/**
 * `@medxai/fhir-core` — Public API (Frozen at v0.1.0)
 *
 * Re-exports all public types and functions from the six core modules:
 *   model → parser → context → profile → validator (+ fhirpath internal)
 *
 * This file defines the frozen public API surface for @medxai/fhir-core v0.1.
 * Any symbol exported here is subject to the v0.1 compatibility contract.
 * See: docs/specs/engine-capability-contract-v0.1.md
 *      docs/api/fhir-core-api-v0.1.md
 *
 * @packageDocumentation
 */

// ─── Parser module ───────────────────────────────────────────────────────────
export type {
  ParseSeverity,
  ParseErrorCode,
  ParseIssue,
  ParseResult,
  ChoiceValue,
  ChoiceTypeField,
} from './parser/index.js';

export {
  parseFhirJson,
  parseFhirObject,
  parseStructureDefinition,
  parseElementDefinition,
  serializeToFhirJson,
  serializeToFhirObject,
  parseSuccess,
  parseFailure,
  createIssue,
  hasErrors,
} from './parser/index.js';

// ─── Model module ────────────────────────────────────────────────────────────
export type {
  // Primitives
  FhirBoolean,
  FhirInteger,
  FhirString,
  FhirDecimal,
  FhirUri,
  FhirUrl,
  FhirCanonical,
  FhirBase64Binary,
  FhirInstant,
  FhirDate,
  FhirDateTime,
  FhirTime,
  FhirCode,
  FhirOid,
  FhirId,
  FhirMarkdown,
  FhirUnsignedInt,
  FhirPositiveInt,
  FhirUuid,
  FhirXhtml,

  // Enums
  PublicationStatus,
  StructureDefinitionKind,
  TypeDerivationRule,
  ExtensionContextType,
  FhirVersionCode,
  PropertyRepresentation,
  SlicingRules,
  DiscriminatorType,
  AggregationMode,
  ReferenceVersionRules,
  ConstraintSeverity,
  BindingStrength,
  NarrativeStatus,

  // Base complex types
  Element,
  Extension,
  Coding,
  CodeableConcept,
  Identifier,
  Period,
  Reference,
  ContactDetail,
  ContactPoint,
  UsageContext,
  Quantity,
  Narrative,
  Meta,
  Resource,
  DomainResource,
  BackboneElement,

  // ElementDefinition
  ElementDefinition,
  ElementDefinitionSlicing,
  SlicingDiscriminator,
  ElementDefinitionBase,
  ElementDefinitionType,
  ElementDefinitionConstraint,
  ElementDefinitionBinding,
  ElementDefinitionExample,
  ElementDefinitionMapping,

  // StructureDefinition
  StructureDefinition,
  StructureDefinitionMapping,
  StructureDefinitionContext,
  StructureDefinitionSnapshot,
  StructureDefinitionDifferential,

  // Canonical Profile (internal semantic model)
  CanonicalProfile,
  CanonicalElement,
  TypeConstraint,
  BindingConstraint,
  Invariant,
  SlicingDefinition,
  SlicingDiscriminatorDef,
} from './model/index.js';

// ─── Context module ─────────────────────────────────────────────────────────
export type {
  FhirContext,
  FhirContextOptions,
  StructureDefinitionLoader,
  LoaderOptions,
  ContextStatistics,
  BundleLoadOptions,
  BundleLoadResult,
  BundleLoadError,
} from './context/index.js';

export {
  FhirContextImpl,
  createEmptyStatistics,
  MemoryLoader,
  FileSystemLoader,
  CompositeLoader,
  ContextError,
  ResourceNotFoundError,
  CircularDependencyError,
  LoaderError,
  InvalidStructureDefinitionError,
  loadBundleFromObject,
  loadBundleFromFile,
  loadBundlesFromFiles,
  BASE_RESOURCES,
  PRIMITIVE_TYPES,
  COMPLEX_TYPES,
  CORE_RESOURCES,
  ALL_CORE_DEFINITIONS,
  loadAllCoreDefinitions,
  loadCoreDefinition,
  loadCoreDefinitionSync,
  getCoreDefinitionsDir,
  extractInnerTypes,
  buildTypeName,
  isBackboneElementType,
} from './context/index.js';

