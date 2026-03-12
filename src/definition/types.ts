/**
 * fhir-definition — Type Definitions
 *
 * Re-exports types from `fhir-definition` package and defines bridge/runtime
 * types for integrating fhir-definition into fhir-runtime.
 *
 * STAGE-6: fhir-definition Integration (v0.8.0)
 *
 * @module fhir-definition
 */

import type {
  DefinitionProvider as FhirDefProvider,
  StructureDefinition as FhirDefSD,
  ValueSet as FhirDefVS,
  CodeSystem as FhirDefCS,
  SearchParameter as FhirDefSP,
  DefinitionRegistry,
  InMemoryDefinitionRegistry,
  RegistryStatistics,
} from 'fhir-definition';

import type { Resource } from '../model/index.js';
import type { FhirContext } from '../context/index.js';
import type { TerminologyProvider, ReferenceResolver } from '../provider/index.js';
import type {
  SearchParameter as RuntimeSearchParameter,
  SearchIndexEntry,
} from '../integration/index.js';
import type { ValidationResult } from '../validator/index.js';

// =============================================================================
// Section 1: Re-export fhir-definition types
// =============================================================================

/**
 * Re-export fhir-definition types under the fhir-runtime namespace.
 *
 * These are the canonical types from `fhir-definition` v0.4.0.
 * Consumers of fhir-runtime can use these without importing fhir-definition directly.
 */
export type {
  FhirDefProvider as DefinitionProvider,
  FhirDefSD as FhirDefStructureDefinition,
  FhirDefVS as FhirDefValueSet,
  FhirDefCS as FhirDefCodeSystem,
  FhirDefSP as FhirDefSearchParameter,
  DefinitionRegistry,
  InMemoryDefinitionRegistry,
  RegistryStatistics,
};

// =============================================================================
// Section 2: DefinitionBridge Options
// =============================================================================

/**
 * Options for creating a DefinitionBridge.
 */
export interface DefinitionBridgeOptions {
  /** FhirContext instance for StructureDefinition lookups. */
  readonly context: FhirContext;

  /** Optional: ValueSet map (url → ValueSet object). */
  readonly valueSets?: ReadonlyMap<string, FhirDefVS>;

  /** Optional: CodeSystem map (url → CodeSystem object). */
  readonly codeSystems?: ReadonlyMap<string, FhirDefCS>;

  /** Optional: SearchParameter list. */
  readonly searchParameters?: readonly FhirDefSP[];
}

// =============================================================================
// Section 3: Runtime Factory Options
// =============================================================================

/**
 * Options for the createRuntime() factory function.
 */
export interface RuntimeOptions {
  /**
   * External DefinitionProvider (e.g., from fhir-definition's InMemoryDefinitionRegistry).
   * When provided, this is used directly as the DefinitionProvider.
   */
  readonly definitions?: FhirDefProvider;

  /**
   * FhirContext for StructureDefinition loading (legacy mode).
   * If `definitions` is not provided, a DefinitionBridge is created
   * from this context.
   */
  readonly context?: FhirContext;

  /** Optional terminology provider. */
  readonly terminology?: TerminologyProvider;

  /** Optional reference resolver. */
  readonly referenceResolver?: ReferenceResolver;

  /**
   * Whether to preload core R4 definitions.
   * Only applies when `context` is used (or auto-created).
   * @default true
   */
  readonly preloadCore?: boolean;
}

/**
 * A fully configured fhir-runtime instance.
 */
export interface FhirRuntimeInstance {
  /** The DefinitionProvider in use. */
  readonly definitions: FhirDefProvider;

  /** The FhirContext in use (may be auto-created). */
  readonly context: FhirContext;

  /** Terminology provider. */
  readonly terminology: TerminologyProvider;

  /** Reference resolver. */
  readonly referenceResolver: ReferenceResolver;

  /**
   * Validate a resource against a profile URL.
   *
   * Loads the StructureDefinition, builds a CanonicalProfile,
   * generates a snapshot if needed, and runs structural validation.
   */
  validate(resource: Resource, profileUrl: string): Promise<ValidationResult>;

  /**
   * Get SearchParameters for a resource type from the DefinitionProvider.
   */
  getSearchParameters(resourceType: string): FhirDefSP[];

  /**
   * Extract search values from a resource using a SearchParameter.
   */
  extractSearchValues(resource: Resource, searchParam: RuntimeSearchParameter): SearchIndexEntry;
}
