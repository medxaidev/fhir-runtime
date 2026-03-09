/**
 * fhir-package — NpmPackageLoader
 *
 * Loads FHIR conformance resources from an extracted NPM-format IG package directory.
 * Implements {@link StructureDefinitionLoader} for integration with CompositeLoader.
 *
 * @module fhir-package
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';

import type { StructureDefinition } from '../model/index.js';
import type { StructureDefinitionLoader } from '../context/types.js';
import type {
  PackageManifest,
  PackageIndex,
  PackageIndexEntry,
  NpmPackageLoaderOptions,
} from './types.js';
import { CONFORMANCE_RESOURCE_TYPES } from './types.js';
import { parsePackageManifest } from './package-manifest-parser.js';
import { parsePackageIndex } from './package-index-parser.js';
import { parseFhirJson } from '../parser/index.js';

/**
 * Loads FHIR resources from an extracted NPM-format IG package directory.
 *
 * Supports both `.index.json`-based fast lookup and filesystem scan fallback.
 *
 * @example
 * ```typescript
 * const loader = new NpmPackageLoader('/path/to/hl7.fhir.us.core/package');
 * const sd = await loader.load('http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient');
 * ```
 */
export class NpmPackageLoader implements StructureDefinitionLoader {
  private readonly _packagePath: string;
  private readonly _options: Required<NpmPackageLoaderOptions>;
  private _manifest: PackageManifest | undefined;
  private _index: PackageIndex | undefined;
  private _urlToFile: Map<string, PackageIndexEntry> | undefined;
  private _initialized = false;

  constructor(packagePath: string, options?: NpmPackageLoaderOptions) {
    this._packagePath = packagePath;
    this._options = {
      resourceTypes: options?.resourceTypes ?? [],
      useIndex: options?.useIndex ?? true,
      loadSnapshots: options?.loadSnapshots ?? true,
    };
  }

  // ---------------------------------------------------------------------------
  // Initialization
  // ---------------------------------------------------------------------------

  private _ensureInitialized(): void {
    if (this._initialized) return;
    this._initialized = true;

    // Parse manifest
    const manifestPath = join(this._packagePath, 'package.json');
    if (existsSync(manifestPath)) {
      try {
        const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'));
        this._manifest = parsePackageManifest(raw);
      } catch {
        // Manifest parse failure is non-fatal
      }
    }

    // Parse .index.json if available and enabled
    if (this._options.useIndex) {
      const indexPath = join(this._packagePath, '.index.json');
      if (existsSync(indexPath)) {
        try {
          const raw = JSON.parse(readFileSync(indexPath, 'utf-8'));
          this._index = parsePackageIndex(raw);
        } catch {
          // Index parse failure is non-fatal — will fall back to scan
        }
      }
    }

    // Build URL → file lookup map
    this._urlToFile = new Map();

    if (this._index) {
      for (const entry of this._index.files) {
        if (this._shouldInclude(entry.resourceType)) {
          this._urlToFile.set(entry.url, entry);
        }
      }
    } else {
      // Fallback: scan directory for JSON files
      this._scanDirectory();
    }
  }

  private _shouldInclude(resourceType: string): boolean {
    if (this._options.resourceTypes.length > 0) {
      return this._options.resourceTypes.includes(resourceType);
    }
    return (CONFORMANCE_RESOURCE_TYPES as readonly string[]).includes(resourceType);
  }

  private _scanDirectory(): void {
    try {
      const files = readdirSync(this._packagePath);
      for (const filename of files) {
        if (!filename.endsWith('.json') || filename.startsWith('.') || filename === 'package.json') {
          continue;
        }

        try {
          const filePath = join(this._packagePath, filename);
          const raw = JSON.parse(readFileSync(filePath, 'utf-8'));

          if (!raw || typeof raw !== 'object') continue;
          const obj = raw as Record<string, unknown>;

          const resourceType = obj['resourceType'];
          const url = obj['url'];
          const id = obj['id'];

          if (typeof resourceType !== 'string' || typeof url !== 'string') continue;
          if (!this._shouldInclude(resourceType)) continue;

          const entry: PackageIndexEntry = {
            filename,
            resourceType,
            id: typeof id === 'string' ? id : filename.replace('.json', ''),
            url,
            version: typeof obj['version'] === 'string' ? obj['version'] : undefined,
            kind: typeof obj['kind'] === 'string' ? obj['kind'] : undefined,
            type: typeof obj['type'] === 'string' ? obj['type'] : undefined,
          };

          this._urlToFile!.set(url, entry);
        } catch {
          // Skip files that can't be parsed
        }
      }
    } catch {
      // Directory read failure
    }
  }

