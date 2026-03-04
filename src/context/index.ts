/**
 * fhir-context — Public API Barrel Exports
 *
 * Re-exports all public types, classes, and functions from the
 * context module. Internal implementation details (registry,
 * resolver) are NOT re-exported here.
 *
 * @module fhir-context
 */

// ─── Interfaces & Types ──────────────────────────────────────────────────────
export type {
  FhirContext,
  FhirContextOptions,
  StructureDefinitionLoader,
  LoaderOptions,
  ContextStatistics,
} from './types.js';

export { createEmptyStatistics } from './types.js';

// ─── FhirContext Implementation ──────────────────────────────────────────────
export { FhirContextImpl } from './fhir-context.js';

// ─── Loaders ─────────────────────────────────────────────────────────────────
export { MemoryLoader } from './loaders/memory-loader.js';
export { FileSystemLoader } from './loaders/file-loader.js';
export { CompositeLoader } from './loaders/composite-loader.js';

// ─── Errors ──────────────────────────────────────────────────────────────────
export {
  ContextError,
  ResourceNotFoundError,
  CircularDependencyError,
  LoaderError,
  InvalidStructureDefinitionError,
} from './errors.js';

// ─── Bundle Loader ────────────────────────────────────────────────────────────
export type {
  BundleLoadOptions,
  BundleLoadResult,
  BundleLoadError,
} from './bundle-loader.js';

export {
  loadBundleFromObject,
  loadBundleFromFile,
  loadBundlesFromFiles,
} from './bundle-loader.js';

// ─── InnerType Extractor ────────────────────────────────────────────────────
export {
  extractInnerTypes,
  buildTypeName,
  isBackboneElementType,
} from './inner-type-extractor.js';

// ─── Core Definitions ────────────────────────────────────────────────────────
export {
  BASE_RESOURCES,
  PRIMITIVE_TYPES,
  COMPLEX_TYPES,
  CORE_RESOURCES,
  ALL_CORE_DEFINITIONS,
  loadAllCoreDefinitions,
  loadCoreDefinition,
  loadCoreDefinitionSync,
  getCoreDefinitionsDir,
} from './core-definitions/index.js';
