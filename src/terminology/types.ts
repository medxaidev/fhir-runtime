/**
 * fhir-terminology — Public Interfaces & Types
 *
 * Defines data structures for terminology binding validation:
 * - {@link CodeSystemDefinition} — in-memory CodeSystem representation
 * - {@link ValueSetDefinition} — in-memory ValueSet representation
 * - {@link BindingValidationResult} — result of binding validation
 *
 * @module fhir-terminology
 */

// =============================================================================
// Section 1: CodeSystem Types
// =============================================================================

/**
 * In-memory representation of a FHIR CodeSystem.
 *
 * Stores the minimal information needed for code validation and lookup.
 */
export interface CodeSystemDefinition {
  /** Canonical URL of the CodeSystem. */
  readonly url: string;

  /** Version of the CodeSystem. */
  readonly version?: string;

  /** Human-readable name of the CodeSystem. */
  readonly name?: string;

  /** Flat or hierarchical list of concepts. */
  readonly concepts: readonly CodeSystemConcept[];
}

/**
 * A single concept in a CodeSystem.
 *
 * Supports hierarchical CodeSystems via the `children` property.
 */
export interface CodeSystemConcept {
  /** The code value. */
  readonly code: string;

  /** Human-readable display string. */
  readonly display?: string;

  /** Formal definition of the concept. */
  readonly definition?: string;

  /** Child concepts (for hierarchical CodeSystems like SNOMED CT). */
  readonly children?: readonly CodeSystemConcept[];
}

// =============================================================================
// Section 2: ValueSet Types
// =============================================================================

/**
 * In-memory representation of a FHIR ValueSet.
 *
 * Supports both `compose` (intensional) and `expansion` (extensional)
 * definitions.
 */
export interface ValueSetDefinition {
  /** Canonical URL of the ValueSet. */
  readonly url: string;

  /** Version of the ValueSet. */
  readonly version?: string;

  /** Human-readable name of the ValueSet. */
  readonly name?: string;

  /** Intensional definition (include/exclude rules). */
  readonly compose?: ValueSetCompose;

  /** Pre-expanded list of concepts. */
  readonly expansion?: ValueSetExpansionDef;
}

/**
 * Intensional definition of a ValueSet.
 */
export interface ValueSetCompose {
  /** Include rules — concepts matching any include are in the ValueSet. */
  readonly include: readonly ValueSetComposeInclude[];

  /** Exclude rules — concepts matching any exclude are removed. */
  readonly exclude?: readonly ValueSetComposeInclude[];
}

/**
 * A single include or exclude clause in a ValueSet compose.
 */
export interface ValueSetComposeInclude {
  /** The CodeSystem URL to include/exclude from. */
  readonly system: string;

  /** Optional CodeSystem version. */
  readonly version?: string;

  /** Explicit list of concepts to include/exclude. */
  readonly concept?: readonly ValueSetComposeConcept[];

  /** Filter rules (e.g., is-a hierarchy). */
  readonly filter?: readonly ValueSetComposeFilter[];
}

/**
 * An explicitly enumerated concept in a ValueSet compose include.
 */
export interface ValueSetComposeConcept {
  /** The code value. */
  readonly code: string;

  /** Optional display string. */
  readonly display?: string;
}

/**
 * A filter rule in a ValueSet compose include.
 */
export interface ValueSetComposeFilter {
  /** The CodeSystem property to filter on. */
  readonly property: string;

  /** The filter operation. */
  readonly op: 'is-a' | 'is-not-a' | 'in' | 'not-in' | '=' | 'regex' | 'exists';

  /** The value to filter by. */
  readonly value: string;
}

/**
 * Pre-expanded ValueSet (extensional definition).
 */
export interface ValueSetExpansionDef {
  /** Total number of concepts. */
  readonly total?: number;

  /** The expanded concepts. */
  readonly contains: readonly ValueSetExpansionContainsDef[];
}

/**
 * A single concept in a ValueSet expansion.
 */
export interface ValueSetExpansionContainsDef {
  /** The CodeSystem URL. */
  readonly system: string;

  /** The code value. */
  readonly code: string;

  /** Human-readable display. */
  readonly display?: string;
}

// =============================================================================
// Section 3: Binding Validation Result
// =============================================================================

/**
 * Result of validating a coded value against a binding.
 */
export interface BindingValidationResult {
  /** Whether the code is valid in the bound ValueSet. */
  readonly valid: boolean;

  /** Severity of the issue (if invalid). */
  readonly severity: 'error' | 'warning' | 'information';

  /** Human-readable message. */
  readonly message: string;

  /** The code that was validated. */
  readonly code?: string;

  /** The CodeSystem of the code. */
  readonly system?: string;

  /** The ValueSet URL the code was validated against. */
  readonly valueSetUrl?: string;
}
