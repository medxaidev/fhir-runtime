/**
 * fhir-profile — Slicing Handler
 *
 * Dedicated module for FHIR slicing operations during snapshot generation.
 * Corresponds to the slicing branches in HAPI FHIR R4's `processPaths()`.
 *
 * Slicing is the **second most complex** part of snapshot generation
 * (after `processPaths` itself). This module extracts slicing logic into
 * well-tested, independently callable functions.
 *
 * Two primary scenarios:
 * - **Case A (handleNewSlicing)**: Base is unsliced, differential introduces slicing
 * - **Case B (handleExistingSlicing)**: Base is already sliced, differential modifies/extends
 *
 * Supporting functions:
 * - {@link getSliceSiblings} — collect base slice siblings
 * - {@link validateSlicingCompatibility} — check diff slicing vs base slicing
 * - {@link diffsConstrainTypes} — detect type slicing pattern
 * - {@link makeExtensionSlicing} — synthesize default extension slicing
 *
 * @module fhir-profile
 */

import type {
  ElementDefinition,
  ElementDefinitionSlicing,
  ElementDefinitionType,
} from '../model/index.js';
import type { DiffElementTracker, SnapshotIssue, TraversalScope } from './types.js';
import { createSnapshotIssue } from './types.js';
import type { MergeContext } from './element-merger.js';
import { processPaths } from './element-merger.js';
import { mergeConstraints, setBaseTraceability } from './constraint-merger.js';
import { getChildScope, isChoiceTypePath, matchesChoiceType } from './path-utils.js';

// =============================================================================
// Section 1: Deep Clone Helper
// =============================================================================

/**
 * Deep clone an ElementDefinition.
 */
function cloneElement(element: ElementDefinition): ElementDefinition {
  if (typeof structuredClone === 'function') {
    return structuredClone(element);
  }
  return JSON.parse(JSON.stringify(element)) as ElementDefinition;
}

// =============================================================================
// Section 2: makeExtensionSlicing
// =============================================================================

/**
 * Generate the default slicing definition for extension elements.
 *
 * Corresponds to HAPI's `makeExtensionSlicing()`. Extension elements
 * are always sliced by `url` using the `value` discriminator type.
 *
 * @returns A new {@link ElementDefinitionSlicing} for extensions.
 */
export function makeExtensionSlicing(): ElementDefinitionSlicing {
  return {
    discriminator: [
      {
        type: 'value' as any,
        path: 'url' as any,
      },
    ],
    rules: 'open' as any,
    ordered: false as any,
  };
}

// =============================================================================
// Section 3: getSliceSiblings
// =============================================================================

/**
 * Get all sibling slices from a base snapshot starting after the slicing root.
 *
 * Corresponds to HAPI's `getSiblings()`. Collects all elements with the
 * same path as the slicing root that have a `sliceName`, plus their children.
 *
 * @param elements - The base snapshot element list.
 * @param slicingRootIndex - Index of the slicing root element.
 * @returns Array of slice elements (each with sliceName) and their children.
 */
export function getSliceSiblings(
  elements: readonly ElementDefinition[],
  slicingRootIndex: number,
): ElementDefinition[] {
  if (slicingRootIndex < 0 || slicingRootIndex >= elements.length) return [];

  const rootPath = elements[slicingRootIndex].path ?? '';
  const siblings: ElementDefinition[] = [];
  const prefix = rootPath + '.';

  for (let i = slicingRootIndex + 1; i < elements.length; i++) {
    const ep = elements[i].path ?? '';
    if (ep === rootPath) {
      // Same path — this is a slice sibling
      siblings.push(elements[i]);
    } else if (ep.startsWith(prefix)) {
      // Child of a slice — include it
      siblings.push(elements[i]);
    } else {
      // Past the slicing group
      break;
    }
  }

  return siblings;
}

// =============================================================================
// Section 4: validateSlicingCompatibility
// =============================================================================

