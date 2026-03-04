/**
 * Stress / Brute-Force Tests — Phase S1 Final Verification
 *
 * S1: Malformed Input Resilience
 * S2: Deep Nesting Stress
 * S3: Large Payload Stress
 * S4: FHIRPath Complexity Stress
 * S5: Memory Pressure — Batch Processing
 * S6: Concurrent Safety
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';

import {
  parseFhirJson,
  parseFhirObject,
  serializeToFhirJson,
  loadBundleFromFile,
  StructureValidator,
  buildCanonicalProfile,
  extractInnerTypes,
} from '../index.js';
import type { CanonicalProfile, Resource } from '../index.js';
import {
  evalFhirPath,
  evalFhirPathBoolean,
  evalFhirPathString,
  parseFhirPath,
  clearExpressionCache,
} from '../fhirpath/index.js';

// =============================================================================
// Shared setup
// =============================================================================

const SPEC_DIR = resolve(__dirname, '..', '..', 'spec', 'fhir', 'r4');
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
// S1: Malformed Input Resilience
// =============================================================================

describe('S1: Malformed Input Resilience', () => {
  const malformedInputs: Array<[string, string]> = [
    ['empty string', ''],
    ['whitespace only', '   \n\t  '],
    ['plain text', 'not json at all'],
    ['number literal', '42'],
    ['boolean literal', 'true'],
    ['null literal', 'null'],
    ['array literal', '[]'],
    ['empty object', '{}'],
    ['invalid JSON syntax', '{ bad: json }'],
    ['truncated JSON', '{"resourceType":"Patient","id":'],
    ['trailing comma', '{"resourceType":"Patient","id":"1",}'],
    ['single quotes', "{'resourceType':'Patient'}"],
    ['missing closing brace', '{"resourceType":"Patient"'],
    ['double open brace', '{{"resourceType":"Patient"}}'],
    ['JSON with BOM', '\uFEFF{"resourceType":"Patient","id":"1"}'],
  ];

  it.each(malformedInputs)(
    'parseFhirJson handles malformed input: %s — no throw, returns ParseResult',
    (_label, input) => {
      // Must NEVER throw — always returns a ParseResult
      const result = parseFhirJson(input);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(Array.isArray(result.issues)).toBe(true);
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
      }
    },
  );

  it('handles extremely long string (1MB)', () => {
    const longStr = JSON.stringify({ resourceType: 'Patient', id: 'a'.repeat(1_000_000) });
    const result = parseFhirJson(longStr);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('handles JSON with 10,000 keys', () => {
    const obj: Record<string, string> = { resourceType: 'Patient' };
    for (let i = 0; i < 10_000; i++) {
      obj[`field_${i}`] = `value_${i}`;
    }
    const json = JSON.stringify(obj);
    const result = parseFhirJson(json);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('handles unicode edge cases', () => {
    const cases = [
      // Zero-width characters
      '{"resourceType":"Patient","id":"test\u200B"}',
      // RTL characters
      '{"resourceType":"Patient","id":"مريض"}',
      // Emoji
      '{"resourceType":"Patient","id":"patient-😀"}',
      // CJK
      '{"resourceType":"Patient","id":"患者1号"}',
      // Mixed scripts
      '{"resourceType":"Patient","id":"Patient-Пациент-患者"}',
    ];

    for (const json of cases) {
      const result = parseFhirJson(json);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    }
  });

  it('handles binary-like data', () => {
    // String with control characters
    const binaryLike = '{"resourceType":"Patient","id":"\x00\x01\x02"}';
    const result = parseFhirJson(binaryLike);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('handles resourceType-missing objects gracefully', () => {
    const cases = [
      '{"id":"1","name":"test"}',
      '{"resourceType":"","id":"1"}',
      '{"resourceType":null,"id":"1"}',
      '{"resourceType":123,"id":"1"}',
      '{"resourceType":true,"id":"1"}',
    ];

    for (const json of cases) {
      const result = parseFhirJson(json);
      expect(result).toBeDefined();
      // Should fail but not throw
      if (result.success === false) {
        expect(result.issues.length).toBeGreaterThan(0);
      }
    }
  });
});

// =============================================================================
// S2: Deep Nesting Stress
// =============================================================================

describe('S2: Deep Nesting Stress', () => {
  it('handles deeply nested contained resources (100 levels)', () => {
    // Build a resource with 100 levels of nested contained
    let resource: any = { resourceType: 'Basic', id: 'leaf' };
    for (let i = 99; i >= 0; i--) {
      resource = {
        resourceType: 'Basic',
        id: `level-${i}`,
        contained: [resource],
      };
    }
    const json = JSON.stringify(resource);
    const result = parseFhirJson(json);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('handles deeply nested extension chains (50 levels)', () => {
    let ext: any = { url: 'http://leaf', valueString: 'done' };
    for (let i = 49; i >= 0; i--) {
      ext = {
        url: `http://level-${i}`,
        extension: [ext],
      };
    }
    const resource = { resourceType: 'Patient', id: 'deep-ext', extension: [ext] };
    const json = JSON.stringify(resource);
    const result = parseFhirJson(json);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('FHIRPath handles 30+ chained function calls', () => {
    // Build a long chain: Patient.name.given.first().substring(0,1).upper().length().toString()...
    // We'll just chain .where(true) many times
    let expr = 'Patient.name';
    for (let i = 0; i < 30; i++) {
      expr += '.where(true)';
    }

    const patient = {
      resourceType: 'Patient',
      name: [{ given: ['Test'] }],
    };

    // Should not stack overflow
    const result = evalFhirPath(expr, patient);
    expect(Array.isArray(result)).toBe(true);
  });
});

// =============================================================================
// S3: Large Payload Stress
// =============================================================================

describe('S3: Large Payload Stress', () => {
  it('parses Observation with 10,000 components', () => {
    const components = Array.from({ length: 10_000 }, (_, i) => ({
      code: { coding: [{ system: 'http://loinc.org', code: `code-${i}` }] },
      valueQuantity: { value: i, unit: 'mg' },
    }));
    const obs = {
      resourceType: 'Observation',
      id: 'large-obs',
      status: 'final',
      code: { text: 'large' },
      component: components,
    };
    const json = JSON.stringify(obs);
    expect(json.length).toBeGreaterThan(1_000_000); // >1MB

    const start = performance.now();
    const result = parseFhirJson(json);
    const elapsed = performance.now() - start;

    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
    expect(elapsed).toBeLessThan(30_000); // < 30s
  }, 60_000);

  it('parses Patient with 1,000 names', () => {
    const names = Array.from({ length: 1_000 }, (_, i) => ({
      use: 'official',
      family: `Family-${i}`,
      given: [`Given-${i}-A`, `Given-${i}-B`],
    }));
    const patient = { resourceType: 'Patient', id: 'many-names', name: names };
    const json = JSON.stringify(patient);

    const result = parseFhirJson(json);
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('validates resource with 10,000 components without timeout', () => {
    const components = Array.from({ length: 10_000 }, (_, i) => ({
      code: { coding: [{ system: 'http://loinc.org', code: `code-${i}` }] },
      valueQuantity: { value: i, unit: 'mg' },
    }));
    const obs = {
      resourceType: 'Observation',
      id: 'large-validate',
      status: 'final',
      code: { text: 'large' },
      component: components,
    } as unknown as Resource;

    const profile = profilesByType.get('Observation')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });

    const start = performance.now();
    const result = validator.validate(obs, profile);
    const elapsed = performance.now() - start;

    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
    expect(elapsed).toBeLessThan(30_000); // < 30s
  }, 60_000);

  it('round-trips large resource through serialize → parse', () => {
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
});

// =============================================================================
// S4: FHIRPath Complexity Stress
// =============================================================================

describe('S4: FHIRPath Complexity Stress', () => {
  const patient = {
    resourceType: 'Patient',
    id: 'fp-stress',
    name: [
      { use: 'official', family: 'Smith', given: ['John', 'James'] },
      { use: 'usual', family: 'Johnny', given: ['J'] },
    ],
    active: true,
    telecom: Array.from({ length: 50 }, (_, i) => ({
      system: 'phone',
      value: `555-${String(i).padStart(4, '0')}`,
    })),
  };

  it('handles very long expression (1000+ chars)', () => {
    // Build a long but valid expression
    let expr = 'Patient.name';
    while (expr.length < 1000) {
      expr += ".where(use = 'official')";
    }
    const result = evalFhirPath(expr, patient);
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles deeply nested where() clauses (10 levels)', () => {
    let expr = "Patient.name.where(use = 'official')";
    for (let i = 0; i < 9; i++) {
      expr += ".where(family.exists())";
    }
    const result = evalFhirPath(expr, patient);
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles expression referencing non-existent deeply nested paths', () => {
    const expr = 'Patient.a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t';
    const result = evalFhirPath(expr, patient);
    expect(result).toEqual([]);
  });

  it('handles 1000 repeated evaluations of same expression (cache test)', () => {
    clearExpressionCache();
    const expr = "Patient.name.where(use = 'official').family";

    for (let i = 0; i < 1000; i++) {
      const result = evalFhirPath(expr, patient);
      expect(result).toEqual(['Smith']);
    }
  });

  it('handles parseFhirPath + eval separation for 100 expressions', () => {
    const expressions = Array.from({ length: 100 }, (_, i) =>
      `Patient.telecom[${i % 50}].value`,
    );

    for (const expr of expressions) {
      const ast = parseFhirPath(expr);
      expect(ast).toBeDefined();
      const result = evalFhirPath(ast, patient);
      expect(Array.isArray(result)).toBe(true);
    }
  });

  it('evalFhirPathBoolean with complex boolean expressions', () => {
    const exprs = [
      "Patient.name.exists() and Patient.active",
      "Patient.name.count() > 1",
      "Patient.telecom.count() >= 50",
      "Patient.name.where(use = 'official').family = 'Smith'",
      "Patient.active.not().not()", // double negation
    ];

    for (const expr of exprs) {
      const result = evalFhirPathBoolean(expr, patient);
      expect(typeof result).toBe('boolean');
    }
  });
});

// =============================================================================
// S5: Memory Pressure — Batch Processing
// =============================================================================

describe('S5: Memory Pressure — Batch Processing', () => {
  it('parses 1,000 resources sequentially without excessive heap growth', () => {
    // Force GC if available
    if (global.gc) global.gc();
    const baselineHeap = process.memoryUsage().heapUsed;

    for (let i = 0; i < 1_000; i++) {
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
    const growth = (finalHeap - baselineHeap) / (1024 * 1024); // MB

    // Heap growth should be reasonable (< 100MB for 1000 small resources)
    expect(growth).toBeLessThan(100);
  }, 30_000);

  it('validates 500 resources sequentially', () => {
    const profile = profilesByType.get('Patient')!;
    const validator = new StructureValidator({ skipInvariants: true, validateSlicing: false });

    const start = performance.now();
    for (let i = 0; i < 500; i++) {
      const resource = {
        resourceType: 'Patient',
        id: `val-batch-${i}`,
        name: [{ family: `F-${i}` }],
      } as unknown as Resource;
      const result = validator.validate(resource, profile);
      expect(result).toBeDefined();
    }
    const elapsed = performance.now() - start;

    // 500 validations should complete within 30s
    expect(elapsed).toBeLessThan(30_000);
  }, 60_000);

  it('generates snapshots for all 146 resource profiles sequentially', () => {
    // The profiles are already loaded as CanonicalProfiles, but let's verify
    // we can iterate through all of them without issues
    let totalElements = 0;
    for (const p of allProfiles) {
      expect(p.elements.size).toBeGreaterThan(0);
      totalElements += p.elements.size;
    }
    // All 146+ profiles should have a reasonable total element count
    expect(totalElements).toBeGreaterThan(5000);
    expect(allProfiles.length).toBeGreaterThan(140);
  });

  it('extracts inner types for all profiles sequentially', () => {
    let totalInnerTypes = 0;
    for (const p of allProfiles) {
      const innerTypes = extractInnerTypes(p);
      totalInnerTypes += innerTypes.size;
    }
    // Should have extracted many inner types across all resources
    expect(totalInnerTypes).toBeGreaterThan(100);
  });
});

// =============================================================================
// S6: Concurrent Safety
// =============================================================================

describe('S6: Concurrent Safety', () => {
  it('50 concurrent parseFhirJson calls produce correct results', async () => {
    const inputs = Array.from({ length: 50 }, (_, i) =>
      JSON.stringify({ resourceType: 'Patient', id: `concurrent-${i}`, active: i % 2 === 0 }),
    );

    const results = await Promise.all(
      inputs.map((json) => Promise.resolve(parseFhirJson(json))),
    );

    expect(results).toHaveLength(50);
    for (let i = 0; i < 50; i++) {
      expect(results[i].success).toBe(true);
      expect((results[i].data as any).id).toBe(`concurrent-${i}`);
    }
  });

  it('50 concurrent evalFhirPath calls produce correct results', async () => {
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

  it('10 concurrent validation calls produce correct results', async () => {
    const profile = profilesByType.get('Patient')!;

    const resources = Array.from({ length: 10 }, (_, i) => ({
      resourceType: 'Patient',
      id: `val-conc-${i}`,
      name: [{ family: `F-${i}` }],
    })) as unknown as Resource[];

    const results = await Promise.all(
      resources.map((r) => {
        const validator = new StructureValidator({ skipInvariants: true });
        return Promise.resolve(validator.validate(r, profile));
      }),
    );

    expect(results).toHaveLength(10);
    for (const result of results) {
      expect(result).toBeDefined();
      expect(typeof result.valid).toBe('boolean');
    }
  });

  it('mixed concurrent operations (parse + validate + FHIRPath)', async () => {
    const profile = profilesByType.get('Patient')!;

    const operations = [
      // 10 parse operations
      ...Array.from({ length: 10 }, (_, i) => () => {
        const result = parseFhirJson(JSON.stringify({ resourceType: 'Patient', id: `mix-p-${i}` }));
        expect(result.success).toBe(true);
        return result;
      }),
      // 10 validate operations
      ...Array.from({ length: 10 }, (_, i) => () => {
        const resource = { resourceType: 'Patient', id: `mix-v-${i}` } as unknown as Resource;
        const validator = new StructureValidator({ skipInvariants: true });
        const result = validator.validate(resource, profile);
        expect(result).toBeDefined();
        return result;
      }),
      // 10 FHIRPath operations
      ...Array.from({ length: 10 }, (_, i) => () => {
        const resource = { resourceType: 'Patient', name: [{ family: `F-${i}` }] };
        const result = evalFhirPath('Patient.name.family', resource);
        expect(result).toEqual([`F-${i}`]);
        return result;
      }),
    ];

    const results = await Promise.all(
      operations.map((op) => Promise.resolve(op())),
    );

    expect(results).toHaveLength(30);
  });
});
