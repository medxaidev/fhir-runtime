/**
 * RemoteTerminologyProvider — Remote Terminology Service Interface
 *
 * Defines the contract for delegating terminology operations to an external
 * terminology server (e.g., tx.fhir.org, SNOMED CT, LOINC).
 *
 * fhir-runtime does NOT implement HTTP calls. This interface is designed
 * to be implemented by higher layers (e.g., fhir-server) that have access
 * to HTTP clients.
 *
 * The runtime's TerminologyService uses a fallback strategy:
 * 1. Try local resolution (InMemoryTerminologyProvider)
 * 2. If not found locally, delegate to RemoteTerminologyProvider (if registered)
 * 3. If no remote provider, return empty/warning result
 *
 * STAGE-B: fhir-server prerequisites (v0.9.0)
 *
 * @module fhir-provider
 */

import type { Coding } from '../model/index.js';

// =============================================================================
// Remote Terminology Provider Interface
// =============================================================================

/**
 * Parameters for a remote ValueSet $expand operation.
 */
export interface RemoteExpandParams {
  /** The canonical URL of the ValueSet to expand. */
  readonly url?: string;

  /** Optional inline ValueSet resource to expand. */
  readonly valueSet?: unknown;

  /** Optional text filter to narrow the expansion. */
  readonly filter?: string;

  /** Maximum number of concepts to return. */
  readonly count?: number;

  /** Offset for pagination. */
  readonly offset?: number;

  /** Preferred display language (BCP-47 code). */
  readonly displayLanguage?: string;

  /** Whether to include designations in the expansion. */
  readonly includeDesignations?: boolean;
}

/**
 * Parameters for a remote $validate-code operation.
 */
export interface RemoteValidateCodeParams {
  /** The ValueSet URL to validate against. */
  readonly url?: string;

  /** The code to validate. */
  readonly code: string;

  /** The CodeSystem URL. */
  readonly system?: string;

  /** Optional display string to validate. */
  readonly display?: string;

  /** Optional CodeSystem version. */
  readonly version?: string;
}

/**
 * Result of a remote $validate-code operation.
 */
export interface RemoteValidateCodeResult {
  /** Whether the code is valid. */
  readonly result: boolean;

  /** Optional message explaining the outcome. */
  readonly message?: string;

  /** The preferred display for the code. */
  readonly display?: string;
}

/**
 * Parameters for a remote CodeSystem $lookup operation.
 */
export interface RemoteLookupParams {
  /** The code to look up. */
  readonly code: string;

  /** The CodeSystem URL. */
  readonly system: string;

  /** Optional CodeSystem version. */
  readonly version?: string;

  /** Preferred display language (BCP-47 code). */
  readonly displayLanguage?: string;
}

/**
 * Result of a remote CodeSystem $lookup operation.
 */
export interface RemoteLookupResult {
  /** The name of the CodeSystem. */
  readonly name: string;

  /** Display string for the code. */
  readonly display?: string;

  /** Definition of the code. */
  readonly definition?: string;

  /** Designations (translations, synonyms). */
  readonly designation?: ReadonlyArray<{
    readonly language?: string;
    readonly use?: Coding;
    readonly value: string;
  }>;

  /** Properties of the code. */
  readonly property?: ReadonlyArray<{
    readonly code: string;
    readonly value: string | boolean | number;
  }>;
}

/**
 * Abstract interface for delegating terminology operations to a remote
 * FHIR terminology server.
 *
 * Implementations are expected to be provided by higher layers
 * (e.g., fhir-server using fhir-client for HTTP calls).
 *
 * fhir-runtime itself never makes HTTP calls — this interface is
 * the integration contract.
 *
 * @example
 * ```typescript
 * // In fhir-server:
 * class HttpRemoteTerminologyProvider implements RemoteTerminologyProvider {
 *   constructor(private client: FhirClient) {}
 *
 *   async expandValueSet(params) {
 *     return this.client.operation('/ValueSet/$expand', params);
 *   }
 *   async validateCode(params) { ... }
 *   async lookupCode(params) { ... }
 * }
 *
 * // Register with runtime
 * runtime.setRemoteTerminologyProvider(new HttpRemoteTerminologyProvider(client));
 * ```
 */
export interface RemoteTerminologyProvider {
  /**
   * Delegate a $expand request to a remote terminology service.
   *
   * @param params - ValueSet expand parameters.
   * @returns The expanded ValueSet (with expansion member).
   */
  expandValueSet(params: RemoteExpandParams): Promise<unknown>;

  /**
   * Delegate a $validate-code request to a remote terminology service.
   *
   * @param params - Validation parameters.
   * @returns Validation result.
   */
  validateCode(params: RemoteValidateCodeParams): Promise<RemoteValidateCodeResult>;

  /**
   * Delegate a $lookup request to a remote terminology service.
   *
   * @param params - Lookup parameters.
   * @returns Concept properties and designations.
   */
  lookupCode(params: RemoteLookupParams): Promise<RemoteLookupResult>;
}
