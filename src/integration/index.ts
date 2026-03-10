/**
 * Integration Module — Barrel Export
 *
 * Provides SearchParameter parsing, search value extraction, reference
 * extraction, CapabilityStatement generation, and resource type registry.
 *
 * STAGE-5: Server/Persistence Integration (v0.7.0)
 *
 * @module integration
 */

// --- Types ---
export type {
  SearchParamType,
  SearchParameter,
  SearchIndexValue,
  SearchIndexEntry,
  ReferenceType,
  ReferenceInfo,
  CapabilitySearchParam,
  CapabilityRestResource,
  CapabilityStatementRest,
  ResourceTypeInfo,
} from './types.js';

// --- SearchParameter Parser ---
export {
  parseSearchParameter,
  parseSearchParametersFromBundle,
} from './search-parameter-parser.js';

// --- Search Value Extractor ---
export {
  extractSearchValues,
  extractAllSearchValues,
} from './search-value-extractor.js';

// --- Reference Extractor ---
export {
  extractReferences,
  extractReferencesFromBundle,
  validateReferenceTargets,
} from './reference-extractor.js';

// --- CapabilityStatement Builder ---
export { buildCapabilityFragment } from './capability-builder.js';

// --- Resource Type Registry ---
export { ResourceTypeRegistry, FHIR_R4_RESOURCE_TYPES } from './resource-type-registry.js';
