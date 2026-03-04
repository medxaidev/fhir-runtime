/**
 * FHIR R4 StructureDefinition Model
 *
 * Defines the complete StructureDefinition resource type as per the FHIR R4
 * specification, including all sub-types (Mapping, Context, Snapshot, Differential).
 *
 * StructureDefinition is the core metadata resource that describes the shape
 * of other FHIR resources, data types, and extensions. It is the primary input
 * for snapshot generation and validation.
 *
 * @see https://hl7.org/fhir/R4/structuredefinition.html
 * @module fhir-model
 */

import type {
  FhirBoolean,
  FhirCanonical,
  FhirDateTime,
  FhirId,
  FhirMarkdown,
  FhirString,
  FhirUri,
  PublicationStatus,
  StructureDefinitionKind,
  TypeDerivationRule,
  ExtensionContextType,
  FhirVersionCode,
  CodeableConcept,
  Coding,
  ContactDetail,
  BackboneElement,
  DomainResource,
  Identifier,
  UsageContext,
} from './primitives.js';

import type { ElementDefinition } from './element-definition.js';

// =============================================================================
// Section 1: StructureDefinition Sub-Types
// =============================================================================

/**
 * A mapping to an external specification that the structure conforms to.
 * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.mapping
 */
export interface StructureDefinitionMapping extends BackboneElement {
  /** Internal id when this mapping is used (1..1) */
  identity: FhirId;
  /** Identifies what this mapping refers to (0..1) */
  uri?: FhirUri;
  /** Names what this mapping refers to (0..1) */
  name?: FhirString;
  /** Versions, issues, scope limitations, etc. (0..1) */
  comment?: FhirString;
}

/**
 * Identifies the types of resource or data type elements to which the
 * extension can be applied. Only relevant when kind = 'resource' and
 * type = 'Extension'.
 * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.context
 */
export interface StructureDefinitionContext extends BackboneElement {
  /** fhirpath | element | extension (1..1) */
  type: ExtensionContextType;
  /** Where the extension can be used in instances (1..1) */
  expression: FhirString;
}

/**
 * A snapshot view of the structure, containing all element definitions
 * with their complete constraint information resolved from the
 * inheritance chain.
 * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.snapshot
 */
export interface StructureDefinitionSnapshot extends BackboneElement {
  /**
   * Definition of elements in the resource (if no StructureDefinition) (1..*)
   *
   * The snapshot contains the complete, flattened list of all ElementDefinition
   * entries with all constraints from the inheritance chain fully resolved.
   * This is the "semantic truth" used for validation and interpretation.
   */
  element: ElementDefinition[];
}

/**
 * A differential view of the structure, containing only the constraints
 * that differ from the base definition. This is the compact authoring
 * format used when creating profiles.
 * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.differential
 */
export interface StructureDefinitionDifferential extends BackboneElement {
  /**
   * Definition of elements in the resource (if no StructureDefinition) (1..*)
   *
   * The differential contains only the constraints that differ from the base
   * profile. It MUST NOT be used directly for semantic interpretation — it
   * must first be expanded into a snapshot via snapshot generation.
   */
  element: ElementDefinition[];
}

// =============================================================================
// Section 2: StructureDefinition Resource
// =============================================================================

/**
 * A definition of a FHIR structure — a resource, data type, or extension.
 *
 * StructureDefinition is the central metadata resource in FHIR. It defines:
 * - The shape of resources and data types (via snapshot/differential)
 * - Profile constraints (via derivation = 'constraint')
 * - Extension definitions (via kind = 'resource', type = 'Extension')
 *
 * This interface extends DomainResource and includes all fields defined
 * in the FHIR R4 specification.
 *
 * @see https://hl7.org/fhir/R4/structuredefinition.html
 */
export interface StructureDefinition extends DomainResource {
  // === Resource Identity ===

  /** Resource type discriminator (1..1) */
  resourceType: 'StructureDefinition';

  // === Conformance Resource Metadata ===

  /**
   * Canonical identifier for this structure definition, represented as a URI
   * (globally unique) (1..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.url
   */
  url: FhirUri;

  /**
   * Additional identifier for the structure definition (0..*)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.identifier
   */
  identifier?: Identifier[];

  /**
   * Business version of the structure definition (0..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.version
   */
  version?: FhirString;

  /**
   * Computer-readable name of the structure definition (1..1)
   *
   * Name should be usable as an identifier for the module by machine
   * processing applications such as code generation.
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.name
   */
  name: FhirString;

