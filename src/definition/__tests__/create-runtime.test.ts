/**
 * Tests for createRuntime() factory
 *
 * Testing policy: ≥15 tests covering all 3 patterns.
 */

import { describe, it, expect } from 'vitest';
import type { DefinitionProvider, StructureDefinition, SearchParameter } from 'fhir-definition';
import type { Resource } from '../../model/index.js';
import { createRuntime } from '../create-runtime.js';
import { FhirContextImpl, MemoryLoader } from '../../context/index.js';
import { NoOpTerminologyProvider, NoOpReferenceResolver } from '../../provider/index.js';

// =============================================================================
// Mock DefinitionProvider (simulates fhir-definition's InMemoryDefinitionRegistry)
// =============================================================================

function createMockDefinitions(options?: {
  sds?: StructureDefinition[];
  sps?: SearchParameter[];
}): DefinitionProvider {
  const sdMap = new Map<string, StructureDefinition>();
  const spMap = new Map<string, SearchParameter[]>();

  for (const sd of options?.sds ?? []) {
    sdMap.set(sd.url, sd);
  }

  for (const sp of options?.sps ?? []) {
    for (const base of sp.base ?? []) {
      const list = spMap.get(base) ?? [];
      list.push(sp);
      spMap.set(base, list);
    }
  }

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
    getSearchParameters(resourceType: string) {
      return spMap.get(resourceType) ?? [];
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe('createRuntime', () => {
  // --- Pattern 3: Bare minimum ---

  it('should create runtime with no options', async () => {
    const runtime = await createRuntime();
    expect(runtime).toBeDefined();
    expect(runtime.definitions).toBeDefined();
    expect(runtime.context).toBeDefined();
    expect(runtime.terminology).toBeDefined();
    expect(runtime.referenceResolver).toBeDefined();
  });

  it('should have NoOp terminology provider by default', async () => {
    const runtime = await createRuntime();
    expect(runtime.terminology).toBeInstanceOf(NoOpTerminologyProvider);
  });

  it('should have NoOp reference resolver by default', async () => {
    const runtime = await createRuntime();
    expect(runtime.referenceResolver).toBeInstanceOf(NoOpReferenceResolver);
  });

  it('should preload core definitions by default', async () => {
    const runtime = await createRuntime();
    const stats = runtime.context.getStatistics();
    expect(stats.totalLoaded).toBeGreaterThan(0);
  });

  it('should skip preload when preloadCore is false', async () => {
    const runtime = await createRuntime({ preloadCore: false });
    const stats = runtime.context.getStatistics();
    expect(stats.totalLoaded).toBe(0);
  });

  // --- Pattern 1: With external DefinitionProvider ---

  it('should accept external DefinitionProvider', async () => {
    const defs = createMockDefinitions();
    const runtime = await createRuntime({ definitions: defs });
    expect(runtime.definitions).toBe(defs);
  });

  it('should auto-create FhirContext from DefinitionProvider', async () => {
    const defs = createMockDefinitions();
    const runtime = await createRuntime({ definitions: defs, preloadCore: false });
    expect(runtime.context).toBeDefined();
  });

  it('should use provided context with DefinitionProvider', async () => {
    const defs = createMockDefinitions();
    const context = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
    const runtime = await createRuntime({ definitions: defs, context, preloadCore: false });
    expect(runtime.context).toBe(context);
  });

  it('should delegate getSearchParameters to DefinitionProvider', async () => {
    const sp: SearchParameter = {
      resourceType: 'SearchParameter',
      url: 'http://example.org/sp',
      name: 'test',
      code: 'test',
      base: ['Patient'],
      type: 'string',
    };
    const defs = createMockDefinitions({ sps: [sp] });
    const runtime = await createRuntime({ definitions: defs, preloadCore: false });
    const sps = runtime.getSearchParameters('Patient');
    expect(sps.length).toBe(1);
    expect(sps[0].code).toBe('test');
  });

  it('should return empty array for unknown resource type', async () => {
    const defs = createMockDefinitions();
    const runtime = await createRuntime({ definitions: defs, preloadCore: false });
    expect(runtime.getSearchParameters('UnknownType')).toEqual([]);
  });

  // --- Pattern 2: With FhirContext ---

  it('should accept FhirContext without DefinitionProvider', async () => {
    const context = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
    const runtime = await createRuntime({ context, preloadCore: false });
    expect(runtime.context).toBe(context);
    expect(runtime.definitions).toBeDefined();
  });

  it('should create DefinitionBridge from FhirContext', async () => {
    const context = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
    const runtime = await createRuntime({ context, preloadCore: false });
    // DefinitionBridge should delegate SD lookups to context
    expect(runtime.definitions.getSearchParameters('Patient')).toEqual([]);
  });

  // --- Custom providers ---

  it('should accept custom terminology provider', async () => {
    const terminology = new NoOpTerminologyProvider();
    const runtime = await createRuntime({ terminology, preloadCore: false });
    expect(runtime.terminology).toBe(terminology);
  });

  it('should accept custom reference resolver', async () => {
    const resolver = new NoOpReferenceResolver();
    const runtime = await createRuntime({ referenceResolver: resolver, preloadCore: false });
    expect(runtime.referenceResolver).toBe(resolver);
  });

  // --- validate() function ---

  it('should have a validate function', async () => {
    const runtime = await createRuntime();
    expect(typeof runtime.validate).toBe('function');
  });

  it('should have an extractSearchValues function', async () => {
    const runtime = await createRuntime({ preloadCore: false });
    expect(typeof runtime.extractSearchValues).toBe('function');
  });

  // --- Validate with core definitions ---

  it('should validate a simple Patient resource', async () => {
    const runtime = await createRuntime();
    const patient = {
      resourceType: 'Patient',
      name: [{ family: 'Test', given: ['John'] }],
    } as unknown as Resource;
    const result = await runtime.validate(
      patient,
      'http://hl7.org/fhir/StructureDefinition/Patient',
    );
    expect(result).toBeDefined();
    expect(result.valid).toBe(true);
  });
});
