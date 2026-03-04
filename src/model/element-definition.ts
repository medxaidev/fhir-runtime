/**
 * FHIR R4 ElementDefinition Model
 *
 * Defines the complete ElementDefinition complex type as per the FHIR R4
 * specification, including all sub-types (Slicing, Discriminator, Base,
 * Type, Constraint, Binding, Example, Mapping).
 *
 * ElementDefinition is the most complex data type in FHIR. It appears inside
 * StructureDefinition.snapshot.element and StructureDefinition.differential.element,
 * and carries all constraint information for a single element path.
 *
 * @see https://hl7.org/fhir/R4/elementdefinition.html
 * @module fhir-model
 */

import type {
  FhirBoolean,
  FhirCanonical,
  FhirCode,
  FhirId,
  FhirInteger,
  FhirMarkdown,
  FhirString,
  FhirUnsignedInt,
  FhirUri,
  PropertyRepresentation,
  SlicingRules,
  DiscriminatorType,
  AggregationMode,
  ReferenceVersionRules,
  ConstraintSeverity,
  BindingStrength,
  BackboneElement,
  Coding,
  Element,
} from './primitives.js';

// =============================================================================
// Section 1: ElementDefinition Sub-Types
// =============================================================================

// --- Slicing ---

/**
 * How an element is sliced — defines the discriminator(s) and rules
 * for matching slices in an instance.
 * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.slicing
 */
export interface ElementDefinitionSlicing extends Element {
  /**
   * Element values that are used to distinguish the slices (0..*)
   *
   * Each discriminator specifies a path and a type that together
   * identify which slice a given element instance belongs to.
   */
  discriminator?: SlicingDiscriminator[];
  /** Text description of how slicing works (or in profile determine how slicing is used) (0..1) */
  description?: FhirString;
  /** If elements must be in same order as slices (0..1) */
  ordered?: FhirBoolean;
  /**
   * closed | open | openAtEnd (1..1)
   *
   * - `closed`: no additional content allowed beyond the defined slices
   * - `open`: additional content allowed anywhere
   * - `openAtEnd`: additional content allowed, but only at the end
   * @see https://hl7.org/fhir/R4/valueset-resource-slicing-rules.html
   */
  rules: SlicingRules;
}

/**
 * Designates a discriminator to differentiate between slices.
 * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.slicing.discriminator
 */
export interface SlicingDiscriminator extends Element {
  /**
   * value | exists | pattern | type | profile (1..1)
   * @see https://hl7.org/fhir/R4/valueset-discriminator-type.html
   */
  type: DiscriminatorType;
  /**
   * Path to element value (1..1)
   *
   * A FHIRPath expression that identifies the element within the
   * resource/type to be used as the discriminator.
   */
  path: FhirString;
}

// --- Base ---

/**
 * Information about the base definition of the element, provided to
 * make it unnecessary for tools to trace the deviation of the element
 * through the derived and related profiles.
 * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.base
 */
export interface ElementDefinitionBase extends Element {
  /** Path that identifies the base element (1..1) */
  path: FhirString;
  /** Min cardinality of the base element (1..1) */
  min: FhirUnsignedInt;
  /**
   * Max cardinality of the base element (1..1)
   *
   * A string value, either a number or "*" for unbounded.
   */
  max: FhirString;
}

// --- Type ---

/**
 * The data type or resource that is a permitted type for the element.
 * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.type
 */
export interface ElementDefinitionType extends Element {
  /**
   * Data type or Resource (name) (1..1)
   *
   * The URI of the data type or resource, e.g., `http://hl7.org/fhirpath/System.String`
   * for primitives or a simple name like `string`, `Patient`, `Reference`.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.type.code
   */
  code: FhirUri;
  /**
   * Profiles (StructureDefinition or IG) — one of which this type must
   * conform to (0..*)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.type.profile
   */
  profile?: FhirCanonical[];
  /**
   * Profile (StructureDefinition or IG) on the Reference target —
   * one of which the reference must conform to (0..*)
   *
   * Only meaningful when `code` is `Reference` or `canonical`.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.type.targetProfile
   */
  targetProfile?: FhirCanonical[];
  /**
   * contained | referenced | bundled (0..*)
   *
   * How resource references are aggregated. Only meaningful when
   * `code` is `Reference`.
   * @see https://hl7.org/fhir/R4/valueset-resource-aggregation-mode.html
   */
  aggregation?: AggregationMode[];
  /**
   * either | independent | specific (0..1)
   *
   * Whether references need to be version-specific.
   * @see https://hl7.org/fhir/R4/valueset-reference-version-rules.html
   */
  versioning?: ReferenceVersionRules;
}

