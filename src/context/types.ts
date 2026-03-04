/**
 * fhir-context — Public Interfaces & Types
 *
 * Defines the core abstractions for the FHIR context module:
 * - {@link FhirContext} — central registry and lifecycle manager
 * - {@link StructureDefinitionLoader} — pluggable loading strategy
 * - {@link LoaderOptions} — loader configuration
 * - {@link ContextStatistics} — runtime metrics
 *
 * This module is conceptually equivalent to HAPI's `FhirContext` +
 * `IValidationSupport` interface, adapted for TypeScript/async patterns.
 *
 * @see https://hapifhir.io/hapi-fhir/docs/
 * @module fhir-context
 */

import type { StructureDefinition, CanonicalProfile } from '../model/index.js';

// =============================================================================
// Section 1: FhirContext Interface
// =============================================================================

/**
 * Central registry and lifecycle manager for FHIR StructureDefinitions.
 *
 * `FhirContext` is the primary entry point for accessing FHIR definitions
 * at runtime. It manages loading, caching, and resolution of
 * StructureDefinitions from one or more sources.
 *
 * Conceptual mapping:
 * - HAPI `FhirContext` → registry + lifecycle
 * - HAPI `IValidationSupport` → loader delegation
 *
 * Phase 4 (`fhir-profile`) will use this interface to load base definitions
 * during snapshot generation.
 *
 * @example
 * ```typescript
 * const context = new FhirContextImpl({ loaders: [memoryLoader, fileLoader] });
 * await context.preloadCoreDefinitions();
 *
 * const patient = await context.loadStructureDefinition(
 *   'http://hl7.org/fhir/StructureDefinition/Patient'
 * );
 * const chain = await context.resolveInheritanceChain(patient.url!);
 * // → ['http://hl7.org/fhir/StructureDefinition/Patient',
 * //    'http://hl7.org/fhir/StructureDefinition/DomainResource',
 * //    'http://hl7.org/fhir/StructureDefinition/Resource']
 * ```
 */
export interface FhirContext {
  /**
   * Load a StructureDefinition by canonical URL.
   *
   * Resolution order:
   * 1. Check internal registry (cache hit)
   * 2. Delegate to configured loaders (cache miss)
   * 3. Parse, validate, and register the result
   *
   * Supports versioned URLs in `url|version` format
   * (e.g., `"http://example.org/Profile|1.0.0"`).
   *
   * @param url - Canonical URL, optionally with `|version` suffix
   * @returns Resolved StructureDefinition
   * @throws {@link ResourceNotFoundError} if no loader can resolve the URL
   * @throws {@link LoaderError} if a loader fails during loading
   * @throws {@link InvalidStructureDefinitionError} if the loaded resource is malformed
   */
  loadStructureDefinition(url: string): Promise<StructureDefinition>;

  /**
   * Synchronously retrieve a StructureDefinition from the registry.
   *
   * Does **not** trigger any loader — only checks the in-memory registry.
   * Use {@link loadStructureDefinition} if you need on-demand loading.
   *
   * @param url - Canonical URL (with optional `|version`)
   * @returns The cached StructureDefinition, or `undefined` if not loaded
   */
  getStructureDefinition(url: string): StructureDefinition | undefined;

  /**
   * Check whether a StructureDefinition is present in the registry.
   *
   * @param url - Canonical URL (with optional `|version`)
   */
  hasStructureDefinition(url: string): boolean;

  /**
   * Resolve the full inheritance chain for a profile.
   *
   * Walks the `baseDefinition` links from the given URL up to the root
   * resource type (e.g., `Resource`). Each base is loaded on demand if
   * not already in the registry.
   *
   * @param url - Canonical URL of the starting profile
   * @returns Array of canonical URLs from child to root
   *          (e.g., `[ChinesePatient, Patient, DomainResource, Resource]`)
   * @throws {@link CircularDependencyError} if a cycle is detected
   * @throws {@link ResourceNotFoundError} if a base definition cannot be found
   */
  resolveInheritanceChain(url: string): Promise<string[]>;

  /**
   * Register a StructureDefinition in the registry.
   *
   * This is used for:
   * - Manually adding definitions (e.g., custom profiles)
   * - Phase 4: caching generated snapshots back into the context
   *
   * If a definition with the same URL (and version) already exists,
   * it will be replaced and any cached inheritance chains invalidated.
   *
   * @param sd - The StructureDefinition to register
   * @throws {@link InvalidStructureDefinitionError} if `sd.url` is missing
   */
  registerStructureDefinition(sd: StructureDefinition): void;

  /**
   * Preload FHIR R4 core StructureDefinitions.
   *
   * Loads base resource types (Resource, DomainResource, Patient,
   * Observation, etc.) into the registry so they are available
   * synchronously via {@link getStructureDefinition}.
   *
   * Should be called once during application initialization.
   */
  preloadCoreDefinitions(): Promise<void>;

  /**
   * Return runtime statistics for monitoring and diagnostics.
   */
  getStatistics(): ContextStatistics;