/**
 * Validate that a differential slicing definition is compatible with
 * the base slicing definition.
 *
 * Rules:
 * - Discriminators must match (same type and path, in same order)
 * - `ordered` cannot change from `true` to `false`
 * - `rules` cannot relax from `closed` to `open`/`openAtEnd`
 *
 * @param baseSlicing - The base element's slicing definition.
 * @param diffSlicing - The differential element's slicing definition.
 * @param issues - Issue collector for recording incompatibilities.
 * @param path - Element path for issue reporting.
 * @returns `true` if compatible, `false` if incompatible.
 */
export function validateSlicingCompatibility(
  baseSlicing: ElementDefinitionSlicing,
  diffSlicing: ElementDefinitionSlicing,
  issues: SnapshotIssue[],
  path: string,
): boolean {
  let compatible = true;

  // Check discriminator compatibility
  const baseDiscs = baseSlicing.discriminator ?? [];
  const diffDiscs = diffSlicing.discriminator ?? [];

  if (diffDiscs.length > 0) {
    if (diffDiscs.length !== baseDiscs.length) {
      issues.push(
        createSnapshotIssue(
          'error',
          'SLICING_ERROR',
          `Slicing discriminator count mismatch: base has ${baseDiscs.length}, diff has ${diffDiscs.length}`,
          path,
        ),
      );
      compatible = false;
    } else {
      for (let i = 0; i < baseDiscs.length; i++) {
        const bd = baseDiscs[i];
        const dd = diffDiscs[i];
        if (bd.type !== dd.type || bd.path !== dd.path) {
          issues.push(
            createSnapshotIssue(
              'error',
              'SLICING_ERROR',
              `Slicing discriminator[${i}] mismatch: base={type:${bd.type},path:${bd.path}}, diff={type:${dd.type},path:${dd.path}}`,
              path,
            ),
          );
          compatible = false;
        }
      }
    }
  }

  // Check ordered: cannot change from true to false
  if (baseSlicing.ordered === true && diffSlicing.ordered === false) {
    issues.push(
      createSnapshotIssue(
        'error',
        'SLICING_ERROR',
        'Cannot change slicing ordered from true to false',
        path,
      ),
    );
    compatible = false;
  }

  // Check rules: cannot relax from closed to open/openAtEnd
  const rulesOrder: Record<string, number> = { closed: 0, openAtEnd: 1, open: 2 };
  const baseRulesVal = rulesOrder[baseSlicing.rules as string] ?? 2;
  const diffRulesVal = rulesOrder[diffSlicing.rules as string] ?? 2;

  if (diffRulesVal > baseRulesVal) {
    issues.push(
      createSnapshotIssue(
        'error',
        'SLICING_ERROR',
        `Cannot relax slicing rules from '${baseSlicing.rules}' to '${diffSlicing.rules}'`,
        path,
      ),
    );
    compatible = false;
  }

  return compatible;
}

// =============================================================================
// Section 5: diffsConstrainTypes
// =============================================================================

/**
 * Detect whether diff matches constitute type slicing.
 *
 * Corresponds to HAPI's `diffsConstrainTypes()`. Type slicing is detected when:
 * - Multiple diff matches exist
 * - All diff matches constrain different types, OR
 * - The base is a choice type `[x]` and diffs use concrete type paths
 *
 * @param diffMatches - The differential element trackers that matched a base path.
 * @param basePath - The base element path.
 * @param baseTypes - The base element's type list (optional).
 * @returns `true` if the diffs represent type slicing.
 */
export function diffsConstrainTypes(
  diffMatches: readonly DiffElementTracker[],
  basePath: string,
  baseTypes: readonly ElementDefinitionType[] | undefined,
): boolean {
  if (diffMatches.length < 2) return false;

  // Check if base is a choice type and diffs use concrete paths
  if (isChoiceTypePath(basePath)) {
    const allConcrete = diffMatches.every((dm) => {
      const dp = dm.element.path ?? '';
      return matchesChoiceType(basePath, dp);
    });
    if (allConcrete) return true;
  }

  // Check if diffs have different type constraints
  const typeSets = diffMatches.map((dm) => {
    const types = dm.element.type;
    if (!types || types.length === 0) return '';
    return types.map((t) => t.code).sort().join(',');
  });

  const nonEmpty = typeSets.filter((t) => t !== '');
  if (nonEmpty.length < 2) return false;

  const uniqueTypes = new Set(nonEmpty);
  return uniqueTypes.size > 1;
}