// --- Constraint ---

/**
 * Formal constraints (invariants) on the element that must be satisfied
 * for the element to be valid.
 * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.constraint
 */
export interface ElementDefinitionConstraint extends Element {
  /**
   * Target of 'condition' reference (1..1)
   *
   * Unique identifier for the constraint, used by `condition` fields
   * to reference which constraints apply.
   */
  key: FhirId;
  /** Why this constraint is necessary or appropriate (0..1) */
  requirements?: FhirString;
  /**
   * error | warning (1..1)
   * @see https://hl7.org/fhir/R4/valueset-constraint-severity.html
   */
  severity: ConstraintSeverity;
  /** Human description of constraint (1..1) */
  human: FhirString;
  /**
   * FHIRPath expression of constraint (0..1)
   *
   * A FHIRPath expression that must evaluate to `true` when
   * tested against the element and its children.
   */
  expression?: FhirString;
  /**
   * XPath expression of constraint (0..1)
   *
   * Deprecated in favor of `expression` (FHIRPath), but retained
   * for backward compatibility with older profiles.
   */
  xpath?: FhirString;
  /**
   * Reference to original source of constraint (0..1)
   *
   * Canonical URL of the StructureDefinition where this constraint
   * was originally defined.
   */
  source?: FhirCanonical;
}

// --- Binding ---

/**
 * Binds an element to a specific value set, indicating the degree of
 * conformance expectation.
 * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.binding
 */
export interface ElementDefinitionBinding extends Element {
  /**
   * required | extensible | preferred | example (1..1)
   *
   * Indicates the degree of conformance expectations associated with
   * this binding. Only `required` means mandatory in FHIR.
   * @see https://hl7.org/fhir/R4/valueset-binding-strength.html
   */
  strength: BindingStrength;
  /** Human explanation of the value set (0..1) */
  description?: FhirString;
  /**
   * Source of value set (0..1)
   *
   * Canonical URL reference to the value set bound to this element.
   */
  valueSet?: FhirCanonical;
}

// --- Example ---

/**
 * A sample value for the element, providing an example for implementers.
 * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.example
 */
export interface ElementDefinitionExample extends Element {
  /** Describes the purpose of this example (1..1) */
  label: FhirString;
  /**
   * Value of Example (1..1)
   *
   * Choice type [x] — the actual property name in JSON will be
   * `valueString`, `valueBoolean`, `valueCoding`, etc.
   * Can be any FHIR data type.
   *
   * Stage-1: represented as `unknown`; fhir-parser will handle
   * concrete dispatch in Phase 2.
   */
  value: unknown;
}

// --- Mapping ---

/**
 * Identifies a concept from an external specification that roughly
 * corresponds to this element.
 * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.mapping
 */
export interface ElementDefinitionMapping extends Element {
  /**
   * Reference to mapping declaration (1..1)
   *
   * An internal reference to the StructureDefinition.mapping.identity
   * that this element mapping refers to.
   */
  identity: FhirId;
  /** Computable language of mapping (0..1) */
  language?: FhirCode;
  /** Details of the mapping (1..1) */
  map: FhirString;
  /** Comments about the mapping (0..1) */
  comment?: FhirString;
}

// =============================================================================
// Section 2: ElementDefinition
// =============================================================================

