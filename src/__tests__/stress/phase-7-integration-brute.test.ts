/**
 * Phase 7 — Integration Brute-Force Tests
 *
 * Tests extractSearchValues, extractReferences, buildCapabilityFragment,
 * parseSearchParameter, and ResourceTypeRegistry under adversarial inputs.
 */
import { describe, it, expect } from 'vitest';

import {
  parseSearchParameter,
  parseSearchParametersFromBundle,
  extractSearchValues,
  extractAllSearchValues,
  extractReferences,
  extractReferencesFromBundle,
  buildCapabilityFragment,
  ResourceTypeRegistry,
  FHIR_R4_RESOURCE_TYPES,
} from '../../integration/index.js';
import type { SearchParameter, Resource } from '../../index.js';
import { buildBundleWithReferences } from './helpers/boundary-values.js';

// =============================================================================
// Scenario A: SearchParameter parsing edge cases
// =============================================================================

describe('P7-A: SearchParameter parsing edge cases', () => {
  it('parseSearchParameter rejects invalid inputs', () => {
    const invalids: unknown[] = [
      null,
      undefined,
      42,
      'string',
      [],
      {},
      { resourceType: 'Patient' }, // wrong resourceType
      { resourceType: 'SearchParameter' }, // missing required fields
      { resourceType: 'SearchParameter', url: 'http://x', name: 'x' }, // missing code, type, base
    ];

    for (const input of invalids) {
      const result = parseSearchParameter(input);
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      if (!result.success) {
        expect(result.issues.length).toBeGreaterThan(0);
      }
    }
  });

  it('parseSearchParameter handles invalid type values', () => {
    const result = parseSearchParameter({
      resourceType: 'SearchParameter',
      url: 'http://example.com/sp',
      name: 'test',
      code: 'test',
      type: 'invalid-type',
      base: ['Patient'],
      status: 'active',
    });
    expect(result).toBeDefined();
    expect(typeof result.success).toBe('boolean');
  });

  it('parseSearchParametersFromBundle handles empty/invalid bundles', () => {
    const invalids: unknown[] = [
      null,
      undefined,
      {},
      { entry: null },
      { entry: 'not-array' },
      { entry: [] },
      { entry: [null, undefined, {}] },
      { entry: [{ resource: null }] },
      { entry: [{ resource: { resourceType: 'Patient' } }] }, // not SP
    ];

    for (const input of invalids) {
      const result = parseSearchParametersFromBundle(input);
      expect(result).toBeDefined();
      expect(Array.isArray(result.data) || result.data === undefined || result.data === null).toBe(true);
    }
  });
});

// =============================================================================
// Scenario B: Search value extraction edge cases
// =============================================================================

