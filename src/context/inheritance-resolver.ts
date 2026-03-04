/**
 * fhir-context — Inheritance Chain Resolver
 *
 * Resolves the `baseDefinition` inheritance chain for a FHIR
 * StructureDefinition, walking from a child profile up to the root
 * resource type (e.g., `Resource`).
 *
 * Features:
 * - Recursive resolution with on-demand loading
 * - Circular dependency detection via an "in-flight" Set
 * - Resolved chain caching with explicit invalidation
 *
 * @module fhir-context
 */

import type { StructureDefinition } from '../model/index.js';
import { CircularDependencyError, ResourceNotFoundError } from './errors.js';

// =============================================================================
// Section 1: DefinitionProvider
// =============================================================================

/**
 * Minimal interface for loading a StructureDefinition by canonical URL.
 *
 * This decouples the resolver from the full {@link FhirContext} interface,
 * making it independently testable. The `FhirContextImpl` class (Task 3.6)
 * will satisfy this interface.
 */
export interface DefinitionProvider {
  /**
   * Load a StructureDefinition by canonical URL.
   *
   * Must throw {@link ResourceNotFoundError} if the URL cannot be resolved.
   */
  loadStructureDefinition(url: string): Promise<StructureDefinition>;
}

// =============================================================================
// Section 2: InheritanceChainResolver
// =============================================================================

/**
 * Resolves profile inheritance chains by walking `baseDefinition` links.
 *
 * The resolver loads each StructureDefinition on demand via the provided
 * {@link DefinitionProvider}, detects circular dependencies, and caches
 * resolved chains for repeated lookups.
 *
 * @example
 * ```typescript
 * const resolver = new InheritanceChainResolver(provider);
 * const chain = await resolver.resolve(
 *   'http://hl7.org/fhir/StructureDefinition/Patient'
 * );
 * // → ['http://hl7.org/fhir/StructureDefinition/Patient',
 * //    'http://hl7.org/fhir/StructureDefinition/DomainResource',
 * //    'http://hl7.org/fhir/StructureDefinition/Resource']
 * ```
 */
export class InheritanceChainResolver {
  private readonly _provider: DefinitionProvider;

  /** Cache of resolved chains: canonical URL → chain array */
  private readonly _cache = new Map<string, string[]>();

  /** Statistics counter */
  private _resolutionCount = 0;

  constructor(provider: DefinitionProvider) {
    this._provider = provider;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Resolve the full inheritance chain for a profile.
   *
   * Returns an array of canonical URLs ordered from child to root:
   * `[startUrl, ..., parentUrl, rootUrl]`
   *
   * @param url - Canonical URL of the starting StructureDefinition
   * @returns Inheritance chain from child to root
   * @throws {@link CircularDependencyError} if a cycle is detected
   * @throws {@link ResourceNotFoundError} if a definition cannot be loaded
   */
  async resolve(url: string): Promise<string[]> {
    // Check cache first
    const cached = this._cache.get(url);
    if (cached) {
      return cached;
    }

    // Resolve with circular dependency tracking
    const inFlight = new Set<string>();
    const chain = await this._resolveRecursive(url, inFlight);

    // Cache the result
    this._cache.set(url, chain);
    this._resolutionCount++;

    // Also cache sub-chains for efficiency.
    // If chain is [A, B, C, D], then B→[B,C,D], C→[C,D], D→[D]
    for (let i = 1; i < chain.length; i++) {
      const subChain = chain.slice(i);
      if (!this._cache.has(subChain[0])) {
        this._cache.set(subChain[0], subChain);
      }
    }

    return chain;
  }

  /**
   * Invalidate the cached chain for a specific URL.
   *
   * Should be called when a StructureDefinition is re-registered,
   * as its `baseDefinition` may have changed.
   *
   * @param url - Canonical URL to invalidate
   */
  invalidate(url: string): void {
    // Remove any cached chain that contains this URL
    for (const [key, chain] of this._cache) {
      if (key === url || chain.includes(url)) {
        this._cache.delete(key);
      }
    }
  }

  /**
   * Clear all cached chains.
   */
  clearCache(): void {
    this._cache.clear();
  }

  /**
   * Number of chains that have been resolved (not from cache).
   */
  get resolutionCount(): number {
    return this._resolutionCount;
  }

  /**
   * Number of chains currently in the cache.
   */
  get cacheSize(): number {
    return this._cache.size;
  }

  // ---------------------------------------------------------------------------
  // Internal
  // ---------------------------------------------------------------------------

  /**
   * Recursive resolution with circular dependency detection.
   *
   * @param url - Current URL to resolve
   * @param inFlight - Set of URLs currently being resolved (cycle detection)
   * @returns Chain from current URL to root
   */
  private async _resolveRecursive(
    url: string,
    inFlight: Set<string>,
  ): Promise<string[]> {
    // Check for cached sub-chain
    const cached = this._cache.get(url);
    if (cached) {
      return cached;
    }

    // Circular dependency check
    if (inFlight.has(url)) {
      // Build the cycle display: existing chain + the repeated URL
      const cycleChain = [...inFlight, url];
      throw new CircularDependencyError(cycleChain);
    }

    // Mark as in-flight
    inFlight.add(url);

    try {
      // Load the StructureDefinition
      const sd = await this._provider.loadStructureDefinition(url);

      // Extract baseDefinition
      const baseUrl = sd.baseDefinition as string | undefined;

      if (!baseUrl) {
        // Reached root (e.g., Resource has no baseDefinition)
        return [url];
      }

      // Recursively resolve the base chain
      const baseChain = await this._resolveRecursive(baseUrl, inFlight);

      // Prepend current URL
      return [url, ...baseChain];
    } finally {
      // Remove from in-flight (important for correct behavior when
      // the same URL appears in multiple independent resolution paths)
      inFlight.delete(url);
    }
  }
}
