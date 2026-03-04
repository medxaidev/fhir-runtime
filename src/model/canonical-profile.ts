/**
 * Canonical Profile — Internal Semantic Model
 *
 * Defines the internal, post-snapshot-generation representation of a FHIR
 * StructureDefinition. This is NOT a FHIR-specified type — it is MedXAI's
 * own semantic abstraction designed for efficient downstream consumption
 * by the validation, runtime, and application layers.
 *
 * ## Relationship to FHIR types
 *
 * ```
 * StructureDefinition (FHIR R4, raw)
 *   → snapshot generation (fhir-profile module)
 *     → CanonicalProfile (internal, resolved)
 * ```
 *
 * ## Design Principles
 *
 * 1. **Pre-resolved** — all inheritance is flattened; no need to chase
 *    `baseDefinition` chains at query time.
 * 2. **Semantic types** — `max` is `number | 'unbounded'` instead of
 *    FHIR's raw `"*"` string, eliminating repeated parsing.
 * 3. **Non-optional flags** — `mustSupport`, `isModifier`, `isSummary`
 *    always have a value (default `false`), and `constraints` is always
 *    an array (possibly empty), removing undefined checks downstream.
 * 4. **O(1) element lookup** — `elements` is a `Map<string, CanonicalElement>`
 *    keyed by element path. JavaScript `Map` preserves insertion order,
 *    so iteration yields elements in definition order (matching the
 *    snapshot element array order).
 *
 * @module fhir-model
 */

import type {
  BindingStrength,
  ConstraintSeverity,
  DiscriminatorType,
  SlicingRules,
  StructureDefinitionKind,
  TypeDerivationRule,
} from './primitives.js';

// =============================================================================
// Section 1: Canonical Sub-Types
// =============================================================================

/**
 * A resolved type constraint on a canonical element.
 *
 * Corresponds to a simplified, pre-validated version of
 * `ElementDefinition.type` from the FHIR spec.
 */
export interface TypeConstraint {
  /**
   * The data type or resource name (e.g., `string`, `Reference`, `Patient`).
   *
   * Unlike `ElementDefinitionType.code` (which is a URI), this is the
   * resolved short name used for runtime dispatch.
   */
  code: string;

  /**
   * Profiles that the type must conform to (resolved canonical URLs).
   *
   * Corresponds to `ElementDefinitionType.profile`.
   */
  profiles?: string[];

  /**
   * For Reference/canonical types, profiles that the target must conform to.
   *
   * Corresponds to `ElementDefinitionType.targetProfile`.
   */
  targetProfiles?: string[];
}

/**
 * A resolved value set binding on a canonical element.
 *
 * Corresponds to a simplified version of `ElementDefinition.binding`.
 */
export interface BindingConstraint {
  /**
   * required | extensible | preferred | example
   *
   * Indicates the degree of conformance expectation.
   * @see https://hl7.org/fhir/R4/valueset-binding-strength.html
   */
  strength: BindingStrength;

  /**
   * Canonical URL of the bound value set.
   *
   * Resolved from `ElementDefinitionBinding.valueSet`.
   */
  valueSetUrl?: string;

  /** Human-readable description of the binding. */
  description?: string;
}

/**
 * A resolved constraint (invariant) on a canonical element.
 *
 * Corresponds to a simplified version of `ElementDefinition.constraint`.
 */
export interface Invariant {
  /** Unique key identifying this constraint. */
  key: string;

  /**
   * error | warning
   * @see https://hl7.org/fhir/R4/valueset-constraint-severity.html
   */
  severity: ConstraintSeverity;

  /** Human-readable description of the constraint. */
  human: string;

  /** FHIRPath expression that must evaluate to `true`. */
  expression?: string;

  /**
   * Canonical URL of the StructureDefinition where this constraint
   * was originally defined.
   */
  source?: string;
}

/**
 * A resolved slicing definition on a canonical element.
 *
 * Corresponds to a simplified version of `ElementDefinition.slicing`.
 * Unlike the FHIR version, `ordered` is always a boolean (default `false`).
 */
export interface SlicingDefinition {
  /** Discriminators used to match slices. */
  discriminators: SlicingDiscriminatorDef[];

  /**
   * closed | open | openAtEnd
   * @see https://hl7.org/fhir/R4/valueset-resource-slicing-rules.html
   */
  rules: SlicingRules;

