/**
 * fhir-package — Canonical Resolver
 *
 * Version-aware canonical URL resolution across multiple packages.
 *
 * @module fhir-package
 */

import type { CanonicalResolution, PackageIndexEntry } from './types.js';
import type { NpmPackageLoader } from './npm-package-loader.js';

/**
 * Parse a canonical URL that may contain a version suffix.
 *
 * @example
 * ```
 * parseCanonicalUrl('http://hl7.org/fhir/StructureDefinition/Patient|4.0.1')
 * // → { url: 'http://hl7.org/fhir/StructureDefinition/Patient', version: '4.0.1' }
 * ```
 */
export function parseCanonicalUrl(canonical: string): { url: string; version?: string } {
  const pipeIndex = canonical.indexOf('|');
  if (pipeIndex === -1) {
    return { url: canonical };
  }
  return {
    url: canonical.substring(0, pipeIndex),
    version: canonical.substring(pipeIndex + 1),
  };
}

/**
 * Resolve a canonical URL across multiple package loaders.
 *
 * Resolution priority:
 * 1. Exact match `url|version`
 * 2. Same URL, latest version
 * 3. First match in loader order (loaders ordered by dependency proximity)
 *
 * @param canonical - Canonical URL, optionally with `|version` suffix
 * @param loaders - Ordered list of package loaders (dependency order)
 * @returns Resolution result, or `undefined` if not found
 */
export function resolveCanonical(
  canonical: string,
  loaders: NpmPackageLoader[],
): CanonicalResolution | undefined {
  const { url, version } = parseCanonicalUrl(canonical);

  // Collect all matches across all loaders
  const candidates: Array<{
    entry: PackageIndexEntry;
    loader: NpmPackageLoader;
  }> = [];

  for (const loader of loaders) {
    const entry = loader.resolveCanonical(url);
    if (entry) {
      candidates.push({ entry, loader });
    }
  }

  if (candidates.length === 0) return undefined;

  // If version specified, prefer exact version match
  if (version) {
    const exact = candidates.find((c) => c.entry.version === version);
    if (exact) {
      return _toResolution(exact.entry, exact.loader);
    }
  }

  // Return first match (loaders are ordered by dependency proximity)
  const best = candidates[0];
  return _toResolution(best.entry, best.loader);
}

/**
 * Resolve all canonical URLs matching a given resource type across loaders.
 */
export function resolveAllByType(
  resourceType: string,
  loaders: NpmPackageLoader[],
): CanonicalResolution[] {
  const seen = new Set<string>();
  const results: CanonicalResolution[] = [];

  for (const loader of loaders) {
    const entries = loader.getEntriesByType(resourceType);
    for (const entry of entries) {
      if (!seen.has(entry.url)) {
        seen.add(entry.url);
        results.push(_toResolution(entry, loader));
      }
    }
  }

  return results;
}

function _toResolution(entry: PackageIndexEntry, loader: NpmPackageLoader): CanonicalResolution {
  const manifest = loader.getManifest();
  return {
    url: entry.url,
    version: entry.version,
    packageName: manifest?.name ?? 'unknown',
    packageVersion: manifest?.version ?? 'unknown',
    resourceType: entry.resourceType,
    filename: entry.filename,
  };
}
