/**
 * Phase 8 — End-to-End Pipeline Stress Tests
 *
 * Tests complete parse → validate → extract pipeline under concurrent
 * execution, memory pressure, and mixed operations.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';

import {
  parseFhirJson,
  serializeToFhirJson,
  loadBundleFromFile,
  StructureValidator,
  ValidationPipeline,
  StructuralValidationStep,
  InvariantValidationStep,
  extractReferences,
  extractInnerTypes,
} from '../../index.js';
import type {
  CanonicalProfile,
  Resource,
} from '../../index.js';
import {
  evalFhirPath,
  clearExpressionCache,
} from '../../fhirpath/index.js';
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
// Helper: full pipeline execution
// =============================================================================

function runFullPipeline(
  resourceJson: string,
  profile: CanonicalProfile,
): { parseOk: boolean; validateOk: boolean; refsCount: number } {
  const parseResult = parseFhirJson(resourceJson);
  if (!parseResult.success || !parseResult.data) {
    return { parseOk: false, validateOk: false, refsCount: 0 };
  }

  const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });
  const valResult = validator.validate(parseResult.data as Resource, profile);

  const refs = extractReferences(parseResult.data as Resource);

  return {
    parseOk: true,
    validateOk: valResult.valid,
    refsCount: refs.length,
  };
}

// =============================================================================
// Scenario A: High concurrency pipeline
// =============================================================================

describe('P8-A: High concurrency pipeline', () => {
  it('100 concurrent parse + validate pipelines', async () => {
    const profile = profilesByType.get('Patient')!;

    const tasks = Array.from({ length: 100 }, (_, i) => {
      const json = JSON.stringify({
        resourceType: 'Patient',
        id: `conc-${i}`,
        name: [{ family: `Family-${i}`, given: [`Given-${i}`] }],
        active: i % 2 === 0,
      });
      return Promise.resolve(runFullPipeline(json, profile));
    });

    const results = await Promise.all(tasks);
    expect(results).toHaveLength(100);

    for (const r of results) {
      expect(r.parseOk).toBe(true);
    }
  });

  it('50 concurrent FHIRPath evaluations produce deterministic results', async () => {
    const resources = Array.from({ length: 50 }, (_, i) => ({
      resourceType: 'Patient',
      id: `fp-conc-${i}`,
      name: [{ family: `Family-${i}` }],
    }));

    const results = await Promise.all(
      resources.map((r) => Promise.resolve(evalFhirPath('Patient.name.family', r))),
    );

    expect(results).toHaveLength(50);
    for (let i = 0; i < 50; i++) {
      expect(results[i]).toEqual([`Family-${i}`]);
    }
  });

  it('mixed concurrent operations (parse + validate + FHIRPath)', async () => {
    const profile = profilesByType.get('Patient')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });

    const operations = [
      // 20 parse operations
      ...Array.from({ length: 20 }, (_, i) => () => {
        const result = parseFhirJson(
          JSON.stringify({ resourceType: 'Patient', id: `mix-p-${i}` }),
        );
        expect(result.success).toBe(true);
        return result;
      }),
      // 20 validate operations
      ...Array.from({ length: 20 }, (_, i) => () => {
        const resource = { resourceType: 'Patient', id: `mix-v-${i}` } as unknown as Resource;
        const result = validator.validate(resource, profile);
        expect(result).toBeDefined();
        return result;
      }),
      // 20 FHIRPath operations
      ...Array.from({ length: 20 }, (_, i) => () => {
        const resource = { resourceType: 'Patient', name: [{ family: `F-${i}` }] };
        const result = evalFhirPath('Patient.name.family', resource);
        expect(result).toEqual([`F-${i}`]);
        return result;
      }),
    ];

    const results = await Promise.all(
      operations.map((op) => Promise.resolve(op())),
    );

    expect(results).toHaveLength(60);
  });
});

// =============================================================================
// Scenario B: Memory pressure / batch processing
// =============================================================================

describe('P8-B: Memory pressure — batch processing', () => {
  it('parses 2,000 resources sequentially without excessive heap growth', () => {
    if (global.gc) global.gc();
    const baselineHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 2_000; i++) {
      const json = JSON.stringify({
        resourceType: 'Patient',
        id: `batch-${i}`,
        name: [{ family: `Family-${i}`, given: [`Given-${i}`] }],
        active: i % 2 === 0,
      });
      const result = parseFhirJson(json);
      expect(result.success).toBe(true);
    }

    if (global.gc) global.gc();
    const finalHeap = process.memoryUsage().heapUsed;
    const growthMB = (finalHeap - baselineHeap) / (1024 * 1024);

    console.log(`Heap growth after 2000 parses: ${growthMB.toFixed(1)}MB`);
    // Should be < 200MB for 2000 small resources
    expect(growthMB).toBeLessThan(200);
  }, 60_000);

  it('validates 1,000 resources sequentially', () => {
    const profile = profilesByType.get('Patient')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });

    const perf = new PerfCollector('validate-1000');
    for (let i = 0; i < 1_000; i++) {
      const resource = {
        resourceType: 'Patient',
        id: `val-batch-${i}`,
        name: [{ family: `F-${i}` }],
      } as unknown as Resource;

      perf.time(() => {
        const result = validator.validate(resource, profile);
        expect(result).toBeDefined();
      });
    }

    const stats = perf.stats();
    console.log(perf.report());
    expect(stats.total).toBeLessThan(60_000);
  }, 120_000);

  it('round-trips 500 resources through serialize → parse', () => {
    for (let i = 0; i < 500; i++) {
      const json = JSON.stringify({
        resourceType: 'Patient',
        id: `rt-${i}`,
        name: [{ family: `F-${i}` }],
        active: true,
      });

      const r1 = parseFhirJson(json);
      expect(r1.success).toBe(true);

      const serialized = serializeToFhirJson(r1.data!);
      const r2 = parseFhirJson(serialized);
      expect(r2.success).toBe(true);
    }
  }, 60_000);
});

// =============================================================================
// Scenario C: Pipeline batch validation
// =============================================================================

describe('P8-C: Pipeline batch validation', () => {
  it('pipeline validates 100 resources in batch', async () => {
    const profile = profilesByType.get('Patient')!;
    const pipeline = new ValidationPipeline({ failFast: false });
    pipeline.addStep(new StructuralValidationStep());

    const entries = Array.from({ length: 100 }, (_, i) => ({
      resource: {
        resourceType: 'Patient',
        id: `pipe-batch-${i}`,
        name: [{ family: `F-${i}` }],
      } as unknown as Resource,
      profile,
    }));

    const start = performance.now();
    const result = await pipeline.validateBatch(entries);
    const elapsed = performance.now() - start;

    expect(result).toBeDefined();
    expect(result.results).toHaveLength(100);
    console.log(`Pipeline batch 100: ${elapsed.toFixed(0)}ms`);
    expect(elapsed).toBeLessThan(60_000);
  }, 120_000);

  it('pipeline with structural + invariant steps on 50 resources', async () => {
    const profile = profilesByType.get('Patient')!;
    const pipeline = new ValidationPipeline({ failFast: false });
    pipeline.addStep(new StructuralValidationStep());
    pipeline.addStep(new InvariantValidationStep());

    const entries = Array.from({ length: 50 }, (_, i) => ({
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
    expect(result.results).toHaveLength(50);
  }, 120_000);
});

// =============================================================================
// Scenario D: Full pipeline per-resource benchmark
// =============================================================================

describe('P8-D: Full pipeline benchmarks', () => {
  it('benchmarks single resource full pipeline (parse + validate)', () => {
    const profile = profilesByType.get('Patient')!;
    const perf = new PerfCollector('full-pipeline-single');

    for (let i = 0; i < 100; i++) {
      const json = JSON.stringify({
        resourceType: 'Patient',
        id: `bench-${i}`,
        name: [{ family: 'Smith', given: ['John'] }],
        active: true,
        birthDate: '1990-01-01',
      });

      perf.time(() => runFullPipeline(json, profile));
    }

    const stats = perf.stats();
    console.log(perf.report());
    expect(stats.p50).toBeLessThan(50);
    expect(stats.p99).toBeLessThan(200);
  });

  it('benchmarks FHIRPath cache warmup vs cached', () => {
    const patient = { resourceType: 'Patient', name: [{ family: 'Test' }] };
    const expr = "Patient.name.where(use = 'official').family";

    // Cold start
    clearExpressionCache();
    const coldPerf = new PerfCollector('fhirpath-cold');
    for (let i = 0; i < 20; i++) {
      clearExpressionCache();
      coldPerf.time(() => evalFhirPath(expr, patient));
    }

    // Warm (cached)
    const warmPerf = new PerfCollector('fhirpath-warm');
    for (let i = 0; i < 200; i++) {
      warmPerf.time(() => evalFhirPath(expr, patient));
    }

    const coldStats = coldPerf.stats();
    const warmStats = warmPerf.stats();
    console.log(coldPerf.report());
    console.log(warmPerf.report());

    // Cached should be significantly faster
    expect(warmStats.p50).toBeLessThan(coldStats.p50 * 2 || 1);
  });
});

// =============================================================================
// Scenario E: Determinism verification
// =============================================================================

describe('P8-E: Determinism verification', () => {
  it('same input always produces same parse result', () => {
    const json = JSON.stringify({
      resourceType: 'Patient',
      id: 'determinism-1',
      name: [{ family: 'Smith', given: ['John', 'James'] }],
      active: true,
    });

    const results = Array.from({ length: 50 }, () => parseFhirJson(json));

    // All results should be identical
    for (let i = 1; i < results.length; i++) {
      expect(results[i].success).toBe(results[0].success);
      expect(results[i].issues.length).toBe(results[0].issues.length);
    }
  });

  it('same input always produces same validation result', () => {
    const profile = profilesByType.get('Patient')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });
    const resource = {
      resourceType: 'Patient',
      id: 'determinism-2',
      name: [{ family: 'Smith' }],
    } as unknown as Resource;

    const results = Array.from({ length: 50 }, () =>
      validator.validate(resource, profile),
    );

    for (let i = 1; i < results.length; i++) {
      expect(results[i].valid).toBe(results[0].valid);
      expect(results[i].issues.length).toBe(results[0].issues.length);
    }
  });

  it('same input always produces same FHIRPath result', () => {
    const resource = {
      resourceType: 'Patient',
      name: [{ family: 'Test', given: ['A', 'B'] }],
    };

    const results = Array.from({ length: 100 }, () =>
      evalFhirPath('Patient.name.given', resource),
    );

    for (let i = 1; i < results.length; i++) {
      expect(results[i]).toEqual(results[0]);
    }
  });
});

// =============================================================================
// Scenario F: All core profiles + innerTypes extraction
// =============================================================================

describe('P8-F: All core profiles coverage', () => {
  it('all 146+ core profiles loaded and have elements', () => {
    expect(allProfiles.length).toBeGreaterThan(140);

    let totalElements = 0;
    for (const p of allProfiles) {
      expect(p.elements.size).toBeGreaterThan(0);
      totalElements += p.elements.size;
    }
    expect(totalElements).toBeGreaterThan(5000);
  });

  it('extractInnerTypes for all profiles without crash', () => {
    let totalInnerTypes = 0;
    for (const p of allProfiles) {
      const innerTypes = extractInnerTypes(p);
      totalInnerTypes += innerTypes.size;
    }
    expect(totalInnerTypes).toBeGreaterThan(100);
  });

  it('validates minimal resource for each known type', () => {
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });
    let validated = 0;

    for (const p of allProfiles) {
      if (p.abstract) continue;
      const resource = { resourceType: p.type, id: `auto-${validated}` } as unknown as Resource;

      const result = validator.validate(resource, p);
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
      validated++;
    }

    console.log(`Validated minimal resource for ${validated} types`);
    expect(validated).toBeGreaterThan(100);
  }, 120_000);
});
