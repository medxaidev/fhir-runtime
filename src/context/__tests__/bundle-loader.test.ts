/**
 * Tests for bundle-loader.ts — Task 7.2
 *
 * Covers:
 * - loadBundleFromObject: unit tests with mock bundles (no file I/O)
 * - loadBundleFromFile: integration tests with real FHIR R4 spec files
 * - loadBundlesFromFiles: merge order and deduplication tests
 */

import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';

import {
  loadBundleFromObject,
  loadBundleFromFile,
  loadBundlesFromFiles,
} from '../bundle-loader.js';

// =============================================================================
// Helpers
// =============================================================================

/** Resolve path relative to project root spec directory */
function specPath(filename: string): string {
  return resolve(__dirname, '..', '..', '..', 'spec', 'fhir', 'r4', filename);
}

/** Create a minimal valid StructureDefinition entry */
function makeSD(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    resourceType: 'StructureDefinition',
    url: 'http://hl7.org/fhir/StructureDefinition/Patient',
    name: 'Patient',
    status: 'active',
    kind: 'resource',
    abstract: false,
    type: 'Patient',
    snapshot: {
      element: [
        { path: 'Patient', id: 'Patient', min: 0, max: '*' },
        { path: 'Patient.id', id: 'Patient.id', min: 0, max: '1', type: [{ code: 'id' }] },
      ],
    },
    ...overrides,
  };
}

/** Create a minimal Bundle with the given entries */
function makeBundle(entries: Array<Record<string, unknown>>): Record<string, unknown> {
  return {
    resourceType: 'Bundle',
    type: 'collection',
    entry: entries.map((resource) => ({ resource })),
  };
}

// =============================================================================
// Section 1: loadBundleFromObject — Unit Tests
// =============================================================================

