/**
 * fhir-package — Public API Barrel Exports
 *
 * Re-exports all public types, classes, and functions from the
 * package module.
 *
 * @module fhir-package
 */

// ─── Types ──────────────────────────────────────────────────────────────────
export type {
  PackageManifest,
  PackageIndex,
  PackageIndexEntry,
  NpmPackageLoaderOptions,
  PackageManagerOptions,
  PackageInfo,
  DependencyGraph,
  DependencyNode,
  CanonicalResolution,
} from './types.js';

export { CONFORMANCE_RESOURCE_TYPES } from './types.js';

// ─── Manifest Parser ────────────────────────────────────────────────────────
export {
  parsePackageManifest,
  parsePackageManifestFromString,
} from './package-manifest-parser.js';

// ─── Index Parser ───────────────────────────────────────────────────────────
export {
  parsePackageIndex,
  parsePackageIndexFromString,
  filterIndexByResourceType,
} from './package-index-parser.js';

// ─── NpmPackageLoader ───────────────────────────────────────────────────────
export { NpmPackageLoader } from './npm-package-loader.js';

// ─── Dependency Resolver ────────────────────────────────────────────────────
export {
  buildDependencyGraph,
  topologicalSort,
  findMissingDependencies,
  CircularPackageDependencyError,
} from './dependency-resolver.js';

// ─── Canonical Resolver ─────────────────────────────────────────────────────
export {
  parseCanonicalUrl,
  resolveCanonical,
  resolveAllByType,
} from './canonical-resolver.js';

// ─── PackageManager ─────────────────────────────────────────────────────────
export { PackageManager } from './package-manager.js';
