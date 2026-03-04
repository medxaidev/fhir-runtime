/**
 * Unit & integration tests for FhirContextImpl (Task 3.6)
 *
 * Covers:
 * - Construction and initialization
 * - loadStructureDefinition (cache hit, cache miss, not found)
 * - getStructureDefinition / hasStructureDefinition (synchronous)
 * - resolveInheritanceChain (end-to-end)
 * - registerStructureDefinition (manual registration)
 * - preloadCoreDefinitions (bulk load)
 * - Statistics tracking
 * - dispose() lifecycle
 * - Error handling
 * - Integration with real FHIR R4 core definitions
 *
 * @module fhir-context
 */

import { describe, it, expect, beforeEach } from 'vitest';

import type { StructureDefinition } from '../../model/index.js';
import type { StructureDefinitionLoader } from '../types.js';
import { FhirContextImpl } from '../fhir-context.js';
import { MemoryLoader } from '../loaders/memory-loader.js';
import {
  ResourceNotFoundError,
  InvalidStructureDefinitionError,
  LoaderError,
} from '../errors.js';

// =============================================================================
// Helpers
// =============================================================================

const RESOURCE_URL = 'http://hl7.org/fhir/StructureDefinition/Resource';
const DOMAIN_RESOURCE_URL = 'http://hl7.org/fhir/StructureDefinition/DomainResource';
const PATIENT_URL = 'http://hl7.org/fhir/StructureDefinition/Patient';
const OBSERVATION_URL = 'http://hl7.org/fhir/StructureDefinition/Observation';
const CUSTOM_URL = 'http://example.org/fhir/StructureDefinition/ChinesePatient';

function makeSD(
  url: string,
  name: string,
  baseDefinition?: string,
  version?: string,
): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url: url as any,
    name: name as any,
    status: 'active' as any,
    kind: 'resource' as any,
    abstract: false as any,
    type: name as any,
    ...(baseDefinition ? { baseDefinition: baseDefinition as any } : {}),
    ...(version ? { version: version as any } : {}),
  } as StructureDefinition;
}

function createStandardMap(): Map<string, StructureDefinition> {
  const map = new Map<string, StructureDefinition>();
  map.set(RESOURCE_URL, makeSD(RESOURCE_URL, 'Resource'));
  map.set(DOMAIN_RESOURCE_URL, makeSD(DOMAIN_RESOURCE_URL, 'DomainResource', RESOURCE_URL));
  map.set(PATIENT_URL, makeSD(PATIENT_URL, 'Patient', DOMAIN_RESOURCE_URL));
  map.set(OBSERVATION_URL, makeSD(OBSERVATION_URL, 'Observation', DOMAIN_RESOURCE_URL));
  return map;
}

function createContext(map?: Map<string, StructureDefinition>): FhirContextImpl {
  const defs = map ?? createStandardMap();
  return new FhirContextImpl({
    loaders: [new MemoryLoader(defs)],
  });
}

// =============================================================================
// Section 1: Construction
// =============================================================================