  // ---------------------------------------------------------------------------
  // StructureDefinitionLoader interface
  // ---------------------------------------------------------------------------

  async load(url: string): Promise<StructureDefinition | null> {
    this._ensureInitialized();

    const entry = this._urlToFile!.get(url);
    if (!entry) return null;

    if (entry.resourceType !== 'StructureDefinition') return null;

    const filePath = join(this._packagePath, entry.filename);
    try {
      const raw = await readFile(filePath, 'utf-8');
      const result = parseFhirJson(raw);
      if (!result.success) return null;
      return result.data as StructureDefinition;
    } catch {
      return null;
    }
  }

  canLoad(url: string): boolean {
    this._ensureInitialized();
    const entry = this._urlToFile!.get(url);
    return entry !== undefined && entry.resourceType === 'StructureDefinition';
  }

  getSourceType(): string {
    return 'npm-package';
  }

  // ---------------------------------------------------------------------------
  // Package-specific methods
  // ---------------------------------------------------------------------------

  /**
   * Get the parsed package manifest.
   */
  getManifest(): PackageManifest | undefined {
    this._ensureInitialized();
    return this._manifest;
  }

  /**
   * Get the parsed package index. May be `undefined` if no `.index.json` exists.
   */
  getIndex(): PackageIndex | undefined {
    this._ensureInitialized();
    return this._index;
  }

  /**
   * Get all resource index entries visible to this loader.
   */
  getEntries(): PackageIndexEntry[] {
    this._ensureInitialized();
    return Array.from(this._urlToFile!.values());
  }

  /**
   * Get entries filtered by resource type.
   */
  getEntriesByType(resourceType: string): PackageIndexEntry[] {
    this._ensureInitialized();
    return Array.from(this._urlToFile!.values()).filter((e) => e.resourceType === resourceType);
  }

  /**
   * Load all StructureDefinitions from this package.
   */
  async loadAllStructureDefinitions(): Promise<StructureDefinition[]> {
    this._ensureInitialized();
    const entries = this.getEntriesByType('StructureDefinition');
    const results: StructureDefinition[] = [];

    for (const entry of entries) {
      const filePath = join(this._packagePath, entry.filename);
      try {
        const raw = await readFile(filePath, 'utf-8');
        const result = parseFhirJson(raw);
        if (result.success) {
          results.push(result.data as StructureDefinition);
        }
      } catch {
        // Skip files that can't be loaded
      }
    }

    return results;
  }

  /**
   * Load all ValueSets from this package.
   */
  async loadAllValueSets(): Promise<unknown[]> {
    return this._loadAllByType('ValueSet');
  }

  /**
   * Load all CodeSystems from this package.
   */
  async loadAllCodeSystems(): Promise<unknown[]> {
    return this._loadAllByType('CodeSystem');
  }

  /**
   * Load a single resource by canonical URL and return the raw parsed object.
   */
  async loadResource(url: string): Promise<unknown | null> {
    this._ensureInitialized();
    const entry = this._urlToFile!.get(url);
    if (!entry) return null;

    const filePath = join(this._packagePath, entry.filename);
    try {
      const raw = await readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  /**
   * Resolve a canonical URL to a file entry.
   */
  resolveCanonical(url: string): PackageIndexEntry | undefined {
    this._ensureInitialized();
    return this._urlToFile!.get(url);
  }

  /**
   * The package directory path.
   */
  get packagePath(): string {
    return this._packagePath;
  }

  /**
   * Total number of indexed resources.
   */
  get resourceCount(): number {
    this._ensureInitialized();
    return this._urlToFile!.size;
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async _loadAllByType(resourceType: string): Promise<unknown[]> {
    this._ensureInitialized();
    const entries = this.getEntriesByType(resourceType);
    const results: unknown[] = [];

    for (const entry of entries) {
      const filePath = join(this._packagePath, entry.filename);
      try {
        const raw = await readFile(filePath, 'utf-8');
        results.push(JSON.parse(raw));
      } catch {
        // Skip
      }
    }

    return results;
  }
}
