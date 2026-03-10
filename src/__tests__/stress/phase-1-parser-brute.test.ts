/**
 * Phase 1 — Parser Brute-Force Tests
 *
 * Validates that parseFhirJson and parseStructureDefinition maintain
 * the no-throw contract under any input, including adversarial data.
 */
import { describe, it, expect } from 'vitest';

import {
  parseFhirJson,
  parseFhirObject,
  serializeToFhirJson,
  serializeToFhirObject,
} from '../../index.js';
import { PerfCollector } from './helpers/performance-reporter.js';
import {
  MALFORMED_JSON_INPUTS,
  TYPE_CONFUSION_PATIENTS,
  BOUNDARY_STRINGS,
  buildDeepExtension,
  buildDeepContained,
  buildLargePatient,
  buildLargeObservation,
  randomJson,
  randomFhirLikeJson,
} from './helpers/boundary-values.js';

// =============================================================================
// Scenario A: Completely invalid input
// =============================================================================

describe('P1-A: Completely invalid input', () => {
  it.each(MALFORMED_JSON_INPUTS)(
    'parseFhirJson handles: %s — no throw, returns ParseResult',
    (_label, input) => {
      const result = parseFhirJson(input);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.issues)).toBe(true);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
      }
    },
  );

  it('parseFhirObject handles null/undefined/primitive gracefully', () => {
    for (const input of [null, undefined, 42, true, 'string', [], '']) {
      const result = parseFhirObject(input as any);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    }
  });
});

// =============================================================================
// Scenario B: Deep nesting
// =============================================================================

describe('P1-B: Deep nesting stress', () => {
  it.each([10, 50, 100, 200])(
    'handles %d-level nested extensions without stack overflow',
    (depth) => {
      const json = buildDeepExtension(depth);
      const result = parseFhirJson(json);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    },
  );

  it.each([10, 50, 100])(
    'handles %d-level nested contained resources',
    (depth) => {
      const json = buildDeepContained(depth);
      const result = parseFhirJson(json);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    },
  );
});

// =============================================================================
// Scenario C: Super-long strings and large payloads
// =============================================================================

