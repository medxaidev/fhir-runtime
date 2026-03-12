/**
 * Tests for DefinitionProviderLoader
 *
 * Testing policy: ≥5 unit tests.
 */

import { describe, it, expect } from 'vitest';
import type { DefinitionProvider, StructureDefinition } from 'fhir-definition';
import { DefinitionProviderLoader } from '../definition-provider-loader.js';

// =============================================================================
// Mock DefinitionProvider
// =============================================================================

function createMockProvider(sdMap: Map<string, StructureDefinition>): DefinitionProvider {
  return {
    getStructureDefinition(url: string) {
      return sdMap.get(url);
    },
    getValueSet() {
      return undefined;
    },
    getCodeSystem() {
      return undefined;
    },
    getSearchParameters() {
      return [];
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('DefinitionProviderLoader', () => {
  const patientSD: StructureDefinition = {
    resourceType: 'StructureDefinition',
    url: 'http://hl7.org/fhir/StructureDefinition/Patient',
    name: 'Patient',
    kind: 'resource',
    type: 'Patient',
  };

  const sdMap = new Map<string, StructureDefinition>([
    [patientSD.url, patientSD],
  ]);

  it('should load a StructureDefinition from the provider', async () => {
    const loader = new DefinitionProviderLoader(createMockProvider(sdMap));
    const result = await loader.load('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(result).toBeDefined();
    expect(result!.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
  });

  it('should return null for unknown URL', async () => {
    const loader = new DefinitionProviderLoader(createMockProvider(sdMap));
    const result = await loader.load('http://unknown.org/SD');
    expect(result).toBeNull();
  });

  it('should always return true for canLoad', () => {
    const loader = new DefinitionProviderLoader(createMockProvider(sdMap));
    expect(loader.canLoad('http://any-url')).toBe(true);
    expect(loader.canLoad('')).toBe(true);
  });

  it('should return "definition-provider" as source type', () => {
    const loader = new DefinitionProviderLoader(createMockProvider(sdMap));
    expect(loader.getSourceType()).toBe('definition-provider');
  });

  it('should return a Promise from load()', async () => {
    const loader = new DefinitionProviderLoader(createMockProvider(sdMap));
    const promise = loader.load('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(promise).toBeInstanceOf(Promise);
    await promise;
  });

  it('should work with an empty provider', async () => {
    const loader = new DefinitionProviderLoader(createMockProvider(new Map()));
    expect(await loader.load('http://hl7.org/fhir/StructureDefinition/Patient')).toBeNull();
    expect(await loader.load('')).toBeNull();
  });
});
