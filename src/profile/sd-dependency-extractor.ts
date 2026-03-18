/**
 * SD Dependency Extractor
 *
 * Extracts all direct type dependencies from a StructureDefinition's snapshot.
 * Used by IG import pipelines to build dependency graphs for SD indexing.
 *
 * @module fhir-profile
 */

import type { StructureDefinition } from '../model/index.js';

/**
 * FHIR primitive type codes that are excluded from dependency lists
 * since they are universally available and do not represent meaningful dependencies.
 */
const FHIR_PRIMITIVES = new Set([
  'boolean', 'integer', 'string', 'decimal', 'uri', 'url', 'canonical',
  'base64Binary', 'instant', 'date', 'dateTime', 'time', 'code', 'oid',
  'id', 'markdown', 'unsignedInt', 'positiveInt', 'uuid', 'xhtml',
]);

/**
 * Extract all direct type dependencies from a StructureDefinition.
 *
 * Scans `snapshot.element[].type[]` collecting:
 * - `type.code` (e.g. "Reference", "HumanName")
 * - `type.profile[]` (e.g. "http://hl7.org/fhir/us/core/StructureDefinition/us-core-race")
 * - `type.targetProfile[]` (Reference target profiles)
 *
 * Results are de-duplicated, sorted, and exclude:
 * - FHIR primitive types (string, boolean, etc.)
 * - The SD's own URL
 *
 * @param sd - A StructureDefinition with snapshot
 * @param options - Optional configuration
 * @param options.includePrimitives - If true, include primitive types (default: false)
 * @returns Sorted, de-duplicated array of dependency type names / profile URLs
 */
export function extractSDDependencies(
  sd: StructureDefinition,
  options?: { includePrimitives?: boolean },
): string[] {
  const deps = new Set<string>();
  const includePrimitives = options?.includePrimitives ?? false;

  const elements = (sd.snapshot as any)?.element;
  if (!Array.isArray(elements)) return [];

  for (const el of elements) {
    const types = el.type;
    if (!Array.isArray(types)) continue;

    for (const t of types) {
      // Collect type.code
      if (typeof t.code === 'string') {
        if (includePrimitives || !FHIR_PRIMITIVES.has(t.code)) {
          deps.add(t.code);
        }
      }

      // Collect type.profile[]
      if (Array.isArray(t.profile)) {
        for (const p of t.profile) {
          if (typeof p === 'string') deps.add(p);
        }
      }

      // Collect type.targetProfile[]
      if (Array.isArray(t.targetProfile)) {
        for (const tp of t.targetProfile) {
          if (typeof tp === 'string') deps.add(tp);
        }
      }
    }
  }

  // Exclude self URL
  const selfUrl = sd.url;
  if (typeof selfUrl === 'string') {
    deps.delete(selfUrl);
  }

  return [...deps].sort();
}
