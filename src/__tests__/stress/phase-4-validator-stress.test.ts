/**
 * Phase 4 — Validator Stress Tests
 *
 * Tests StructureValidator and ValidationPipeline under max-cardinality
 * resources, invariant-heavy profiles, issue explosion, and batch validation.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';

import {
  loadBundleFromFile,
  StructureValidator,
  ValidationPipeline,
  StructuralValidationStep,
  InvariantValidationStep,
} from '../../index.js';
import type {
  CanonicalProfile,
  Resource,
} from '../../index.js';
import { PerfCollector } from './helpers/performance-reporter.js';

// =============================================================================
// Shared setup
// =============================================================================

const SPEC_DIR = resolve(__dirname, '..', '..', '..', 'spec', 'fhir', 'r4');
const PROFILES_RESOURCES = resolve(SPEC_DIR, 'profiles-resources.json');

let allProfiles: CanonicalProfile[];
let profilesByType: Map<string, CanonicalProfile>;

beforeAll(() => {
  const result = loadBundleFromFile(PROFILES_RESOURCES, {
    filterKind: 'resource',
    excludeAbstract: true,
  });
  allProfiles = result.profiles;
  profilesByType = new Map<string, CanonicalProfile>();
  for (const p of allProfiles) {
    profilesByType.set(p.type, p);
  }
}, 60_000);

// =============================================================================
// Scenario A: Max cardinality resources
// =============================================================================

describe('P4-A: Max cardinality resources', () => {
  it('validates Patient with 1000 names', () => {
    const resource = {
      resourceType: 'Patient',
      id: 'max-names',
      name: Array.from({ length: 1000 }, (_, i) => ({ family: `F-${i}` })),
    } as unknown as Resource;

    const profile = profilesByType.get('Patient')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });

    const start = performance.now();
    const result = validator.validate(resource, profile);
    const elapsed = performance.now() - start;

    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);

  it('validates Patient with 1000 identifiers', () => {
    const resource = {
      resourceType: 'Patient',
      id: 'max-ids',
      identifier: Array.from({ length: 1000 }, (_, i) => ({
        system: 'http://example.com',
        value: `ID-${i}`,
      })),
    } as unknown as Resource;

    const profile = profilesByType.get('Patient')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });
    const result = validator.validate(resource, profile);
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
  });

  it('validates Observation with 10,000 components', () => {
    const resource = {
      resourceType: 'Observation',
      id: 'max-components',
      status: 'final',
      code: { text: 'large' },
      component: Array.from({ length: 10_000 }, (_, i) => ({
        code: { coding: [{ system: 'http://loinc.org', code: `code-${i}` }] },
        valueQuantity: { value: i, unit: 'mg' },
      })),
    } as unknown as Resource;

    const profile = profilesByType.get('Observation')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });

    const start = performance.now();
    const result = validator.validate(resource, profile);
    const elapsed = performance.now() - start;

    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
    expect(elapsed).toBeLessThan(60_000);
  }, 120_000);
});

// =============================================================================
// Scenario B: Batch validation
// =============================================================================

describe('P4-B: Batch validation stress', () => {
  it('validates 500 Patient resources sequentially', () => {
    const profile = profilesByType.get('Patient')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });

    const perf = new PerfCollector('validate-500-patients');
    for (let i = 0; i < 500; i++) {
      const resource = {
        resourceType: 'Patient',
        id: `batch-${i}`,
        name: [{ family: `F-${i}` }],
      } as unknown as Resource;

      perf.time(() => {
        const result = validator.validate(resource, profile);
        expect(result).toBeDefined();
      });
    }

    const stats = perf.stats();
    console.log(perf.report());
    expect(stats.total).toBeLessThan(30_000);
  }, 60_000);

  it('validates 100 different resource types', () => {
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });
    const types = ['Patient', 'Observation', 'Condition', 'Encounter', 'Procedure'];
    let count = 0;

    for (let i = 0; i < 100; i++) {
      const type = types[i % types.length];
      const profile = profilesByType.get(type);
      if (!profile) continue;

      const resource = {
        resourceType: type,
        id: `multi-${i}`,
      } as unknown as Resource;

      const result = validator.validate(resource, profile);
      expect(result).toBeDefined();
      count++;
    }

    expect(count).toBe(100);
  });
});

// =============================================================================
// Scenario C: Pipeline batch validation
// =============================================================================

describe('P4-C: Pipeline batch validation', () => {
  it('pipeline validates 50 resources', async () => {
    const profile = profilesByType.get('Patient')!;
    const pipeline = new ValidationPipeline({ failFast: false });
    pipeline.addStep(new StructuralValidationStep());

    const entries = Array.from({ length: 50 }, (_, i) => ({
      resource: {
        resourceType: 'Patient',
        id: `pipe-${i}`,
        name: [{ family: `F-${i}` }],
      } as unknown as Resource,
      profile,
    }));

    const result = await pipeline.validateBatch(entries);
    expect(result).toBeDefined();
    expect(result.results).toHaveLength(50);
  }, 60_000);

  it('pipeline with structural + invariant steps on 20 resources', async () => {
    const profile = profilesByType.get('Patient')!;
    const pipeline = new ValidationPipeline({ failFast: false });
    pipeline.addStep(new StructuralValidationStep());
    pipeline.addStep(new InvariantValidationStep());

    const entries = Array.from({ length: 20 }, (_, i) => ({
      resource: {
        resourceType: 'Patient',
        id: `pipe-inv-${i}`,
        name: [{ family: `F-${i}` }],
        active: true,
      } as unknown as Resource,
      profile,
    }));

    const result = await pipeline.validateBatch(entries);
    expect(result).toBeDefined();
    expect(result.results).toHaveLength(20);
  }, 60_000);
});

// =============================================================================
// Scenario D: Issue explosion
// =============================================================================

describe('P4-D: Issue explosion', () => {
  it('collects many issues from massively invalid resource without crash', () => {
    const resource: Record<string, unknown> = {
      resourceType: 'Patient',
      id: 'issue-explosion',
    };

    // Add 200 fields with wrong types
    for (let i = 0; i < 200; i++) {
      resource[`invalidField${i}`] = { nested: { deep: i } };
    }

    const profile = profilesByType.get('Patient')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });
    const result = validator.validate(resource as unknown as Resource, profile);

    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
    // Should have many issues but not crash
    expect(Array.isArray(result.issues)).toBe(true);
  });
});

// =============================================================================
// Scenario E: Validation on empty / minimal resources
// =============================================================================

describe('P4-E: Minimal and empty resources', () => {
  it('validates resource with only resourceType', () => {
    const types = ['Patient', 'Observation', 'Condition', 'Encounter', 'Bundle'];
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });

    for (const type of types) {
      const profile = profilesByType.get(type);
      if (!profile) continue;

      const resource = { resourceType: type } as unknown as Resource;
      const result = validator.validate(resource, profile);
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
    }
  });

  it('validates resource with null fields', () => {
    const resource = {
      resourceType: 'Patient',
      id: null,
      name: null,
      active: null,
    } as unknown as Resource;

    const profile = profilesByType.get('Patient')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });
    const result = validator.validate(resource, profile);
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
  });
});

// =============================================================================
// Scenario F: Performance benchmarks
// =============================================================================

describe('P4-F: Validator performance benchmarks', () => {
  it('benchmarks single Patient validation', () => {
    const profile = profilesByType.get('Patient')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });
    const resource = {
      resourceType: 'Patient',
      id: 'bench',
      name: [{ family: 'Smith', given: ['John'] }],
      active: true,
    } as unknown as Resource;

    const perf = new PerfCollector('single-patient-validate');
    for (let i = 0; i < 200; i++) {
      perf.time(() => validator.validate(resource, profile));
    }

    const stats = perf.stats();
    console.log(perf.report());
    expect(stats.p50).toBeLessThan(20);
  });
});
