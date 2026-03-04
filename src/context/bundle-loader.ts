/**
 * Bundle Loader — Phase 7
 *
 * Loads FHIR Bundle JSON files containing StructureDefinition entries
 * and converts them to CanonicalProfile[] for downstream consumption
 * by Phase 8's schema generation pipeline.
 *
 * Two data paths exist in MedXAI:
 *
 * ```
 * Path A — Stage-1 Validation (unchanged):
 *   core-definitions/*.json (73 files)
 *     → loadAllCoreDefinitions()
 *     → FhirContextImpl (runtime validation)
 *
 * Path B — Stage-2 Schema Generation (this module):
 *   spec/fhir/r4/profiles-*.json (complete bundles)
 *     → BundleLoader
 *     → StructureDefinitionRegistry (Phase 8)
 *     → TableSchemaBuilder (Phase 8)
 * ```
 *
 * @module fhir-context
 */

import { readFileSync } from 'node:fs';

import { parseStructureDefinition } from '../parser/structure-definition-parser.js';
import { buildCanonicalProfile } from '../profile/canonical-builder.js';
import type { CanonicalProfile } from '../model/canonical-profile.js';
import type { StructureDefinitionKind } from '../model/primitives.js';
import type { ParseIssue } from '../parser/parse-error.js';

// =============================================================================
// Section 1: Types
// =============================================================================

/**
 * Options for filtering which StructureDefinitions to load from a bundle.
 */
export interface BundleLoadOptions {
  /** Only include entries where kind matches. Default: all kinds. */
  filterKind?: StructureDefinitionKind | StructureDefinitionKind[];

  /** Exclude abstract definitions. Default: false (include abstract). */
  excludeAbstract?: boolean;

  /** Only include entries where type matches one of these. */
  filterTypes?: string[];
}

/**
 * Result of loading one or more bundles.
 */
export interface BundleLoadResult {
  /** Successfully loaded CanonicalProfiles. */
  profiles: CanonicalProfile[];

  /** Errors encountered during loading (partial failures). */
  errors: BundleLoadError[];

  /** Summary statistics. */
  stats: {
    /** Total StructureDefinition entries found in bundle(s). */
    total: number;
    /** Successfully parsed and converted to CanonicalProfile. */
    loaded: number;
    /** Filtered out by options (kind, abstract, type). */
    skipped: number;
    /** Failed to parse or convert. */
    failed: number;
  };
}

/**
 * Describes a single error encountered while loading a StructureDefinition.
 */
export interface BundleLoadError {
  /** The name of the StructureDefinition that failed. */
  name: string;
  /** The canonical URL of the StructureDefinition that failed. */
  url: string;
  /** The error that occurred. */
  error: Error;
  /** Parse issues, if the failure was during parsing. */
  parseIssues?: readonly ParseIssue[];
}

// =============================================================================
// Section 2: Internal Helpers
// =============================================================================

/**
 * Minimal Bundle shape for type-safe access.
 */
interface BundleShape {
  resourceType: string;
  entry?: Array<{
    resource?: Record<string, unknown>;
  }>;
}

/**
 * Check if a StructureDefinition should be included based on filter options.
 */
function shouldInclude(
  sd: Record<string, unknown>,
  options?: BundleLoadOptions,
): boolean {
  if (!options) return true;

  // Filter by kind
  if (options.filterKind !== undefined) {
    const kinds = Array.isArray(options.filterKind) ? options.filterKind : [options.filterKind];
    if (!kinds.includes(sd.kind as StructureDefinitionKind)) {
      return false;
    }
  }

  // Filter by abstract
  if (options.excludeAbstract === true && sd.abstract === true) {
    return false;
  }

  // Filter by type
  if (options.filterTypes !== undefined && options.filterTypes.length > 0) {
    if (!options.filterTypes.includes(sd.type as string)) {
      return false;
    }
  }

  return true;
}

/**
 * Create an empty BundleLoadResult.
 */
function emptyResult(): BundleLoadResult {
  return {
    profiles: [],
    errors: [],
    stats: { total: 0, loaded: 0, skipped: 0, failed: 0 },
  };
}

/**
 * Extract StructureDefinition entries from a bundle object.
 */
function extractStructureDefinitions(bundle: BundleShape): Array<Record<string, unknown>> {
  if (bundle.resourceType !== 'Bundle' || !Array.isArray(bundle.entry)) {
    return [];
  }

  return bundle.entry
    .filter(
      (e): e is { resource: Record<string, unknown> } =>
        e.resource !== undefined &&
        e.resource !== null &&
        typeof e.resource === 'object' &&
        e.resource.resourceType === 'StructureDefinition',
    )
    .map((e) => e.resource);
}

