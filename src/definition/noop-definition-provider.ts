/**
 * fhir-definition — NoOp DefinitionProvider
 *
 * Default implementation of DefinitionProvider that returns undefined/empty
 * for all queries. Used as a fallback when no definitions are available.
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

// =============================================================================
// NoOpDefinitionProvider
// =============================================================================

/**
 * No-op implementation of DefinitionProvider.
 *
 * All methods return `undefined` or empty arrays. Useful as:
 * - Default fallback when no definitions are configured
 * - Base class for partial implementations
 * - Test mock baseline
 *
 * @example
 * ```typescript
 * const provider = new NoOpDefinitionProvider();
 * provider.getStructureDefinition('http://any-url'); // → undefined
 * provider.getSearchParameters('Patient');           // → []
 * ```
 */
export class NoOpDefinitionProvider implements DefinitionProvider {
  getStructureDefinition(_url: string): StructureDefinition | undefined {
    return undefined;
  }

  getValueSet(_url: string): ValueSet | undefined {
    return undefined;
  }

  getCodeSystem(_url: string): CodeSystem | undefined {
    return undefined;
  }

  getSearchParameters(_resourceType: string): SearchParameter[] {
    return [];
  }
}
