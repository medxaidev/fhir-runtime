/**
 * fhir-package — Package Index Parser
 *
 * Parses FHIR NPM package `.index.json` files into typed {@link PackageIndex} objects.
 *
 * @module fhir-package
 */

import type { PackageIndex, PackageIndexEntry } from './types.js';

/**
 * Parse a raw JSON object into a {@link PackageIndex}.
 *
 * @param raw - The parsed JSON content of a .index.json
 * @returns The typed index, or `undefined` if the input is invalid
 */
export function parsePackageIndex(raw: unknown): PackageIndex | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;

  const obj = raw as Record<string, unknown>;

  // index-version can be 1 or 2
  const indexVersion =
    typeof obj['index-version'] === 'number'
      ? obj['index-version']
      : typeof obj['indexVersion'] === 'number'
        ? obj['indexVersion']
        : undefined;

  if (indexVersion === undefined) return undefined;

  const rawFiles = obj['files'];
  if (!Array.isArray(rawFiles)) return undefined;

  const files: PackageIndexEntry[] = [];

  for (const entry of rawFiles) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;

    const filename = e['filename'];
    const resourceType = e['resourceType'];
    const id = e['id'];
    const url = e['url'];

    if (typeof filename !== 'string') continue;
    if (typeof resourceType !== 'string') continue;
    if (typeof id !== 'string') continue;
    if (typeof url !== 'string') continue;

    const parsed: PackageIndexEntry = { filename, resourceType, id, url };

    if (typeof e['version'] === 'string') parsed.version = e['version'];
    if (typeof e['kind'] === 'string') parsed.kind = e['kind'];
    if (typeof e['type'] === 'string') parsed.type = e['type'];

    files.push(parsed);
  }

  return { indexVersion, files };
}

/**
 * Parse a JSON string into a {@link PackageIndex}.
 *
 * @param jsonString - The raw JSON string
 * @returns The typed index, or `undefined` if parsing fails
 */
export function parsePackageIndexFromString(jsonString: string): PackageIndex | undefined {
  try {
    const raw = JSON.parse(jsonString);
    return parsePackageIndex(raw);
  } catch {
    return undefined;
  }
}

/**
 * Filter index entries by resource type(s).
 *
 * @param index - The package index
 * @param resourceTypes - Types to include (e.g., ['StructureDefinition', 'ValueSet'])
 * @returns Filtered entries
 */
export function filterIndexByResourceType(
  index: PackageIndex,
  resourceTypes: string[],
): PackageIndexEntry[] {
  const typeSet = new Set(resourceTypes);
  return index.files.filter((f) => typeSet.has(f.resourceType));
}
