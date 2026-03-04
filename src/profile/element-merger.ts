/**
 * fhir-profile — Element Merger (Core Merge Loop)
 *
 * Implements the base-driven merge loop for snapshot generation,
 * corresponding to HAPI FHIR R4's `ProfileUtilities.processPaths()`.
 *
 * This is the **core engine** of snapshot generation. It walks the base
 * snapshot element-by-element, finds matching differential entries, and
 * produces the merged snapshot output.
 *
 * Four major branches:
 * - **Branch A**: No diff match → inherit base as-is (may recurse for inner diffs)
 * - **Branch B**: Single diff match → merge constraints, recurse into children/datatype
 * - **Branch C**: Type slicing → multiple diffs constrain different types
 * - **Branch D**: Explicit slicing → multiple diffs with sliceNames
 *
 * @module fhir-profile
 */

import type { ElementDefinition } from '../model/index.js';
import type { FhirContext } from '../context/types.js';
import type { DiffElementTracker, SnapshotIssue, TraversalScope } from './types.js';
import { createSnapshotIssue, createDiffTracker } from './types.js';
import {
  getChildScope,
  getDiffMatches,
  hasInnerDiffMatches,
  isChoiceTypePath,
  matchesChoiceType,
  extractChoiceTypeName,
  rewritePath,
} from './path-utils.js';
import { mergeConstraints, setBaseTraceability } from './constraint-merger.js';

// =============================================================================
// Section 1: MergeContext
// =============================================================================

/**
 * Shared state passed through all recursive `processPaths` calls.
 */
export interface MergeContext {
  /** FhirContext for loading datatype definitions (async). `undefined` for sync-only tests. */
  readonly fhirContext?: FhirContext;
  /** Preloaded datatype snapshots cache (url → snapshot elements). */
  readonly datatypeCache: Map<string, readonly ElementDefinition[]>;
  /** Issue collector. */
  readonly issues: SnapshotIssue[];
  /** URL of the profile being generated. */
  readonly profileUrl: string;
  /** Current recursion depth. */
  depth: number;
  /** Maximum allowed recursion depth. */
  readonly maxDepth: number;
}

/**
 * Create a default MergeContext.
 */
export function createMergeContext(
  profileUrl: string,
  options?: {
    fhirContext?: FhirContext;
    maxDepth?: number;
  },
): MergeContext {
  return {
    fhirContext: options?.fhirContext,
    datatypeCache: new Map(),
    issues: [],
    profileUrl,
    depth: 0,
    maxDepth: options?.maxDepth ?? 50,
  };
}

// =============================================================================
// Section 2: Deep Clone Helper
// =============================================================================

/**
 * Deep clone an ElementDefinition.
 *
 * Uses structured clone for a true deep copy. Falls back to
 * JSON round-trip if structuredClone is unavailable.
 */
function cloneElement(element: ElementDefinition): ElementDefinition {
  if (typeof structuredClone === 'function') {
    return structuredClone(element);
  }
  return JSON.parse(JSON.stringify(element)) as ElementDefinition;
}

// =============================================================================
// Section 3: Core Merge Loop — processPaths
// =============================================================================

/**
 * Base-driven merge loop (corresponds to HAPI `processPaths`).
 *
 * Walks the base snapshot within `baseScope`, finds matching differential
 * entries within `[diffStart, diffEnd]`, and appends merged elements to `result`.
 *
 * @param context - Shared merge state.
 * @param result - Mutable output array to append merged elements to.
 * @param baseElements - The base snapshot element list.
 * @param baseCursor - Start index in baseElements (inclusive).
 * @param baseLimit - End index in baseElements (inclusive).
 * @param diffTrackers - The differential element trackers.
 * @param diffStart - Start index in diffTrackers (inclusive).
 * @param diffEnd - End index in diffTrackers (inclusive).
 * @param contextPathSrc - Source path prefix for rewriting (e.g., datatype name).
 * @param contextPathDst - Destination path prefix for rewriting.
 */