  /**
   * Register a CanonicalProfile and its extracted InnerTypes.
   *
   * This is the primary method for making InnerTypes available for
   * downstream consumption (UI forms, recursive validation, etc.).
   * Typically called after snapshot generation + `extractInnerTypes()`.
   *
   * @param profile - The CanonicalProfile (with innerTypes populated)
   */
  registerCanonicalProfile(profile: CanonicalProfile): void;

  /**
   * Retrieve an InnerType schema by its generated type name.
   *
   * @param typeName - Generated type name (e.g., `'PatientContact'`)
   * @returns The InnerType CanonicalProfile, or `undefined` if not registered
   */
  getInnerType(typeName: string): CanonicalProfile | undefined;

  /**
   * Check whether an InnerType is registered.
   *
   * @param typeName - Generated type name (e.g., `'PatientContact'`)
   */
  hasInnerType(typeName: string): boolean;

  /**
   * Release all cached data and reset internal state.
   *
   * After calling `dispose()`, the context must be re-initialized
   * (e.g., by calling {@link preloadCoreDefinitions} again).
   */
  dispose(): void;
}

// =============================================================================
// Section 2: StructureDefinitionLoader Interface
// =============================================================================

/**
 * Pluggable strategy for loading StructureDefinitions from an external source.
 *
 * Implementations include:
 * - `MemoryLoader` — loads from an in-memory map (for testing / preloaded data)
 * - `FileSystemLoader` — loads from local JSON files
 * - `CompositeLoader` — chains multiple loaders (fallback pattern)
 *
 * Conceptually equivalent to HAPI's `IValidationSupport` implementations.
 */
export interface StructureDefinitionLoader {
  /**
   * Attempt to load a StructureDefinition by canonical URL.
   *
   * @param url - Canonical URL (without `|version` — version is stripped
   *              by the caller before delegation)
   * @returns The loaded StructureDefinition, or `null` if this loader
   *          cannot resolve the URL (allows fallback to next loader)
   * @throws {@link LoaderError} on I/O or parse failures
   */
  load(url: string): Promise<StructureDefinition | null>;

  /**
   * Quick check whether this loader is likely able to resolve the URL.
   *
   * This is a hint — returning `true` does not guarantee `load()` will
   * succeed. Returning `false` allows the composite loader to skip this
   * source entirely.
   *
   * @param url - Canonical URL to check
   */
  canLoad(url: string): boolean;

  /**
   * Human-readable identifier for the loader source.
   *
   * Used in error messages and diagnostics.
   *
   * @returns Source type label (e.g., `'memory'`, `'filesystem'`, `'http'`)
   */
  getSourceType(): string;
}

// =============================================================================
// Section 3: Configuration Types
// =============================================================================

/**
 * Configuration options for creating a {@link FhirContext}.
 */
export interface FhirContextOptions {
  /**
   * One or more loaders to use for resolving StructureDefinitions.
   *
   * When multiple loaders are provided, they are tried in order
   * (first match wins — chain of responsibility pattern).
   */
  loaders: StructureDefinitionLoader[];

  /**
   * Whether to automatically call {@link FhirContext.preloadCoreDefinitions}
   * during initialization.
   *
   * @defaultValue `true`
   */
  preloadCore?: boolean;

  /**
   * Path to the FHIR R4 specification directory.
   *
   * Used by the core definition preloader to locate `profiles-resources.json`
   * and `profiles-types.json`.
   *
   * @defaultValue `undefined` (uses bundled definitions)
   */
  specDirectory?: string;
}

/**
 * Options for individual loader instances.
 */
export interface LoaderOptions {
  /**
   * Base directory or URL prefix for resolving relative paths.
   */
  basePath?: string;

  /**
   * Request timeout in milliseconds (for future HTTP loaders).
   *
   * @defaultValue `30000`
   */
  timeout?: number;

  /**
   * Number of retry attempts on transient failures.
   *
   * @defaultValue `0`
   */
  retryCount?: number;
}

// =============================================================================
// Section 4: Statistics Types
// =============================================================================

/**
 * Runtime metrics for the {@link FhirContext}.
 *
 * Useful for monitoring cache effectiveness and diagnosing
 * performance issues.
 */
export interface ContextStatistics {
  /** Total number of StructureDefinitions in the registry */
  totalLoaded: number;

  /** Number of `loadStructureDefinition` calls resolved from cache */
  cacheHits: number;

  /** Number of `loadStructureDefinition` calls that required loader delegation */
  cacheMisses: number;

  /** Total number of loader invocations across all loaders */
  loaderCalls: number;

  /** Number of inheritance chains resolved */
  chainsResolved: number;

  /** Number of `registerStructureDefinition` calls */
  registrations: number;
}

/**
 * Create a fresh statistics object with all counters at zero.
 */
export function createEmptyStatistics(): ContextStatistics {
  return {
    totalLoaded: 0,
    cacheHits: 0,
    cacheMisses: 0,
    loaderCalls: 0,
    chainsResolved: 0,
    registrations: 0,
  };
}