// =============================================================================
// Section 6: handleNewSlicing (Case A)
// =============================================================================

/**
 * Handle Case A: Base is unsliced, differential introduces slicing.
 *
 * Steps:
 * 1. Create slicing root element (from diff slicing definition or synthesized extension slicing)
 * 2. Add slicing root to result
 * 3. For each diff slice, recursively process against the same base range
 *
 * @param context - Shared merge state.
 * @param result - Mutable output array.
 * @param currentBase - The base element being sliced.
 * @param baseScope - Scope of the base element and its children.
 * @param diffMatches - Diff trackers that matched this base path.
 * @param diffTrackers - All diff trackers (for recursive calls).
 * @param diffStart - Start index in diffTrackers.
 * @param diffEnd - End index in diffTrackers.
 * @param contextPathSrc - Source path prefix for rewriting.
 * @param contextPathDst - Destination path prefix for rewriting.
 * @param cpath - The current (rewritten) path.
 */
export function handleNewSlicing(
  context: MergeContext,
  result: ElementDefinition[],
  currentBase: ElementDefinition,
  baseScope: TraversalScope,
  diffMatches: DiffElementTracker[],
  diffTrackers: readonly DiffElementTracker[],
  diffStart: number,
  diffEnd: number,
  contextPathSrc: string,
  contextPathDst: string,
  cpath: string,
): void {
  // Separate slicing definition from slice entries
  let slicingDef: DiffElementTracker | undefined;
  const slices: DiffElementTracker[] = [];

  for (const dm of diffMatches) {
    if (dm.element.slicing && !dm.element.sliceName) {
      slicingDef = dm;
    } else {
      slices.push(dm);
    }
  }

  // Build slicing root
  const slicingRoot = cloneElement(currentBase);
  slicingRoot.path = cpath as typeof slicingRoot.path;
  setBaseTraceability(slicingRoot, currentBase);

  if (slicingDef) {
    // Merge the slicing definition from diff
    mergeConstraints(slicingRoot, slicingDef.element, context.issues);
    slicingDef.consumed = true;
  } else if (isExtensionPath(cpath)) {
    // Auto-generate extension slicing
    slicingRoot.slicing = makeExtensionSlicing();
  }

  // Ensure slicing root has slicing metadata
  if (!slicingRoot.slicing && slices.length > 0) {
    // Synthesize a basic open slicing
    slicingRoot.slicing = {
      rules: 'open' as any,
      ordered: false as any,
    };
  }

  result.push(slicingRoot);

  // Copy base children for the slicing root (unsliced content)
  const childScope = getChildScope(baseScope.elements, findIndexInScope(baseScope, currentBase));
  if (childScope) {
    copyBaseChildrenToResult(result, baseScope.elements, childScope, contextPathSrc, contextPathDst);
  }

  // Process each slice against the same base range
  for (const slice of slices) {
    const outcome = cloneElement(currentBase);
    outcome.path = cpath as typeof outcome.path;
    setBaseTraceability(outcome, currentBase);
    mergeConstraints(outcome, slice.element, context.issues);
    slice.consumed = true;
    result.push(outcome);

    // Recurse into children for this slice
    const slicePath = slice.element.path ?? cpath;
    const innerDiffScope = getInnerDiffScope(diffTrackers, slicePath, diffStart, diffEnd);

    if (childScope && innerDiffScope) {
      processPaths(
        context, result,
        baseScope.elements, childScope.start, childScope.end,
        diffTrackers, innerDiffScope.start, innerDiffScope.end,
        contextPathSrc, contextPathDst,
      );
    }
  }
}

