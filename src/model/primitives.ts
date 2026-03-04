/**
 * FHIR R4 Primitive Types, Common Enums, and Base Complex Types
 *
 * This file defines the foundational type system for the fhir-core package.
 * All types are pure type definitions with zero runtime logic.
 *
 * @see https://hl7.org/fhir/R4/datatypes.html
 * @module fhir-model
 */

// =============================================================================
// Section 1: Branded Type Infrastructure
// =============================================================================

/**
 * Brand symbol used to distinguish FHIR primitive types at compile time.
 * This provides nominal typing over TypeScript's structural type system,
 * preventing accidental assignment between semantically different types
 * (e.g., assigning a FhirUri to a FhirCode) while maintaining zero runtime overhead.
 */
declare const __brand: unique symbol;

/**
 * Generic branded type. Intersects a base type with a unique brand tag.
 * @typeParam Base - The underlying TypeScript type (string, number, boolean)
 * @typeParam Brand - A unique string literal identifying the FHIR type
 */
type Branded<Base, Brand extends string> = Base & {
  readonly [__brand]: Brand;
};

// =============================================================================
// Section 2: FHIR R4 Primitive Types
// =============================================================================

/**
 * FHIR boolean: true | false
 * @see https://hl7.org/fhir/R4/datatypes.html#boolean
 */
export type FhirBoolean = Branded<boolean, 'FhirBoolean'>;

/**
 * FHIR integer: whole numbers in the range -2,147,483,648..2,147,483,647
 * Regex: `[0]|[-+]?[1-9][0-9]*`
 * @see https://hl7.org/fhir/R4/datatypes.html#integer
 */
export type FhirInteger = Branded<number, 'FhirInteger'>;

/**
 * FHIR string: a sequence of Unicode characters.
 * Regex: `[ \r\n\t\S]+`
 * Note: strings SHOULD not contain Unicode character points below 32,
 * except for horizontal tab, carriage return, and line feed.
 * @see https://hl7.org/fhir/R4/datatypes.html#string
 */
export type FhirString = Branded<string, 'FhirString'>;

/**
 * FHIR decimal: rational numbers with implicit precision.
 * Regex: `-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?`
 * Note: precision of the decimal value has significance
 * (e.g., 0.010 is regarded as different to 0.01).
 * @see https://hl7.org/fhir/R4/datatypes.html#decimal
 */
export type FhirDecimal = Branded<number, 'FhirDecimal'>;

/**
 * FHIR uri: a Uniform Resource Identifier.
 * Regex: `\S*`
 * @see https://hl7.org/fhir/R4/datatypes.html#uri
 */
export type FhirUri = Branded<string, 'FhirUri'>;

/**
 * FHIR url: a Uniform Resource Locator (a subset of uri).
 * Must start with http:, https:, ftp:, mailto:, or mllp:.
 * @see https://hl7.org/fhir/R4/datatypes.html#url
 */
export type FhirUrl = Branded<string, 'FhirUrl'>;

/**
 * FHIR canonical: a URI that refers to a resource by its canonical URL,
 * optionally with a version suffix `|version`.
 * @see https://hl7.org/fhir/R4/datatypes.html#canonical
 */
export type FhirCanonical = Branded<string, 'FhirCanonical'>;

/**
 * FHIR base64Binary: base64 encoded content (RFC 4648).
 * Regex: `(\s*([0-9a-zA-Z\+\/\=]){4}\s*)+`
 * @see https://hl7.org/fhir/R4/datatypes.html#base64Binary
 */
export type FhirBase64Binary = Branded<string, 'FhirBase64Binary'>;

/**
 * FHIR instant: an instant in time with at least second precision
 * and always includes a timezone.
 * Format: `YYYY-MM-DDThh:mm:ss.sss+zz:zz`
 * Regex: `([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])T([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?(Z|(\+|-)((0[0-9]|1[0-3]):[0-5][0-9]|14:00))`
 * @see https://hl7.org/fhir/R4/datatypes.html#instant
 */
export type FhirInstant = Branded<string, 'FhirInstant'>;

