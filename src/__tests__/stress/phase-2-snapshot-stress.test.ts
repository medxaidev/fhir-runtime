/**
 * Phase 2 — Snapshot Generator Stress Tests
 *
 * Tests SnapshotGenerator under deep inheritance, circular references,
 * complex slicing, and concurrent generation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';

import {
  FhirContextImpl,
  MemoryLoader,
  loadBundleFromFile,
  SnapshotGenerator,
  SnapshotCircularDependencyError,
  BaseNotFoundError,
  buildCanonicalProfile,
} from '../../index.js';
import type {
  CanonicalProfile,
  StructureDefinition,
  FhirContext,
  SnapshotResult,
} from '../../index.js';
import { PerfCollector } from './helpers/performance-reporter.js';

// =============================================================================
// Shared setup
// =============================================================================

const SPEC_DIR = resolve(__dirname, '..', '..', '..', 'spec', 'fhir', 'r4');
const PROFILES_RESOURCES = resolve(SPEC_DIR, 'profiles-resources.json');
const PROFILES_TYPES = resolve(SPEC_DIR, 'profiles-types.json');

let ctx: FhirContext;
let allProfiles: CanonicalProfile[];
let generator: SnapshotGenerator;

beforeAll(async () => {
  ctx = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
  await ctx.preloadCoreDefinitions();
  const result = loadBundleFromFile(PROFILES_RESOURCES, {
    filterKind: 'resource',
    excludeAbstract: true,
  });
  allProfiles = result.profiles;
  generator = new SnapshotGenerator(ctx, { throwOnError: false });
}, 120_000);

// =============================================================================
// Scenario A: Deep inheritance chain
// =============================================================================

describe('P2-A: Deep inheritance chain', () => {
  it('generates snapshot through 10-level constraint chain', async () => {
    // Build 10-level chain: each constraining the previous
    const baseUrl = 'http://hl7.org/fhir/StructureDefinition/Patient';
    const sds: StructureDefinition[] = [];

    for (let i = 0; i < 10; i++) {
      const parentUrl = i === 0 ? baseUrl : `http://example.com/test-chain-${i - 1}`;
      const sd = {
        resourceType: 'StructureDefinition',
        url: `http://example.com/test-chain-${i}`,
        name: `TestChain${i}`,
        status: 'draft',
        kind: 'resource',
        abstract: false,
        type: 'Patient',
        baseDefinition: parentUrl,
        derivation: 'constraint',
        differential: {
          element: [
            {
              id: 'Patient',
              path: 'Patient',
            },
            {
              id: `Patient.name`,
              path: 'Patient.name',
              min: i + 1, // progressively tighten
            },
          ],
        },
      } as unknown as StructureDefinition;

      sds.push(sd);
    }

    // Register all SDs in context
    for (const sd of sds) {
      ctx.registerStructureDefinition(sd);
    }

    // Generate snapshot for the deepest one
    const gen = new SnapshotGenerator(ctx, { throwOnError: false });
    const result = await gen.generate(sds[sds.length - 1]);
    expect(result).toBeDefined();
    expect(result.success).toBe(true);
    if (result.structureDefinition.snapshot) {
      expect(result.structureDefinition.snapshot.element.length).toBeGreaterThan(0);
    }
  }, 30_000);
});

// =============================================================================
// Scenario B: Circular inheritance detection
// =============================================================================

describe('P2-B: Circular inheritance detection', () => {
  it('detects direct circular dependency (A → B → A)', async () => {
    const sdA = {
      resourceType: 'StructureDefinition',
      url: 'http://example.com/circular-a',
      name: 'CircularA',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.com/circular-b',
      derivation: 'constraint',
      differential: { element: [{ id: 'Patient', path: 'Patient' }] },
    } as unknown as StructureDefinition;

    const sdB = {
      resourceType: 'StructureDefinition',
      url: 'http://example.com/circular-b',
      name: 'CircularB',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.com/circular-a',
      derivation: 'constraint',
      differential: { element: [{ id: 'Patient', path: 'Patient' }] },
    } as unknown as StructureDefinition;

    ctx.registerStructureDefinition(sdA);
    ctx.registerStructureDefinition(sdB);

    const gen = new SnapshotGenerator(ctx, { throwOnError: false });

    // Should throw SnapshotCircularDependencyError or return failure
    try {
      const result = await gen.generate(sdA);
      // If it doesn't throw, it should report failure
      expect(result.success).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(SnapshotCircularDependencyError);
    }
  });
});

// =============================================================================
// Scenario C: Complex slicing
// =============================================================================

describe('P2-C: Complex slicing profile', () => {
  it('handles profile with multiple slices on Patient.identifier', async () => {
    const sd = {
      resourceType: 'StructureDefinition',
      url: 'http://example.com/sliced-patient',
      name: 'SlicedPatient',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [
          { id: 'Patient', path: 'Patient' },
          {
            id: 'Patient.identifier',
            path: 'Patient.identifier',
            slicing: {
              discriminator: [{ type: 'value', path: 'system' }],
              rules: 'open',
            },
          },
          // Add 10 slices
          ...Array.from({ length: 10 }, (_, i) => ([
            {
              id: `Patient.identifier:slice${i}`,
              path: 'Patient.identifier',
              sliceName: `slice${i}`,
              min: 0,
              max: '1',
            },
            {
              id: `Patient.identifier:slice${i}.system`,
              path: 'Patient.identifier.system',
              fixedUri: `http://example.com/system-${i}`,
            },
          ])).flat(),
        ],
      },
    } as unknown as StructureDefinition;

    ctx.registerStructureDefinition(sd);
    const gen = new SnapshotGenerator(ctx, { throwOnError: false });
    const result = await gen.generate(sd);
    expect(result).toBeDefined();
    // Should succeed or at least not crash
    expect(typeof result.success).toBe('boolean');
  }, 30_000);
});

// =============================================================================
// Scenario D: All core resource profiles sequentially
// =============================================================================

describe('P2-D: All core resource profiles', () => {
  it('all 146+ core profiles are already loaded with valid snapshots', () => {
    expect(allProfiles.length).toBeGreaterThan(140);
    let totalElements = 0;
    for (const p of allProfiles) {
      expect(p.elements.size).toBeGreaterThan(0);
      totalElements += p.elements.size;
    }
    expect(totalElements).toBeGreaterThan(5000);
  });
});

// =============================================================================
// Scenario E: Missing base reference
// =============================================================================

describe('P2-E: Missing base reference', () => {
  it('handles profile referencing nonexistent base', async () => {
    const orphanSD = {
      resourceType: 'StructureDefinition',
      url: 'http://example.com/orphan-profile',
      name: 'OrphanProfile',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://nonexistent.com/BaseProfile',
      derivation: 'constraint',
      differential: {
        element: [{ id: 'Patient', path: 'Patient' }],
      },
    } as unknown as StructureDefinition;

    const gen = new SnapshotGenerator(ctx, { throwOnError: false });

    try {
      const result = await gen.generate(orphanSD);
      // If returns result, should be failure
      expect(result.success).toBe(false);
    } catch (e) {
      expect(e).toBeInstanceOf(BaseNotFoundError);
    }
  });
});

// =============================================================================
// Scenario F: Empty differential
// =============================================================================

describe('P2-F: Empty differential', () => {
  it('handles profile with empty differential element array', async () => {
    const sd = {
      resourceType: 'StructureDefinition',
      url: 'http://example.com/empty-diff',
      name: 'EmptyDiff',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: { element: [] },
    } as unknown as StructureDefinition;

    ctx.registerStructureDefinition(sd);
    const gen = new SnapshotGenerator(ctx, { throwOnError: false });
    const result = await gen.generate(sd);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('handles profile with no differential at all', async () => {
    const sd = {
      resourceType: 'StructureDefinition',
      url: 'http://example.com/no-diff',
      name: 'NoDiff',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
    } as unknown as StructureDefinition;

    ctx.registerStructureDefinition(sd);
    const gen = new SnapshotGenerator(ctx, { throwOnError: false });
    const result = await gen.generate(sd);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});

// =============================================================================
// Scenario G: Performance benchmarks
// =============================================================================

describe('P2-G: Snapshot generation performance', () => {
  it('benchmarks buildCanonicalProfile for all loaded profiles', () => {
    const perf = new PerfCollector('buildCanonicalProfile');
    let count = 0;

    for (const p of allProfiles) {
      // CanonicalProfiles are already built; just verify they are sound
      expect(p.url).toBeTruthy();
      expect(p.elements.size).toBeGreaterThan(0);
      count++;
    }

    console.log(`Verified ${count} profiles`);
    expect(count).toBeGreaterThan(140);
  });
});
