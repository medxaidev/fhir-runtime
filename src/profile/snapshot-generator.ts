/**
 * fhir-profile — Snapshot Generator (Orchestrator)
 *
 * Implements the top-level snapshot generation workflow, corresponding to
 * HAPI FHIR R4's `ProfileUtilities.generateSnapshot()`.
 *
 * This is the **orchestrator** that coordinates:
 * 1. Input validation
 * 2. Circular dependency detection (generation stack)
 * 3. Base SD loading (recursive snapshot generation if needed)
 * 4. Datatype cache population
 * 5. Merge loop delegation to {@link processPaths}
 * 6. Post-processing (unconsumed diff, element IDs)
 * 7. Result caching
 *
 * @module fhir-profile
 */

import type { ElementDefinition, StructureDefinition } from '../model/index.js';
import type { FhirContext } from '../context/types.js';
import type { SnapshotGeneratorOptions, SnapshotResult, SnapshotIssue } from './types.js';
import { createSnapshotIssue, createDiffTracker } from './types.js';
import type { MergeContext } from './element-merger.js';
import { createMergeContext, processPaths } from './element-merger.js';
import {
  SnapshotCircularDependencyError,
  BaseNotFoundError,
  UnconsumedDifferentialError,
} from './errors.js';

// =============================================================================
// Section 1: SnapshotGenerator Class
// =============================================================================

/**
 * Snapshot Generator — top-level orchestrator for snapshot generation.
 *
 * Corresponds to HAPI's `ProfileUtilities.generateSnapshot()`.
 *
 * @example
 * ```typescript
 * const generator = new SnapshotGenerator(fhirContext, { throwOnError: false });
 * const result = await generator.generate(myProfile);
 * if (result.success) {
 *   console.log('Snapshot generated with', result.structureDefinition.snapshot?.element.length, 'elements');
 * }
 * ```
 */
export class SnapshotGenerator {
  private readonly context: FhirContext;
  private readonly options: SnapshotGeneratorOptions;

  /** URLs currently being generated — for circular dependency detection. */
  private readonly generationStack: Set<string> = new Set();