/**
 * Captures constraints on each element within a resource, data type,
 * or extension.
 *
 * ElementDefinition is the most complex data type in FHIR. Each instance
 * describes a single element path (e.g., `Patient.name`, `Patient.name.given`)
 * and carries all constraint information: cardinality, types, bindings,
 * invariants, slicing, flags, and documentation.
 *
 * ElementDefinition appears in:
 * - `StructureDefinition.snapshot.element` (complete, flattened)
 * - `StructureDefinition.differential.element` (delta only)
 *
 * This interface extends BackboneElement (has `id`, `extension`,
 * `modifierExtension`).
 *
 * @see https://hl7.org/fhir/R4/elementdefinition.html
 */
export interface ElementDefinition extends BackboneElement {
  // === Core Path & Identity ===

  /**
   * Path of the element in the hierarchy of elements (1..1)
   *
   * The path is dot-separated, e.g., `Patient.name.given`.
   * The first element in a snapshot always has a path equal to the
   * resource/type name (e.g., `Patient`).
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.path
   */
  path: FhirString;

  /**
   * How this element is represented in instances (0..*)
   *
   * Controls serialization format (mainly relevant for XML).
   * @see https://hl7.org/fhir/R4/valueset-property-representation.html
   */
  representation?: PropertyRepresentation[];

  /**
   * Name for this particular element (in a set of slices) (0..1)
   *
   * Unique within the context of the containing element. Used to
   * identify slices in a slicing definition.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.sliceName
   */
  sliceName?: FhirString;

  /**
   * If this slice definition constrains an inherited slice definition
   * (or not) (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.sliceIsConstraining
   */
  sliceIsConstraining?: FhirBoolean;

  /**
   * Name for element to display with or prompt for element (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.label
   */
  label?: FhirString;

  /**
   * Corresponding codes in terminologies (0..*)
   *
   * Codes that define the meaning of this element, e.g., LOINC or
   * SNOMED CT codes. Used for mapping and search.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.code
   */
  code?: Coding[];

  // === Slicing ===

  /**
   * This element is sliced — slices follow (0..1)
   *
   * Defines how this element can be divided into a set of slices.
   * Only appears on the "slicing root" element; individual slices
   * are identified by `sliceName`.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.slicing
   */
  slicing?: ElementDefinitionSlicing;

  // === Documentation ===

  /**
   * Concise definition for space-constrained presentations (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.short
   */
  short?: FhirString;

  /**
   * Full formal definition of the element (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.definition
   */
  definition?: FhirMarkdown;

  /**
   * Comments about the use of this element (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.comment
   */
  comment?: FhirMarkdown;

  /**
   * Why this resource has been created (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.requirements
   */
  requirements?: FhirMarkdown;

  /**
   * Other names (0..*)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.alias
   */
  alias?: FhirString[];

  // === Cardinality ===

  /**
   * Minimum cardinality (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.min
   */
  min?: FhirUnsignedInt;

  /**
   * Maximum cardinality (number or "*") (0..1)
   *
   * A string value: either a non-negative integer or `"*"` for unbounded.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.max
   */
  max?: FhirString;

  // === Base ===

  /**
   * Base definition information for tools (0..1)
   *
   * Records the cardinality and path from the base StructureDefinition,
   * so tools can show what has changed in a derived profile without
   * needing to trace the full inheritance chain.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.base
   */
  base?: ElementDefinitionBase;

  // === Content Reference ===

  /**
   * Reference to definition of content for the element (0..1)
   *
   * A URI that points to another element within the same
   * StructureDefinition, in the form `#<elementId>`. Indicates that
   * this element has the same meaning and constraints as the
   * referenced element.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.contentReference
   */
  contentReference?: FhirUri;

  // === Type ===

  /**
   * Data type and profile for this element (0..*)
   *
   * Defines the allowed types for this element. Multiple entries
   * indicate a choice type (e.g., value[x] can be valueString,
   * valueInteger, etc.).
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.type
   */
  type?: ElementDefinitionType[];

  // === Value Constraints ===

  /**
   * Specified value if missing from instance (0..1)
   *
   * Choice type [x] — the actual JSON property will be
   * `defaultValueString`, `defaultValueBoolean`, etc.
   * Can be any FHIR data type.
   *
   * Stage-1: represented as `unknown`; fhir-parser will handle
   * concrete dispatch in Phase 2.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.defaultValue_x_
   */
  defaultValue?: unknown;

