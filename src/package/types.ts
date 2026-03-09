/**
 * fhir-package — Type Definitions
 *
 * Core interfaces for FHIR NPM package loading and canonical resolution.
 *
 * @module fhir-package
 */

// =============================================================================
// Section 1: Package Manifest
// =============================================================================

/**
 * Parsed representation of a FHIR NPM package's `package.json`.
 */
export interface PackageManifest {
  name: string;
  version: string;
  fhirVersions?: string[];
  type?: string;
  dependencies?: Record<string, string>;
  description?: string;
  author?: string;
  canonical?: string;
  title?: string;
  license?: string;
  url?: string;
}

// =============================================================================
// Section 2: Package Index
// =============================================================================

/**
 * Parsed representation of a FHIR NPM package's `.index.json`.
 */
export interface PackageIndex {
  indexVersion: number;
  files: PackageIndexEntry[];
}

/**
 * A single entry in the `.index.json` resource index.
 */
export interface PackageIndexEntry {
  filename: string;
  resourceType: string;
  id: string;
  url: string;
  version?: string;
  kind?: string;
  type?: string;
}

// =============================================================================
// Section 3: NpmPackageLoader Options
// =============================================================================

/**
 * Options for the {@link NpmPackageLoader}.
 */
export interface NpmPackageLoaderOptions {
  /**
   * Resource types to load. If empty or undefined, loads all conformance resources.
   */
  resourceTypes?: string[];

  /**
   * Whether to use `.index.json` if available. Default `true`.
   */
  useIndex?: boolean;

  /**
   * Whether to load StructureDefinition snapshots. Default `true`.
   */
  loadSnapshots?: boolean;
}

// =============================================================================
// Section 4: PackageManager Types
// =============================================================================

/**
 * Options for the {@link PackageManager}.
 */
export interface PackageManagerOptions {
  /**
   * Base path containing multiple extracted IG packages.
   */
  packageCachePath?: string;
}

/**
 * Information about a registered package.
 */
export interface PackageInfo {
  name: string;
  version: string;
  path: string;
  manifest: PackageManifest;
  resourceCount: number;
}

/**
 * A dependency graph with topological ordering.
 */
export interface DependencyGraph {
  root: string;
  nodes: Map<string, DependencyNode>;
  order: string[];
}

/**
 * A single node in the dependency graph.
 */
export interface DependencyNode {
  name: string;
  version: string;
  dependencies: string[];
}

/**
 * Result of resolving a canonical URL across packages.
 */
export interface CanonicalResolution {
  url: string;
  version?: string;
  packageName: string;
  packageVersion: string;
  resourceType: string;
  filename: string;
}

// =============================================================================
// Section 5: Default conformance resource types
// =============================================================================

/**
 * Resource types considered "conformance" resources in FHIR IG packages.
 */
export const CONFORMANCE_RESOURCE_TYPES = [
  'StructureDefinition',
  'ValueSet',
  'CodeSystem',
  'SearchParameter',
  'CapabilityStatement',
  'OperationDefinition',
  'ConceptMap',
  'NamingSystem',
  'ImplementationGuide',
] as const;
