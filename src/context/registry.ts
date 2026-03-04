/**
 * fhir-context — StructureDefinition Registry
 *
 * In-memory registry for storing and querying StructureDefinitions.
 * Keyed by canonical URL with optional `|version` support.
 *
 * This is an internal component used by {@link FhirContextImpl}.
 * It is not exported from the public API.
 *
 * @module fhir-context
 */

import type { StructureDefinition } from '../model/index.js';
import { InvalidStructureDefinitionError } from './errors.js';

// =============================================================================
// Section 1: URL Utilities
// =============================================================================

/**
 * Parse a canonical URL that may contain a `|version` suffix.
 *
 * @param urlWithVersion - e.g. `"http://hl7.org/fhir/StructureDefinition/Patient|4.0.1"`
 * @returns `{ url, version }` where `version` is `undefined` if absent
 */
export function parseVersionedUrl(urlWithVersion: string): {
  url: string;
  version: string | undefined;
} {
  const pipeIndex = urlWithVersion.indexOf('|');
  if (pipeIndex === -1) {
    return { url: urlWithVersion, version: undefined };
  }
  return {
    url: urlWithVersion.substring(0, pipeIndex),
    version: urlWithVersion.substring(pipeIndex + 1),
  };
}

/**
 * Build a versioned registry key from URL and version.
 *
 * @param url - Canonical URL (without version)
 * @param version - Semantic version string, or `undefined`
 * @returns `"url|version"` if version is present, otherwise just `"url"`
 */
export function buildVersionedKey(
  url: string,
  version: string | undefined,
): string {
  return version ? `${url}|${version}` : url;
}

// =============================================================================
// Section 2: StructureDefinitionRegistry
// =============================================================================

/**
 * In-memory registry for StructureDefinitions.
 *
 * Storage strategy:
 * - **Primary map**: keyed by `url|version` (exact match)
 * - **Latest map**: keyed by bare `url` → points to the most recently
 *   registered version (for unversioned lookups)
 *
 * When a lookup uses a bare URL (no `|version`), the latest map is consulted.
 * When a lookup uses `url|version`, the primary map is used for exact match.
 */
export class StructureDefinitionRegistry {
  /** Primary storage: `url|version` → StructureDefinition */
  private readonly _entries = new Map<string, StructureDefinition>();

  /** Latest-version index: bare `url` → `url|version` key in _entries */
  private readonly _latestIndex = new Map<string, string>();

  /** Statistics counters */
  private _queryCount = 0;
  private _hitCount = 0;

  // ---------------------------------------------------------------------------
  // Mutators
  // ---------------------------------------------------------------------------

  /**
   * Register a StructureDefinition.
   *
   * Validates that the definition has a `url` field. If a definition with
   * the same URL (and version) already exists, it is silently replaced.
   *
   * @param sd - The StructureDefinition to register
   * @throws {@link InvalidStructureDefinitionError} if `sd.url` is missing
   */
  register(sd: StructureDefinition): void {
    if (!sd.url) {
      throw new InvalidStructureDefinitionError(
        'Missing required field: url',
        sd.name as string | undefined,
      );
    }

    const bareUrl = sd.url as string;
    const version = sd.version as string | undefined;
    const key = buildVersionedKey(bareUrl, version);

    this._entries.set(key, sd);

    // Update latest index: always point bare URL to the newest registration.
    // If the same bare URL is registered with different versions, the last
    // one registered wins as "latest". This is intentional — callers that
    // need a specific version should use `url|version`.
    this._latestIndex.set(bareUrl, key);
  }

  /**
   * Remove a StructureDefinition by canonical URL.
   *
   * @param urlWithVersion - Canonical URL (with optional `|version`)
   * @returns `true` if a definition was removed, `false` if not found
   */
  delete(urlWithVersion: string): boolean {
    const { url, version } = parseVersionedUrl(urlWithVersion);

    if (version) {
      // Exact versioned delete
      const key = buildVersionedKey(url, version);
      const deleted = this._entries.delete(key);
      // If the latest index pointed to this key, remove it
      if (deleted && this._latestIndex.get(url) === key) {
        this._latestIndex.delete(url);
      }
      return deleted;
    }

    // Unversioned delete: remove the entry pointed to by the latest index
    const latestKey = this._latestIndex.get(url);
    if (latestKey) {
      this._entries.delete(latestKey);
      this._latestIndex.delete(url);
      return true;
    }

    return false;
  }

  /**
   * Remove all entries and reset statistics.
   */
  clear(): void {
    this._entries.clear();
    this._latestIndex.clear();
    this._queryCount = 0;
    this._hitCount = 0;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  /**
   * Retrieve a StructureDefinition by canonical URL.
   *
   * - If `urlWithVersion` contains `|version`, performs exact match.
   * - If no version, returns the latest registered version.
   *
   * @param urlWithVersion - Canonical URL (with optional `|version`)
   * @returns The StructureDefinition, or `undefined` if not found
   */
  get(urlWithVersion: string): StructureDefinition | undefined {
    this._queryCount++;

    const { url, version } = parseVersionedUrl(urlWithVersion);

    let result: StructureDefinition | undefined;

    if (version) {
      // Exact versioned lookup
      result = this._entries.get(buildVersionedKey(url, version));
    } else {
      // Unversioned: use latest index
      const latestKey = this._latestIndex.get(url);
      result = latestKey ? this._entries.get(latestKey) : undefined;
    }

    if (result) {
      this._hitCount++;
    }

    return result;
  }

  /**
   * Check whether a StructureDefinition is registered.
   *
   * @param urlWithVersion - Canonical URL (with optional `|version`)
   */
  has(urlWithVersion: string): boolean {
    const { url, version } = parseVersionedUrl(urlWithVersion);

    if (version) {
      return this._entries.has(buildVersionedKey(url, version));
    }

    return this._latestIndex.has(url);
  }

  /**
   * Total number of registered StructureDefinitions.
   */
  get size(): number {
    return this._entries.size;
  }

  /**
   * Return all registered canonical URLs (including version suffixes).
   */
  getAllKeys(): string[] {
    return Array.from(this._entries.keys());
  }

  /**
   * Return all registered bare URLs (without version suffixes).
   */
  getAllUrls(): string[] {
    return Array.from(this._latestIndex.keys());
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Total number of `get()` calls.
   */
  get queryCount(): number {
    return this._queryCount;
  }

  /**
   * Number of `get()` calls that returned a result (cache hits).
   */
  get hitCount(): number {
    return this._hitCount;
  }

  /**
   * Number of `get()` calls that returned `undefined` (cache misses).
   */
  get missCount(): number {
    return this._queryCount - this._hitCount;
  }

  /**
   * Cache hit ratio (0–1). Returns 0 if no queries have been made.
   */
  get hitRate(): number {
    return this._queryCount === 0 ? 0 : this._hitCount / this._queryCount;
  }
}