/**
 * FHIR date: a date or partial date (year, year-month, or year-month-day).
 * No timezone. No time.
 * Format: `YYYY(-MM(-DD)?)?`
 * Regex: `([0-9]([0-9]([0-9][1-9]|[1-9]0)|[1-9]00)|[1-9]000)(-(0[1-9]|1[0-2])(-(0[1-9]|[1-2][0-9]|3[0-1]))?)?`
 * @see https://hl7.org/fhir/R4/datatypes.html#date
 */
export type FhirDate = Branded<string, 'FhirDate'>;

/**
 * FHIR dateTime: a date, date-time, or partial date with optional time and timezone.
 * Format: `YYYY(-MM(-DD(Thh:mm:ss(.sss)?(Z|(+|-)hh:mm))?)?)?`
 * @see https://hl7.org/fhir/R4/datatypes.html#dateTime
 */
export type FhirDateTime = Branded<string, 'FhirDateTime'>;

/**
 * FHIR time: a time of day with no date and no timezone.
 * Format: `hh:mm:ss(.sss)?`
 * Regex: `([01][0-9]|2[0-3]):[0-5][0-9]:([0-5][0-9]|60)(\.[0-9]+)?`
 * @see https://hl7.org/fhir/R4/datatypes.html#time
 */
export type FhirTime = Branded<string, 'FhirTime'>;

/**
 * FHIR code: a string that is constrained to the set of allowed values
 * from a controlled vocabulary (value set).
 * Regex: `[^\s]+(\s[^\s]+)*`
 * @see https://hl7.org/fhir/R4/datatypes.html#code
 */
export type FhirCode = Branded<string, 'FhirCode'>;

/**
 * FHIR oid: an OID represented as a URI (RFC 3001).
 * Format: `urn:oid:[0-2](\.(0|[1-9][0-9]*))+`
 * @see https://hl7.org/fhir/R4/datatypes.html#oid
 */
export type FhirOid = Branded<string, 'FhirOid'>;

/**
 * FHIR id: any combination of upper- or lower-case ASCII letters,
 * numerals, '-', and '.', with a length limit of 64 characters.
 * Regex: `[A-Za-z0-9\-\.]{1,64}`
 * @see https://hl7.org/fhir/R4/datatypes.html#id
 */
export type FhirId = Branded<string, 'FhirId'>;

/**
 * FHIR markdown: a FHIR string that may contain markdown syntax.
 * Systems are not required to have markdown support.
 * @see https://hl7.org/fhir/R4/datatypes.html#markdown
 */
export type FhirMarkdown = Branded<string, 'FhirMarkdown'>;

/**
 * FHIR unsignedInt: non-negative integer in the range 0..2,147,483,647.
 * Regex: `[0]|([1-9][0-9]*)`
 * @see https://hl7.org/fhir/R4/datatypes.html#unsignedInt
 */
export type FhirUnsignedInt = Branded<number, 'FhirUnsignedInt'>;

/**
 * FHIR positiveInt: positive integer in the range 1..2,147,483,647.
 * Regex: `+?[1-9][0-9]*`
 * @see https://hl7.org/fhir/R4/datatypes.html#positiveInt
 */
export type FhirPositiveInt = Branded<number, 'FhirPositiveInt'>;

/**
 * FHIR uuid: a UUID expressed as a URI (RFC 4122).
 * Format: `urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}`
 * @see https://hl7.org/fhir/R4/datatypes.html#uuid
 */
export type FhirUuid = Branded<string, 'FhirUuid'>;

/**
 * FHIR xhtml: limited XHTML content as defined in the Narrative datatype.
 * @see https://hl7.org/fhir/R4/datatypes.html#xhtml
 * @see https://hl7.org/fhir/R4/narrative.html
 */
export type FhirXhtml = Branded<string, 'FhirXhtml'>;

// =============================================================================
// Section 3: Common Enums (Value Sets used by StructureDefinition / ElementDefinition)
// =============================================================================

/**
 * Publication status of a FHIR conformance resource.
 * @see https://hl7.org/fhir/R4/valueset-publication-status.html
 */
export type PublicationStatus = 'draft' | 'active' | 'retired' | 'unknown';

/**
 * The kind of structure being defined by a StructureDefinition.
 * @see https://hl7.org/fhir/R4/valueset-structure-definition-kind.html
 */
