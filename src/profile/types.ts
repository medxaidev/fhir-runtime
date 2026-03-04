/**
 * fhir-profile — Public Interfaces & Types
 *
 * Defines the core abstractions for the FHIR profile module:
 * - {@link SnapshotGeneratorOptions} — generation configuration
 * - {@link SnapshotResult} — generation output
 * - {@link SnapshotIssue} — issue reporting
 * - {@link DiffElementTracker} — internal differential consumption tracking
 * - {@link TraversalScope} — cursor-based scope for base-driven traversal
 *
 * This module implements the snapshot generation algorithm conceptually
 * equivalent to HAPI FHIR's `ProfileUtilities.generateSnapshot()`.
 *
 * @module fhir-profile
 */

import type {
  CanonicalProfile,
  ElementDefinition,
  StructureDefinition,
} from '../model/index.js';

// =============================================================================
// Section 1: Snapshot Generation Options
// =============================================================================

/**
 * Configuration options for snapshot generation.
 *
 * @example
 * ```typescript
 * const options: SnapshotGeneratorOptions = {
 *   throwOnError: false,
 *   maxRecursionDepth: 50,
 *   generateCanonical: true,
 * };
 * ```
 */
export interface SnapshotGeneratorOptions {
  /**
   * Whether to throw on the first error or collect all errors.
   *
   * When `true`, the generator throws immediately on the first error
   * (matching HAPI's "exception mode"). When `false` (default), errors
   * are collected in {@link SnapshotResult.issues} and generation
   * continues as far as possible.
   *
   * @default false
   */
  readonly throwOnError?: boolean;

  /**
   * Maximum recursion depth for nested snapshot generation.
   *
   * Snapshot generation can recursively trigger generation of other
   * profiles (e.g., when a base profile lacks a snapshot, or when
   * expanding into datatype definitions). This limit prevents runaway
   * recursion in pathological or circular profiles.
   *
   * @default 50
   */
  readonly maxRecursionDepth?: number;

  /**
   * Whether to generate a {@link CanonicalProfile} alongside the snapshot.
   *
   * When `true`, the result includes a `canonical` field containing
   * the MedXAI internal semantic model derived from the generated snapshot.
   *
   * @default false
   */
  readonly generateCanonical?: boolean;
}

// =============================================================================
// Section 2: Snapshot Result
// =============================================================================

/**
 * Result of snapshot generation.
 *
 * Contains the StructureDefinition with its populated snapshot, any issues
 * encountered during generation, and optionally a {@link CanonicalProfile}.
 *
 * @example
 * ```typescript
 * const result = await generator.generate(sd);
 * if (result.success) {
 *   console.log(`Generated ${result.structureDefinition.snapshot?.element.length} elements`);
 * } else {
 *   console.error('Errors:', result.issues.filter(i => i.severity === 'error'));
 * }
 * ```
 */
export interface SnapshotResult {
  /** The StructureDefinition with populated snapshot. */
  readonly structureDefinition: StructureDefinition;

  /**
   * Optional {@link CanonicalProfile} if
   * {@link SnapshotGeneratorOptions.generateCanonical} was `true`.
   */
  readonly canonical?: CanonicalProfile;

  /** Issues encountered during generation (warnings + errors). */
  readonly issues: readonly SnapshotIssue[];

  /**
   * Whether generation completed successfully.
   *
   * `true` when no error-severity issues were recorded.
   * Warnings and informational issues do not affect this flag.
   */
  readonly success: boolean;
}

// =============================================================================
// Section 3: Snapshot Issue
// =============================================================================

/**
 * An issue encountered during snapshot generation.
 *
 * Mirrors the concept of HAPI's `ValidationMessage` but scoped to
 * snapshot generation. Issues are collected during generation and
 * returned in {@link SnapshotResult.issues}.
 *
 * @example
 * ```typescript
 * const issue: SnapshotIssue = {
 *   severity: 'error',
 *   code: 'CARDINALITY_VIOLATION',
 *   message: 'Derived min (0) is less than base min (1)',
 *   path: 'Patient.identifier',
 * };
 * ```
 */
export interface SnapshotIssue {
  /** Severity level of the issue. */
  readonly severity: 'error' | 'warning' | 'information';

  /** Machine-readable issue code. */
  readonly code: SnapshotIssueCode;

  /** Human-readable description of the issue. */
  readonly message: string;

  /** Element path where the issue occurred (e.g., `'Patient.identifier'`). */
  readonly path?: string;

