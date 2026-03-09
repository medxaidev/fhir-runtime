/**
 * fhir-package — Package Manifest Parser
 *
 * Parses FHIR NPM package `package.json` files into typed {@link PackageManifest} objects.
 *
 * @module fhir-package
 */

import type { PackageManifest } from './types.js';

/**
 * Parse a raw JSON object into a {@link PackageManifest}.
 *
 * @param raw - The parsed JSON content of a package.json
 * @returns The typed manifest, or `undefined` if the input is invalid
 */
export function parsePackageManifest(raw: unknown): PackageManifest | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const obj = raw as Record<string, unknown>;

  const name = obj['name'];
  const version = obj['version'];

  if (typeof name !== 'string' || !name) return undefined;
  if (typeof version !== 'string' || !version) return undefined;

  const manifest: PackageManifest = { name, version };

  if (Array.isArray(obj['fhirVersions'])) {
    manifest.fhirVersions = obj['fhirVersions'].filter(
      (v): v is string => typeof v === 'string',
    );
  }

  if (typeof obj['type'] === 'string') manifest.type = obj['type'];
  if (typeof obj['description'] === 'string') manifest.description = obj['description'];
  if (typeof obj['author'] === 'string') manifest.author = obj['author'];
  if (typeof obj['canonical'] === 'string') manifest.canonical = obj['canonical'];
  if (typeof obj['title'] === 'string') manifest.title = obj['title'];
  if (typeof obj['license'] === 'string') manifest.license = obj['license'];
  if (typeof obj['url'] === 'string') manifest.url = obj['url'];

  if (obj['dependencies'] && typeof obj['dependencies'] === 'object' && !Array.isArray(obj['dependencies'])) {
    const deps: Record<string, string> = {};
    for (const [k, v] of Object.entries(obj['dependencies'] as Record<string, unknown>)) {
      if (typeof v === 'string') {
        deps[k] = v;
      }
    }
    if (Object.keys(deps).length > 0) {
      manifest.dependencies = deps;
    }
  }

  return manifest;
}

/**
 * Parse a JSON string into a {@link PackageManifest}.
 *
 * @param jsonString - The raw JSON string
 * @returns The typed manifest, or `undefined` if parsing fails
 */
export function parsePackageManifestFromString(jsonString: string): PackageManifest | undefined {
  try {
    const raw = JSON.parse(jsonString);
    return parsePackageManifest(raw);
  } catch {
    return undefined;
  }
}