export function processPaths(
  context: MergeContext,
  result: ElementDefinition[],
  baseElements: readonly ElementDefinition[],
  baseCursor: number,
  baseLimit: number,
  diffTrackers: readonly DiffElementTracker[],
  diffStart: number,
  diffEnd: number,
  contextPathSrc: string,
  contextPathDst: string,
): void {
  // Recursion depth guard
  if (context.depth > context.maxDepth) {
    context.issues.push(
      createSnapshotIssue(
        'error',
        'INTERNAL_ERROR',
        `Maximum recursion depth (${context.maxDepth}) exceeded`,
        contextPathDst,
      ),
    );
    return;
  }

  context.depth++;

  try {
    let bc = baseCursor;

    while (bc <= baseLimit && bc < baseElements.length) {
      const currentBase = baseElements[bc];
      const basePath = currentBase.path;
      if (!basePath) {
        bc++;
        continue;
      }

      // Rewrite path from source context to destination context
      const cpath = rewritePath(basePath, contextPathSrc, contextPathDst);

      // Find differential matches for this base path
      const diffMatches = getDiffMatchesForPath(
        diffTrackers, cpath, diffStart, diffEnd, contextPathSrc, contextPathDst,
      );

      // Determine if base element is already sliced
      const baseSliced = currentBase.slicing !== undefined;

      if (!baseSliced) {
        if (diffMatches.length === 0) {
          // ---------------------------------------------------------------
          // Branch A: No diff match — inherit base as-is
          // ---------------------------------------------------------------
          const outcome = cloneElement(currentBase);
          outcome.path = cpath as typeof outcome.path;
          setBaseTraceability(outcome, currentBase);
          result.push(outcome);

          // Check for inner diff matches (children constrained without parent match)
          const childScopeA = getChildScope(baseElements, bc);
          if (hasInnerDiffMatches(diffTrackers, cpath, diffStart, diffEnd)) {
            if (childScopeA) {
              // Base has children — recurse into them
              processPaths(
                context, result,
                baseElements, childScopeA.start, childScopeA.end,
                diffTrackers, diffStart, diffEnd,
                contextPathSrc, contextPathDst,
              );
              // Skip past children in base (already handled by recursion)
              bc = childScopeA.end + 1;
              continue;
            } else {
              // Base has no children — need datatype expansion
              expandDatatype(
                context, result, outcome,
                diffTrackers, diffStart, diffEnd,
                cpath,
              );
              bc++;
              continue;
            }
          } else if (childScopeA) {
            // No inner diff but base has children — copy them as-is
            copyBaseChildren(result, baseElements, childScopeA, contextPathSrc, contextPathDst);
            bc = childScopeA.end + 1;
            continue;
          }

          bc++;

        } else if (diffMatches.length === 1 && !hasDiffSlicing(diffMatches[0])) {
          // ---------------------------------------------------------------
          // Branch B: Single non-slicing diff match — most common path
          // ---------------------------------------------------------------
          const diffMatch = diffMatches[0];
          const outcome = cloneElement(currentBase);
          outcome.path = cpath as typeof outcome.path;
          setBaseTraceability(outcome, currentBase);
          mergeConstraints(outcome, diffMatch.element, context.issues);

          // Handle choice type narrowing
          if (isChoiceTypePath(basePath) && !isChoiceTypePath(diffMatch.element.path ?? '')) {
            narrowChoiceType(outcome, diffMatch.element.path ?? '', basePath);
          }

          // Mark diff as consumed
          diffMatch.consumed = true;

          result.push(outcome);

          // Recurse into children
          const childScope = getChildScope(baseElements, bc);
          const innerDiffScope = getInnerDiffScope(diffTrackers, cpath, diffStart, diffEnd);

          if (childScope && innerDiffScope) {
            // Both base children and inner diff exist
            processPaths(
              context, result,
              baseElements, childScope.start, childScope.end,
              diffTrackers, innerDiffScope.start, innerDiffScope.end,
              contextPathSrc, contextPathDst,
            );
          } else if (!childScope && innerDiffScope) {
            // No base children but diff has children — datatype expansion
            expandDatatype(
              context, result, outcome,
              diffTrackers, innerDiffScope.start, innerDiffScope.end,
              cpath,
            );
          } else if (childScope && !innerDiffScope) {
            // Base children but no inner diff — copy base children as-is
            copyBaseChildren(result, baseElements, childScope, contextPathSrc, contextPathDst);
          }
          // else: no children on either side — nothing to do

          // Advance past base element and its children
          if (childScope) {
            bc = childScope.end + 1;
          } else {
            bc = skipChildren(baseElements, bc, basePath);
          }

        } else if (diffMatches.length > 1 && diffsConstrainTypes(diffMatches, cpath)) {
          // ---------------------------------------------------------------
          // Branch C: Type slicing
          // ---------------------------------------------------------------
          processTypeSlicing(
            context, result, currentBase,
            diffMatches, baseElements, bc, baseLimit,
            diffTrackers, diffStart, diffEnd,
            contextPathSrc, contextPathDst, cpath,
          );
          {
            const cs = getChildScope(baseElements, bc);
            bc = cs ? cs.end + 1 : bc + 1;
          }

        } else {
          // ---------------------------------------------------------------
          // Branch D: Explicit slicing (multiple diffs with sliceNames)
          // ---------------------------------------------------------------
          processExplicitSlicing(
            context, result, currentBase,
            diffMatches, baseElements, bc, baseLimit,
            diffTrackers, diffStart, diffEnd,
            contextPathSrc, contextPathDst, cpath,
          );
          {
            const cs = getChildScope(baseElements, bc);
            bc = cs ? cs.end + 1 : bc + 1;
          }
        }
      } else {
        // =================================================================
        // Base is already sliced — align slices by sliceName
        // =================================================================
        processBaseSliced(
          context, result, currentBase,
          diffMatches, baseElements, bc, baseLimit,
          diffTrackers, diffStart, diffEnd,
          contextPathSrc, contextPathDst, cpath,
        );
        {
          const cs = getChildScope(baseElements, bc);
          bc = cs ? cs.end + 1 : bc + 1;
        }
      }
    }
  } finally {
    context.depth--;
  }
}