// ─── Profile module ────────────────────────────────────────────────────────
export type {
  SnapshotGeneratorOptions,
  SnapshotResult,
  SnapshotIssue,
  SnapshotIssueCode,
  DiffElementTracker,
  TraversalScope,
  MergeContext,
} from './profile/index.js';

export {
  // SnapshotGenerator
  SnapshotGenerator,

  // CanonicalBuilder
  buildCanonicalProfile,
  buildCanonicalElement,
  buildTypeConstraints,
  buildBindingConstraint,
  buildInvariants,
  buildSlicingDefinition,

  // Errors
  ProfileError,
  SnapshotCircularDependencyError,
  BaseNotFoundError,
  ConstraintViolationError,
  UnconsumedDifferentialError,

  // Type helpers
  createSnapshotIssue,
  createDiffTracker,

  // Path utilities
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

  // Element sorter
  findBaseIndex,
  sortDifferential,
  validateElementOrder,
  ensureElementIds,

  // Constraint merger
  mergeConstraints,
  setBaseTraceability,
  mergeCardinality,
  mergeTypes,
  mergeBinding,
  mergeConstraintList,
  isLargerMax,

  // Element merger
  createMergeContext,
  processPaths,
  mergeSnapshot,

  // Slicing handler
  makeExtensionSlicing,
  getSliceSiblings,
  validateSlicingCompatibility,
  diffsConstrainTypes,
  handleNewSlicing,
  handleExistingSlicing,
} from './profile/index.js';

// ─── Validator module ──────────────────────────────────────────────────────
export type {
  ValidationOptions,
  ValidationResult,
  ValidationIssue,
  ValidationIssueCode,
} from './validator/index.js';

export {
  StructureValidator,
  createValidationIssue,
  resolveValidationOptions,
  hasValidationErrors,
  extractValues,
  ProfileNotFoundError,
  ValidationFailedError,
} from './validator/index.js';

// ─── FHIRPath module (public evaluation API) ─────────────────────────────
export {
  evalFhirPath,
  evalFhirPathBoolean,
  evalFhirPathTyped,
  evalFhirPathString,
} from './fhirpath/index.js';

// ─── Provider module (STAGE-1: v0.3.0) ──────────────────────────────────
export type {
  TerminologyProvider,
  ValidateCodeParams,
  ValidateCodeResult,
  ExpandValueSetParams,
  ValueSetExpansion,
  ValueSetExpansionContains,
  LookupCodeParams,
  LookupCodeResult,
  ReferenceResolver,
  OperationOutcome,
  OperationOutcomeIssue,
  OperationOutcomeIssueType,
} from './provider/index.js';

export {
  NoOpTerminologyProvider,
  NoOpReferenceResolver,
  buildOperationOutcome,
  buildOperationOutcomeFromParse,
  buildOperationOutcomeFromSnapshot,
} from './provider/index.js';

// ─── Pipeline module (STAGE-4: v0.4.0) ──────────────────────────────────
export type {
  ValidationStep,
  PipelineContext,
  PipelineOptions,
  PipelineResult,
  StepResult,
  BatchEntry,
  BatchResult,
  BatchEntryResult,
  PipelineEvent,
  PipelineEventHandler,
  PipelineEventData,
  EnhancedValidationIssue,
  ValidationReport,
  ReportSummary,
} from './pipeline/index.js';

export {
  ValidationPipeline,
  StructuralValidationStep,
  TerminologyValidationStep,
  InvariantValidationStep,
  generateReport,
  enhanceIssue,
  enhanceIssues,
  HookManager,
} from './pipeline/index.js';
