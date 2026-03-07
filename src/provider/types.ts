/**
 * fhir-provider — Public Interfaces & Types
 *
 * Defines the provider abstraction layer for the FHIR runtime engine.
 * Providers are injectable interfaces that allow the runtime to interact
 * with external systems (terminology servers, reference resolvers) without
 * embedding any I/O or network logic.
 *
 * Core interfaces:
 * - {@link TerminologyProvider} — code validation, ValueSet expansion, code lookup
 * - {@link ReferenceResolver} — reference resolution and existence checks
 *
 * The runtime ships with NoOp default implementations that allow
 * standalone usage without any external dependencies.
 *
 * @module fhir-provider
 */

import type { Resource } from '../model/index.js';

// =============================================================================
// Section 1: Terminology Provider
// =============================================================================

/**
 * Parameters for validating a code against a CodeSystem or ValueSet.
 */
export interface ValidateCodeParams {
  /** The CodeSystem URL (e.g., `'http://loinc.org'`). */
  readonly system: string;

  /** The code to validate. */
  readonly code: string;

  /** Optional ValueSet URL to validate the code against. */
  readonly valueSetUrl?: string;

  /** Optional display string to validate. */
  readonly display?: string;
}

/**
 * Result of a code validation operation.
 */
export interface ValidateCodeResult {
  /** Whether the code is valid in the given system/ValueSet. */
  readonly result: boolean;

  /** Optional message explaining the validation outcome. */
  readonly message?: string;

  /** The preferred display for the code (if known). */
  readonly display?: string;
}

/**
 * Parameters for expanding a ValueSet.
 */
export interface ExpandValueSetParams {
  /** The ValueSet URL to expand. */
  readonly url: string;

  /** Optional text filter to narrow the expansion. */
  readonly filter?: string;

  /** Optional offset for pagination. */
  readonly offset?: number;

  /** Optional count limit for pagination. */
  readonly count?: number;
}

/**
 * Result of a ValueSet expansion operation.
 */
export interface ValueSetExpansion {
  /** Total number of concepts in the expansion (before pagination). */
  readonly total?: number;

  /** The expanded concepts. */
  readonly contains: readonly ValueSetExpansionContains[];
}

/**
 * A single concept in a ValueSet expansion.
 */
export interface ValueSetExpansionContains {
  /** The CodeSystem URL this concept belongs to. */
  readonly system: string;

  /** The code value. */
  readonly code: string;

  /** Optional human-readable display for the code. */
  readonly display?: string;
}

/**
 * Parameters for looking up a code in a CodeSystem.
 */
export interface LookupCodeParams {
  /** The CodeSystem URL. */
  readonly system: string;

  /** The code to look up. */
  readonly code: string;
}

/**
 * Result of a code lookup operation.
 */
export interface LookupCodeResult {
  /** Whether the code was found in the CodeSystem. */
  readonly found: boolean;

  /** The display string for the code (if found). */
  readonly display?: string;

  /** The definition of the code (if found). */
  readonly definition?: string;
}

/**
 * Abstract interface for terminology operations.
 *
 * Implementations may connect to a remote FHIR terminology server,
 * an in-memory CodeSystem/ValueSet registry, or any other source.
 *
 * The runtime provides {@link NoOpTerminologyProvider} as a default
 * implementation that accepts all codes without validation.
 *
 * @example
 * ```typescript
 * const provider: TerminologyProvider = new NoOpTerminologyProvider();
 * const result = await provider.validateCode({ system: 'http://loinc.org', code: '12345-6' });
 * console.log(result.result); // true (NoOp always passes)
 * ```
 */
export interface TerminologyProvider {
  /**
   * Validate a code against a CodeSystem or ValueSet.
   *
   * @param params - Validation parameters (system, code, optional valueSetUrl).
   * @returns Validation result indicating whether the code is valid.
   */
  validateCode(params: ValidateCodeParams): Promise<ValidateCodeResult>;

  /**
   * Expand a ValueSet to enumerate its contained codes.
   *
   * @param params - Expansion parameters (url, optional filter/pagination).
   * @returns The expanded ValueSet contents.
   */
  expandValueSet(params: ExpandValueSetParams): Promise<ValueSetExpansion>;

  /**
   * Look up a code in a CodeSystem to retrieve its display and definition.
   *
   * @param params - Lookup parameters (system, code).
   * @returns Lookup result with display and definition (if found).
   */
  lookupCode(params: LookupCodeParams): Promise<LookupCodeResult>;
}

// =============================================================================
// Section 2: Reference Resolver
// =============================================================================

/**
 * Abstract interface for resolving FHIR References.
 *
 * Implementations may resolve references against a local store,
 * a remote FHIR server, or a bundle's contained resources.
 *
 * The runtime provides {@link NoOpReferenceResolver} as a default
 * implementation.
 *
 * @example
 * ```typescript
 * const resolver: ReferenceResolver = new NoOpReferenceResolver();
 * const exists = await resolver.exists('Patient/123');
 * console.log(exists); // true (NoOp always returns true)
 * ```
 */
export interface ReferenceResolver {
  /**
   * Resolve a FHIR reference to its target resource.
   *
   * @param reference - The reference string (e.g., `'Patient/123'`).
   * @returns The resolved resource, or `undefined` if not found.
   */
  resolve(reference: string): Promise<Resource | undefined>;

  /**
   * Check whether a FHIR reference target exists.
   *
   * @param reference - The reference string (e.g., `'Patient/123'`).
   * @returns `true` if the referenced resource exists.
   */
  exists(reference: string): Promise<boolean>;
}

// =============================================================================
// Section 3: OperationOutcome Types
// =============================================================================

/**
 * FHIR OperationOutcome resource.
 *
 * Represents the outcome of an operation, containing a list of issues
 * (errors, warnings, information) encountered during processing.
 *
 * @see https://hl7.org/fhir/R4/operationoutcome.html
 */
export interface OperationOutcome {
  /** Fixed value: `'OperationOutcome'`. */
  readonly resourceType: 'OperationOutcome';

  /** The list of issues. */
  readonly issue: readonly OperationOutcomeIssue[];
}

/**
 * A single issue within an OperationOutcome.
 *
 * @see https://hl7.org/fhir/R4/operationoutcome-definitions.html#OperationOutcome.issue
 */
export interface OperationOutcomeIssue {
  /** Severity of the issue. */
  readonly severity: 'fatal' | 'error' | 'warning' | 'information';

  /**
   * Issue type code.
   * @see https://hl7.org/fhir/R4/valueset-issue-type.html
   */
  readonly code: OperationOutcomeIssueType;

  /** Additional diagnostic information. */
  readonly diagnostics?: string;

  /** Additional details about the issue. */
  readonly details?: { readonly text?: string };

  /** FHIRPath expression(s) pointing to the problematic element(s). */
  readonly expression?: readonly string[];
}

/**
 * FHIR OperationOutcome issue type codes.
 *
 * Subset of codes from https://hl7.org/fhir/R4/valueset-issue-type.html
 * relevant to structural validation, parsing, and snapshot generation.
 */
export type OperationOutcomeIssueType =
  | 'invalid'
  | 'structure'
  | 'required'
  | 'value'
  | 'invariant'
  | 'processing'
  | 'not-supported'
  | 'not-found'
  | 'business-rule'
  | 'informational';