  /** Additional details for debugging. */
  readonly details?: string;
}

// =============================================================================
// Section 4: Snapshot Issue Codes
// =============================================================================

/**
 * Machine-readable issue codes for snapshot generation.
 *
 * Each code corresponds to a specific category of problem that can
 * occur during the snapshot generation process.
 */
export type SnapshotIssueCode =
  /** Circular dependency detected in profile chain. */
  | 'CIRCULAR_DEPENDENCY'
  /** Base StructureDefinition could not be loaded. */
  | 'BASE_NOT_FOUND'
  /** Base StructureDefinition exists but has no snapshot. */
  | 'BASE_MISSING_SNAPSHOT'
  /** Differential element was not consumed during generation. */
  | 'DIFFERENTIAL_NOT_CONSUMED'
  /** Cardinality constraint violation (min/max tightening rules). */
  | 'CARDINALITY_VIOLATION'
  /** Type constraint is incompatible with base types. */
  | 'TYPE_INCOMPATIBLE'
  /** Binding constraint violation (e.g., relaxing REQUIRED binding). */
  | 'BINDING_VIOLATION'
  /** Slicing-related error (compatibility, closed slicing, etc.). */
  | 'SLICING_ERROR'
  /** Differential path not found in base snapshot. */
  | 'PATH_NOT_FOUND'
  /** Generic invalid constraint (catch-all for other violations). */
  | 'INVALID_CONSTRAINT'
  /** Internal error in the generator (should not happen). */
  | 'INTERNAL_ERROR';

// =============================================================================
// Section 5: Internal Types — Differential Tracking
// =============================================================================

/**
 * Tracks a differential element during snapshot generation.
 *
 * Implements the HAPI marker pattern where each differential element
 * is tagged with `userData(GENERATED_IN_SNAPSHOT)` after being consumed
 * by the merge algorithm. At the end of generation, any tracker with
 * `consumed === false` indicates an unmatched differential element.
 *
 * @internal Used by {@link ElementMerger} and {@link SnapshotGenerator}.
 */
export interface DiffElementTracker {
  /** The original differential ElementDefinition. */
  readonly element: ElementDefinition;

  /**
   * Whether this element has been consumed (matched and merged)
   * during snapshot generation.
   *
   * Set to `true` by the merge algorithm when the element is
   * successfully applied to the snapshot. Checked post-generation
   * to detect unmatched differential elements.
   */
  consumed: boolean;
}

// =============================================================================
// Section 6: Internal Types — Traversal Scope
// =============================================================================

/**
 * Cursor-based scope for base-driven traversal.
 *
 * Used by the element merger (`processPaths` equivalent) to define
 * the current working range within a list of ElementDefinitions.
 * Both `start` and `end` are inclusive indices.
 *
 * This mirrors HAPI's `baseCursor/baseLimit` and `diffCursor/diffLimit`
 * parameter pairs in `processPaths()`.
 *
 * @example
 * ```typescript
 * // Scope covering elements[2] through elements[5]
 * const scope: TraversalScope = {
 *   elements: baseSnapshot.element,
 *   start: 2,
 *   end: 5,
 * };
 * ```
 *
 * @internal Used by {@link ElementMerger}.
 */
export interface TraversalScope {
  /** The element list being traversed. */
  readonly elements: readonly ElementDefinition[];

  /** Start index (inclusive). */
  readonly start: number;

  /** End index (inclusive). */
  readonly end: number;
}

// =============================================================================
// Section 7: Helper Functions
// =============================================================================

/**
 * Create a {@link SnapshotIssue} with the given parameters.
 *
 * Convenience factory to reduce boilerplate when recording issues.
 */
export function createSnapshotIssue(
  severity: SnapshotIssue['severity'],
  code: SnapshotIssueCode,
  message: string,
  path?: string,
  details?: string,
): SnapshotIssue {
  const issue: SnapshotIssue = { severity, code, message };
  if (path !== undefined) {
    (issue as { path: string }).path = path;
  }
  if (details !== undefined) {
    (issue as { details: string }).details = details;
  }
  return issue;
}

/**
 * Create a {@link DiffElementTracker} for a differential element.
 *
 * @param element - The differential ElementDefinition to track.
 * @returns A tracker with `consumed` set to `false`.
 */
export function createDiffTracker(element: ElementDefinition): DiffElementTracker {
  return { element, consumed: false };
}