// =============================================================================
// Section 3: Core Loading Functions
// =============================================================================

/**
 * Load CanonicalProfiles from an already-parsed Bundle object.
 *
 * This is the core loading function. It:
 * 1. Extracts all StructureDefinition entries from the bundle
 * 2. Applies filter options (kind, abstract, type)
 * 3. Parses each SD through `parseStructureDefinition`
 * 4. Converts each parsed SD to `CanonicalProfile` via `buildCanonicalProfile`
 * 5. Collects errors without aborting (partial failure tolerance)
 *
 * @param bundle - A parsed FHIR Bundle object containing StructureDefinition entries.
 * @param options - Optional filters to control which entries are loaded.
 * @returns BundleLoadResult with profiles, errors, and statistics.
 */
export function loadBundleFromObject(
  bundle: BundleShape,
  options?: BundleLoadOptions,
): BundleLoadResult {
  const result = emptyResult();

  const definitions = extractStructureDefinitions(bundle);
  result.stats.total = definitions.length;

  for (const sd of definitions) {
    const name = (sd.name as string) ?? '<unknown>';
    const url = (sd.url as string) ?? '<unknown>';

    // Apply filters
    if (!shouldInclude(sd, options)) {
      result.stats.skipped++;
      continue;
    }

    // Parse the StructureDefinition
    try {
      const parseResult = parseStructureDefinition(sd, 'StructureDefinition');

      if (!parseResult.success) {
        result.stats.failed++;
        const errorIssues = parseResult.issues.filter((i) => i.severity === 'error');
        result.errors.push({
          name,
          url,
          error: new Error(`Parse failed for ${name}: ${errorIssues.map((i) => i.message).join('; ')}`),
          parseIssues: parseResult.issues,
        });
        continue;
      }

      // Convert to CanonicalProfile
      const profile = buildCanonicalProfile(parseResult.data);
      result.profiles.push(profile);
      result.stats.loaded++;
    } catch (err) {
      result.stats.failed++;
      result.errors.push({
        name,
        url,
        error: err instanceof Error ? err : new Error(String(err)),
      });
    }
  }

  return result;
}

/**
 * Load CanonicalProfiles from a FHIR Bundle JSON file.
 *
 * Reads the file synchronously (spec files are loaded once at startup),
 * parses the JSON, and delegates to `loadBundleFromObject`.
 *
 * @param filePath - Absolute path to a FHIR Bundle JSON file.
 * @param options - Optional filters to control which entries are loaded.
 * @returns BundleLoadResult with profiles, errors, and statistics.
 * @throws Error if the file cannot be read or is not valid JSON.
 */
export function loadBundleFromFile(
  filePath: string,
  options?: BundleLoadOptions,
): BundleLoadResult {
  const raw = readFileSync(filePath, 'utf-8');
  const bundle: BundleShape = JSON.parse(raw);
  return loadBundleFromObject(bundle, options);
}

/**
 * Load and merge multiple bundle files in order.
 *
 * Later bundles override earlier ones for the same canonical URL.
 * This supports the standard loading order:
 *   1. profiles-types.json    — type system (no tables)
 *   2. profiles-resources.json — clinical resources
 *   3. profiles-others.json   — conformance resources
 *   4. profiles-platform.json — platform resources (Phase 9)
 *
 * @param filePaths - Array of absolute paths to FHIR Bundle JSON files.
 * @param options - Optional filters applied to each bundle.
 * @returns Merged BundleLoadResult with deduplicated profiles.
 */
export function loadBundlesFromFiles(
  filePaths: string[],
  options?: BundleLoadOptions,
): BundleLoadResult {
  const merged = emptyResult();
  const profileMap = new Map<string, CanonicalProfile>();

  for (const filePath of filePaths) {
    const bundleResult = loadBundleFromFile(filePath, options);

    // Merge stats
    merged.stats.total += bundleResult.stats.total;
    merged.stats.skipped += bundleResult.stats.skipped;
    merged.stats.failed += bundleResult.stats.failed;

    // Merge errors
    merged.errors.push(...bundleResult.errors);

    // Merge profiles (later overrides earlier for same URL)
    for (const profile of bundleResult.profiles) {
      profileMap.set(profile.url, profile);
    }
  }

  merged.profiles = Array.from(profileMap.values());
  merged.stats.loaded = merged.profiles.length;

  return merged;
}
