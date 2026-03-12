/**
 * fhir-definition — Barrel Export
 *
 * Provides DefinitionProvider integration with fhir-definition package,
 * DefinitionBridge adapter, NoOpDefinitionProvider, DefinitionProviderLoader,
 * and createRuntime factory.
 *
 * STAGE-6: fhir-definition Integration (v0.8.0)
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
} from './types.js';

// --- DefinitionBridge ---
export { DefinitionBridge } from './definition-bridge.js';

// --- NoOp Implementation ---
export { NoOpDefinitionProvider } from './noop-definition-provider.js';

// --- DefinitionProviderLoader ---
export { DefinitionProviderLoader } from './definition-provider-loader.js';

// --- Runtime Factory ---
export { createRuntime } from './create-runtime.js';