export type StructureDefinitionKind =
  | 'primitive-type'
  | 'complex-type'
  | 'resource'
  | 'logical';

/**
 * Whether a StructureDefinition is a specialization or a constraint.
 * - `specialization`: defines a new type (e.g., Patient specializes DomainResource)
 * - `constraint`: constrains an existing type (e.g., USCorePatient constrains Patient)
 * @see https://hl7.org/fhir/R4/valueset-type-derivation-rule.html
 */
export type TypeDerivationRule = 'specialization' | 'constraint';

/**
 * The context type for an extension definition.
 * @see https://hl7.org/fhir/R4/valueset-extension-context-type.html
 */
export type ExtensionContextType = 'fhirpath' | 'element' | 'extension';

/**
 * FHIR version identifier.
 * @see https://hl7.org/fhir/R4/valueset-FHIR-version.html
 */
export type FhirVersionCode =
  | '0.01'
  | '0.05'
  | '0.06'
  | '0.11'
  | '0.0.80'
  | '0.0.81'
  | '0.0.82'
  | '0.4.0'
  | '0.5.0'
  | '1.0.0'
  | '1.0.1'
  | '1.0.2'
  | '1.1.0'
  | '1.4.0'
  | '1.6.0'
  | '1.8.0'
  | '3.0.0'
  | '3.0.1'
  | '3.0.2'
  | '3.3.0'
  | '3.5.0'
  | '4.0.0'
  | '4.0.1';

/**
 * How a property is represented when serialized.
 * @see https://hl7.org/fhir/R4/valueset-property-representation.html
 */
export type PropertyRepresentation =
  | 'xmlAttr'
  | 'xmlText'
  | 'typeAttr'
  | 'cdaText'
  | 'xhtml';

/**
 * How slices are interpreted when evaluating an instance.
 * @see https://hl7.org/fhir/R4/valueset-resource-slicing-rules.html
 */
export type SlicingRules = 'closed' | 'open' | 'openAtEnd';

/**
 * How an element value is interpreted when discrimination is evaluated.
 * @see https://hl7.org/fhir/R4/valueset-discriminator-type.html
 */
export type DiscriminatorType =
  | 'value'
  | 'exists'
  | 'pattern'
  | 'type'
  | 'profile';

/**
 * How resource references can be aggregated.
 * @see https://hl7.org/fhir/R4/valueset-resource-aggregation-mode.html
 */
export type AggregationMode = 'contained' | 'referenced' | 'bundled';

/**
 * Whether all resource references need to be version-specific.
 * @see https://hl7.org/fhir/R4/valueset-reference-version-rules.html
 */
export type ReferenceVersionRules = 'either' | 'independent' | 'specific';

/**
 * The severity of a constraint violation.
 * @see https://hl7.org/fhir/R4/valueset-constraint-severity.html
 */
export type ConstraintSeverity = 'error' | 'warning';

/**
 * Indication of the degree of conformance expectations associated with a binding.
 * @see https://hl7.org/fhir/R4/valueset-binding-strength.html
 */
export type BindingStrength = 'required' | 'extensible' | 'preferred' | 'example';

/**
 * The status of a narrative.
 * @see https://hl7.org/fhir/R4/valueset-narrative-status.html
 */
export type NarrativeStatus = 'generated' | 'extensions' | 'additional' | 'empty';

// =============================================================================
// Section 4: Base Complex Types (referenced by StructureDefinition / ElementDefinition)
// =============================================================================

// --- Element (root of all FHIR types) ---

/**
 * Base definition for all elements in a resource.
 * Every element in FHIR inherits from Element.
 * @see https://hl7.org/fhir/R4/element.html
 */
export interface Element {
  /** Unique id for inter-element referencing (0..1) */
  id?: FhirString;
  /** Additional content defined by implementations (0..*) */
  extension?: Extension[];
}

// --- Extension ---

/**
 * An Extension: additional information that is not part of the basic
 * definition of the resource.
 * @see https://hl7.org/fhir/R4/extensibility.html#Extension
 */