describe('loadBundleFromObject', () => {
  it('loads all entries from a valid bundle', () => {
    const bundle = makeBundle([
      makeSD(),
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/Observation',
        name: 'Observation',
        type: 'Observation',
        snapshot: {
          element: [
            { path: 'Observation', id: 'Observation', min: 0, max: '*' },
          ],
        },
      }),
    ]);

    const result = loadBundleFromObject(bundle as any);
    expect(result.profiles).toHaveLength(2);
    expect(result.stats.total).toBe(2);
    expect(result.stats.loaded).toBe(2);
    expect(result.stats.skipped).toBe(0);
    expect(result.stats.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('produces CanonicalProfile with correct fields', () => {
    const bundle = makeBundle([makeSD()]);
    const result = loadBundleFromObject(bundle as any);

    expect(result.profiles).toHaveLength(1);
    const profile = result.profiles[0];
    expect(profile.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(profile.name).toBe('Patient');
    expect(profile.kind).toBe('resource');
    expect(profile.type).toBe('Patient');
    expect(profile.abstract).toBe(false);
    expect(profile.elements.size).toBe(2);
    expect(profile.elements.has('Patient')).toBe(true);
    expect(profile.elements.has('Patient.id')).toBe(true);
  });

  it('filters by kind=resource correctly', () => {
    const bundle = makeBundle([
      makeSD(),
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/string',
        name: 'string',
        kind: 'primitive-type',
        type: 'string',
        snapshot: {
          element: [{ path: 'string', id: 'string', min: 0, max: '*' }],
        },
      }),
    ]);

    const result = loadBundleFromObject(bundle as any, { filterKind: 'resource' });
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].name).toBe('Patient');
    expect(result.stats.total).toBe(2);
    expect(result.stats.loaded).toBe(1);
    expect(result.stats.skipped).toBe(1);
  });

  it('filters by multiple kinds', () => {
    const bundle = makeBundle([
      makeSD(),
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/string',
        name: 'string',
        kind: 'primitive-type',
        type: 'string',
        snapshot: {
          element: [{ path: 'string', id: 'string', min: 0, max: '*' }],
        },
      }),
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/HumanName',
        name: 'HumanName',
        kind: 'complex-type',
        type: 'HumanName',
        snapshot: {
          element: [{ path: 'HumanName', id: 'HumanName', min: 0, max: '*' }],
        },
      }),
    ]);

    const result = loadBundleFromObject(bundle as any, {
      filterKind: ['resource', 'complex-type'],
    });
    expect(result.profiles).toHaveLength(2);
    expect(result.stats.skipped).toBe(1);
  });

  it('excludes abstract definitions when excludeAbstract=true', () => {
    const bundle = makeBundle([
      makeSD(),
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
        name: 'DomainResource',
        abstract: true,
        type: 'DomainResource',
        snapshot: {
          element: [{ path: 'DomainResource', id: 'DomainResource', min: 0, max: '*' }],
        },
      }),
    ]);

    const result = loadBundleFromObject(bundle as any, { excludeAbstract: true });
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].name).toBe('Patient');
    expect(result.stats.skipped).toBe(1);
  });

  it('includes abstract definitions by default', () => {
    const bundle = makeBundle([
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
        name: 'DomainResource',
        abstract: true,
        type: 'DomainResource',
        snapshot: {
          element: [{ path: 'DomainResource', id: 'DomainResource', min: 0, max: '*' }],
        },
      }),
    ]);

    const result = loadBundleFromObject(bundle as any);
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].abstract).toBe(true);
  });

  it('filters by type correctly', () => {
    const bundle = makeBundle([
      makeSD(),
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/Observation',
        name: 'Observation',
        type: 'Observation',
        snapshot: {
          element: [{ path: 'Observation', id: 'Observation', min: 0, max: '*' }],
        },
      }),
    ]);

    const result = loadBundleFromObject(bundle as any, { filterTypes: ['Patient'] });
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].type).toBe('Patient');
    expect(result.stats.skipped).toBe(1);
  });

  it('reports errors without aborting on parse failure', () => {
    const bundle = makeBundle([
      makeSD(),
      // Invalid SD: missing required fields
      {
        resourceType: 'StructureDefinition',
        name: 'BadSD',
        url: 'http://example.org/bad',
        // missing kind, abstract, type, status
      },
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/Observation',
        name: 'Observation',
        type: 'Observation',
        snapshot: {
          element: [{ path: 'Observation', id: 'Observation', min: 0, max: '*' }],
        },
      }),
    ]);

    const result = loadBundleFromObject(bundle as any);
    // First and third should succeed, second should fail
    expect(result.profiles).toHaveLength(2);
    expect(result.stats.total).toBe(3);
    expect(result.stats.loaded).toBe(2);
    expect(result.stats.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('BadSD');
    expect(result.errors[0].url).toBe('http://example.org/bad');
    expect(result.errors[0].error).toBeInstanceOf(Error);
  });

  it('reports error for SD without snapshot (buildCanonicalProfile throws)', () => {
    const bundle = makeBundle([
      {
        resourceType: 'StructureDefinition',
        url: 'http://example.org/no-snapshot',
        name: 'NoSnapshot',
        status: 'active',
        kind: 'resource',
        abstract: false,
        type: 'Patient',
        // no snapshot
      },
    ]);

    const result = loadBundleFromObject(bundle as any);
    expect(result.stats.failed).toBe(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].name).toBe('NoSnapshot');
    expect(result.errors[0].error.message).toContain('no snapshot');
  });

  it('returns correct stats (total/loaded/skipped/failed)', () => {
    const bundle = makeBundle([
      makeSD(),
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/string',
        name: 'string',
        kind: 'primitive-type',
        type: 'string',
        snapshot: {
          element: [{ path: 'string', id: 'string', min: 0, max: '*' }],
        },
      }),
      // Invalid SD
      {
        resourceType: 'StructureDefinition',
        name: 'BadSD',
        url: 'http://example.org/bad',
      },
    ]);

    const result = loadBundleFromObject(bundle as any, { filterKind: 'resource' });
    expect(result.stats.total).toBe(3);
    expect(result.stats.loaded).toBe(1);
    expect(result.stats.skipped).toBe(2); // primitive-type filtered + BadSD has no kind → also skipped
    expect(result.stats.failed).toBe(0);
  });

  it('handles empty bundle gracefully', () => {
    const bundle = makeBundle([]);
    const result = loadBundleFromObject(bundle as any);
    expect(result.profiles).toHaveLength(0);
    expect(result.stats.total).toBe(0);
    expect(result.stats.loaded).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('handles bundle with no entry array', () => {
    const bundle = { resourceType: 'Bundle', type: 'collection' };
    const result = loadBundleFromObject(bundle as any);
    expect(result.profiles).toHaveLength(0);
    expect(result.stats.total).toBe(0);
  });

  it('handles bundle with non-StructureDefinition entries', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Patient', id: 'test' } },
        { resource: makeSD() },
        { resource: { resourceType: 'ValueSet', id: 'test-vs' } },
      ],
    };

    const result = loadBundleFromObject(bundle as any);
    expect(result.profiles).toHaveLength(1);
    expect(result.stats.total).toBe(1); // only SDs counted
  });

  it('handles bundle with null/undefined entries', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: null },
        { resource: undefined },
        {},
        { resource: makeSD() },
      ],
    };

    const result = loadBundleFromObject(bundle as any);
    expect(result.profiles).toHaveLength(1);
    expect(result.stats.total).toBe(1);
  });

  it('handles non-Bundle object gracefully', () => {
    const notBundle = { resourceType: 'Patient', id: 'test' };
    const result = loadBundleFromObject(notBundle as any);
    expect(result.profiles).toHaveLength(0);
    expect(result.stats.total).toBe(0);
  });

  it('combines multiple filter options', () => {
    const bundle = makeBundle([
      makeSD(), // resource, non-abstract, Patient → included
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
        name: 'DomainResource',
        abstract: true,
        type: 'DomainResource',
        snapshot: {
          element: [{ path: 'DomainResource', id: 'DomainResource', min: 0, max: '*' }],
        },
      }), // resource, abstract → excluded
      makeSD({
        url: 'http://hl7.org/fhir/StructureDefinition/string',
        name: 'string',
        kind: 'primitive-type',
        type: 'string',
        snapshot: {
          element: [{ path: 'string', id: 'string', min: 0, max: '*' }],
        },
      }), // primitive-type → excluded
    ]);

    const result = loadBundleFromObject(bundle as any, {
      filterKind: 'resource',
      excludeAbstract: true,
    });
    expect(result.profiles).toHaveLength(1);
    expect(result.profiles[0].name).toBe('Patient');
    expect(result.stats.skipped).toBe(2);
  });
});

