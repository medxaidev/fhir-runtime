/**
 * fhir-model — Unified exports for all FHIR R4 type definitions
 *
 * This barrel file re-exports every public type from the model layer.
 * Import order follows the dependency chain:
 *   primitives → element-definition → structure-definition → canonical-profile
 *
 * @module fhir-model
 */

// --- Primitives: branded types, enums, base complex types ---
export type {
  // Branded primitive types
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
} from './primitives.js';

// --- ElementDefinition and sub-types ---
export type {
  ElementDefinition,
  ElementDefinitionSlicing,
  SlicingDiscriminator,
  ElementDefinitionBase,
  ElementDefinitionType,
  ElementDefinitionConstraint,
  ElementDefinitionBinding,
  ElementDefinitionExample,
  ElementDefinitionMapping,
} from './element-definition.js';

// --- StructureDefinition and sub-types ---
export type {
  StructureDefinition,
  StructureDefinitionMapping,
  StructureDefinitionContext,
  StructureDefinitionSnapshot,
  StructureDefinitionDifferential,
} from './structure-definition.js';

// --- Canonical Profile (internal semantic model) ---
export type {
  CanonicalProfile,
  CanonicalElement,
  TypeConstraint,
  BindingConstraint,
  Invariant,
  SlicingDefinition,
  SlicingDiscriminatorDef,
} from './canonical-profile.js';