// =============================================================================
// Section 4: Diff Matching Helpers
// =============================================================================

/**
 * Find diff matches for a rewritten path.
 * Delegates to getDiffMatches but handles path rewriting context.
 */
function getDiffMatchesForPath(
  diffTrackers: readonly DiffElementTracker[],
  cpath: string,
  diffStart: number,
  diffEnd: number,
  _contextPathSrc: string,
  _contextPathDst: string,
): DiffElementTracker[] {
  return getDiffMatches(diffTrackers, cpath, diffStart, diffEnd);
}

/**
 * Check if a diff tracker introduces slicing.
 */
function hasDiffSlicing(tracker: DiffElementTracker): boolean {
  return tracker.element.slicing !== undefined;
}

/**
 * Check if multiple diff matches constrain different types (type slicing).
 *
 * Type slicing is detected when:
 * - All diff matches have type constraints
 * - The types differ between matches
 * - OR the diff paths are concrete choice type paths (e.g., valueString, valueQuantity)
 */
function diffsConstrainTypes(
  diffMatches: readonly DiffElementTracker[],
  basePath: string,
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

  const uniqueTypes = new Set(typeSets.filter((t) => t !== ''));
  return uniqueTypes.size > 1;
}

/**
 * Get the scope of inner diff elements (children of cpath).
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

// =============================================================================
// Section 5: Base Traversal Helpers
// =============================================================================

/**
 * Skip past all children of the element at `index` and return the next
 * sibling index.
 */
function skipChildren(
  elements: readonly ElementDefinition[],
  index: number,
  parentPath: string,
): number {
  const prefix = parentPath + '.';
  let i = index + 1;
  while (i < elements.length) {
    const p = elements[i].path ?? '';
    if (!p.startsWith(prefix)) break;
    i++;
  }
  return i;
}

/**
 * Copy base children as-is into result (with path rewriting).
 */
function copyBaseChildren(
  result: ElementDefinition[],
  baseElements: readonly ElementDefinition[],
  childScope: TraversalScope,
  contextPathSrc: string,
  contextPathDst: string,
): void {
  for (let i = childScope.start; i <= childScope.end; i++) {
    const child = cloneElement(baseElements[i]);
    if (child.path) {
      child.path = rewritePath(
        child.path, contextPathSrc, contextPathDst,
      ) as typeof child.path;
    }
    setBaseTraceability(child, baseElements[i]);
    result.push(child);
  }
}

// =============================================================================
// Section 6: Choice Type Narrowing
// =============================================================================

/**
 * Narrow a choice type element's types based on the concrete diff path.
 *
 * When base has `value[x]` with multiple types and diff uses `valueString`,
 * narrow outcome.type to only the matching type.
 */