describe('FhirContextImpl', () => {
  describe('construction', () => {
    it('creates with a single loader', () => {
      const ctx = createContext();
      expect(ctx).toBeDefined();
    });

    it('creates with multiple loaders (composite)', () => {
      const ctx = new FhirContextImpl({
        loaders: [
          new MemoryLoader(new Map()),
          new MemoryLoader(createStandardMap()),
        ],
      });
      expect(ctx).toBeDefined();
    });

    it('starts with empty registry', () => {
      const ctx = createContext();
      expect(ctx.hasStructureDefinition(PATIENT_URL)).toBe(false);
    });

    it('starts with zero statistics', () => {
      const ctx = createContext();
      const stats = ctx.getStatistics();
      expect(stats.totalLoaded).toBe(0);
      expect(stats.cacheHits).toBe(0);
      expect(stats.cacheMisses).toBe(0);
    });
  });

  // ===========================================================================
  // Section 2: loadStructureDefinition
  // ===========================================================================

  describe('loadStructureDefinition', () => {
    let ctx: FhirContextImpl;

    beforeEach(() => {
      ctx = createContext();
    });

    it('loads from loader on first call (cache miss)', async () => {
      const sd = await ctx.loadStructureDefinition(PATIENT_URL);
      expect(sd).toBeDefined();
      expect(sd.name).toBe('Patient');

      const stats = ctx.getStatistics();
      expect(stats.cacheMisses).toBe(1);
      expect(stats.loaderCalls).toBe(1);
    });

    it('returns from registry on second call (cache hit)', async () => {
      await ctx.loadStructureDefinition(PATIENT_URL);
      const sd = await ctx.loadStructureDefinition(PATIENT_URL);
      expect(sd.name).toBe('Patient');

      const stats = ctx.getStatistics();
      expect(stats.cacheHits).toBe(1);
      expect(stats.cacheMisses).toBe(1);
    });

    it('throws ResourceNotFoundError for unknown URL', async () => {
      await expect(
        ctx.loadStructureDefinition('http://example.org/Unknown'),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('ResourceNotFoundError includes tried sources', async () => {
      try {
        await ctx.loadStructureDefinition('http://example.org/Unknown');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ResourceNotFoundError);
        expect((err as ResourceNotFoundError).triedSources.length).toBeGreaterThan(0);
      }
    });

    it('registers loaded definition in registry', async () => {
      expect(ctx.hasStructureDefinition(PATIENT_URL)).toBe(false);
      await ctx.loadStructureDefinition(PATIENT_URL);
      expect(ctx.hasStructureDefinition(PATIENT_URL)).toBe(true);
    });

    it('updates totalLoaded statistic', async () => {
      await ctx.loadStructureDefinition(PATIENT_URL);
      await ctx.loadStructureDefinition(OBSERVATION_URL);
      expect(ctx.getStatistics().totalLoaded).toBe(2);
    });
  });

  // ===========================================================================
  // Section 3: getStructureDefinition / hasStructureDefinition
  // ===========================================================================

  describe('synchronous queries', () => {
    let ctx: FhirContextImpl;

    beforeEach(async () => {
      ctx = createContext();
      await ctx.loadStructureDefinition(PATIENT_URL);
    });

    it('getStructureDefinition returns loaded definition', () => {
      const sd = ctx.getStructureDefinition(PATIENT_URL);
      expect(sd).toBeDefined();
      expect(sd!.name).toBe('Patient');
    });

    it('getStructureDefinition returns undefined for unloaded URL', () => {
      expect(ctx.getStructureDefinition(OBSERVATION_URL)).toBeUndefined();
    });

    it('hasStructureDefinition returns true for loaded URL', () => {
      expect(ctx.hasStructureDefinition(PATIENT_URL)).toBe(true);
    });

    it('hasStructureDefinition returns false for unloaded URL', () => {
      expect(ctx.hasStructureDefinition(OBSERVATION_URL)).toBe(false);
    });
  });

  // ===========================================================================
  // Section 4: resolveInheritanceChain
  // ===========================================================================

  describe('resolveInheritanceChain', () => {
    let ctx: FhirContextImpl;

    beforeEach(() => {
      ctx = createContext();
    });

    it('resolves Patient → DomainResource → Resource', async () => {
      const chain = await ctx.resolveInheritanceChain(PATIENT_URL);
      expect(chain).toEqual([PATIENT_URL, DOMAIN_RESOURCE_URL, RESOURCE_URL]);
    });

    it('resolves root Resource (single element)', async () => {
      const chain = await ctx.resolveInheritanceChain(RESOURCE_URL);
      expect(chain).toEqual([RESOURCE_URL]);
    });

    it('loads definitions on demand during resolution', async () => {
      // Nothing loaded yet
      expect(ctx.hasStructureDefinition(PATIENT_URL)).toBe(false);

      await ctx.resolveInheritanceChain(PATIENT_URL);

      // All definitions in the chain should now be loaded
      expect(ctx.hasStructureDefinition(PATIENT_URL)).toBe(true);
      expect(ctx.hasStructureDefinition(DOMAIN_RESOURCE_URL)).toBe(true);
      expect(ctx.hasStructureDefinition(RESOURCE_URL)).toBe(true);
    });

    it('updates chainsResolved statistic', async () => {
      await ctx.resolveInheritanceChain(PATIENT_URL);
      expect(ctx.getStatistics().chainsResolved).toBe(1);
    });

    it('throws ResourceNotFoundError for unknown base', async () => {
      const map = new Map<string, StructureDefinition>();
      map.set(CUSTOM_URL, makeSD(CUSTOM_URL, 'ChinesePatient', PATIENT_URL));
      // Patient is NOT in the map → broken chain
      const brokenCtx = new FhirContextImpl({ loaders: [new MemoryLoader(map)] });

      await expect(brokenCtx.resolveInheritanceChain(CUSTOM_URL)).rejects.toThrow(
        ResourceNotFoundError,
      );
    });
  });

  // ===========================================================================
  // Section 5: registerStructureDefinition
  // ===========================================================================

  describe('registerStructureDefinition', () => {
    let ctx: FhirContextImpl;

    beforeEach(() => {
      ctx = createContext();
    });

    it('registers a custom definition', () => {
      const sd = makeSD(CUSTOM_URL, 'ChinesePatient', PATIENT_URL);
      ctx.registerStructureDefinition(sd);

      expect(ctx.hasStructureDefinition(CUSTOM_URL)).toBe(true);
      expect(ctx.getStructureDefinition(CUSTOM_URL)).toBe(sd);
    });

    it('updates registrations statistic', () => {
      ctx.registerStructureDefinition(makeSD(CUSTOM_URL, 'ChinesePatient', PATIENT_URL));
      expect(ctx.getStatistics().registrations).toBe(1);
    });

    it('throws InvalidStructureDefinitionError for missing url', () => {
      const sd = { resourceType: 'StructureDefinition' } as StructureDefinition;
      expect(() => ctx.registerStructureDefinition(sd)).toThrow(
        InvalidStructureDefinitionError,
      );
    });

    it('replaces existing definition and invalidates chain cache', async () => {
      // Load Patient and resolve its chain
      await ctx.resolveInheritanceChain(PATIENT_URL);

      // Re-register Patient with different base
      const newPatient = makeSD(PATIENT_URL, 'PatientV2', RESOURCE_URL);
      ctx.registerStructureDefinition(newPatient);

      // Chain should be re-resolved (not from stale cache)
      const chain = await ctx.resolveInheritanceChain(PATIENT_URL);
      expect(chain).toEqual([PATIENT_URL, RESOURCE_URL]);
    });
  });

  // ===========================================================================
  // Section 6: preloadCoreDefinitions
  // ===========================================================================

  describe('preloadCoreDefinitions', () => {
    it('loads all 73 core definitions', async () => {
      const ctx = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
      await ctx.preloadCoreDefinitions();

      expect(ctx.getStatistics().totalLoaded).toBe(73);
      expect(ctx.hasStructureDefinition('http://hl7.org/fhir/StructureDefinition/Patient')).toBe(true);
      expect(ctx.hasStructureDefinition('http://hl7.org/fhir/StructureDefinition/string')).toBe(true);
      expect(ctx.hasStructureDefinition('http://hl7.org/fhir/StructureDefinition/Element')).toBe(true);
    });

    it('preloaded definitions are available synchronously', async () => {
      const ctx = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
      await ctx.preloadCoreDefinitions();

      const patient = ctx.getStructureDefinition('http://hl7.org/fhir/StructureDefinition/Patient');
      expect(patient).toBeDefined();
      expect(patient!.name).toBe('Patient');
    });

    it('preloaded definitions support inheritance chain resolution', async () => {
      const ctx = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
      await ctx.preloadCoreDefinitions();

      const chain = await ctx.resolveInheritanceChain(
        'http://hl7.org/fhir/StructureDefinition/Patient',
      );
      expect(chain).toEqual([
        'http://hl7.org/fhir/StructureDefinition/Patient',
        'http://hl7.org/fhir/StructureDefinition/DomainResource',
        'http://hl7.org/fhir/StructureDefinition/Resource',
      ]);
    });
  });

  // ===========================================================================
  // Section 7: Statistics
  // ===========================================================================

  describe('statistics', () => {
    it('tracks all operations correctly', async () => {
      const ctx = createContext();

      // Load (miss)
      await ctx.loadStructureDefinition(PATIENT_URL);
      // Load (hit)
      await ctx.loadStructureDefinition(PATIENT_URL);
      // Load another (miss)
      await ctx.loadStructureDefinition(OBSERVATION_URL);
      // Register
      ctx.registerStructureDefinition(makeSD(CUSTOM_URL, 'Custom', PATIENT_URL));
      // Resolve chain
      await ctx.resolveInheritanceChain(PATIENT_URL);

      const stats = ctx.getStatistics();
      // Patient (miss) + Patient (hit) + Observation (miss) + Custom (register)
      // + resolveInheritanceChain loads DomainResource & Resource on demand
      // Registry: Patient, Observation, Custom, DomainResource, Resource = 5
      expect(stats.totalLoaded).toBe(5);
      // loadSD(Patient) hit + resolveChain→loadSD(Patient) hit = 2
      expect(stats.cacheHits).toBe(2);
      // Patient(miss) + Observation(miss) + DomainResource(miss) + Resource(miss) = 4
      expect(stats.cacheMisses).toBe(4);
      expect(stats.loaderCalls).toBe(4);
      expect(stats.registrations).toBe(1);
      expect(stats.chainsResolved).toBe(1);
    });

    it('getStatistics returns a copy (not mutable reference)', () => {
      const ctx = createContext();
      const stats1 = ctx.getStatistics();
      stats1.cacheHits = 999;
      const stats2 = ctx.getStatistics();
      expect(stats2.cacheHits).toBe(0);
    });
  });

  // ===========================================================================
  // Section 8: dispose
  // ===========================================================================

  describe('dispose', () => {
    it('clears registry and resets statistics', async () => {
      const ctx = createContext();
      await ctx.loadStructureDefinition(PATIENT_URL);
      expect(ctx.hasStructureDefinition(PATIENT_URL)).toBe(true);

      ctx.dispose();

      const stats = ctx.getStatistics();
      expect(stats.totalLoaded).toBe(0);
      expect(stats.cacheHits).toBe(0);
    });

    it('throws after dispose for loadStructureDefinition', async () => {
      const ctx = createContext();
      ctx.dispose();

      await expect(ctx.loadStructureDefinition(PATIENT_URL)).rejects.toThrow(
        /disposed/,
      );
    });

    it('throws after dispose for getStructureDefinition', () => {
      const ctx = createContext();
      ctx.dispose();

      expect(() => ctx.getStructureDefinition(PATIENT_URL)).toThrow(/disposed/);
    });

    it('throws after dispose for hasStructureDefinition', () => {
      const ctx = createContext();
      ctx.dispose();

      expect(() => ctx.hasStructureDefinition(PATIENT_URL)).toThrow(/disposed/);
    });

    it('throws after dispose for registerStructureDefinition', () => {
      const ctx = createContext();
      ctx.dispose();

      expect(() =>
        ctx.registerStructureDefinition(makeSD(PATIENT_URL, 'Patient')),
      ).toThrow(/disposed/);
    });

    it('throws after dispose for resolveInheritanceChain', async () => {
      const ctx = createContext();
      ctx.dispose();

      await expect(ctx.resolveInheritanceChain(PATIENT_URL)).rejects.toThrow(
        /disposed/,
      );
    });
  });

  // ===========================================================================
  // Section 9: Multiple Loaders (Composite)
  // ===========================================================================

  describe('multiple loaders', () => {
    it('first loader takes priority', async () => {
      const map1 = new Map<string, StructureDefinition>();
      map1.set(PATIENT_URL, makeSD(PATIENT_URL, 'PatientFromLoader1'));

      const map2 = new Map<string, StructureDefinition>();
      map2.set(PATIENT_URL, makeSD(PATIENT_URL, 'PatientFromLoader2'));

      const ctx = new FhirContextImpl({
        loaders: [new MemoryLoader(map1), new MemoryLoader(map2)],
      });

      const sd = await ctx.loadStructureDefinition(PATIENT_URL);
      expect(sd.name).toBe('PatientFromLoader1');
    });

    it('falls back to second loader', async () => {
      const map1 = new Map<string, StructureDefinition>();
      const map2 = new Map<string, StructureDefinition>();
      map2.set(OBSERVATION_URL, makeSD(OBSERVATION_URL, 'Observation'));

      const ctx = new FhirContextImpl({
        loaders: [new MemoryLoader(map1), new MemoryLoader(map2)],
      });

      const sd = await ctx.loadStructureDefinition(OBSERVATION_URL);
      expect(sd.name).toBe('Observation');
    });
  });

  // ===========================================================================
  // Section 10: Integration — preload + custom profile
  // ===========================================================================

  describe('integration: preload + custom profile', () => {
    it('resolves custom profile chain after preloading core', async () => {
      const customMap = new Map<string, StructureDefinition>();
      customMap.set(CUSTOM_URL, makeSD(CUSTOM_URL, 'ChinesePatient', PATIENT_URL));

      const ctx = new FhirContextImpl({
        loaders: [new MemoryLoader(customMap)],
      });
      await ctx.preloadCoreDefinitions();

      // Register custom profile
      ctx.registerStructureDefinition(customMap.get(CUSTOM_URL)!);

      const chain = await ctx.resolveInheritanceChain(CUSTOM_URL);
      expect(chain).toEqual([
        CUSTOM_URL,
        'http://hl7.org/fhir/StructureDefinition/Patient',
        'http://hl7.org/fhir/StructureDefinition/DomainResource',
        'http://hl7.org/fhir/StructureDefinition/Resource',
      ]);
    });

    it('custom profile loaded via loader after preload', async () => {
      const customMap = new Map<string, StructureDefinition>();
      customMap.set(CUSTOM_URL, makeSD(CUSTOM_URL, 'ChinesePatient', PATIENT_URL));

      const ctx = new FhirContextImpl({
        loaders: [new MemoryLoader(customMap)],
      });
      await ctx.preloadCoreDefinitions();

      // Load custom profile via loader (not register)
      const sd = await ctx.loadStructureDefinition(CUSTOM_URL);
      expect(sd.name).toBe('ChinesePatient');

      // Resolve chain — Patient/DomainResource/Resource already preloaded
      const chain = await ctx.resolveInheritanceChain(CUSTOM_URL);
      expect(chain).toHaveLength(4);
    });
  });
});
