/**
 * Phase 3 — FHIRPath Engine Stress Tests
 *
 * Tests evalFhirPath under invalid expressions, complex nesting,
 * large data, cache pressure, and numeric edge cases.
 */
import { describe, it, expect } from 'vitest';

import {
  evalFhirPath,
  evalFhirPathBoolean,
  evalFhirPathString,
  evalFhirPathTyped,
  parseFhirPath,
  clearExpressionCache,
} from '../../fhirpath/index.js';
import { PerfCollector } from './helpers/performance-reporter.js';
import { buildLargeBundle } from './helpers/boundary-values.js';

// =============================================================================
// Shared test data
// =============================================================================

const patient = {
  resourceType: 'Patient',
  id: 'fp-stress',
  active: true,
  name: [
    { use: 'official', family: 'Smith', given: ['John', 'James'] },
    { use: 'usual', family: 'Johnny', given: ['J'] },
  ],
  telecom: Array.from({ length: 50 }, (_, i) => ({
    system: 'phone',
    value: `555-${String(i).padStart(4, '0')}`,
  })),
  identifier: [
    { system: 'http://example.com/mrn', value: 'MRN-12345' },
  ],
};

// =============================================================================
// Scenario A: Invalid FHIRPath expressions
// =============================================================================

describe('P3-A: Invalid FHIRPath expressions', () => {
  const invalidExpressions: Array<[string, string]> = [
    ['empty string', ''],
    ['special characters', '!@#$%'],
    ['unclosed paren', 'name.where('],
    ['extra closing paren', 'name.where())'],
    ['bad indexer', 'name[[['],
    ['lone dot', '.'],
    ['double dot', 'name..family'],
    ['trailing dot', 'name.'],
    ['just operator', '+'],
    ['just equals', '='],
    ['unclosed string', "name.where(use = 'official"],
    ['mismatched quotes', "name.where(use = 'official\")"],
    ['null byte', 'name\x00.family'],
  ];

  it.each(invalidExpressions)(
    'evalFhirPath handles invalid expression: %s — no uncaught exception',
    (_label, expr) => {
      try {
        const result = evalFhirPath(expr, patient);
        // If it returns, that's fine
        expect(Array.isArray(result)).toBe(true);
      } catch (e) {
        // Throwing a known error (e.g., parse error) is acceptable
        expect(e).toBeInstanceOf(Error);
      }
    },
  );

  it.each(invalidExpressions)(
    'parseFhirPath handles invalid expression: %s',
    (_label, expr) => {
      try {
        parseFhirPath(expr);
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    },
  );
});

// =============================================================================
// Scenario B: Complex nested expressions
// =============================================================================

describe('P3-B: Complex nested expressions', () => {
  it('handles 10-level where/select nesting', () => {
    const expr =
      "name.where(use = 'official').where(family.exists()).where(given.exists()).first()";
    const result = evalFhirPath(expr, patient);
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles deeply chained .where(true) (30 levels)', () => {
    let expr = 'Patient.name';
    for (let i = 0; i < 30; i++) {
      expr += '.where(true)';
    }
    const result = evalFhirPath(expr, patient);
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles complex boolean logic', () => {
    const expr =
      "(name.where(use='official').exists() and active) or " +
      "(identifier.where(system='http://example.com/mrn').value.length() > 5)";
    const result = evalFhirPathBoolean(expr, patient);
    expect(typeof result).toBe('boolean');
  });

  it('handles very long expression (1000+ chars)', () => {
    let expr = 'Patient.name';
    while (expr.length < 1000) {
      expr += ".where(use = 'official')";
    }
    const result = evalFhirPath(expr, patient);
    expect(Array.isArray(result)).toBe(true);
  });

  it('handles expression referencing 20-deep nonexistent paths', () => {
    const expr = 'Patient.a.b.c.d.e.f.g.h.i.j.k.l.m.n.o.p.q.r.s.t';
    const result = evalFhirPath(expr, patient);
    expect(result).toEqual([]);
  });
});

// =============================================================================
// Scenario C: Large data FHIRPath
// =============================================================================

describe('P3-C: Large data FHIRPath', () => {
  const largeBundle = buildLargeBundle(1000);

  it('counts 1000 entries in large bundle', () => {
    const result = evalFhirPath('entry.count()', largeBundle);
    expect(result).toEqual([1000]);
  });

  it('extracts all resource IDs from 1000-entry bundle', () => {
    const result = evalFhirPath('entry.resource.id', largeBundle);
    expect(result).toHaveLength(1000);
  });

  it('filters entries by resourceType in large bundle', () => {
    const start = performance.now();
    const result = evalFhirPath(
      "entry.resource.where(resourceType = 'Patient')",
      largeBundle,
    );
    const elapsed = performance.now() - start;
    expect(result.length).toBe(1000);
    expect(elapsed).toBeLessThan(10_000);
  }, 30_000);

  it('aggregation on large collection', () => {
    const result = evalFhirPath('entry.resource.active.count()', largeBundle);
    expect(result[0]).toBeGreaterThan(0);
  });
});

// =============================================================================
// Scenario D: AST cache pressure
// =============================================================================

describe('P3-D: AST cache pressure', () => {
  it('200 unique expressions (exceeds default LRU 128)', () => {
    clearExpressionCache();
    const expressions = Array.from(
      { length: 200 },
      (_, i) => `name.where(use = 'use${i}').family`,
    );

    for (const expr of expressions) {
      const result = evalFhirPath(expr, patient);
      expect(Array.isArray(result)).toBe(true);
    }
  });

  it('1000 repeated evaluations of same expression (cache hit)', () => {
    clearExpressionCache();
    const expr = "Patient.name.where(use = 'official').family";

    const perf = new PerfCollector('cache-hit-1000');
    for (let i = 0; i < 1000; i++) {
      perf.time(() => {
        const result = evalFhirPath(expr, patient);
        expect(result).toEqual(['Smith']);
      });
    }

    const stats = perf.stats();
    console.log(perf.report());
    // Cached evaluations should be fast
    expect(stats.p50).toBeLessThan(1);
  });

  it('parseFhirPath + eval separation for 100 expressions', () => {
    const expressions = Array.from(
      { length: 100 },
      (_, i) => `Patient.telecom[${i % 50}].value`,
    );

    for (const expr of expressions) {
      const ast = parseFhirPath(expr);
      expect(ast).toBeDefined();
      const result = evalFhirPath(ast, patient);
      expect(Array.isArray(result)).toBe(true);
    }
  });
});

// =============================================================================
// Scenario E: Numeric edge cases
// =============================================================================

describe('P3-E: Numeric edge cases', () => {
  const resource = { resourceType: 'Basic', id: 'num-test' };

  it('handles division by zero', () => {
    try {
      const result = evalFhirPath('1 / 0', resource);
      // Either returns empty or {} — just no crash
      expect(result).toBeDefined();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  it('handles large number arithmetic', () => {
    try {
      const result = evalFhirPath('9999999999999999 + 1', resource);
      expect(result).toBeDefined();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  it('handles negative nesting', () => {
    try {
      const result = evalFhirPath('-(-(-(-(-1))))', resource);
      expect(result).toBeDefined();
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
    }
  });

  it('handles comparison edge cases', () => {
    const exprs = [
      '0 = -0',
      '1.0 = 1',
      "1 > 'a'", // type mismatch
    ];
    for (const expr of exprs) {
      try {
        const result = evalFhirPath(expr, resource);
        expect(result).toBeDefined();
      } catch (e) {
        expect(e).toBeInstanceOf(Error);
      }
    }
  });
});

// =============================================================================
// Scenario F: evalFhirPathBoolean / evalFhirPathString edge cases
// =============================================================================

describe('P3-F: Typed evaluation edge cases', () => {
  it('evalFhirPathBoolean with complex expressions', () => {
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

  it('evalFhirPathString on existing field', () => {
    const result = evalFhirPathString(
      "Patient.name.where(use = 'official').family",
      patient,
    );
    expect(typeof result).toBe('string');
  });

  it('evalFhirPathTyped returns typed values', () => {
    const input = [{ value: patient, type: 'Patient' }];
    const result = evalFhirPathTyped('name.family', input);
    expect(Array.isArray(result)).toBe(true);
    for (const item of result) {
      expect(item).toHaveProperty('value');
      expect(item).toHaveProperty('type');
    }
  });
});

// =============================================================================
// Scenario G: Performance benchmarks
// =============================================================================

describe('P3-G: FHIRPath performance benchmarks', () => {
  it('simple path benchmark (name.family)', () => {
    clearExpressionCache();
    const perf = new PerfCollector('simple-path');

    // warm up
    evalFhirPath('Patient.name.family', patient);

    for (let i = 0; i < 500; i++) {
      perf.time(() => evalFhirPath('Patient.name.family', patient));
    }

    const stats = perf.stats();
    console.log(perf.report());
    expect(stats.p50).toBeLessThan(1);
  });

  it('medium complexity benchmark (where + select)', () => {
    const perf = new PerfCollector('where-select');
    const expr = "Patient.name.where(use = 'official').given.first()";

    for (let i = 0; i < 200; i++) {
      perf.time(() => evalFhirPath(expr, patient));
    }

    const stats = perf.stats();
    console.log(perf.report());
    expect(stats.p50).toBeLessThan(5);
  });

  it('cold-start benchmark (no cache)', () => {
    const perf = new PerfCollector('cold-start');

    for (let i = 0; i < 50; i++) {
      clearExpressionCache();
      perf.time(() =>
        evalFhirPath(`Patient.name.where(use = 'expr-${i}').family`, patient),
      );
    }

    const stats = perf.stats();
    console.log(perf.report());
    expect(stats.p50).toBeLessThan(10);
  });
});
