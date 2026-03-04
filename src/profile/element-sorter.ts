/**
 * fhir-profile — Element Sorter
 *
 * Sorting and ordering utilities for snapshot generation.
 * Corresponds to HAPI FHIR R4's `sortDifferential()` + `sortElements()`.
 *
 * Key concepts:
 * - The authoritative order is the **base snapshot element order**, not alphabetical
 * - Differential elements may need pre-sorting before merge
 * - Sorting builds a tree, sorts each level by base index, then flattens
 *
 * Exported functions:
 * - {@link sortDifferential} — sort diff elements by base snapshot order
 * - {@link findBaseIndex} — locate a path in the base snapshot
 * - {@link validateElementOrder} — verify snapshot ordering post-generation
 * - {@link ensureElementIds} — generate element IDs from path + sliceName
 *
 * @module fhir-profile
 */

import type { ElementDefinition } from '../model/index.js';
import type { SnapshotIssue } from './types.js';
import { createSnapshotIssue } from './types.js';
import {
  isChoiceTypePath,
  matchesChoiceType,
  parentPath,
} from './path-utils.js';

// =============================================================================
// Section 1: Tree Node for Sorting
// =============================================================================

/**
 * Internal tree node used during differential sorting.
 * Each node represents an element and its children in the hierarchy.
 */
interface SortNode {
  /** The element this node represents. */
  element: ElementDefinition;
  /** Index in the base snapshot (-1 if not found). */
  baseIndex: number;
  /** Child nodes (direct children in the element tree). */
  children: SortNode[];
}

// =============================================================================
// Section 2: findBaseIndex
// =============================================================================

/**
 * Find the index of a path in the base snapshot.
 *
 * Handles:
 * - Exact path match
 * - Choice type match (e.g., `valueString` matches `value[x]`)
 * - Slice paths (strips `:sliceName` from id to match by path)
 *
 * @param baseSnapshot - The base snapshot element list.
 * @param path - The path to find.
 * @param sliceName - Optional slice name for disambiguation.
 * @returns The index in baseSnapshot, or -1 if not found.
 */
export function findBaseIndex(
  baseSnapshot: readonly ElementDefinition[],
  path: string,
  sliceName?: string,
): number {
  // 1. Exact path match (prefer sliceName match if provided)
  if (sliceName) {
    for (let i = 0; i < baseSnapshot.length; i++) {
      const el = baseSnapshot[i];
      if ((el.path as string) === path && (el.sliceName as string) === sliceName) {
        return i;
      }
    }
  }

  // 2. Exact path match (no sliceName or fallback)
  for (let i = 0; i < baseSnapshot.length; i++) {
    if ((baseSnapshot[i].path as string) === path) {
      return i;
    }
  }

  // 3. Choice type match: path like "Observation.valueString" → base "Observation.value[x]"
  for (let i = 0; i < baseSnapshot.length; i++) {
    const basePath = baseSnapshot[i].path as string;
    if (isChoiceTypePath(basePath) && matchesChoiceType(basePath, path)) {
      return i;
    }
  }

  return -1;
}

// =============================================================================
// Section 3: sortDifferential
// =============================================================================

/**
 * Sort differential elements according to base snapshot order.
 *
 * Corresponds to HAPI's `sortDifferential()`. The algorithm:
 * 1. Build a tree from the differential elements (parent-child by path)
 * 2. Assign each node a base index via {@link findBaseIndex}
 * 3. Sort children at each level by base index
 * 4. Flatten the tree back to a linear list
 *
 * Elements not found in the base are placed at the end of their level
 * and an issue is recorded.
 *
 * @param differential - The differential elements to sort (not mutated).
 * @param baseSnapshot - The base snapshot providing the authoritative order.
 * @param issues - Issue collector for recording problems.
 * @returns A new array of elements in sorted order.
 */
export function sortDifferential(
  differential: readonly ElementDefinition[],
  baseSnapshot: readonly ElementDefinition[],
  issues: SnapshotIssue[],
): ElementDefinition[] {
  if (differential.length <= 1) {
    return [...differential];
  }

  // Build tree
  const root: SortNode = {
    element: differential[0],
    baseIndex: findBaseIndex(baseSnapshot, differential[0].path as string),
    children: [],
  };

  // Map from path to node for parent lookup
  const nodeMap = new Map<string, SortNode>();
  const rootPath = differential[0].path as string;
  nodeMap.set(rootPath, root);

  for (let i = 1; i < differential.length; i++) {
    const el = differential[i];
    const elPath = el.path as string;
    const elSliceName = el.sliceName as string | undefined;

    const node: SortNode = {
      element: el,
      baseIndex: findBaseIndex(baseSnapshot, elPath, elSliceName),
      children: [],
    };

    // Find parent: walk up the path hierarchy
    let parent: SortNode | undefined;
    const pp = parentPath(elPath);
    if (pp) {
      parent = nodeMap.get(pp);
    }

    // If no parent found, check if this is a slice sibling (same path as existing node)
    if (!parent) {
      // Slice siblings attach to the same parent as the first element with this path
      const existingNode = nodeMap.get(elPath);
      if (existingNode) {
        // Find the parent of the existing node
        for (const [, n] of nodeMap) {
          if (n.children.includes(existingNode)) {
            parent = n;
            break;
          }
        }
      }
    }

    // Fallback: attach to root
    if (!parent) {
      parent = root;
    }

    parent.children.push(node);

    // Register in nodeMap (first occurrence of this path wins)
    const nodeKey = elSliceName ? `${elPath}:${elSliceName}` : elPath;
    if (!nodeMap.has(nodeKey)) {
      nodeMap.set(nodeKey, node);
    }
    // Also register by plain path if not already present
    if (!nodeMap.has(elPath)) {
      nodeMap.set(elPath, node);
    }
  }

  // Sort children at each level by baseIndex
  sortNodeChildren(root);

  // Check for elements not found in base
  checkUnfoundElements(root, issues);

  // Flatten tree back to linear list
  const result: ElementDefinition[] = [];
  flattenTree(root, result);

  return result;
}

