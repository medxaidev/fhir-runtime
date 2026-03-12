/**
 * End-to-end integration tests for fhir-definition integration
 *
 * Tests the full flow: DefinitionProvider → FhirContext → validate/search.
 * Testing policy: ≥15 integration tests.
 */

import { describe, it, expect } from 'vitest';
import type {
  DefinitionProvider,
  StructureDefinition as FhirDefSD,
  ValueSet,
  CodeSystem,
  SearchParameter as FhirDefSP,
} from 'fhir-definition';
import type { Resource } from '../../model/index.js';
import { FhirContextImpl, MemoryLoader, loadAllCoreDefinitions } from '../../context/index.js';
import { DefinitionProviderLoader } from '../definition-provider-loader.js';
import { DefinitionBridge } from '../definition-bridge.js';
import { NoOpDefinitionProvider } from '../noop-definition-provider.js';
import { createRuntime } from '../create-runtime.js';

// =============================================================================
// Helpers: build a mock DefinitionProvider backed by core definitions
// =============================================================================

let coreDefProvider: DefinitionProvider | undefined;

async function getCoreDefProvider(): Promise<DefinitionProvider> {
  if (coreDefProvider) return coreDefProvider;

  const coreDefs = await loadAllCoreDefinitions();
  const sdMap = new Map<string, FhirDefSD>();

  coreDefs.forEach((sd) => {
    if (sd.url) {
      // Cast fhir-runtime's rich SD to fhir-definition's minimal SD
      sdMap.set(sd.url as string, sd as unknown as FhirDefSD);
    }
  });

  coreDefProvider = {
    getStructureDefinition(url: string) {
      return sdMap.get(url);
    },
    getValueSet(_url: string): ValueSet | undefined {
      return undefined;
    },
    getCodeSystem(_url: string): CodeSystem | undefined {
      return undefined;
    },
    getSearchParameters(_resourceType: string): FhirDefSP[] {
      return [];
    },
  };

  return coreDefProvider;
}

// =============================================================================
// Tests
// =============================================================================