export interface Extension extends Element {
  /** Identifies the meaning of the extension (1..1) */
  url: FhirUri;
  /**
   * Value of extension (0..1).
   *
   * Choice type [x] — the actual property name in JSON will be
   * `valueString`, `valueCode`, `valueBoolean`, `valueCoding`, etc.
   * Allows **all** FHIR data types (~50+ types).
   *
   * Stage-1: represented as `unknown`; fhir-parser will handle
   * concrete dispatch in Phase 2.
   * @see https://hl7.org/fhir/R4/extensibility-definitions.html#Extension.value_x_
   */
  value?: unknown;
}

// --- Coding ---

/**
 * A reference to a code defined by a terminology system.
 * @see https://hl7.org/fhir/R4/datatypes.html#Coding
 */
export interface Coding extends Element {
  /** Identity of the terminology system (0..1) */
  system?: FhirUri;
  /** Version of the system (0..1) */
  version?: FhirString;
  /** Symbol in syntax defined by the system (0..1) */
  code?: FhirCode;
  /** Representation defined by the system (0..1) */
  display?: FhirString;
  /** If this coding was chosen directly by the user (0..1) */
  userSelected?: FhirBoolean;
}

// --- CodeableConcept ---

/**
 * A concept that may be defined by a formal reference to a terminology
 * or ontology, or may be provided by text.
 * @see https://hl7.org/fhir/R4/datatypes.html#CodeableConcept
 */
export interface CodeableConcept extends Element {
  /** Code defined by a terminology system (0..*) */
  coding?: Coding[];
  /** Plain text representation of the concept (0..1) */
  text?: FhirString;
}

// --- Identifier ---

/**
 * An identifier intended for computation (e.g., MRN, NPI).
 * @see https://hl7.org/fhir/R4/datatypes.html#Identifier
 */
export interface Identifier extends Element {
  /** usual | official | temp | secondary | old (0..1) */
  use?: FhirCode;
  /** Description of identifier (0..1) */
  type?: CodeableConcept;
  /** The namespace for the identifier value (0..1) */
  system?: FhirUri;
  /** The value that is unique (0..1) */
  value?: FhirString;
  /** Time period when id is/was valid for use (0..1) */
  period?: Period;
  /** Organization that issued id (0..1) */
  assigner?: Reference;
}

// --- Period ---

/**
 * A time period defined by a start and end date/time.
 * @see https://hl7.org/fhir/R4/datatypes.html#Period
 */
export interface Period extends Element {
  /** Starting time with inclusive boundary (0..1) */
  start?: FhirDateTime;
  /** End time with inclusive boundary, if not ongoing (0..1) */
  end?: FhirDateTime;
}

// --- Reference ---

/**
 * A reference from one resource to another.
 * @see https://hl7.org/fhir/R4/references.html#Reference
 */
export interface Reference extends Element {
  /** Literal reference, Relative, internal or absolute URL (0..1) */
  reference?: FhirString;
  /** Type the reference refers to (e.g., "Patient") (0..1) */
  type?: FhirUri;
  /** Logical reference, when literal reference is not known (0..1) */
  identifier?: Identifier;
  /** Text alternative for the resource (0..1) */
  display?: FhirString;
}

// --- ContactDetail ---

/**
 * Contact information for a person or organization.
 * @see https://hl7.org/fhir/R4/metadatatypes.html#ContactDetail
 */
export interface ContactDetail extends Element {
  /** Name of an individual to contact (0..1) */
  name?: FhirString;
  /** Contact details for individual or organization (0..*) */
  telecom?: ContactPoint[];
}

// --- ContactPoint ---

/**
 * Details for all kinds of technology-mediated contact points.
 * @see https://hl7.org/fhir/R4/datatypes.html#ContactPoint
 */
export interface ContactPoint extends Element {
  /** phone | fax | email | pager | url | sms | other (0..1) */
  system?: FhirCode;
  /** The actual contact point details (0..1) */
  value?: FhirString;
  /** home | work | temp | old | mobile (0..1) */
  use?: FhirCode;
  /** Specify preferred order of use (0..1) */
  rank?: FhirPositiveInt;
  /** Time period when the contact point was/is in use (0..1) */
  period?: Period;
}

// --- UsageContext ---

/**
 * Specifies clinical/business/etc. context in which a conformance
 * artifact is applicable.
 * @see https://hl7.org/fhir/R4/metadatatypes.html#UsageContext
 */
