/**
 * fhir-context — FhirContextImpl
 *
 * Concrete implementation of the {@link FhirContext} interface.
 * Integrates the registry, loaders, and inheritance resolver into
 * a single cohesive entry point.
 *
 * Conceptual mapping:
 * - HAPI `FhirContext` → this class
 * - HAPI `IValidationSupport` → loader delegation
 * - HAPI `ValidationSupportChain` → CompositeLoader
 *
 * @module fhir-context
 */

import type { StructureDefinition, CanonicalProfile } from '../model/index.js';
import type {
  FhirContext,
  FhirContextOptions,
  ContextStatistics,
  StructureDefinitionLoader,
} from './types.js';
import { createEmptyStatistics } from './types.js';
import { StructureDefinitionRegistry, parseVersionedUrl } from './registry.js';
import { InheritanceChainResolver } from './inheritance-resolver.js';
import { CompositeLoader } from './loaders/composite-loader.js';
import {
  ResourceNotFoundError,
  InvalidStructureDefinitionError,
} from './errors.js';
import { loadAllCoreDefinitions } from './core-definitions/index.js';

// =============================================================================
// Section 1: FhirContextImpl
// =============================================================================

/**
 * Concrete implementation of {@link FhirContext}.
 *
 * @example
 * ```typescript
 * const ctx = new FhirContextImpl({
 *   loaders: [memoryLoader, fileLoader],
 * });
 * await ctx.preloadCoreDefinitions();
 *
 * const patient = await ctx.loadStructureDefinition(
 *   'http://hl7.org/fhir/StructureDefinition/Patient'
 * );
 * ```
 */
export class FhirContextImpl implements FhirContext {
  private readonly _registry: StructureDefinitionRegistry;
  private readonly _resolver: InheritanceChainResolver;
  private readonly _loader: StructureDefinitionLoader;
  private readonly _options: FhirContextOptions;
  private readonly _stats: ContextStatistics;
  private readonly _innerTypes = new Map<string, CanonicalProfile>();
  private readonly _canonicalProfiles = new Map<string, CanonicalProfile>();
  private _disposed = false;

  constructor(options: FhirContextOptions) {
    this._options = options;
    this._registry = new StructureDefinitionRegistry();
    this._stats = createEmptyStatistics();

    // Build a single loader (composite if multiple provided)
    if (options.loaders.length === 1) {
      this._loader = options.loaders[0];
    } else {
      this._loader = new CompositeLoader(options.loaders);
    }

    // Wire the resolver to use this context's loadStructureDefinition
    this._resolver = new InheritanceChainResolver({
      loadStructureDefinition: (url: string) =>
        this.loadStructureDefinition(url),
    });
  }

  // ---------------------------------------------------------------------------
  // FhirContext interface
  // ---------------------------------------------------------------------------

  async loadStructureDefinition(url: string): Promise<StructureDefinition> {
    this._ensureNotDisposed();

    // 1. Check registry (cache hit)
    const cached = this._registry.get(url);
    if (cached) {
      this._stats.cacheHits++;
      return cached;
    }

    // 2. Strip version for loader delegation
    const { url: bareUrl } = parseVersionedUrl(url);

    // 3. Delegate to loader (cache miss)
    this._stats.cacheMisses++;
    this._stats.loaderCalls++;

    const loaded = await this._loader.load(bareUrl);
    if (!loaded) {
      throw new ResourceNotFoundError(url, [this._loader.getSourceType()]);
    }

    // 4. Validate
    this._validateStructureDefinition(loaded);

    // 5. Register in registry
    this._registry.register(loaded);
    this._stats.totalLoaded = this._registry.size;

    return loaded;
  }

  getStructureDefinition(url: string): StructureDefinition | undefined {
    this._ensureNotDisposed();
    return this._registry.get(url);
  }

  hasStructureDefinition(url: string): boolean {
    this._ensureNotDisposed();
    return this._registry.has(url);
  }

  async resolveInheritanceChain(url: string): Promise<string[]> {
    this._ensureNotDisposed();
    const chain = await this._resolver.resolve(url);
    this._stats.chainsResolved = this._resolver.resolutionCount;
    return chain;
  }

  registerStructureDefinition(sd: StructureDefinition): void {
    this._ensureNotDisposed();
    this._validateStructureDefinition(sd);
    this._registry.register(sd);
    this._stats.registrations++;
    this._stats.totalLoaded = this._registry.size;

    // Invalidate any cached inheritance chains that include this URL
    this._resolver.invalidate(sd.url as string);
  }

  async preloadCoreDefinitions(): Promise<void> {
    this._ensureNotDisposed();

    const defs = await loadAllCoreDefinitions(this._options.specDirectory);

    defs.forEach((sd) => {
      this._registry.register(sd);
    });

    this._stats.totalLoaded = this._registry.size;
  }

  getStatistics(): ContextStatistics {
    return { ...this._stats };
  }

  registerCanonicalProfile(profile: CanonicalProfile): void {
    this._ensureNotDisposed();
    this._canonicalProfiles.set(profile.type, profile);

    // Register all inner types from this profile
    if (profile.innerTypes) {
      for (const [typeName, innerType] of profile.innerTypes) {
        this._innerTypes.set(typeName, innerType);
      }
    }
  }

  getInnerType(typeName: string): CanonicalProfile | undefined {
    this._ensureNotDisposed();
    return this._innerTypes.get(typeName);
  }

  hasInnerType(typeName: string): boolean {
    this._ensureNotDisposed();
    return this._innerTypes.has(typeName);
  }

  dispose(): void {
    this._registry.clear();
    this._resolver.clearCache();
    this._innerTypes.clear();
    this._canonicalProfiles.clear();
    this._stats.totalLoaded = 0;
    this._stats.cacheHits = 0;
    this._stats.cacheMisses = 0;
    this._stats.loaderCalls = 0;
    this._stats.chainsResolved = 0;
    this._stats.registrations = 0;
    this._disposed = true;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Validate that a StructureDefinition has the minimum required fields.
   */
  private _validateStructureDefinition(sd: StructureDefinition): void {
    if (!sd.url) {
      throw new InvalidStructureDefinitionError(
        'Missing required field: url',
        sd.name as string | undefined,
      );
    }
  }

  /**
   * Guard against use after dispose.
   */
  private _ensureNotDisposed(): void {
    if (this._disposed) {
      throw new Error(
        'FhirContext has been disposed. Create a new instance or call preloadCoreDefinitions() again.',
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Accessors (for testing / diagnostics)
  // ---------------------------------------------------------------------------

  /**
   * Direct access to the internal registry (for diagnostics).
   */
  get registry(): StructureDefinitionRegistry {
    return this._registry;
  }

  /**
   * Direct access to the internal resolver (for diagnostics).
   */
  get resolver(): InheritanceChainResolver {
    return this._resolver;
  }
}
