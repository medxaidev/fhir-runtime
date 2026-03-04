/**
 * fhir-context — FileSystemLoader
 *
 * Loads StructureDefinitions from local JSON files on disk.
 * Uses the fhir-parser module to parse raw JSON into typed models.
 *
 * URL-to-path mapping strategy:
 * - Extract the resource name from the canonical URL tail
 *   (e.g., `http://hl7.org/fhir/StructureDefinition/Patient` → `Patient`)
 * - Look for `{basePath}/{name}.json`
 *
 * @module fhir-context
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { existsSync } from 'node:fs';

import type { StructureDefinition } from '../../model/index.js';
import type { StructureDefinitionLoader } from '../types.js';
import { parseFhirJson } from '../../parser/index.js';
import { LoaderError } from '../errors.js';

/**
 * Extract the resource name from a canonical URL.
 *
 * @param url - e.g. `"http://hl7.org/fhir/StructureDefinition/Patient"`
 * @returns The last path segment, e.g. `"Patient"`
 */
export function extractResourceName(url: string): string {
  const lastSlash = url.lastIndexOf('/');
  return lastSlash === -1 ? url : url.substring(lastSlash + 1);
}

/**
 * A loader that resolves StructureDefinitions from local JSON files.
 *
 * @example
 * ```typescript
 * const loader = new FileSystemLoader('/path/to/definitions');
 * const sd = await loader.load('http://hl7.org/fhir/StructureDefinition/Patient');
 * // Reads /path/to/definitions/Patient.json
 * ```
 */
export class FileSystemLoader implements StructureDefinitionLoader {
  private readonly _basePath: string;

  /**
   * @param basePath - Directory containing `{ResourceName}.json` files
   */
  constructor(basePath: string) {
    this._basePath = basePath;
  }

  async load(url: string): Promise<StructureDefinition | null> {
    const name = extractResourceName(url);
    const filePath = join(this._basePath, `${name}.json`);

    let raw: string;
    try {
      raw = await readFile(filePath, 'utf-8');
    } catch (err) {
      // File not found is a normal "miss" — return null to allow fallback
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      // Other I/O errors (permission denied, etc.) are hard failures
      throw new LoaderError(url, 'filesystem', err as Error);
    }

    // Parse using fhir-parser
    const result = parseFhirJson(raw);
    if (!result.success) {
      const messages = result.issues
        .filter((i) => i.severity === 'error')
        .map((i) => i.message)
        .join('; ');
      throw new LoaderError(
        url,
        'filesystem',
        new Error(`Parse failed: ${messages}`),
      );
    }

    return result.data as StructureDefinition;
  }

  canLoad(url: string): boolean {
    const name = extractResourceName(url);
    const filePath = join(this._basePath, `${name}.json`);
    return existsSync(filePath);
  }

  getSourceType(): string {
    return 'filesystem';
  }

  /**
   * The base directory this loader reads from.
   */
  get basePath(): string {
    return this._basePath;
  }
}
