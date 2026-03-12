/**
 * fhir-definition — DefinitionProviderLoader
 *
 * StructureDefinitionLoader adapter that delegates to fhir-definition's
 * DefinitionProvider. Bridges an external DefinitionProvider into
 * FhirContext's loader system, enabling on-demand SD loading.
 *
 * STAGE-6: fhir-definition Integration (v0.8.0)
 *
 * @module fhir-definition
 */

import type { DefinitionProvider } from 'fhir-definition';
import type { StructureDefinition } from '../model/index.js';
import type { StructureDefinitionLoader } from '../context/index.js';

// =============================================================================
// DefinitionProviderLoader
// =============================================================================

/**
 * StructureDefinitionLoader that delegates to a DefinitionProvider.
 *
 * This bridges fhir-definition's DefinitionProvider into FhirContext's
 * loader pipeline, allowing FhirContext to load SDs on-demand from
 * an external DefinitionProvider.
 *
 * @example
 * ```typescript
 * import { DefinitionProviderLoader } from 'fhir-runtime';
 *
 * const loader = new DefinitionProviderLoader(registry);
 * const context = new FhirContextImpl({ loaders: [loader] });
 * ```
 */
export class DefinitionProviderLoader implements StructureDefinitionLoader {
  private readonly _provider: DefinitionProvider;

  constructor(provider: DefinitionProvider) {
    this._provider = provider;
  }

  async load(url: string): Promise<StructureDefinition | null> {
    // DefinitionProvider returns fhir-definition's minimal SD type.
    // FhirContext expects fhir-runtime's rich SD type.
    // Since fhir-definition's SD has [key: string]: unknown, actual FHIR JSON
    // objects loaded via fhir-definition will have all fields present at runtime.
    const sd = this._provider.getStructureDefinition(url);
    return (sd as unknown as StructureDefinition) ?? null;
  }

  canLoad(_url: string): boolean {
    return true;
  }

  getSourceType(): string {
    return 'definition-provider';
  }
}