function narrowChoiceType(
  outcome: ElementDefinition,
  diffPath: string,
  basePath: string,
): void {
  const typeName = extractChoiceTypeName(basePath, diffPath);
  if (!typeName || !outcome.type || outcome.type.length <= 1) return;

  const lowerTypeName = typeName.charAt(0).toLowerCase() + typeName.slice(1);
  const matched = outcome.type.filter(
    (t) => t.code === typeName || t.code === lowerTypeName,
  );

  if (matched.length > 0) {
    outcome.type = matched;
  }
}

// =============================================================================
// Section 7: Datatype Expansion
// =============================================================================

/**
 * Expand into a complex datatype's snapshot when the base has no children
 * but the diff constrains child elements.
 *
 * Steps:
 * 1. Determine the datatype from outcome.type[0].code
 * 2. Look up the datatype snapshot from cache
 * 3. Recurse processPaths with the datatype snapshot as new base
 * 4. Path rewriting: DatatypeName.x → parentPath.x
 */
function expandDatatype(
  context: MergeContext,
  result: ElementDefinition[],
  outcome: ElementDefinition,
  diffTrackers: readonly DiffElementTracker[],
  diffStart: number,
  diffEnd: number,
  parentPath: string,
): void {
  // Determine the datatype
  const types = outcome.type;
  if (!types || types.length === 0) {
    context.issues.push(
      createSnapshotIssue(
        'error',
        'INTERNAL_ERROR',
        'Cannot expand datatype: element has no type',
        parentPath,
      ),
    );
    return;
  }

  // Use the first type (or single type) for expansion
  const typeCode = types[0].code as string;
  if (!typeCode) return;

  // Look up datatype snapshot from cache
  const dtUrl = `http://hl7.org/fhir/StructureDefinition/${typeCode}`;
  const dtElements = context.datatypeCache.get(dtUrl);

  if (!dtElements || dtElements.length === 0) {
    context.issues.push(
      createSnapshotIssue(
        'warning',
        'BASE_NOT_FOUND',
        `Datatype '${typeCode}' snapshot not available in cache for expansion`,
        parentPath,
      ),
    );
    return;
  }

  // The datatype snapshot's first element is the root (e.g., "Identifier")
  // Children start at index 1
  if (dtElements.length < 2) return; // No children to expand

  const dtRoot = dtElements[0].path as string;

  // Recurse with datatype snapshot as new base, rewriting paths
  processPaths(
    context, result,
    dtElements, 1, dtElements.length - 1,
    diffTrackers, diffStart, diffEnd,
    dtRoot, parentPath,
  );
}

// =============================================================================
// Section 8: Type Slicing (Branch C)
// =============================================================================

/**
 * Process type slicing: multiple diff entries constrain different types
 * of a choice element.
 *
 * Inserts a slicing root element, then processes each type-slice.
 */
function processTypeSlicing(
  context: MergeContext,
  result: ElementDefinition[],
  currentBase: ElementDefinition,
  diffMatches: DiffElementTracker[],
  baseElements: readonly ElementDefinition[],
  baseCursor: number,
  _baseLimit: number,
  diffTrackers: readonly DiffElementTracker[],
  diffStart: number,
  diffEnd: number,
  contextPathSrc: string,
  contextPathDst: string,
  cpath: string,
): void {
  // Insert the slicing root (unsliced element with slicing info)
  const slicingRoot = cloneElement(currentBase);
  slicingRoot.path = cpath as typeof slicingRoot.path;
  setBaseTraceability(slicingRoot, currentBase);

  // Add synthetic slicing if not already present
  if (!slicingRoot.slicing) {
    slicingRoot.slicing = {
      discriminator: [{ type: 'type' as any, path: '$this' as any }],
      rules: 'open' as any,
      ordered: false as any,
    };
  }
  result.push(slicingRoot);

  // Process each type-slice
  for (const dm of diffMatches) {
    const outcome = cloneElement(currentBase);
    outcome.path = cpath as typeof outcome.path;
    setBaseTraceability(outcome, currentBase);
    mergeConstraints(outcome, dm.element, context.issues);

    // Narrow type for choice types
    if (isChoiceTypePath(currentBase.path ?? '') && dm.element.path) {
      narrowChoiceType(outcome, dm.element.path, currentBase.path ?? '');
    }

    // Set sliceName from type if not already set
    if (!outcome.sliceName && dm.element.type && dm.element.type.length > 0) {
      outcome.sliceName = dm.element.type[0].code as unknown as typeof outcome.sliceName;
    }

    dm.consumed = true;
    result.push(outcome);

    // Recurse into children if needed
    const childScope = getChildScope(baseElements, baseCursor);
    const innerDiffScope = getInnerDiffScope(diffTrackers, dm.element.path ?? cpath, diffStart, diffEnd);

    if (innerDiffScope) {
      if (childScope) {
        processPaths(
          context, result,
          baseElements, childScope.start, childScope.end,
          diffTrackers, innerDiffScope.start, innerDiffScope.end,
          contextPathSrc, contextPathDst,
        );
      } else {
        expandDatatype(
          context, result, outcome,
          diffTrackers, innerDiffScope.start, innerDiffScope.end,
          dm.element.path ?? cpath,
        );
      }
    }
  }
}

