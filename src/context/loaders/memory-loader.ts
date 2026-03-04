/**
 * fhir-context — MemoryLoader
 *
 * Loads StructureDefinitions from an in-memory Map.
 * Primary use cases:
 * - Unit testing (inject known definitions)
 * - Preloaded core FHIR R4 definitions
 *
 * @module fhir-context
 */

import type { StructureDefinition } from '../../model/index.js';
import type { StructureDefinitionLoader } from '../types.js';

/**
 * A loader that resolves StructureDefinitions from an in-memory Map.
 *
 * The map is keyed by canonical URL. Lookups are synchronous but the
 * interface returns a Promise for consistency with other loaders.
 *
 * @example
 * ```typescript
 * const definitions = new Map<string, StructureDefinition>();
 * definitions.set('http://hl7.org/fhir/StructureDefinition/Patient', patientSD);
 * const loader = new MemoryLoader(definitions);
 * ```
 */
export class MemoryLoader implements StructureDefinitionLoader {
  private readonly _definitions: Map<string, StructureDefinition>;

  /**
   * @param definitions - Map of canonical URL → StructureDefinition.
   *                      The map is **not** copied; mutations to the
   *                      original map are visible to the loader.
   */
  constructor(definitions: Map<string, StructureDefinition>) {
    this._definitions = definitions;
  }

  async load(url: string): Promise<StructureDefinition | null> {
    return this._definitions.get(url) ?? null;
  }

  canLoad(url: string): boolean {
    return this._definitions.has(url);
  }

  getSourceType(): string {
    return 'memory';
  }

  /**
   * Number of definitions currently held in the map.
   */
  get size(): number {
    return this._definitions.size;
  }
}
