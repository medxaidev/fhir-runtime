/**
 * fhir-profile — Barrel Exports
 *
 * Re-exports all public types, interfaces, error classes, and helper
 * functions from the FHIR profile module.
 *
 * Public surface:
 * - Types: SnapshotGeneratorOptions, SnapshotResult, SnapshotIssue, etc.
 * - SnapshotGenerator: orchestrator class
 * - CanonicalBuilder: SD → CanonicalProfile conversion
 * - Errors: ProfileError hierarchy
 * - Path Utilities: path matching for advanced consumers
 *
 * @module fhir-profile
 */

// ─── Types & Interfaces ───
export type {
  SnapshotGeneratorOptions,
  SnapshotResult,
  SnapshotIssue,
  SnapshotIssueCode,
  DiffElementTracker,
  TraversalScope,
} from './types.js';

// ─── Type Helper Functions ───
export {
  createSnapshotIssue,
  createDiffTracker,
} from './types.js';

// ─── SnapshotGenerator ───
export { SnapshotGenerator } from './snapshot-generator.js';

// ─── CanonicalBuilder ───
export {
  buildCanonicalProfile,
  buildCanonicalElement,
  buildTypeConstraints,
  buildBindingConstraint,
  buildInvariants,
  buildSlicingDefinition,
} from './canonical-builder.js';

// ─── Errors ───
export {
  ProfileError,
  SnapshotCircularDependencyError,
  BaseNotFoundError,
  ConstraintViolationError,
  UnconsumedDifferentialError,
} from './errors.js';

// ─── Path Utilities (for advanced consumers) ───
export {
  pathMatches,
  isDirectChild,
  isDescendant,
  pathDepth,
  parentPath,
  tailSegment,
  isChoiceTypePath,
  matchesChoiceType,
  extractChoiceTypeName,
  hasSliceName,
  extractSliceName,
} from './path-utils.js';

// ─── Element Sorter ───
export {
  findBaseIndex,
  sortDifferential,
  validateElementOrder,
  ensureElementIds,
} from './element-sorter.js';

// ─── Constraint Merger ───
export {
  mergeConstraints,
  setBaseTraceability,
  mergeCardinality,
  mergeTypes,
  mergeBinding,
  mergeConstraintList,
  isLargerMax,
} from './constraint-merger.js';

// ─── Element Merger ───
export type { MergeContext } from './element-merger.js';
export {
  createMergeContext,
  processPaths,
  mergeSnapshot,
} from './element-merger.js';

// ─── Slicing Handler ───
export {
  makeExtensionSlicing,
  getSliceSiblings,
  validateSlicingCompatibility,
  diffsConstrainTypes,
  handleNewSlicing,
  handleExistingSlicing,
} from './slicing-handler.js';
