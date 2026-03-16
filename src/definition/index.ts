/**
 * fhir-definition — Barrel Export
 *
 * Provides DefinitionProvider integration with fhir-definition package,
 * DefinitionBridge adapter, NoOpDefinitionProvider, DefinitionProviderLoader,
 * createRuntime factory, SnapshotCache, and batch validation types.
 *
 * STAGE-6: fhir-definition Integration (v0.8.0)
 * STAGE-B: fhir-server prerequisites (v0.9.0)
 *
 * @module fhir-definition
 */

// --- Types & Interfaces (re-exported from fhir-definition + bridge types) ---
export type {
  DefinitionProvider,
  FhirDefStructureDefinition,
  FhirDefValueSet,
  FhirDefCodeSystem,
  FhirDefSearchParameter,
  DefinitionRegistry,
  InMemoryDefinitionRegistry,
  RegistryStatistics,
  DefinitionBridgeOptions,
  RuntimeOptions,
  FhirRuntimeInstance,
  BatchValidationOptions,
  BatchValidationResult,
} from './types.js';

// --- DefinitionBridge ---
export { DefinitionBridge } from './definition-bridge.js';

// --- NoOp Implementation ---
export { NoOpDefinitionProvider } from './noop-definition-provider.js';

// --- DefinitionProviderLoader ---
export { DefinitionProviderLoader } from './definition-provider-loader.js';

// --- Runtime Factory ---
export { createRuntime } from './create-runtime.js';

// --- Snapshot Cache (STAGE-B: v0.9.0) ---
export { SnapshotCache } from './snapshot-cache.js';