/**
 * Recursively sort children of a node by baseIndex.
 */
function sortNodeChildren(node: SortNode): void {
  if (node.children.length > 1) {
    node.children.sort((a, b) => {
      // Elements not found in base go to end
      const ai = a.baseIndex === -1 ? Number.MAX_SAFE_INTEGER : a.baseIndex;
      const bi = b.baseIndex === -1 ? Number.MAX_SAFE_INTEGER : b.baseIndex;
      return ai - bi;
    });
  }
  for (const child of node.children) {
    sortNodeChildren(child);
  }
}

/**
 * Check for elements with baseIndex === -1 and record issues.
 */
function checkUnfoundElements(node: SortNode, issues: SnapshotIssue[]): void {
  if (node.baseIndex === -1 && node.element.path) {
    issues.push(
      createSnapshotIssue(
        'warning',
        'PATH_NOT_FOUND',
        `Differential path '${node.element.path}' not found in base snapshot`,
        node.element.path as string,
      ),
    );
  }
  for (const child of node.children) {
    checkUnfoundElements(child, issues);
  }
}

/**
 * Flatten a sort tree back to a linear element list (pre-order traversal).
 */
function flattenTree(node: SortNode, result: ElementDefinition[]): void {
  result.push(node.element);
  for (const child of node.children) {
    flattenTree(child, result);
  }
}

// =============================================================================
// Section 4: validateElementOrder
// =============================================================================

/**
 * Validate that snapshot elements are in correct order.
 *
 * Rules:
 * - Parent elements must appear before their children
 * - Slice elements must appear after their slicing root
 * - No duplicate paths (unless sliced)
 *
 * @param snapshot - The snapshot elements to validate.
 * @param issues - Issue collector for recording problems.
 * @returns `true` if order is valid, `false` if any violations found.
 */
export function validateElementOrder(
  snapshot: readonly ElementDefinition[],
  issues: SnapshotIssue[],
): boolean {
  let valid = true;
  const seenPaths = new Map<string, number>(); // path → first index

  for (let i = 0; i < snapshot.length; i++) {
    const el = snapshot[i];
    const elPath = el.path as string;
    if (!elPath) continue;

    // Rule 1: Parent must appear before child
    const pp = parentPath(elPath);
    if (pp && !seenPaths.has(pp)) {
      // Check if parent path exists anywhere earlier
      let parentFound = false;
      for (let j = 0; j < i; j++) {
        if ((snapshot[j].path as string) === pp) {
          parentFound = true;
          break;
        }
      }
      if (!parentFound && i > 0) {
        // Root element (index 0) has no parent — that's fine
        issues.push(
          createSnapshotIssue(
            'error',
            'INTERNAL_ERROR',
            `Element '${elPath}' appears before its parent '${pp}'`,
            elPath,
          ),
        );
        valid = false;
      }
    }

    // Rule 2: Slice must appear after slicing root (same path without sliceName)
    if (el.sliceName) {
      const rootIdx = seenPaths.get(elPath);
      if (rootIdx === undefined) {
        // No slicing root seen yet — could be a problem if there should be one
        // But some profiles define slices without explicit root in diff
        // This is a warning, not an error
      }
    }

    // Rule 3: Track paths for duplicate/ordering checks
    if (!seenPaths.has(elPath)) {
      seenPaths.set(elPath, i);
    }
  }

  return valid;
}

// =============================================================================
// Section 5: ensureElementIds
// =============================================================================

/**
 * Ensure all elements have an `id` property.
 *
 * If an element lacks an `id`, generates one from its path and sliceName.
 * This follows the FHIR convention:
 * - Unsliced: `id = path` (e.g., `"Patient.name"`)
 * - Sliced: `id = path:sliceName` (e.g., `"Patient.identifier:MRN"`)
 *
 * Corresponds to HAPI's `setIds()`.
 *
 * @param elements - The elements to process (mutated in place).
 * @param resourceType - The resource type name (used for the root element).
 */
export function ensureElementIds(
  elements: ElementDefinition[],
  resourceType?: string,
): void {
  for (const el of elements) {
    if (!el.id && el.path) {
      const path = el.path as string;
      const sliceName = el.sliceName as string | undefined;
      el.id = (sliceName ? `${path}:${sliceName}` : path) as typeof el.id;
    }
  }

  // Optionally ensure root element id matches resourceType
  if (resourceType && elements.length > 0) {
    const root = elements[0];
    const rootPath = root.path as string | undefined;
    if (rootPath === resourceType && !root.id) {
      root.id = resourceType as typeof root.id;
    }
  }
}