// =============================================================================
// Section 7: handleExistingSlicing (Case B)
// =============================================================================

/**
 * Handle Case B: Base is already sliced, differential modifies/extends slices.
 *
 * Steps:
 * 1. Copy base slicing root (merge diff slicing definition if present)
 * 2. Collect base slice siblings
 * 3. Align base slices with diff slices by sliceName
 * 4. Matched slices → merge constraints
 * 5. Unmatched base slices → copy as-is
 * 6. Remaining diff slices → append as new (only if open/openAtEnd)
 *
 * @param context - Shared merge state.
 * @param result - Mutable output array.
 * @param currentBase - The base slicing root element.
 * @param baseScope - Scope of the base element and its children.
 * @param diffMatches - Diff trackers that matched this base path.
 * @param diffTrackers - All diff trackers (for recursive calls).
 * @param diffStart - Start index in diffTrackers.
 * @param diffEnd - End index in diffTrackers.
 * @param contextPathSrc - Source path prefix for rewriting.
 * @param contextPathDst - Destination path prefix for rewriting.
 * @param cpath - The current (rewritten) path.
 */
export function handleExistingSlicing(
  context: MergeContext,
  result: ElementDefinition[],
  currentBase: ElementDefinition,
  baseScope: TraversalScope,
  diffMatches: DiffElementTracker[],
  diffTrackers: readonly DiffElementTracker[],
  diffStart: number,
  diffEnd: number,
  contextPathSrc: string,
  contextPathDst: string,
  cpath: string,
): void {
  // Separate slicing definition from slice entries
  let slicingDiff: DiffElementTracker | undefined;
  const diffSlices: DiffElementTracker[] = [];

  for (const dm of diffMatches) {
    if (dm.element.slicing && !dm.element.sliceName) {
      slicingDiff = dm;
    } else {
      diffSlices.push(dm);
    }
  }

  // Build slicing root
  const slicingRoot = cloneElement(currentBase);
  slicingRoot.path = cpath as typeof slicingRoot.path;
  setBaseTraceability(slicingRoot, currentBase);

  if (slicingDiff) {
    // Validate compatibility before merging
    if (currentBase.slicing && slicingDiff.element.slicing) {
      validateSlicingCompatibility(
        currentBase.slicing, slicingDiff.element.slicing,
        context.issues, cpath,
      );
    }
    mergeConstraints(slicingRoot, slicingDiff.element, context.issues);
    slicingDiff.consumed = true;
  }

  result.push(slicingRoot);

  // Collect base slice entries
  const rootIndex = findIndexInScope(baseScope, currentBase);

  // Extract base slices (elements with same path + sliceName)
  const basePath = currentBase.path ?? '';
  const baseSliceEntries: { element: ElementDefinition; index: number; sliceName: string }[] = [];
  for (let i = rootIndex + 1; i < baseScope.elements.length; i++) {
    const ep = baseScope.elements[i].path ?? '';
    if (ep === basePath && baseScope.elements[i].sliceName) {
      baseSliceEntries.push({
        element: baseScope.elements[i],
        index: i,
        sliceName: baseScope.elements[i].sliceName as string,
      });
    } else if (!ep.startsWith(basePath + '.') && ep !== basePath) {
      break;
    }
  }

  // Build diff slice map by sliceName
  const diffSliceMap = new Map<string, DiffElementTracker>();
  const unmatchedDiffSlices: DiffElementTracker[] = [];
  for (const dm of diffSlices) {
    const sn = dm.element.sliceName as string | undefined;
    if (sn) {
      diffSliceMap.set(sn, dm);
    } else {
      unmatchedDiffSlices.push(dm);
    }
  }

  // Align: process base slices in order
  for (const bs of baseSliceEntries) {
    const outcome = cloneElement(bs.element);
    outcome.path = cpath as typeof outcome.path;
    setBaseTraceability(outcome, bs.element);

    const matchingDiff = diffSliceMap.get(bs.sliceName);
    if (matchingDiff) {
      mergeConstraints(outcome, matchingDiff.element, context.issues);
      matchingDiff.consumed = true;
      diffSliceMap.delete(bs.sliceName);
    }

    result.push(outcome);

    // Copy children of this base slice
    const sliceChildScope = getChildScope(baseScope.elements, bs.index);
    if (sliceChildScope) {
      // If there's a matching diff with inner children, recurse
      if (matchingDiff) {
        const slicePath = matchingDiff.element.path ?? cpath;
        const innerDiffScope = getInnerDiffScope(diffTrackers, slicePath, diffStart, diffEnd);
        if (innerDiffScope) {
          processPaths(
            context, result,
            baseScope.elements, sliceChildScope.start, sliceChildScope.end,
            diffTrackers, innerDiffScope.start, innerDiffScope.end,
            contextPathSrc, contextPathDst,
          );
          continue;
        }
      }
      copyBaseChildrenToResult(result, baseScope.elements, sliceChildScope, contextPathSrc, contextPathDst);
    }
  }

  // Append new diff slices (not matching any base slice)
  const isClosed = (currentBase.slicing?.rules as string) === 'closed';
  for (const [sliceName, dm] of diffSliceMap) {
    if (isClosed) {
      context.issues.push(
        createSnapshotIssue(
          'error',
          'SLICING_ERROR',
          `Cannot add new slice '${sliceName}' to closed slicing`,
          cpath,
        ),
      );
    }
    const outcome = cloneElement(currentBase);
    outcome.path = cpath as typeof outcome.path;
    setBaseTraceability(outcome, currentBase);
    mergeConstraints(outcome, dm.element, context.issues);
    dm.consumed = true;
    result.push(outcome);
  }

  // Handle unmatched diff entries (no sliceName)
  for (const dm of unmatchedDiffSlices) {
    if (!dm.consumed) {
      dm.consumed = true;
    }
  }
}