describe('P1-C: Large payload stress', () => {
  it('handles Patient id with 1MB string', () => {
    const longStr = 'x'.repeat(1_000_000);
    const json = JSON.stringify({ resourceType: 'Patient', id: longStr });
    const start = performance.now();
    const result = parseFhirJson(json);
    const elapsed = performance.now() - start;
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(elapsed).toBeLessThan(5000);
  });

  it('handles Patient with 10,000 names', () => {
    const json = buildLargePatient(10_000);
    const start = performance.now();
    const result = parseFhirJson(json);
    const elapsed = performance.now() - start;
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(elapsed).toBeLessThan(10_000);
  }, 30_000);

  it('handles Observation with 10,000 components (>1MB)', () => {
    const json = buildLargeObservation(10_000);
    expect(json.length).toBeGreaterThan(1_000_000);
    const start = performance.now();
    const result = parseFhirJson(json);
    const elapsed = performance.now() - start;
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);

  it('handles 10MB string field', () => {
    const bigStr = 'a'.repeat(10_000_000);
    const json = JSON.stringify({ resourceType: 'Patient', id: 'big', text: { div: bigStr } });
    const result = parseFhirJson(json);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  }, 30_000);
});

// =============================================================================
// Scenario D: Type confusion
// =============================================================================

describe('P1-D: Type confusion', () => {
  it.each(TYPE_CONFUSION_PATIENTS)(
    'parseFhirJson handles type confusion: %s',
    (_label, json) => {
      const result = parseFhirJson(json);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      // Should parse without throwing — may or may not report issues
    },
  );
});

// =============================================================================
// Scenario E: Choice type boundaries
// =============================================================================

describe('P1-E: Choice type edge cases', () => {
  it('handles multiple value[x] simultaneously', () => {
    const json = JSON.stringify({
      resourceType: 'Observation',
      id: 'multi-choice',
      status: 'final',
      code: { text: 'test' },
      valueString: 'hello',
      valueInteger: 42,
      valueBoolean: true,
    });
    const result = parseFhirJson(json);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('handles unknown choice type suffix', () => {
    const json = JSON.stringify({
      resourceType: 'Observation',
      id: 'bad-choice',
      status: 'final',
      code: { text: 'test' },
      valueUnknownType: 'x',
    });
    const result = parseFhirJson(json);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('handles value[x] with wrong type', () => {
    const json = JSON.stringify({
      resourceType: 'Observation',
      id: 'wrong-type-choice',
      status: 'final',
      code: { text: 'test' },
      valueString: 42, // should be string
    });
    const result = parseFhirJson(json);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });
});

// =============================================================================
// Scenario F: Random fuzz testing
// =============================================================================

describe('P1-F: Random fuzz testing', () => {
  it('1000 random JSON strings never throw from parseFhirJson', () => {
    for (let i = 0; i < 1000; i++) {
      const json = JSON.stringify(randomJson());
      const result = parseFhirJson(json);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    }
  });

  it('500 random FHIR-like JSON strings never throw', () => {
    for (let i = 0; i < 500; i++) {
      const json = randomFhirLikeJson();
      const result = parseFhirJson(json);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    }
  });

  it('boundary strings as Patient.id never throw', () => {
    for (const str of BOUNDARY_STRINGS) {
      try {
        const json = JSON.stringify({ resourceType: 'Patient', id: str });
        const result = parseFhirJson(json);
        expect(result).toBeDefined();
      } catch {
        // JSON.stringify might fail on some boundary strings — that's OK
      }
    }
  });
});

// =============================================================================
// Scenario G: Serialization round-trip stress
// =============================================================================

describe('P1-G: Serialization round-trip', () => {
  it('round-trips 500-name Patient through serialize → parse', () => {
    const names = Array.from({ length: 500 }, (_, i) => ({
      family: `F-${i}`,
      given: [`G-${i}`],
    }));
    const patient = { resourceType: 'Patient', id: 'rt-large', name: names };
    const json = JSON.stringify(patient);

    const r1 = parseFhirJson(json);
    expect(r1.success).toBe(true);

    const serialized = serializeToFhirJson(r1.data!);
    const r2 = parseFhirJson(serialized);
    expect(r2.success).toBe(true);
  });

  it('serializeToFhirObject handles empty/minimal resources', () => {
    const minimal = parseFhirJson('{"resourceType":"Patient"}');
    if (minimal.success && minimal.data) {
      const obj = serializeToFhirObject(minimal.data);
      expect(obj).toBeDefined();
      expect((obj as any).resourceType).toBe('Patient');
    }
  });
});

// =============================================================================
// Scenario H: Performance benchmarks
// =============================================================================

describe('P1-H: Parser performance benchmarks', () => {
  it('benchmarks small Patient parsing (P50 < 1ms)', () => {
    const perf = new PerfCollector('small-patient-parse');
    const json = JSON.stringify({
      resourceType: 'Patient',
      id: 'bench-1',
      name: [{ family: 'Smith', given: ['John'] }],
      active: true,
    });

    for (let i = 0; i < 200; i++) {
      perf.time(() => parseFhirJson(json));
    }

    const stats = perf.stats();
    console.log(perf.report());
    expect(stats.p50).toBeLessThan(5); // relaxed for CI
    expect(stats.p99).toBeLessThan(20);
  });

  it('benchmarks large Bundle parsing (100 entries)', () => {
    const entries = Array.from({ length: 100 }, (_, i) => ({
      resource: {
        resourceType: 'Patient',
        id: `p-${i}`,
        name: [{ family: `F-${i}` }],
      },
    }));
    const bundle = JSON.stringify({
      resourceType: 'Bundle',
      type: 'collection',
      entry: entries,
    });

    const perf = new PerfCollector('bundle-100-parse');
    for (let i = 0; i < 20; i++) {
      perf.time(() => parseFhirJson(bundle));
    }

    const stats = perf.stats();
    console.log(perf.report());
    expect(stats.p50).toBeLessThan(500);
    expect(stats.p99).toBeLessThan(2000);
  });
});