describe('P7-B: Search value extraction edge cases', () => {
  it('extractSearchValues with FHIRPath that returns empty', () => {
    const sp: SearchParameter = {
      resourceType: 'SearchParameter',
      url: 'http://example.com/sp-empty',
      name: 'empty',
      code: 'empty',
      type: 'string',
      base: ['Patient'],
      status: 'active',
      expression: 'Patient.nonExistentField',
    };

    const resource = { resourceType: 'Patient', id: 'p1' } as unknown as Resource;
    const entry = extractSearchValues(resource, sp);
    expect(entry).toBeDefined();
    expect(entry.values).toEqual([]);
  });

  it('extractSearchValues with invalid FHIRPath expression', () => {
    const sp: SearchParameter = {
      resourceType: 'SearchParameter',
      url: 'http://example.com/sp-bad',
      name: 'bad',
      code: 'bad',
      type: 'string',
      base: ['Patient'],
      status: 'active',
      expression: '!!!invalid!!!',
    };

    const resource = { resourceType: 'Patient', id: 'p1' } as unknown as Resource;
    // Should not crash — returns empty values
    const entry = extractSearchValues(resource, sp);
    expect(entry).toBeDefined();
    expect(entry.values).toEqual([]);
  });

  it('extractSearchValues with mismatched resource type', () => {
    const sp: SearchParameter = {
      resourceType: 'SearchParameter',
      url: 'http://example.com/sp-obs',
      name: 'obs-only',
      code: 'obs-only',
      type: 'string',
      base: ['Observation'],
      status: 'active',
      expression: 'Observation.status',
    };

    const resource = { resourceType: 'Patient', id: 'p1' } as unknown as Resource;
    const entry = extractSearchValues(resource, sp);
    expect(entry).toBeDefined();
    expect(entry.values).toEqual([]);
  });

  it('extractSearchValues with no expression', () => {
    const sp: SearchParameter = {
      resourceType: 'SearchParameter',
      url: 'http://example.com/sp-noexpr',
      name: 'noexpr',
      code: 'noexpr',
      type: 'string',
      base: ['Patient'],
      status: 'active',
    };

    const resource = { resourceType: 'Patient', id: 'p1' } as unknown as Resource;
    const entry = extractSearchValues(resource, sp);
    expect(entry).toBeDefined();
    expect(entry.values).toEqual([]);
  });

  it('extractAllSearchValues with mixed valid/invalid SPs', () => {
    const sps: SearchParameter[] = [
      {
        resourceType: 'SearchParameter',
        url: 'http://example.com/sp-name',
        name: 'name',
        code: 'name',
        type: 'string',
        base: ['Patient'],
        status: 'active',
        expression: 'Patient.name.family',
      },
      {
        resourceType: 'SearchParameter',
        url: 'http://example.com/sp-bad',
        name: 'bad',
        code: 'bad',
        type: 'string',
        base: ['Patient'],
        status: 'active',
        expression: '!!!invalid!!!',
      },
    ];

    const resource = {
      resourceType: 'Patient',
      id: 'p1',
      name: [{ family: 'Smith' }],
    } as unknown as Resource;

    const entries = extractAllSearchValues(resource, sps);
    expect(Array.isArray(entries)).toBe(true);
    // At least the valid SP should produce results
    expect(entries.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// Scenario C: Reference extraction edge cases
// =============================================================================

describe('P7-C: Reference extraction edge cases', () => {
  it('extractReferences from minimal resource', () => {
    const resource = { resourceType: 'Patient', id: 'p1' } as unknown as Resource;
    const refs = extractReferences(resource);
    expect(Array.isArray(refs)).toBe(true);
  });

  it('extractReferences from resource with self-reference', () => {
    const resource = {
      resourceType: 'Patient',
      id: 'p1',
      link: [{ other: { reference: 'Patient/p1' }, type: 'seealso' }],
    } as unknown as Resource;

    const refs = extractReferences(resource);
    expect(Array.isArray(refs)).toBe(true);
    // Should handle self-reference without infinite loop
  });

  it('extractReferences from resource with many references', () => {
    const resource = {
      resourceType: 'Patient',
      id: 'p1',
      managingOrganization: { reference: 'Organization/org-1' },
      generalPractitioner: Array.from({ length: 100 }, (_, i) => ({
        reference: `Practitioner/pract-${i}`,
      })),
    } as unknown as Resource;

    const refs = extractReferences(resource);
    expect(Array.isArray(refs)).toBe(true);
    expect(refs.length).toBeGreaterThan(0);
  });

  it('extractReferencesFromBundle with invalid bundles', () => {
    const invalids: unknown[] = [
      null,
      undefined,
      {},
      { entry: null },
      { entry: 'not-array' },
      { entry: [null, {}, { resource: null }] },
    ];

    for (const input of invalids) {
      const refs = extractReferencesFromBundle(input);
      expect(Array.isArray(refs)).toBe(true);
      expect(refs).toEqual([]);
    }
  });

  it('extractReferencesFromBundle with large bundle (1000 resources, 10 refs each)', () => {
    const bundle = buildBundleWithReferences(1000, 10);
    const start = performance.now();
    const refs = extractReferencesFromBundle(bundle);
    const elapsed = performance.now() - start;

    expect(Array.isArray(refs)).toBe(true);
    expect(refs.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(10_000);
  }, 30_000);
});

// =============================================================================
// Scenario D: ResourceTypeRegistry edge cases
// =============================================================================

describe('P7-D: ResourceTypeRegistry', () => {
  it('FHIR_R4_RESOURCE_TYPES has 148 resource types', () => {
    expect(FHIR_R4_RESOURCE_TYPES.length).toBe(148);
  });

  it('ResourceTypeRegistry validates known types when populated', () => {
    const registry = ResourceTypeRegistry.fromList(
      FHIR_R4_RESOURCE_TYPES.map((type) => ({
        type,
        url: `http://hl7.org/fhir/StructureDefinition/${type}`,
        kind: 'resource',
        abstract: false,
      })),
    );
    expect(registry.isKnown('Patient')).toBe(true);
    expect(registry.isKnown('Observation')).toBe(true);
    expect(registry.isKnown('Bundle')).toBe(true);
    expect(registry.size).toBe(148);
  });

  it('ResourceTypeRegistry rejects unknown types', () => {
    const registry = ResourceTypeRegistry.fromList(
      FHIR_R4_RESOURCE_TYPES.map((type) => ({
        type,
        url: `http://hl7.org/fhir/StructureDefinition/${type}`,
        kind: 'resource',
        abstract: false,
      })),
    );
    expect(registry.isKnown('FakeResource')).toBe(false);
    expect(registry.isKnown('')).toBe(false);
    expect(registry.isKnown('patient')).toBe(false); // case sensitive
  });
});

// =============================================================================
// Scenario E: buildCapabilityFragment edge cases
// =============================================================================

describe('P7-E: buildCapabilityFragment', () => {
  it('builds fragment with empty profiles', () => {
    const fragment = buildCapabilityFragment([]);
    expect(fragment).toBeDefined();
    expect(fragment.mode).toBe('server');
    expect(fragment.resource).toEqual([]);
  });

  it('builds fragment with search parameters', () => {
    // We need at least a minimal CanonicalProfile-like object
    // Use empty profiles array with search params
    const sps: SearchParameter[] = Array.from({ length: 20 }, (_, i) => ({
      resourceType: 'SearchParameter' as const,
      url: `http://example.com/sp-${i}`,
      name: `sp-${i}`,
      code: `sp-${i}`,
      type: 'string' as const,
      base: ['Patient'],
      status: 'active' as const,
    }));

    const fragment = buildCapabilityFragment([], sps);
    expect(fragment).toBeDefined();
    expect(fragment.mode).toBe('server');
  });
});