export interface UsageContext extends Element {
  /** Type of context being specified (1..1) */
  code: Coding;
  /**
   * Value that defines the context (1..1).
   *
   * Choice type [x] — the actual property name in JSON will be
   * `valueCodeableConcept`, `valueQuantity`, `valueRange`, or `valueReference`.
   * Allows: CodeableConcept | Quantity | Range | Reference.
   *
   * Stage-1: represented as `unknown`; fhir-parser will handle
   * concrete dispatch in Phase 2.
   * @see https://hl7.org/fhir/R4/metadatatypes-definitions.html#UsageContext.value_x_
   */
  value?: unknown;
}

// --- Quantity ---

/**
 * A measured amount (or an amount that can potentially be measured).
 * @see https://hl7.org/fhir/R4/datatypes.html#Quantity
 */
export interface Quantity extends Element {
  /** Numerical value (with implicit precision) (0..1) */
  value?: FhirDecimal;
  /** `<` | `<=` | `>=` | `>` — how to understand the value (0..1) */
  comparator?: FhirCode;
  /** Unit representation (0..1) */
  unit?: FhirString;
  /** System that defines coded unit form (0..1) */
  system?: FhirUri;
  /** Coded form of the unit (0..1) */
  code?: FhirCode;
}

// --- Narrative ---

/**
 * A human-readable summary of the resource conveying the essential
 * clinical and business information.
 * @see https://hl7.org/fhir/R4/narrative.html#Narrative
 */
export interface Narrative extends Element {
  /** generated | extensions | additional | empty (1..1) */
  status: NarrativeStatus;
  /** Limited xhtml content (1..1) */
  div: FhirXhtml;
}

// --- Meta ---

/**
 * The metadata about a resource. This is content in the resource that is
 * maintained by the infrastructure.
 * @see https://hl7.org/fhir/R4/resource.html#Meta
 */
export interface Meta extends Element {
  /** Version specific identifier (0..1) */
  versionId?: FhirId;
  /** When the resource version last changed (0..1) */
  lastUpdated?: FhirInstant;
  /** Identifies where the resource comes from (0..1) */
  source?: FhirUri;
  /** Profiles this resource claims to conform to (0..*) */
  profile?: FhirCanonical[];
  /** Security Labels applied to this resource (0..*) */
  security?: Coding[];
  /** Tags applied to this resource (0..*) */
  tag?: Coding[];
}

// --- Resource (abstract base) ---

/**
 * Abstract base for all FHIR resources.
 * @see https://hl7.org/fhir/R4/resource.html
 */
export interface Resource {
  /**
   * The type of the resource (1..1)
   *
   * This is typed as `string` rather than `FhirString` because it serves
   * as a discriminator field that concrete resource interfaces narrow to
   * a string literal (e.g., `'StructureDefinition'`, `'Patient'`).
   * Branded types would prevent this narrowing.
   */
  resourceType: string;
  /** Logical id of this artifact (0..1) */
  id?: FhirId;
  /** Metadata about the resource (0..1) */
  meta?: Meta;
  /** A set of rules under which this content was created (0..1) */
  implicitRules?: FhirUri;
  /** Language of the resource content (0..1) */
  language?: FhirCode;
}

// --- DomainResource (abstract base for most resources) ---

/**
 * A resource that includes narrative, extensions, and contained resources.
 * Most FHIR resources inherit from DomainResource.
 * @see https://hl7.org/fhir/R4/domainresource.html
 */
export interface DomainResource extends Resource {
  /** Text summary of the resource, for human interpretation (0..1) */
  text?: Narrative;
  /** Contained, inline Resources (0..*) */
  contained?: Resource[];
  /** Additional content defined by implementations (0..*) */
  extension?: Extension[];
  /** Extensions that cannot be ignored (0..*) */
  modifierExtension?: Extension[];
}

// --- BackboneElement ---

/**
 * Base definition for all elements that are defined inside a resource,
 * but not those in a data type.
 * @see https://hl7.org/fhir/R4/backboneelement.html
 */
export interface BackboneElement extends Element {
  /** Extensions that cannot be ignored even if unrecognized (0..*) */
  modifierExtension?: Extension[];
}