  /**
   * Whether elements must appear in the same order as slices.
   *
   * Always has a value (default `false`), unlike the FHIR spec where
   * this is optional.
   */
  ordered: boolean;

  /** Human-readable description of the slicing. */
  description?: string;
}

/**
 * A single discriminator within a slicing definition.
 *
 * Corresponds to `ElementDefinition.slicing.discriminator`.
 */
export interface SlicingDiscriminatorDef {
  /**
   * value | exists | pattern | type | profile
   * @see https://hl7.org/fhir/R4/valueset-discriminator-type.html
   */
  type: DiscriminatorType;

  /**
   * FHIRPath expression identifying the discriminating element.
   */
  path: string;
}

// =============================================================================
// Section 2: CanonicalElement
// =============================================================================

/**
 * A single resolved element within a CanonicalProfile.
 *
 * This is the internal, pre-resolved representation of an
 * `ElementDefinition` from a StructureDefinition snapshot.
 * All values are resolved and normalized for efficient downstream use.
 *
 * ## Key differences from ElementDefinition
 *
 * | Aspect | ElementDefinition (FHIR) | CanonicalElement (internal) |
 * |--------|--------------------------|----------------------------|
 * | `max` | `string` (`"1"`, `"*"`) | `number \| 'unbounded'` |
 * | `mustSupport` | `boolean \| undefined` | `boolean` (always present) |
 * | `isModifier` | `boolean \| undefined` | `boolean` (always present) |
 * | `isSummary` | `boolean \| undefined` | `boolean` (always present) |
 * | `constraints` | `array \| undefined` | `array` (always present, may be empty) |
 * | `types` | `array \| undefined` | `array` (always present, may be empty) |
 */
export interface CanonicalElement {
  /** Element path (e.g., `Patient.name.given`). */
  path: string;

  /**
   * Element id (e.g., `Patient.name.given`).
   *
   * In most cases identical to `path`, but may differ for sliced elements
   * (e.g., `Patient.identifier:MRN`).
   */
  id: string;

  /**
   * Minimum cardinality.
   *
   * Resolved from `ElementDefinition.min`. Always a non-negative integer.
   */
  min: number;

  /**
   * Maximum cardinality.
   *
   * **Design decision:** Uses `number | 'unbounded'` instead of FHIR's
   * `string` representation. The `"*"` from FHIR is converted to
   * `'unbounded'` during snapshot resolution, eliminating the need for
   * downstream code to repeatedly parse the string.
   */
  max: number | 'unbounded';

  /**
   * Allowed types for this element.
   *
   * Always an array (possibly empty). Empty means the element is a
   * backbone element whose children define its structure.
   */
  types: TypeConstraint[];

  /**
   * Value set binding, if this element is coded.
   */
  binding?: BindingConstraint;

  /**
   * Formal constraints (invariants) on this element.
   *
   * **Design decision:** Always an array (possibly empty), never
   * `undefined`. This simplifies downstream iteration — no need to
   * check for `undefined` before looping.
   */
  constraints: Invariant[];

  /**
   * Slicing definition, if this element is a slicing root.
   */
  slicing?: SlicingDefinition;

  /**
   * Whether implementations must meaningfully support this element.
   *
   * **Design decision:** Always `boolean`, never `undefined`.
   * Defaults to `false` during snapshot resolution.
   */
  mustSupport: boolean;

  /**
   * Whether this element can modify the meaning of other elements.
   *
   * **Design decision:** Always `boolean`, never `undefined`.
   * Defaults to `false` during snapshot resolution.
   */
  isModifier: boolean;

  /**
   * Whether this element is included in summary views.
   *
   * **Design decision:** Always `boolean`, never `undefined`.
   * Defaults to `false` during snapshot resolution.
   */
  isSummary: boolean;

  /**
   * Slice name for this element, if it is a named slice.
   *
   * Corresponds to `ElementDefinition.sliceName`. Only present on
   * elements that represent a specific slice within a sliced array.
   *
   * @example `'MRN'` for `Patient.identifier:MRN`
   */
  sliceName?: string;

  /**
   * Fixed value constraint for this element.
   *
   * When present, the element value MUST exactly equal this value.
   * Corresponds to `ElementDefinition.fixed[x]` in the FHIR spec.
   *
   * **Design decision:** Stored as `unknown` because fixed values can
   * be any FHIR type (primitive or complex). The validator performs
   * deep equality comparison at runtime.
   */
  fixed?: unknown;

