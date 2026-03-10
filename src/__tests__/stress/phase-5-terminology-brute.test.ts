/**
 * Phase 5 — Terminology Brute-Force Tests
 *
 * Tests InMemoryTerminologyProvider, CodeSystemRegistry, ValueSetRegistry
 * against empty values, large CodeSystems, and boundary inputs.
 */
import { describe, it, expect } from 'vitest';

import {
  InMemoryTerminologyProvider,
  CodeSystemRegistry,
  ValueSetRegistry,
  isCodeInValueSet,
  extractCodedValues,
  severityForBindingStrength,
  requiresValidation,
} from '../../terminology/index.js';
import type {
  CodeSystemDefinition,
  ValueSetDefinition,
} from '../../terminology/index.js';
import { BOUNDARY_STRINGS } from './helpers/boundary-values.js';

// =============================================================================
// Scenario A: Empty / null / boundary inputs
// =============================================================================

describe('P5-A: Empty and boundary inputs', () => {
  it('validateCode with empty params does not throw', async () => {
    const provider = new InMemoryTerminologyProvider();
    const result = await provider.validateCode({
      code: '',
      system: '',
    });
    expect(result).toBeDefined();
    expect(typeof result.result).toBe('boolean');
    expect(result.result).toBe(false);
  });

  it('validateCode with whitespace/empty values does not throw', async () => {
    const provider = new InMemoryTerminologyProvider();
    const params = [
      { code: '   ', system: 'http://example.com' },
      { code: 'valid', system: '' },
      { code: '', system: 'http://example.com' },
    ];

    for (const p of params) {
      const result = await provider.validateCode(p);
      expect(result).toBeDefined();
      expect(typeof result.result).toBe('boolean');
    }
  });

  it('lookupCode with empty code does not throw', async () => {
    const provider = new InMemoryTerminologyProvider();
    const cases = [
      { code: '', system: '' },
      { code: 'test', system: '' },
      { code: '', system: 'http://example.com' },
    ];

    for (const c of cases) {
      const result = await provider.lookupCode(c);
      expect(result).toBeDefined();
    }
  });

  it('boundary strings as code values do not crash', async () => {
    const provider = new InMemoryTerminologyProvider();

    const cs: CodeSystemDefinition = {
      url: 'http://example.com/cs-boundary',
      name: 'BoundaryCS',
      concepts: [{ code: 'valid', display: 'Valid' }],
    };
    provider.registerCodeSystem(cs);

    for (const str of BOUNDARY_STRINGS) {
      const result = await provider.validateCode({
        code: str,
        system: 'http://example.com/cs-boundary',
      });
      expect(result).toBeDefined();
      expect(typeof result.result).toBe('boolean');
    }
  });
});

// =============================================================================
// Scenario B: Large CodeSystem
// =============================================================================

describe('P5-B: Large CodeSystem', () => {
  it('registers and queries CodeSystem with 10,000 concepts', async () => {
    const provider = new InMemoryTerminologyProvider();
    const concepts = Array.from({ length: 10_000 }, (_, i) => ({
      code: `CODE-${i}`,
      display: `Display ${i}`,
    }));

    const cs: CodeSystemDefinition = {
      url: 'http://example.com/large-cs',
      name: 'LargeCS',
      concepts,
    };

    provider.registerCodeSystem(cs);

    // Validate some codes
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      const result = await provider.validateCode({
        code: `CODE-${i}`,
        system: 'http://example.com/large-cs',
      });
      expect(result.result).toBe(true);
    }
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(10_000);

    // Non-existent code
    const notFound = await provider.validateCode({
      code: 'NONEXISTENT',
      system: 'http://example.com/large-cs',
    });
    expect(notFound.result).toBe(false);
  }, 30_000);

  it('lookupCode in large CodeSystem', async () => {
    const provider = new InMemoryTerminologyProvider();
    const concepts = Array.from({ length: 5000 }, (_, i) => ({
      code: `LKP-${i}`,
      display: `Lookup ${i}`,
    }));

    provider.registerCodeSystem({
      url: 'http://example.com/lookup-cs',
      name: 'LookupCS',
      concepts,
    });

    for (let i = 0; i < 100; i++) {
      const result = await provider.lookupCode({
        code: `LKP-${i}`,
        system: 'http://example.com/lookup-cs',
      });
      expect(result).toBeDefined();
    }
  });
});

// =============================================================================
// Scenario C: ValueSet with many includes
// =============================================================================

describe('P5-C: Complex ValueSet', () => {
  it('handles ValueSet with 20 include entries', async () => {
    const provider = new InMemoryTerminologyProvider();

    // Register 20 CodeSystems
    for (let i = 0; i < 20; i++) {
      provider.registerCodeSystem({
        url: `http://example.com/cs-multi-${i}`,
        name: `MultiCS${i}`,
        concepts: Array.from({ length: 50 }, (_, j) => ({
          code: `C${i}-${j}`,
          display: `Concept ${i}-${j}`,
        })),
      });
    }

    // Register a ValueSet that includes all 20
    const vs: ValueSetDefinition = {
      url: 'http://example.com/vs-multi',
      name: 'MultiVS',
      compose: {
        include: Array.from({ length: 20 }, (_, i) => ({
          system: `http://example.com/cs-multi-${i}`,
        })),
      },
    };
    provider.registerValueSet(vs);

    // Validate codes from various systems
    for (let i = 0; i < 20; i++) {
      const result = await provider.validateCode({
        code: `C${i}-0`,
        system: `http://example.com/cs-multi-${i}`,
      });
      expect(result).toBeDefined();
      expect(typeof result.result).toBe('boolean');
    }
  });

  it('expandValueSet with many concepts', async () => {
    const provider = new InMemoryTerminologyProvider();

    provider.registerCodeSystem({
      url: 'http://example.com/cs-expand',
      name: 'ExpandCS',
      concepts: Array.from({ length: 500 }, (_, i) => ({
        code: `EXP-${i}`,
        display: `Expand ${i}`,
      })),
    });

    provider.registerValueSet({
      url: 'http://example.com/vs-expand',
      name: 'ExpandVS',
      compose: {
        include: [{ system: 'http://example.com/cs-expand' }],
      },
    });

    const expansion = await provider.expandValueSet({
      url: 'http://example.com/vs-expand',
    });
    expect(expansion).toBeDefined();
  });
});