describe('fhir-definition Integration E2E', () => {
  // --- DefinitionProviderLoader → FhirContext ---

  it('should load Patient SD via DefinitionProviderLoader', async () => {
    const provider = await getCoreDefProvider();
    const loader = new DefinitionProviderLoader(provider);
    const ctx = new FhirContextImpl({ loaders: [loader], preloadCore: false });

    const sd = await ctx.loadStructureDefinition(
      'http://hl7.org/fhir/StructureDefinition/Patient',
    );
    expect(sd).toBeDefined();
    expect(sd.type).toBe('Patient');
  });

  it('should load Observation SD via DefinitionProviderLoader', async () => {
    const provider = await getCoreDefProvider();
    const loader = new DefinitionProviderLoader(provider);
    const ctx = new FhirContextImpl({ loaders: [loader], preloadCore: false });

    const sd = await ctx.loadStructureDefinition(
      'http://hl7.org/fhir/StructureDefinition/Observation',
    );
    expect(sd).toBeDefined();
    expect(sd.type).toBe('Observation');
  });

  it('should throw for unknown SD via DefinitionProviderLoader', async () => {
    const provider = await getCoreDefProvider();
    const loader = new DefinitionProviderLoader(provider);
    const ctx = new FhirContextImpl({ loaders: [loader], preloadCore: false });

    await expect(
      ctx.loadStructureDefinition('http://unknown.org/StructureDefinition/Foo'),
    ).rejects.toThrow();
  });

  // --- DefinitionBridge round-trip ---

  it('should create DefinitionBridge from FhirContext with core defs', async () => {
    const ctx = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
    await ctx.preloadCoreDefinitions();

    const bridge = new DefinitionBridge({ context: ctx });
    const sd = bridge.getStructureDefinition(
      'http://hl7.org/fhir/StructureDefinition/Patient',
    );
    expect(sd).toBeDefined();
    expect(sd!.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
  });

  it('should return undefined from bridge for non-loaded SD', async () => {
    const ctx = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
    // Don't preload — registry is empty
    const bridge = new DefinitionBridge({ context: ctx });
    expect(
      bridge.getStructureDefinition('http://hl7.org/fhir/StructureDefinition/Patient'),
    ).toBeUndefined();
  });

  it('should pass DefinitionBridge with VS and CS maps', async () => {
    const ctx = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
    const vsMap = new Map<string, ValueSet>([
      [
        'http://test.org/vs',
        { resourceType: 'ValueSet', url: 'http://test.org/vs', name: 'Test' },
      ],
    ]);
    const csMap = new Map<string, CodeSystem>([
      [
        'http://test.org/cs',
        { resourceType: 'CodeSystem', url: 'http://test.org/cs', name: 'Test' },
      ],
    ]);

    const bridge = new DefinitionBridge({
      context: ctx,
      valueSets: vsMap,
      codeSystems: csMap,
    });

    expect(bridge.getValueSet('http://test.org/vs')).toBeDefined();
    expect(bridge.getCodeSystem('http://test.org/cs')).toBeDefined();
    expect(bridge.getValueSet('http://unknown.org')).toBeUndefined();
    expect(bridge.getCodeSystem('http://unknown.org')).toBeUndefined();
  });

  // --- createRuntime E2E ---

  it('should create runtime with external DefinitionProvider and validate', async () => {
    const provider = await getCoreDefProvider();
    const runtime = await createRuntime({ definitions: provider });

    const patient = {
      resourceType: 'Patient',
      name: [{ family: 'Smith' }],
    } as unknown as Resource;

    const result = await runtime.validate(
      patient,
      'http://hl7.org/fhir/StructureDefinition/Patient',
    );
    expect(result).toBeDefined();
    expect(result.valid).toBe(true);
  });

  it('should create runtime with bare minimum and validate', async () => {
    const runtime = await createRuntime();

    const observation = {
      resourceType: 'Observation',
      status: 'final',
      code: {
        coding: [{ system: 'http://loinc.org', code: '12345-6' }],
      },
    } as unknown as Resource;

    const result = await runtime.validate(
      observation,
      'http://hl7.org/fhir/StructureDefinition/Observation',
    );
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
  });

  it('should detect invalid resource type during validation', async () => {
    const runtime = await createRuntime();

    const wrongType = {
      resourceType: 'Encounter',
    } as unknown as Resource;

    const result = await runtime.validate(
      wrongType,
      'http://hl7.org/fhir/StructureDefinition/Patient',
    );
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'RESOURCE_TYPE_MISMATCH')).toBe(true);
  });

  // --- NoOpDefinitionProvider in runtime ---

  it('should work with NoOpDefinitionProvider (no definitions)', async () => {
    const noop = new NoOpDefinitionProvider();
    expect(noop.getStructureDefinition('http://any.org')).toBeUndefined();
    expect(noop.getValueSet('http://any.org')).toBeUndefined();
    expect(noop.getCodeSystem('http://any.org')).toBeUndefined();
    expect(noop.getSearchParameters('Patient')).toEqual([]);
  });

  // --- Type compatibility ---

  it('should accept fhir-definition DefinitionProvider interface structurally', () => {
    // This test verifies that a plain object satisfying DefinitionProvider
    // is accepted as a DefinitionProvider (structural typing)
    const provider: DefinitionProvider = {
      getStructureDefinition: () => undefined,
      getValueSet: () => undefined,
      getCodeSystem: () => undefined,
      getSearchParameters: () => [],
    };
    expect(provider.getStructureDefinition('test')).toBeUndefined();
    expect(provider.getSearchParameters('Patient')).toEqual([]);
  });

  it('should allow DefinitionProviderLoader with mock provider', async () => {
    const mockProvider: DefinitionProvider = {
      getStructureDefinition: (url: string) => {
        if (url === 'http://test.org/sd') {
          return {
            resourceType: 'StructureDefinition',
            url: 'http://test.org/sd',
            name: 'TestSD',
          };
        }
        return undefined;
      },
      getValueSet: () => undefined,
      getCodeSystem: () => undefined,
      getSearchParameters: () => [],
    };

    const loader = new DefinitionProviderLoader(mockProvider);
    const result = await loader.load('http://test.org/sd');
    expect(result).toBeDefined();
    expect(result!.url).toBe('http://test.org/sd');
  });

  // --- Multiple resource types ---

  it('should validate multiple resource types via same runtime', async () => {
    const runtime = await createRuntime();

    const patient = { resourceType: 'Patient' } as unknown as Resource;
    const r1 = await runtime.validate(
      patient,
      'http://hl7.org/fhir/StructureDefinition/Patient',
    );
    expect(r1).toBeDefined();

    const observation = {
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '1' }] },
    } as unknown as Resource;
    const r2 = await runtime.validate(
      observation,
      'http://hl7.org/fhir/StructureDefinition/Observation',
    );
    expect(r2).toBeDefined();
  });

  it('should expose definitions and context on runtime instance', async () => {
    const runtime = await createRuntime();
    expect(runtime.definitions).toBeDefined();
    expect(runtime.context).toBeDefined();
    expect(runtime.terminology).toBeDefined();
    expect(runtime.referenceResolver).toBeDefined();
    expect(typeof runtime.validate).toBe('function');
    expect(typeof runtime.getSearchParameters).toBe('function');
    expect(typeof runtime.extractSearchValues).toBe('function');
  });
});