  /**
   * Implicit meaning when this element is missing (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.meaningWhenMissing
   */
  meaningWhenMissing?: FhirMarkdown;

  /**
   * What the order of the elements means (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.orderMeaning
   */
  orderMeaning?: FhirString;

  /**
   * Value must be exactly this (0..1)
   *
   * Choice type [x] — `fixedString`, `fixedCoding`, etc.
   * If present, the element value in instances MUST match exactly.
   *
   * Stage-1: represented as `unknown`; fhir-parser will handle
   * concrete dispatch in Phase 2.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.fixed_x_
   */
  fixed?: unknown;

  /**
   * Value must have at least these property values (0..1)
   *
   * Choice type [x] — `patternCodeableConcept`, `patternString`, etc.
   * More lenient than `fixed`: the instance value must contain at least
   * the properties and values specified by the pattern.
   *
   * Stage-1: represented as `unknown`; fhir-parser will handle
   * concrete dispatch in Phase 2.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.pattern_x_
   */
  pattern?: unknown;

  // === Examples ===

  /**
   * Example value (as defined for type) (0..*)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.example
   */
  example?: ElementDefinitionExample[];

  // === Value Range ===

  /**
   * Minimum allowed value (for some types) (0..1)
   *
   * Choice type [x] — `minValueDate`, `minValueInteger`, etc.
   * Only applicable to: date, dateTime, instant, time, decimal,
   * integer, positiveInt, unsignedInt, Quantity.
   *
   * Stage-1: represented as `unknown`; fhir-parser will handle
   * concrete dispatch in Phase 2.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.minValue_x_
   */
  minValue?: unknown;

  /**
   * Maximum allowed value (for some types) (0..1)
   *
   * Choice type [x] — `maxValueDate`, `maxValueInteger`, etc.
   * Same type restrictions as `minValue`.
   *
   * Stage-1: represented as `unknown`; fhir-parser will handle
   * concrete dispatch in Phase 2.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.maxValue_x_
   */
  maxValue?: unknown;

  /**
   * Max length for strings (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.maxLength
   */
  maxLength?: FhirInteger;

  // === Constraints ===

  /**
   * Reference to invariant about presence (0..*)
   *
   * A list of constraint keys (`ElementDefinitionConstraint.key`) that
   * are conditions on this element. When a constraint evaluates to false,
   * the element is not valid.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.condition
   */
  condition?: FhirId[];

  /**
   * Condition that must evaluate to true (0..*)
   *
   * Formal constraints (invariants) that must be met for the element
   * to be valid. Expressed as FHIRPath expressions.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.constraint
   */
  constraint?: ElementDefinitionConstraint[];

  // === Flags ===

  /**
   * If the element must be supported (0..1)
   *
   * When `true`, implementations claiming conformance to this profile
   * MUST "meaningfully support" this element. The exact meaning of
   * mustSupport is defined per implementation guide.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.mustSupport
   */
  mustSupport?: FhirBoolean;

  /**
   * If this modifies the meaning of other elements (0..1)
   *
   * Modifier elements can change the interpretation of the containing
   * resource or element. Implementations MUST understand modifier elements.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.isModifier
   */
  isModifier?: FhirBoolean;

  /**
   * Reason that this element is marked as a modifier (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.isModifierReason
   */
  isModifierReason?: FhirString;

  /**
   * Include when _summary = true? (0..1)
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.isSummary
   */
  isSummary?: FhirBoolean;

  // === Binding ===

  /**
   * ValueSet details if this is coded (0..1)
   *
   * Binds this element to a specific value set. The `strength`
   * determines how strictly the binding applies.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.binding
   */
  binding?: ElementDefinitionBinding;

  // === Mapping ===

  /**
   * Map element to another set of definitions (0..*)
   *
   * Identifies a concept from an external specification (e.g., v2,
   * CDA, or a custom mapping) that corresponds to this element.
   * @see https://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.mapping
   */
  mapping?: ElementDefinitionMapping[];
}