// =============================================================================
// Section 9: Explicit Slicing (Branch D)
// =============================================================================

/**
 * Process explicit slicing: multiple diff entries with sliceNames.
 *
 * Inserts a slicing root, then processes each slice against the same
 * base subtree.
 */
function processExplicitSlicing(
  context: MergeContext,
  result: ElementDefinition[],
  currentBase: ElementDefinition,
  diffMatches: DiffElementTracker[],
  baseElements: readonly ElementDefinition[],
  baseCursor: number,
  _baseLimit: number,
  diffTrackers: readonly DiffElementTracker[],
  diffStart: number,
  diffEnd: number,
  contextPathSrc: string,
  contextPathDst: string,
  cpath: string,
): void {
  // First diff match may be the slicing definition itself
  let slicingDef: DiffElementTracker | undefined;
  const slices: DiffElementTracker[] = [];

  for (const dm of diffMatches) {
    if (dm.element.slicing && !dm.element.sliceName) {
      slicingDef = dm;
    } else {
      slices.push(dm);
    }
  }

  // Insert slicing root
  const slicingRoot = cloneElement(currentBase);
  slicingRoot.path = cpath as typeof slicingRoot.path;
  setBaseTraceability(slicingRoot, currentBase);

  if (slicingDef) {
    mergeConstraints(slicingRoot, slicingDef.element, context.issues);
    slicingDef.consumed = true;
  }

  result.push(slicingRoot);

  // Process each slice
  for (const slice of slices) {
    const outcome = cloneElement(currentBase);
    outcome.path = cpath as typeof outcome.path;
    setBaseTraceability(outcome, currentBase);
    mergeConstraints(outcome, slice.element, context.issues);
    slice.consumed = true;
    result.push(outcome);

    // Recurse into children for this slice
    const childScope = getChildScope(baseElements, baseCursor);
    const slicePath = slice.element.id ?? slice.element.path ?? cpath;
    const innerDiffScope = getInnerDiffScope(diffTrackers, slicePath, diffStart, diffEnd);

    if (childScope && innerDiffScope) {
      processPaths(
        context, result,
        baseElements, childScope.start, childScope.end,
        diffTrackers, innerDiffScope.start, innerDiffScope.end,
        contextPathSrc, contextPathDst,
      );
    } else if (!childScope && innerDiffScope) {
      expandDatatype(
        context, result, outcome,
        diffTrackers, innerDiffScope.start, innerDiffScope.end,
        cpath,
      );
    }
  }
}

// =============================================================================
// Section 10: Base Already Sliced
// =============================================================================

/**
 * Handle the case where the base element is already sliced.
 *
 * Aligns diff slices with base slices by sliceName:
 * - Matching slices: merge constraints
 * - Non-matching base slices: copy as-is
 * - New diff slices: append at end (if slicing is not CLOSED)
 */
