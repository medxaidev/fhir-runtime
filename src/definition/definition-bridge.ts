/**
 * fhir-definition — DefinitionBridge
 *
 * Adapter that bridges existing fhir-runtime modules (FhirContext,
 * terminology registries) into a unified DefinitionProvider interface
 * from fhir-definition.
 *
 * This allows fhir-runtime to work standalone while still providing
 * a consistent DefinitionProvider to consumers.
 *
 * STAGE-6: fhir-definition Integration (v0.8.0)
 *
 * @module fhir-definition
 */

import type {
  DefinitionProvider,
  StructureDefinition,
  ValueSet,
  CodeSystem,
  SearchParameter,
} from 'fhir-definition';

import type { DefinitionBridgeOptions } from './types.js';

// =============================================================================
// DefinitionBridge
// =============================================================================

/**
 * Adapter that composes FhirContext + optional registries into a
 * unified DefinitionProvider (from fhir-definition).
 *
 * Delegation strategy:
 * - `getStructureDefinition(url)` → `context.getStructureDefinition(url)` cast to fhir-definition SD
 * - `getValueSet(url)` → `valueSets.get(url)`
 * - `getCodeSystem(url)` → `codeSystems.get(url)`
 * - `getSearchParameters(resourceType)` → filters internal SP array
 *
 * All methods follow the no-throw contract.
 *
 * @example
 * ```typescript
 * const bridge = new DefinitionBridge({
 *   context: fhirContext,
 *   valueSets: vsMap,
 *   codeSystems: csMap,
 *   searchParameters: spList,
 * });
 *
 * const sd = bridge.getStructureDefinition('http://hl7.org/fhir/StructureDefinition/Patient');
 * const sps = bridge.getSearchParameters('Patient');
 * ```
 */
export class DefinitionBridge implements DefinitionProvider {
  private readonly _options: DefinitionBridgeOptions;

  /** Pre-built index: resourceType → SearchParameter[] */
  private readonly _spIndex = new Map<string, SearchParameter[]>();

  constructor(options: DefinitionBridgeOptions) {
    this._options = options;
    this._buildSearchParameterIndex();
  }

  // ---------------------------------------------------------------------------
  // DefinitionProvider interface
  // ---------------------------------------------------------------------------

  getStructureDefinition(url: string): StructureDefinition | undefined {
    // FhirContext returns fhir-runtime's StructureDefinition (rich type).
    // fhir-definition's StructureDefinition is a minimal type with [key: string]: unknown.
    // Runtime's SD is a superset, so we cast safely.
    const sd = this._options.context.getStructureDefinition(url);
    return sd as unknown as StructureDefinition | undefined;
  }

  getValueSet(url: string): ValueSet | undefined {
    return this._options.valueSets?.get(url);
  }

  getCodeSystem(url: string): CodeSystem | undefined {
    return this._options.codeSystems?.get(url);
  }

  getSearchParameters(resourceType: string): SearchParameter[] {
    return this._spIndex.get(resourceType) ?? [];
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Build the resourceType → SP[] index from the provided search parameters.
   */
  private _buildSearchParameterIndex(): void {
    const sps = this._options.searchParameters;
    if (!sps) return;

    for (const sp of sps) {
      const bases = sp.base;
      if (!bases) continue;

      for (const base of bases) {
        let list = this._spIndex.get(base);
        if (!list) {
          list = [];
          this._spIndex.set(base, list);
        }
        list.push(sp);
      }
    }
  }
}