// =============================================================================
// Section 8: Internal Helpers
// =============================================================================

/**
 * Check if a path refers to an extension element.
 */
function isExtensionPath(path: string): boolean {
  return path.endsWith('.extension') || path.endsWith('.modifierExtension');
}

/**
 * Find the index of an element within a scope's element list.
 */
function findIndexInScope(scope: TraversalScope, element: ElementDefinition): number {
  for (let i = scope.start; i <= scope.end; i++) {
    if (scope.elements[i] === element) return i;
  }
  // Fallback: search from 0
  for (let i = 0; i < scope.elements.length; i++) {
    if (scope.elements[i] === element) return i;
  }
  return scope.start;
}

/**
 * Get the scope of inner diff elements (children of parentPath).
 */
function getInnerDiffScope(
  diffTrackers: readonly DiffElementTracker[],
  parentPath: string,
  diffStart: number,
  diffEnd: number,
): { start: number; end: number } | undefined {
  const prefix = parentPath + '.';
  let start = -1;
  let end = -1;

  for (let i = diffStart; i <= diffEnd && i < diffTrackers.length; i++) {
    const dp = diffTrackers[i].element.path ?? '';
    if (dp.startsWith(prefix)) {
      if (start === -1) start = i;
      end = i;
    }
  }

  if (start === -1) return undefined;
  return { start, end };
}

/**
 * Copy base children as-is into result (with path rewriting).
 */
function copyBaseChildrenToResult(
  result: ElementDefinition[],
  baseElements: readonly ElementDefinition[],
  childScope: TraversalScope,
  contextPathSrc: string,
  contextPathDst: string,
): void {
  for (let i = childScope.start; i <= childScope.end; i++) {
    const child = cloneElement(baseElements[i]);
    if (child.path && contextPathSrc !== contextPathDst) {
      const p = child.path as string;
      if (p.startsWith(contextPathSrc + '.')) {
        child.path = (contextPathDst + p.slice(contextPathSrc.length)) as typeof child.path;
      } else if (p === contextPathSrc) {
        child.path = contextPathDst as typeof child.path;
      }
    }
    setBaseTraceability(child, baseElements[i]);
    result.push(child);
  }
}