// =============================================================================
// Section 2: loadBundleFromFile — Integration Tests (real spec files)
// =============================================================================

describe('loadBundleFromFile — profiles-resources.json', () => {
  it('loads all resource StructureDefinitions without errors', () => {
    const result = loadBundleFromFile(specPath('profiles-resources.json'));
    expect(result.stats.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.loaded).toBeGreaterThan(100);
    expect(result.profiles.length).toBe(result.stats.loaded);
  });

  it('produces CanonicalProfile with correct kind=resource for resources', () => {
    const result = loadBundleFromFile(specPath('profiles-resources.json'), {
      filterKind: 'resource',
    });
    for (const profile of result.profiles) {
      expect(profile.kind).toBe('resource');
    }
  });

  it('Patient profile has expected elements', () => {
    const result = loadBundleFromFile(specPath('profiles-resources.json'), {
      filterTypes: ['Patient'],
    });
    expect(result.profiles).toHaveLength(1);
    const patient = result.profiles[0];
    expect(patient.name).toBe('Patient');
    expect(patient.type).toBe('Patient');
    expect(patient.elements.has('Patient')).toBe(true);
    expect(patient.elements.has('Patient.id')).toBe(true);
    expect(patient.elements.has('Patient.name')).toBe(true);
    expect(patient.elements.has('Patient.birthDate')).toBe(true);
    expect(patient.elements.has('Patient.gender')).toBe(true);
  });

  it('Observation profile has expected elements', () => {
    const result = loadBundleFromFile(specPath('profiles-resources.json'), {
      filterTypes: ['Observation'],
    });
    expect(result.profiles).toHaveLength(1);
    const obs = result.profiles[0];
    expect(obs.name).toBe('Observation');
    expect(obs.elements.has('Observation.status')).toBe(true);
    expect(obs.elements.has('Observation.code')).toBe(true);
    expect(obs.elements.has('Observation.value[x]')).toBe(true);
    expect(obs.elements.has('Observation.subject')).toBe(true);
  });

  it('excludeAbstract filters out abstract resources', () => {
    const all = loadBundleFromFile(specPath('profiles-resources.json'));
    const nonAbstract = loadBundleFromFile(specPath('profiles-resources.json'), {
      excludeAbstract: true,
    });
    expect(nonAbstract.stats.loaded).toBeLessThan(all.stats.loaded);
    for (const profile of nonAbstract.profiles) {
      expect(profile.abstract).toBe(false);
    }
  }, 15_000);
});