function processBaseSliced(
  context: MergeContext,
  result: ElementDefinition[],
  currentBase: ElementDefinition,
  diffMatches: DiffElementTracker[],
  baseElements: readonly ElementDefinition[],
  baseCursor: number,
  baseLimit: number,
  _diffTrackers: readonly DiffElementTracker[],
  _diffStart: number,
  _diffEnd: number,
  contextPathSrc: string,
  contextPathDst: string,
  cpath: string,
): void {
  // Copy the slicing root
  const slicingRoot = cloneElement(currentBase);
  slicingRoot.path = cpath as typeof slicingRoot.path;
  setBaseTraceability(slicingRoot, currentBase);

  // Merge slicing definition from diff if present
  const slicingDiff = diffMatches.find((dm) => dm.element.slicing && !dm.element.sliceName);
  if (slicingDiff) {
    mergeConstraints(slicingRoot, slicingDiff.element, context.issues);
    slicingDiff.consumed = true;
  }

  result.push(slicingRoot);

  // Collect base slices (siblings with same path after the slicing root)
  const basePath = currentBase.path ?? '';
  const baseSlices: { index: number; sliceName: string | undefined }[] = [];
  for (let i = baseCursor + 1; i <= baseLimit && i < baseElements.length; i++) {
    const ep = baseElements[i].path ?? '';
    if (ep === basePath && baseElements[i].sliceName) {
      baseSlices.push({ index: i, sliceName: baseElements[i].sliceName as string | undefined });
    } else if (!ep.startsWith(basePath + '.') && ep !== basePath) {
      break;
    }
  }

  // Build diff slice map by sliceName
  const diffSliceMap = new Map<string, DiffElementTracker>();
  const unmatchedDiffSlices: DiffElementTracker[] = [];
  for (const dm of diffMatches) {
    if (dm === slicingDiff) continue;
    const sn = dm.element.sliceName as string | undefined;
    if (sn) {
      diffSliceMap.set(sn, dm);
    } else {
      unmatchedDiffSlices.push(dm);
    }
  }

  // Align: process base slices in order
  for (const bs of baseSlices) {
    const baseSliceElement = baseElements[bs.index];
    const outcome = cloneElement(baseSliceElement);
    outcome.path = cpath as typeof outcome.path;
    setBaseTraceability(outcome, baseSliceElement);

    const matchingDiff = bs.sliceName ? diffSliceMap.get(bs.sliceName) : undefined;
    if (matchingDiff) {
      mergeConstraints(outcome, matchingDiff.element, context.issues);
      matchingDiff.consumed = true;
      diffSliceMap.delete(bs.sliceName!);
    }

    result.push(outcome);

    // Copy children of this base slice
    const sliceChildScope = getChildScope(baseElements, bs.index);
    if (sliceChildScope) {
      copyBaseChildren(result, baseElements, sliceChildScope, contextPathSrc, contextPathDst);
    }
  }

  // Append new diff slices (not matching any base slice)
  const isClosed = currentBase.slicing?.rules === 'closed';
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

  // Handle unmatched diff entries
  for (const dm of unmatchedDiffSlices) {
    if (!dm.consumed) {
      dm.consumed = true;
    }
  }
}

// =============================================================================
// Section 11: Public Convenience — mergeSnapshot
// =============================================================================

/**
 * High-level convenience function: merge a base snapshot with a differential
 * to produce a new snapshot element list.
 *
 * This is the primary entry point for testing and for the SnapshotGenerator
 * orchestrator (Task 4.5).
 *
 * @param baseElements - The base profile's snapshot elements.
 * @param diffElements - The differential elements to apply.
 * @param context - Merge context (or auto-created if not provided).
 * @returns The merged snapshot element list.
 */
export function mergeSnapshot(
  baseElements: readonly ElementDefinition[],
  diffElements: readonly ElementDefinition[],
  context?: MergeContext,
): { elements: ElementDefinition[]; issues: SnapshotIssue[] } {
  const ctx = context ?? createMergeContext('');

  // Wrap diff elements in trackers
  const diffTrackers = diffElements.map(createDiffTracker);

  // Determine root path from base
  const rootPath = baseElements.length > 0 ? (baseElements[0].path as string) ?? '' : '';

  // Run the merge loop
  const result: ElementDefinition[] = [];
  processPaths(
    ctx, result,
    baseElements, 0, baseElements.length - 1,
    diffTrackers, 0, diffTrackers.length - 1,
    rootPath, rootPath,
  );

  // Check for unconsumed differential elements
  for (const tracker of diffTrackers) {
    if (!tracker.consumed) {
      ctx.issues.push(
        createSnapshotIssue(
          'warning',
          'DIFFERENTIAL_NOT_CONSUMED',
          `Differential element '${tracker.element.path ?? tracker.element.id ?? '<unknown>'}' was not consumed`,
          tracker.element.path as string | undefined,
        ),
      );
    }
  }

  return { elements: result, issues: ctx.issues };
}