// =============================================================================
// Scenario D: CodeSystemRegistry and ValueSetRegistry direct
// =============================================================================

describe('P5-D: Registry direct operations', () => {
  it('CodeSystemRegistry handles duplicate registration', () => {
    const registry = new CodeSystemRegistry();
    const cs: CodeSystemDefinition = {
      url: 'http://example.com/dup',
      name: 'DupCS',
      concepts: [{ code: 'A', display: 'A' }],
    };

    registry.register(cs);
    registry.register(cs); // duplicate — should overwrite, not crash
    expect(registry.get('http://example.com/dup')).toBeDefined();
  });

  it('ValueSetRegistry handles duplicate registration', () => {
    const registry = new ValueSetRegistry();
    const vs: ValueSetDefinition = {
      url: 'http://example.com/dup-vs',
      name: 'DupVS',
    };

    registry.register(vs);
    registry.register(vs);
    expect(registry.get('http://example.com/dup-vs')).toBeDefined();
  });

  it('isCodeInValueSet with minimal/empty VS', () => {
    const csRegistry = new CodeSystemRegistry();

    // Empty VS — no compose
    const vs: ValueSetDefinition = {
      url: 'http://example.com/empty-vs',
      name: 'EmptyVS',
    };

    const result = isCodeInValueSet(vs, 'http://example.com/system', 'anycode', csRegistry);
    expect(typeof result).toBe('boolean');
    expect(result).toBe(false);
  });
});

// =============================================================================
// Scenario E: Binding validation edge cases
// =============================================================================

describe('P5-E: Binding validation edge cases', () => {
  it('extractCodedValues handles various inputs', () => {
    // null / undefined
    expect(extractCodedValues(null)).toEqual([]);
    expect(extractCodedValues(undefined)).toEqual([]);

    // plain string
    const strResult = extractCodedValues('active');
    expect(Array.isArray(strResult)).toBe(true);

    // object that is not a coding
    expect(extractCodedValues({ resourceType: 'Patient' })).toEqual([]);

    // Coding-like object
    const codingResult = extractCodedValues({ system: 'http://example.com', code: 'A' });
    expect(codingResult.length).toBeGreaterThan(0);

    // CodeableConcept-like object
    const ccResult = extractCodedValues({
      coding: [{ system: 'http://example.com', code: 'B' }],
    });
    expect(ccResult.length).toBeGreaterThan(0);
  });

  it('severityForBindingStrength returns valid result for all strengths', () => {
    const strengths = ['required', 'extensible', 'preferred', 'example'] as const;
    for (const s of strengths) {
      const result = severityForBindingStrength(s);
      // May return undefined for strengths that don't require validation (e.g., 'example')
      expect(result === undefined || typeof result === 'string').toBe(true);
    }
  });

  it('requiresValidation returns for all strengths', () => {
    const strengths = ['required', 'extensible', 'preferred', 'example'] as const;
    for (const s of strengths) {
      const result = requiresValidation(s);
      expect(typeof result).toBe('boolean');
    }
  });
});

// =============================================================================
// Scenario F: loadFromBundle stress
// =============================================================================

describe('P5-F: loadFromBundle stress', () => {
  it('handles empty/invalid bundle gracefully', () => {
    const provider = new InMemoryTerminologyProvider();

    // Various invalid inputs
    provider.loadFromBundle(null);
    provider.loadFromBundle(undefined);
    provider.loadFromBundle({});
    provider.loadFromBundle({ entry: null });
    provider.loadFromBundle({ entry: 'not-array' });
    provider.loadFromBundle({ entry: [null, undefined, {}, { resource: null }] });

    // Should not crash
    expect(true).toBe(true);
  });

  it('loads bundle with 100 CodeSystems + 100 ValueSets', async () => {
    const provider = new InMemoryTerminologyProvider();

    const entries: any[] = [];
    for (let i = 0; i < 100; i++) {
      entries.push({
        resource: {
          resourceType: 'CodeSystem',
          url: `http://example.com/bundle-cs-${i}`,
          name: `BundleCS${i}`,
          status: 'active',
          content: 'complete',
          concept: [{ code: `BC-${i}`, display: `BundleConcept ${i}` }],
        },
      });
      entries.push({
        resource: {
          resourceType: 'ValueSet',
          url: `http://example.com/bundle-vs-${i}`,
          name: `BundleVS${i}`,
          status: 'active',
          compose: {
            include: [{ system: `http://example.com/bundle-cs-${i}` }],
          },
        },
      });
    }

    provider.loadFromBundle({ resourceType: 'Bundle', type: 'collection', entry: entries });

    // Verify some are loaded
    const result = await provider.validateCode({
      code: 'BC-50',
      system: 'http://example.com/bundle-cs-50',
    });
    expect(result.result).toBe(true);
  });
});