  constructor(context: FhirContext, options: SnapshotGeneratorOptions = {}) {
    this.context = context;
    this.options = options;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Generate a snapshot for a StructureDefinition.
   *
   * @param sd - StructureDefinition with a differential to expand.
   * @returns SnapshotResult with the populated snapshot and any issues.
   * @throws {SnapshotCircularDependencyError} if circular reference detected
   * @throws {BaseNotFoundError} if base SD cannot be loaded
   * @throws {UnconsumedDifferentialError} if throwOnError and unconsumed diffs
   */
  async generate(sd: StructureDefinition): Promise<SnapshotResult> {
    const issues: SnapshotIssue[] = [];
    const url = sd.url as string;

    // ----- Step 1: Input validation -----
    const validationError = this.validateInput(sd, issues);
    if (validationError) {
      return this.buildResult(sd, issues);
    }

    // ----- Step 2: Circular dependency detection -----
    if (this.generationStack.has(url)) {
      const chain = [...this.generationStack, url];
      throw new SnapshotCircularDependencyError(url, chain);
    }
    this.generationStack.add(url);

    try {
      // ----- Step 2b: Handle root types (no baseDefinition) -----
      if (!sd.baseDefinition) {
        // Root types (Element, Resource) — use differential as snapshot
        const diffElements = sd.differential?.element ?? [];
        if (diffElements.length > 0) {
          const cloned = deepCloneElements(diffElements);
          ensureElementIds(cloned);
          sd.snapshot = { element: cloned } as typeof sd.snapshot;
        } else {
          sd.snapshot = { element: [] } as typeof sd.snapshot;
        }
        return this.buildResult(sd, issues);
      }

      // ----- Step 3: Load base StructureDefinition -----
      const baseUrl = sd.baseDefinition as string;
      const baseSd = await this.loadBase(sd, baseUrl, issues);
      if (!baseSd) {
        return this.buildResult(sd, issues);
      }

      // Recursively ensure base has a snapshot
      if (!baseSd.snapshot?.element?.length) {
        const baseResult = await this.generate(baseSd);
        if (!baseResult.success) {
          issues.push(
            createSnapshotIssue(
              'error',
              'BASE_MISSING_SNAPSHOT',
              `Failed to generate snapshot for base '${baseUrl}'`,
              url,
            ),
          );
          return this.buildResult(sd, issues);
        }
      }

      const baseElements = baseSd.snapshot!.element;

      // ----- Step 4: Prepare differential -----
      const diffElements = sd.differential?.element ?? [];
      if (diffElements.length === 0) {
        // No differential — just clone the base snapshot
        sd.snapshot = {
          element: deepCloneElements(baseElements),
        } as typeof sd.snapshot;
        return this.buildResult(sd, issues);
      }

      // ----- Step 5: Populate datatype cache -----
      const mergeCtx = createMergeContext(url, {
        fhirContext: this.context,
        maxDepth: this.options.maxRecursionDepth ?? 50,
      });
      await this.populateDatatypeCache(mergeCtx, baseElements, diffElements);

      // ----- Step 6: Run merge loop -----
      const diffTrackers = diffElements.map(createDiffTracker);
      const rootPath = baseElements.length > 0
        ? (baseElements[0].path as string) ?? ''
        : '';

      const result: ElementDefinition[] = [];
      processPaths(
        mergeCtx,
        result,
        baseElements, 0, baseElements.length - 1,
        diffTrackers, 0, diffTrackers.length - 1,
        rootPath, rootPath,
      );

      // Collect merge issues
      issues.push(...mergeCtx.issues);

      // ----- Step 7: Post-processing -----

      // 7a: Check for unconsumed differential elements
      const unconsumedPaths: string[] = [];
      for (const tracker of diffTrackers) {
        if (!tracker.consumed) {
          const path = (tracker.element.path as string)
            ?? (tracker.element.id as string)
            ?? '<unknown>';
          unconsumedPaths.push(path);
          issues.push(
            createSnapshotIssue(
              'warning',
              'DIFFERENTIAL_NOT_CONSUMED',
              `Differential element '${path}' was not consumed`,
              path,
            ),
          );
        }
      }

      if (unconsumedPaths.length > 0 && this.options.throwOnError) {
        throw new UnconsumedDifferentialError(unconsumedPaths);
      }

      // 7b: Ensure element IDs
      ensureElementIds(result);

      // ----- Step 8: Assemble result -----
      sd.snapshot = {
        element: result,
      } as typeof sd.snapshot;

      // Cache the updated SD back into context
      try {
        this.context.registerStructureDefinition(sd);
      } catch {
        // Non-fatal: caching failure shouldn't break generation
      }

      return this.buildResult(sd, issues);

    } catch (err) {
      // On error, clear snapshot and re-throw
      sd.snapshot = undefined;
      throw err;
    } finally {
      this.generationStack.delete(url);
    }
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate input StructureDefinition.
   * Returns true if there's a fatal validation error.
   */
  private validateInput(sd: StructureDefinition, issues: SnapshotIssue[]): boolean {
    if (!sd) {
      issues.push(
        createSnapshotIssue('error', 'INTERNAL_ERROR', 'StructureDefinition is null or undefined'),
      );
      return true;
    }

    if (!sd.url) {
      issues.push(
        createSnapshotIssue('error', 'INTERNAL_ERROR', 'StructureDefinition.url is required'),
      );
      return true;
    }

    // Root types (Element, Resource) don't need baseDefinition
    const isRootType = isRootStructureDefinition(sd);
    if (!sd.baseDefinition && !isRootType) {
      issues.push(
        createSnapshotIssue(
          'error',
          'BASE_NOT_FOUND',
          `StructureDefinition '${sd.url}' has no baseDefinition and is not a root type`,
          sd.url as string,
        ),
      );
      return true;
    }

    return false;
  }

  /**
   * Load the base StructureDefinition.
   */
  private async loadBase(
    sd: StructureDefinition,
    baseUrl: string,
    issues: SnapshotIssue[],
  ): Promise<StructureDefinition | undefined> {
    try {
      return await this.context.loadStructureDefinition(baseUrl);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      issues.push(
        createSnapshotIssue(
          'error',
          'BASE_NOT_FOUND',
          `Cannot load base '${baseUrl}' for '${sd.url}': ${msg}`,
          sd.url as string,
        ),
      );

      if (this.options.throwOnError) {
        throw new BaseNotFoundError(sd.url as string, baseUrl, err instanceof Error ? err : undefined);
      }

      return undefined;
    }
  }

  /**
   * Populate the datatype cache with snapshots of types referenced by
   * the differential's child paths.
   *
   * Scans both base elements and diff elements for type codes, then
   * pre-loads their StructureDefinitions into the merge context cache.
   */
  private async populateDatatypeCache(
    mergeCtx: MergeContext,
    baseElements: readonly ElementDefinition[],
    diffElements: readonly ElementDefinition[],
  ): Promise<void> {
    // Collect unique type codes from base elements that have diff children
    const typeCodes = new Set<string>();

    for (const base of baseElements) {
      if (base.type) {
        for (const t of base.type) {
          const code = t.code as string;
          if (code && isComplexType(code)) {
            typeCodes.add(code);
          }
        }
      }
    }

    // Also check diff elements for type codes
    for (const diff of diffElements) {
      if (diff.type) {
        for (const t of diff.type) {
          const code = t.code as string;
          if (code && isComplexType(code)) {
            typeCodes.add(code);
          }
        }
      }
    }

    // Load each datatype's snapshot into cache
    for (const code of typeCodes) {
      const dtUrl = `http://hl7.org/fhir/StructureDefinition/${code}`;
      if (mergeCtx.datatypeCache.has(dtUrl)) continue;

      try {
        const dtSd = await this.context.loadStructureDefinition(dtUrl);
        if (dtSd?.snapshot?.element) {
          mergeCtx.datatypeCache.set(dtUrl, dtSd.snapshot.element);
        }
      } catch {
        // Non-fatal: datatype not available, expansion will report issue
      }
    }
  }

  /**
   * Build a SnapshotResult from the current state.
   */
  private buildResult(sd: StructureDefinition, issues: SnapshotIssue[]): SnapshotResult {
    const hasErrors = issues.some((i) => i.severity === 'error');
    return {
      structureDefinition: sd,
      issues,
      success: !hasErrors,
    };
  }
}

// =============================================================================
// Section 2: Helper Functions
// =============================================================================

/**
 * Check if a StructureDefinition is a root type (Element or Resource)
 * that doesn't require a baseDefinition.
 */
function isRootStructureDefinition(sd: StructureDefinition): boolean {
  const type = sd.type as string;
  return type === 'Element' || type === 'Resource';
}

/**
 * Check if a type code represents a complex type that can be expanded.
 * Excludes primitive types and special types.
 */
function isComplexType(code: string): boolean {
  // Primitive types start with lowercase
  if (code.charAt(0) === code.charAt(0).toLowerCase() && code !== 'xhtml') {
    return false;
  }
  // Special types that shouldn't be expanded
  const skipTypes = new Set([
    'Resource', 'DomainResource', 'Element', 'BackboneElement',
    'Extension', 'Narrative',
  ]);
  return !skipTypes.has(code);
}

/**
 * Deep clone an array of ElementDefinitions.
 */
function deepCloneElements(elements: readonly ElementDefinition[]): ElementDefinition[] {
  if (typeof structuredClone === 'function') {
    return structuredClone(elements as ElementDefinition[]);
  }
  return JSON.parse(JSON.stringify(elements)) as ElementDefinition[];
}

/**
 * Ensure all elements have an `id` property.
 *
 * If an element lacks an `id`, generates one from its path and sliceName.
 * This follows the FHIR convention: `path` for unsliced elements,
 * `path:sliceName` for sliced elements.
 */
function ensureElementIds(elements: ElementDefinition[]): void {
  for (const el of elements) {
    if (!el.id && el.path) {
      const path = el.path as string;
      const sliceName = el.sliceName as string | undefined;
      el.id = (sliceName ? `${path}:${sliceName}` : path) as typeof el.id;
    }
  }
}
