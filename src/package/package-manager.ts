/**
 * fhir-package — PackageManager
 *
 * Manages multiple FHIR IG packages, resolves dependencies, and provides
 * cross-package canonical URL resolution.
 *
 * @module fhir-package
 */

import { join } from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';

import type { StructureDefinitionLoader } from '../context/types.js';
import { CompositeLoader } from '../context/loaders/composite-loader.js';
import type {
  PackageManagerOptions,
  PackageInfo,
  PackageManifest,
  DependencyGraph,
  CanonicalResolution,
} from './types.js';
import { NpmPackageLoader } from './npm-package-loader.js';
import { buildDependencyGraph } from './dependency-resolver.js';
import { resolveCanonical, resolveAllByType } from './canonical-resolver.js';

/**
 * Manages multiple registered FHIR IG packages.
 *
 * Provides dependency resolution, cross-package canonical URL resolution,
 * and creates CompositeLoaders for integration with FhirContext.
 *
 * @example
 * ```typescript
 * const manager = new PackageManager();
 * await manager.registerPackage('/path/to/hl7.fhir.us.core/package');
 * const loader = manager.createLoader();
 * const ctx = new FhirContextImpl({ loaders: [loader] });
 * ```
 */
export class PackageManager {
  private readonly _options: PackageManagerOptions;
  private readonly _packages: Map<string, { info: PackageInfo; loader: NpmPackageLoader }> =
    new Map();

  constructor(options?: PackageManagerOptions) {
    this._options = options ?? {};
  }

  /**
   * Register an extracted IG package by path.
   *
   * @param packagePath - Path to the extracted package directory (containing package.json)
   * @returns Information about the registered package
   */
  async registerPackage(packagePath: string): Promise<PackageInfo> {
    const loader = new NpmPackageLoader(packagePath);
    const manifest = loader.getManifest();

    if (!manifest) {
      throw new Error(`Invalid package at '${packagePath}': no valid package.json found`);
    }

    const info: PackageInfo = {
      name: manifest.name,
      version: manifest.version,
      path: packagePath,
      manifest,
      resourceCount: loader.resourceCount,
    };

    this._packages.set(manifest.name, { info, loader });
    return info;
  }

  /**
   * Auto-discover and register all packages in the package cache path.
   *
   * Expects a directory structure like:
   * ```
   * cachePath/
   *   hl7.fhir.us.core#6.1.0/package/
   *   hl7.fhir.r4.core#4.0.1/package/
   * ```
   *
   * @returns Array of registered package info
   */
  async discoverPackages(cachePath?: string): Promise<PackageInfo[]> {
    const basePath = cachePath ?? this._options.packageCachePath;
    if (!basePath || !existsSync(basePath)) return [];

    const results: PackageInfo[] = [];

    try {
      const entries = readdirSync(basePath);
      for (const entry of entries) {
        const entryPath = join(basePath, entry);
        if (!statSync(entryPath).isDirectory()) continue;

        // Check for package/ subdirectory
        const packageSubdir = join(entryPath, 'package');
        const manifestPath = existsSync(join(packageSubdir, 'package.json'))
          ? packageSubdir
          : existsSync(join(entryPath, 'package.json'))
            ? entryPath
            : undefined;

        if (manifestPath) {
          try {
            const info = await this.registerPackage(manifestPath);
            results.push(info);
          } catch {
            // Skip invalid packages
          }
        }
      }
    } catch {
      // Directory read failure
    }

    return results;
  }

  /**
   * Resolve dependencies for a given package.
   *
   * @param packageName - The root package name
   * @returns Dependency graph with topological ordering
   */
  resolveDependencies(packageName: string): DependencyGraph {
    const manifests = new Map<string, PackageManifest>();
    for (const [name, pkg] of this._packages) {
      manifests.set(name, pkg.info.manifest);
    }

    return buildDependencyGraph(packageName, manifests);
  }

  /**
   * Resolve a canonical URL across all registered packages.
   *
   * @param url - Canonical URL, optionally with `|version` suffix
   * @returns Resolution result, or `undefined` if not found
   */
  resolveCanonical(url: string): CanonicalResolution | undefined {
    const loaders = this._getOrderedLoaders();
    return resolveCanonical(url, loaders);
  }

  /**
   * Resolve all canonical URLs of a given resource type across all packages.
   */
  resolveAllByType(resourceType: string): CanonicalResolution[] {
    const loaders = this._getOrderedLoaders();
    return resolveAllByType(resourceType, loaders);
  }

  /**
   * Create a StructureDefinitionLoader that searches all registered packages.
   */
  createLoader(): StructureDefinitionLoader {
    const loaders = this._getOrderedLoaders();
    if (loaders.length === 0) {
      throw new Error('No packages registered. Call registerPackage() first.');
    }
    return new CompositeLoader(loaders);
  }

  /**
   * Get information about all registered packages.
   */
  getPackages(): PackageInfo[] {
    return Array.from(this._packages.values()).map((p) => p.info);
  }

  /**
   * Check if a package is registered.
   */
  hasPackage(name: string): boolean {
    return this._packages.has(name);
  }

  /**
   * Get the loader for a specific package.
   */
  getPackageLoader(name: string): NpmPackageLoader | undefined {
    return this._packages.get(name)?.loader;
  }

  /**
   * Number of registered packages.
   */
  get packageCount(): number {
    return this._packages.size;
  }

  /**
   * Remove all registered packages.
   */
  clear(): void {
    this._packages.clear();
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private _getOrderedLoaders(): NpmPackageLoader[] {
    return Array.from(this._packages.values()).map((p) => p.loader);
  }
}