  /**
   * Pattern value constraint for this element.
   *
   * When present, the element value must be a superset of this pattern —
   * all fields in the pattern must exist in the value with matching values,
   * but the value may contain additional fields.
   * Corresponds to `ElementDefinition.pattern[x]` in the FHIR spec.
   *
   * **Design decision:** Stored as `unknown` for the same reason as `fixed`.
   */
  pattern?: unknown;
}

// =============================================================================
// Section 3: CanonicalProfile
// =============================================================================

/**
 * The internal, resolved representation of a FHIR StructureDefinition.
 *
 * A CanonicalProfile is produced by the snapshot generation algorithm
 * (fhir-profile module) from a StructureDefinition. It flattens the
 * inheritance chain and resolves all element constraints into a single,
 * self-contained structure optimized for validation and runtime use.
 *
 * ## Usage
 *
 * ```typescript
 * // Produced by fhir-profile (Phase 4):
 * const profile: CanonicalProfile = snapshotGenerator.generate(structureDef);
 *
 * // O(1) element lookup:
 * const nameElement = profile.elements.get('Patient.name');
 *
 * // Iteration in definition order (Map preserves insertion order):
 * for (const [path, element] of profile.elements) { ... }
 * ```
 *
 * ## Design note on `elements` ordering
 *
 * JavaScript `Map` preserves insertion order (ES2015+). The fhir-profile
 * module MUST insert elements in the same order as the snapshot element
 * array, so that iteration over `elements` yields elements in definition
 * order. This is important for rendering and for algorithms that depend
 * on element ordering (e.g., slicing evaluation).
 */
export interface CanonicalProfile {
  /**
   * Canonical URL of this profile.
   *
   * Corresponds to `StructureDefinition.url`.
   */
  url: string;

  /**
   * Business version of this profile.
   *
   * Corresponds to `StructureDefinition.version`.
   */
  version?: string;

  /**
   * Computer-readable name.
   *
   * Corresponds to `StructureDefinition.name`.
   */
  name: string;

  /**
   * The kind of structure: primitive-type | complex-type | resource | logical.
   *
   * Corresponds to `StructureDefinition.kind`.
   */
  kind: StructureDefinitionKind;

  /**
   * The type defined or constrained (e.g., `Patient`, `Observation`).
   *
   * Corresponds to `StructureDefinition.type`.
   */
  type: string;

  /**
   * Canonical URL of the base profile, if any.
   *
   * Corresponds to `StructureDefinition.baseDefinition`.
   */
  baseProfile?: string;

  /**
   * Whether this type is abstract.
   *
   * Corresponds to `StructureDefinition.abstract`.
   */
  abstract: boolean;

  /**
   * specialization | constraint
   *
   * Corresponds to `StructureDefinition.derivation`.
   */
  derivation?: TypeDerivationRule;

  /**
   * All resolved elements, keyed by element path.
   *
   * **Design decision:** Uses `Map<string, CanonicalElement>` instead of
   * an array for O(1) path lookup. `Map` preserves insertion order
   * (ES2015+), so iteration yields elements in definition order matching
   * the original snapshot element array.
   *
   * The fhir-profile module is responsible for populating this Map in
   * the correct order during snapshot generation.
   */
  elements: Map<string, CanonicalElement>;

  /**
   * Inner types extracted from BackboneElement elements.
   *
   * Keyed by generated type name (e.g., `'PatientContact'`).
   * Each inner type is itself a `CanonicalProfile` containing only
   * the direct child elements of the BackboneElement.
   *
   * Populated by {@link extractInnerTypes} after snapshot generation.
   * Inspired by Medplum's `InternalTypeSchema.innerTypes`.
   *
   * @example
   * ```typescript
   * const patientProfile = ...;
   * const contactType = patientProfile.innerTypes?.get('PatientContact');
   * // contactType.elements has: Patient.contact.relationship, Patient.contact.name, ...
   * ```
   */
  innerTypes?: Map<string, CanonicalProfile>;

  /**
   * If this profile is an inner type, the generated type name of its parent.
   *
   * For example, `PatientContact` has `parentType: 'Patient'`.
   * Top-level profiles have `parentType` as `undefined`.
   */
  parentType?: string;
}