  /**
   * Human-readable name for the structure definition (0..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.title
   */
  title?: FhirString;

  /**
   * Publication status: draft | active | retired | unknown (1..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.status
   */
  status: PublicationStatus;

  /**
   * For testing purposes, not real usage (0..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.experimental
   */
  experimental?: FhirBoolean;

  /**
   * Date last changed (0..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.date
   */
  date?: FhirDateTime;

  /**
   * Name of the publisher (organization or individual) (0..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.publisher
   */
  publisher?: FhirString;

  /**
   * Contact details for the publisher (0..*)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.contact
   */
  contact?: ContactDetail[];

  /**
   * Natural language description of the structure definition (0..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.description
   */
  description?: FhirMarkdown;

  /**
   * The context that the content is intended to support (0..*)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.useContext
   */
  useContext?: UsageContext[];

  /**
   * Intended jurisdiction for structure definition (0..*)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.jurisdiction
   */
  jurisdiction?: CodeableConcept[];

  /**
   * Why this structure definition is defined (0..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.purpose
   */
  purpose?: FhirMarkdown;

  /**
   * Use and/or publishing restrictions (0..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.copyright
   */
  copyright?: FhirMarkdown;

  /**
   * Assist with indexing and finding (0..*)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.keyword
   */
  keyword?: Coding[];

  /**
   * FHIR Version this StructureDefinition targets (0..1)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.fhirVersion
   */
  fhirVersion?: FhirVersionCode;

  // === Mapping ===

  /**
   * External specification that the content is mapped to (0..*)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.mapping
   */
  mapping?: StructureDefinitionMapping[];

  // === Core Semantic Fields ===

  /**
   * The kind of structure: primitive-type | complex-type | resource | logical (1..1)
   *
   * Determines the fundamental nature of the structure being defined.
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.kind
   */
  kind: StructureDefinitionKind;

  /**
   * Whether the structure is abstract (1..1)
   *
   * Abstract types cannot be instantiated directly. For example,
   * `DomainResource` is abstract — you cannot create a resource
   * with `resourceType: "DomainResource"`.
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.abstract
   */
  abstract: FhirBoolean;

  /**
   * If an extension, where it can be used in instances (0..*)
   *
   * Only meaningful when kind = 'resource' and type = 'Extension'.
   * Defines the contexts in which the extension can appear.
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.context
   */
  context?: StructureDefinitionContext[];

  /**
   * FHIRPath invariants — conditions that must be true for the
   * extension to be valid in a given context (0..*)
   *
   * Only meaningful when kind = 'resource' and type = 'Extension'.
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.contextInvariant
   */
  contextInvariant?: FhirString[];

  /**
   * Type defined or constrained by this structure (1..1)
   *
   * For base definitions (derivation = 'specialization'), this is the
   * type being defined (e.g., 'Patient', 'Observation').
   * For profiles (derivation = 'constraint'), this is the type being
   * constrained (must match the type of the base definition).
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.type
   */
  type: FhirUri;

  /**
   * Definition that this type is constrained/specialized from (0..1)
   *
   * The canonical URL of the base StructureDefinition. This forms the
   * inheritance chain used in snapshot generation.
   * - For specializations: points to the parent type
   * - For constraints: points to the profile being constrained
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.baseDefinition
   */
  baseDefinition?: FhirCanonical;

  /**
   * specialization | constraint (0..1)
   *
   * - `specialization`: defines a new type (e.g., Patient specializes DomainResource)
   * - `constraint`: constrains an existing type (e.g., USCorePatient constrains Patient)
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.derivation
   */
  derivation?: TypeDerivationRule;

  // === Snapshot & Differential ===

  /**
   * Snapshot view of the structure (0..1)
   *
   * Contains the complete, flattened element tree with all constraints
   * from the inheritance chain resolved. Generated by the snapshot
   * generation algorithm (fhir-profile module).
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.snapshot
   */
  snapshot?: StructureDefinitionSnapshot;

  /**
   * Differential constraints of the structure (0..1)
   *
   * Contains only the constraints that differ from the base definition.
   * This is the authoring format — profiles are typically written as
   * differentials to avoid repeating base constraints.
   * @see https://hl7.org/fhir/R4/structuredefinition-definitions.html#StructureDefinition.differential
   */
  differential?: StructureDefinitionDifferential;
}