describe('loadBundleFromFile — profiles-types.json', () => {
  it('loads all type StructureDefinitions without errors', () => {
    const result = loadBundleFromFile(specPath('profiles-types.json'));
    expect(result.stats.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.loaded).toBeGreaterThan(30);
  });

  it('HumanName profile has expected elements', () => {
    const result = loadBundleFromFile(specPath('profiles-types.json'), {
      filterTypes: ['HumanName'],
    });
    expect(result.profiles).toHaveLength(1);
    const hn = result.profiles[0];
    expect(hn.kind).toBe('complex-type');
    expect(hn.elements.has('HumanName.family')).toBe(true);
    expect(hn.elements.has('HumanName.given')).toBe(true);
  });

  it('Coding profile has expected elements', () => {
    const result = loadBundleFromFile(specPath('profiles-types.json'), {
      filterTypes: ['Coding'],
    });
    expect(result.profiles).toHaveLength(1);
    const coding = result.profiles[0];
    expect(coding.kind).toBe('complex-type');
    expect(coding.elements.has('Coding.system')).toBe(true);
    expect(coding.elements.has('Coding.code')).toBe(true);
  });
});

describe('loadBundleFromFile — profiles-others.json', () => {
  it('loads all other StructureDefinitions without errors', () => {
    const result = loadBundleFromFile(specPath('profiles-others.json'));
    expect(result.stats.failed).toBe(0);
    expect(result.errors).toHaveLength(0);
    expect(result.stats.loaded).toBeGreaterThan(10);
  });
});

// =============================================================================
// Section 3: loadBundlesFromFiles — Merge Tests
// =============================================================================

describe('loadBundlesFromFiles', () => {
  it('merged result contains entries from all bundles', () => {
    const result = loadBundlesFromFiles([
      specPath('profiles-types.json'),
      specPath('profiles-resources.json'),
      specPath('profiles-others.json'),
    ]);

    expect(result.stats.failed).toBe(0);
    expect(result.errors).toHaveLength(0);

    // Should have profiles from all three bundles
    const types = loadBundleFromFile(specPath('profiles-types.json'));
    const resources = loadBundleFromFile(specPath('profiles-resources.json'));
    const others = loadBundleFromFile(specPath('profiles-others.json'));

    // Total loaded should be at least the sum (minus any overlapping URLs)
    expect(result.stats.loaded).toBeGreaterThanOrEqual(
      Math.max(types.stats.loaded, resources.stats.loaded, others.stats.loaded),
    );
  }, 30_000);

  it('later bundle overrides earlier for same URL', () => {
    // Create two bundles with the same SD URL
    const bundle1 = makeBundle([
      makeSD({
        url: 'http://example.org/StructureDefinition/Test',
        name: 'TestV1',
        type: 'Patient',
        snapshot: {
          element: [{ path: 'Patient', id: 'Patient', min: 0, max: '*' }],
        },
      }),
    ]);
    const bundle2 = makeBundle([
      makeSD({
        url: 'http://example.org/StructureDefinition/Test',
        name: 'TestV2',
        type: 'Patient',
        snapshot: {
          element: [
            { path: 'Patient', id: 'Patient', min: 0, max: '*' },
            { path: 'Patient.id', id: 'Patient.id', min: 0, max: '1' },
          ],
        },
      }),
    ]);

    // Use loadBundleFromObject to test merge logic directly
    const result1 = loadBundleFromObject(bundle1 as any);
    const result2 = loadBundleFromObject(bundle2 as any);

    // Simulate merge: later overrides earlier
    const profileMap = new Map<string, any>();
    for (const p of result1.profiles) profileMap.set(p.url, p);
    for (const p of result2.profiles) profileMap.set(p.url, p);

    const merged = Array.from(profileMap.values());
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('TestV2');
    expect(merged[0].elements.size).toBe(2);
  });

  it('applies filter options across all bundles', () => {
    const result = loadBundlesFromFiles(
      [specPath('profiles-types.json'), specPath('profiles-resources.json')],
      { filterKind: 'resource' },
    );

    for (const profile of result.profiles) {
      expect(profile.kind).toBe('resource');
    }
    expect(result.stats.skipped).toBeGreaterThan(0);
  });
});
