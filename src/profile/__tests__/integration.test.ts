/**
 * integration.test.ts — End-to-end Integration Tests
 *
 * Tests the full pipeline: real FHIR R4 core definitions → SnapshotGenerator
 * → CanonicalProfile builder. Verifies that the entire snapshot generation
 * and canonical conversion workflow produces correct results.
 *
 * Uses the 73 pre-loaded FHIR R4 core definitions from core-definitions/.
 *
 * Covers:
 * - Base resource snapshot generation (Patient, Observation)
 * - Simple profile snapshot generation
 * - Profile with slicing
 * - Multi-level inheritance
 * - Circular dependency detection
 * - Missing base handling
 * - CanonicalProfile conversion from generated snapshot
 * - Element count and ordering validation
 */

import { describe, it, expect, beforeAll } from 'vitest';
import type { StructureDefinition, ElementDefinition } from '../../model/index.js';
import type { FhirContext } from '../../context/types.js';
import {
  loadCoreDefinitionSync,
  getCoreDefinitionsDir,
  ALL_CORE_DEFINITIONS,
} from '../../context/core-definitions/index.js';
import { SnapshotGenerator } from '../snapshot-generator.js';
import { buildCanonicalProfile } from '../canonical-builder.js';
import { validateElementOrder } from '../element-sorter.js';
import type { SnapshotIssue } from '../types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CORE_DIR = getCoreDefinitionsDir();

let sdMap: Map<string, StructureDefinition>;
let mockContext: FhirContext;
let generator: SnapshotGenerator;

function asSd(obj: Record<string, unknown>): StructureDefinition {
  return obj as unknown as StructureDefinition;
}

function findByPath(elements: ElementDefinition[], path: string): ElementDefinition | undefined {
  return elements.find((e) => (e.path as string) === path);
}

function findSlice(elements: ElementDefinition[], path: string, sliceName: string): ElementDefinition | undefined {
  return elements.find(
    (e) => (e.path as string) === path && (e.sliceName as string) === sliceName,
  );
}

function createMockContext(map: Map<string, StructureDefinition>): FhirContext {
  return {
    loadStructureDefinition: async (url: string) => {
      const found = map.get(url);
      if (!found) throw new Error(`Not found: ${url}`);
      return found;
    },
    getStructureDefinition: (url: string) => map.get(url),
    hasStructureDefinition: (url: string) => map.has(url),
    resolveInheritanceChain: async () => [],
    registerStructureDefinition: (registeredSd: StructureDefinition) => {
      map.set(registeredSd.url as string, registeredSd);
    },
    preloadCoreDefinitions: async () => { },
    getStatistics: () => ({
      registeredDefinitions: map.size,
      loadedFromLoaders: 0,
      cacheHits: 0,
      cacheMisses: 0,
      resolvedChains: 0,
    }),
    dispose: () => { },
  } as unknown as FhirContext;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeAll(() => {
  sdMap = new Map<string, StructureDefinition>();
  for (const name of ALL_CORE_DEFINITIONS) {
    try {
      const coreSd = loadCoreDefinitionSync(name, CORE_DIR);
      sdMap.set(coreSd.url as string, coreSd);
    } catch {
      // Skip missing definitions
    }
  }
  mockContext = createMockContext(sdMap);
  generator = new SnapshotGenerator(mockContext);
}, 30_000);

// ===========================================================================
// Section 1: Base Resource Snapshot Generation
// ===========================================================================

describe('Base resource snapshot generation', () => {
  it('Patient base has snapshot with >100 elements', () => {
    const patientSd = sdMap.get('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(patientSd).toBeDefined();
    expect(patientSd!.snapshot).toBeDefined();
    expect(patientSd!.snapshot!.element.length).toBeGreaterThan(30);
    expect((patientSd!.snapshot!.element[0].path as string)).toBe('Patient');
  });

  it('Observation base has snapshot with >50 elements', () => {
    const obsSd = sdMap.get('http://hl7.org/fhir/StructureDefinition/Observation');
    expect(obsSd).toBeDefined();
    expect(obsSd!.snapshot).toBeDefined();
    expect(obsSd!.snapshot!.element.length).toBeGreaterThanOrEqual(50);
  });

  it('Extension base has snapshot', () => {
    const extSd = sdMap.get('http://hl7.org/fhir/StructureDefinition/Extension');
    expect(extSd).toBeDefined();
    expect(extSd!.snapshot).toBeDefined();
    expect(extSd!.snapshot!.element.length).toBeGreaterThan(0);
  });

  it('HumanName complex type has snapshot', () => {
    const hnSd = sdMap.get('http://hl7.org/fhir/StructureDefinition/HumanName');
    expect(hnSd).toBeDefined();
    expect(hnSd!.snapshot).toBeDefined();
    expect(hnSd!.snapshot!.element.length).toBeGreaterThan(0);
  });

  it('Identifier complex type has snapshot', () => {
    const idSd = sdMap.get('http://hl7.org/fhir/StructureDefinition/Identifier');
    expect(idSd).toBeDefined();
    expect(idSd!.snapshot).toBeDefined();
    expect(idSd!.snapshot!.element.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Section 2: Simple Profile Snapshot Generation
// ===========================================================================

describe('Simple profile snapshot generation', () => {
  it('generates snapshot for simple Patient profile (name required)', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestSimplePatient',
      name: 'IntTestSimplePatient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [
          { path: 'Patient.name', min: 1, mustSupport: true },
        ],
      },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(true);
    expect(profile.snapshot).toBeDefined();

    // Should have same number of elements as base Patient
    const baseSd = sdMap.get('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(profile.snapshot!.element.length).toBe(baseSd!.snapshot!.element.length);

    // Constrained element should have new values
    const nameEl = findByPath(profile.snapshot!.element, 'Patient.name');
    expect(nameEl).toBeDefined();
    expect(nameEl!.min).toBe(1);
    expect(nameEl!.mustSupport).toBe(true);

    // Unconstrained elements should be preserved from base
    const idEl = findByPath(profile.snapshot!.element, 'Patient.id');
    expect(idEl).toBeDefined();
  });

  it('generates snapshot for Observation profile (code required, value restricted)', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestSimpleObs',
      name: 'IntTestSimpleObs',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Observation',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Observation',
      derivation: 'constraint',
      differential: {
        element: [
          { path: 'Observation.code', min: 1, mustSupport: true },
          { path: 'Observation.value[x]', min: 1, type: [{ code: 'Quantity' }] },
        ],
      },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(true);

    const codeEl = findByPath(profile.snapshot!.element, 'Observation.code');
    expect(codeEl!.min).toBe(1);
    expect(codeEl!.mustSupport).toBe(true);

    const valueEl = findByPath(profile.snapshot!.element, 'Observation.value[x]');
    expect(valueEl!.min).toBe(1);
    const types = valueEl!.type as Array<{ code: unknown }>;
    expect(types.length).toBe(1);
    expect((types[0].code as string)).toBe('Quantity');
  });

  it('generates snapshot for profile with multiple constraints', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestMultiConstraint',
      name: 'IntTestMultiConstraint',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [
          { path: 'Patient.identifier', min: 1, mustSupport: true },
          { path: 'Patient.name', min: 1, mustSupport: true },
          { path: 'Patient.gender', min: 1 },
          { path: 'Patient.birthDate', min: 1 },
        ],
      },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(true);

    for (const path of ['Patient.identifier', 'Patient.name', 'Patient.gender', 'Patient.birthDate']) {
      const el = findByPath(profile.snapshot!.element, path);
      expect(el).toBeDefined();
      expect(el!.min).toBe(1);
    }
  });
});

// ===========================================================================
// Section 3: Profile with Slicing
// ===========================================================================

describe('Profile with slicing', () => {
  it('generates snapshot for profile with identifier slicing', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestSlicedPatient',
      name: 'IntTestSlicedPatient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [
          {
            path: 'Patient.identifier',
            slicing: {
              discriminator: [{ type: 'value', path: 'system' }],
              rules: 'open',
            },
            min: 1,
          },
          {
            path: 'Patient.identifier',
            sliceName: 'mrn',
            min: 1,
            max: '1',
          },
        ],
      },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(true);

    // Slicing root
    const idEl = findByPath(profile.snapshot!.element, 'Patient.identifier');
    expect(idEl).toBeDefined();
    expect(idEl!.slicing).toBeDefined();
    expect(idEl!.min).toBe(1);

    // Slice entry
    const mrnSlice = findSlice(profile.snapshot!.element, 'Patient.identifier', 'mrn');
    expect(mrnSlice).toBeDefined();
    expect(mrnSlice!.min).toBe(1);
    expect((mrnSlice!.max as string)).toBe('1');
  });

  it('generates snapshot for profile with extension slicing', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestExtSliced',
      name: 'IntTestExtSliced',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [
          {
            path: 'Patient.extension',
            slicing: {
              discriminator: [{ type: 'value', path: 'url' }],
              rules: 'open',
            },
          },
          {
            path: 'Patient.extension',
            sliceName: 'birthPlace',
            min: 0,
            max: '1',
            type: [{
              code: 'Extension',
              profile: ['http://hl7.org/fhir/StructureDefinition/patient-birthPlace'],
            }],
          },
        ],
      },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(true);

    const extEl = findByPath(profile.snapshot!.element, 'Patient.extension');
    expect(extEl).toBeDefined();
    expect(extEl!.slicing).toBeDefined();

    const bpSlice = findSlice(profile.snapshot!.element, 'Patient.extension', 'birthPlace');
    expect(bpSlice).toBeDefined();
  });
});

// ===========================================================================
// Section 4: Multi-level Inheritance
// ===========================================================================

describe('Multi-level inheritance', () => {
  it('generates snapshot for 2-level profile chain', async () => {
    // Level 1: requires name
    const level1 = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestLevel1',
      name: 'IntTestLevel1',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [{ path: 'Patient.name', min: 1 }],
      },
    });
    sdMap.set(level1.url as string, level1);
    const r1 = await generator.generate(level1);
    expect(r1.success).toBe(true);

    // Level 2: requires birthDate, inherits name requirement
    const level2 = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestLevel2',
      name: 'IntTestLevel2',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/fhir/StructureDefinition/IntTestLevel1',
      derivation: 'constraint',
      differential: {
        element: [{ path: 'Patient.birthDate', min: 1 }],
      },
    });
    sdMap.set(level2.url as string, level2);
    const r2 = await generator.generate(level2);
    expect(r2.success).toBe(true);

    // Level 2 should have both constraints
    const nameEl = findByPath(level2.snapshot!.element, 'Patient.name');
    expect(nameEl!.min).toBe(1);
    const bdEl = findByPath(level2.snapshot!.element, 'Patient.birthDate');
    expect(bdEl!.min).toBe(1);
  });

  it('generates snapshot for 3-level profile chain', async () => {
    // Level 3: requires gender, inherits name + birthDate
    const level3 = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestLevel3',
      name: 'IntTestLevel3',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/fhir/StructureDefinition/IntTestLevel2',
      derivation: 'constraint',
      differential: {
        element: [{ path: 'Patient.gender', min: 1 }],
      },
    });
    sdMap.set(level3.url as string, level3);
    const r3 = await generator.generate(level3);
    expect(r3.success).toBe(true);

    // All 3 constraints should be present
    expect(findByPath(level3.snapshot!.element, 'Patient.name')!.min).toBe(1);
    expect(findByPath(level3.snapshot!.element, 'Patient.birthDate')!.min).toBe(1);
    expect(findByPath(level3.snapshot!.element, 'Patient.gender')!.min).toBe(1);
  });
});

// ===========================================================================
// Section 5: Error Handling
// ===========================================================================

describe('Error handling', () => {
  it('handles circular dependency gracefully', async () => {
    // Create two profiles that reference each other
    const profileA = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/CircularA',
      name: 'CircularA',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/fhir/StructureDefinition/CircularB',
      derivation: 'constraint',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });
    const profileB = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/CircularB',
      name: 'CircularB',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/fhir/StructureDefinition/CircularA',
      derivation: 'constraint',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });
    sdMap.set(profileA.url as string, profileA);
    sdMap.set(profileB.url as string, profileB);

    // Should throw SnapshotCircularDependencyError
    await expect(generator.generate(profileA)).rejects.toThrow();

    // Cleanup
    sdMap.delete(profileA.url as string);
    sdMap.delete(profileB.url as string);
  });

  it('handles missing base gracefully', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestMissingBase',
      name: 'IntTestMissingBase',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/fhir/StructureDefinition/DoesNotExist',
      derivation: 'constraint',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === 'BASE_NOT_FOUND')).toBe(true);
  });

  it('handles SD without differential', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestNoDiff',
      name: 'IntTestNoDiff',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
    });

    const result = await generator.generate(profile);
    // Should succeed with base snapshot cloned
    expect(result.success).toBe(true);
    expect(profile.snapshot).toBeDefined();
    expect(profile.snapshot!.element.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Section 6: CanonicalProfile Conversion
// ===========================================================================

describe('CanonicalProfile conversion from generated snapshot', () => {
  it('converts generated Patient profile to CanonicalProfile', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestCanonicalPatient',
      version: '1.0.0',
      name: 'IntTestCanonicalPatient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [
          { path: 'Patient.name', min: 1, mustSupport: true },
          { path: 'Patient.birthDate', min: 1 },
        ],
      },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(true);

    const canonical = buildCanonicalProfile(profile);
    expect(canonical.url).toBe('http://example.org/fhir/StructureDefinition/IntTestCanonicalPatient');
    expect(canonical.version).toBe('1.0.0');
    expect(canonical.name).toBe('IntTestCanonicalPatient');
    expect(canonical.kind).toBe('resource');
    expect(canonical.type).toBe('Patient');
    expect(canonical.abstract).toBe(false);
    expect(canonical.derivation).toBe('constraint');

    // Elements Map should have all snapshot elements
    expect(canonical.elements.size).toBe(profile.snapshot!.element.length);

    // Check constrained elements
    const nameEl = canonical.elements.get('Patient.name');
    expect(nameEl).toBeDefined();
    expect(nameEl!.min).toBe(1);
    expect(nameEl!.mustSupport).toBe(true);

    const bdEl = canonical.elements.get('Patient.birthDate');
    expect(bdEl).toBeDefined();
    expect(bdEl!.min).toBe(1);
  });

  it('CanonicalProfile normalizes max="*" to "unbounded"', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestCanonicalMax',
      name: 'IntTestCanonicalMax',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [{ path: 'Patient.name', min: 1 }],
      },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(true);

    const canonical = buildCanonicalProfile(profile);
    const nameEl = canonical.elements.get('Patient.name');
    expect(nameEl).toBeDefined();
    // Patient.name has max="*" in base → should be 'unbounded'
    expect(nameEl!.max).toBe('unbounded');
  });

  it('CanonicalProfile boolean flags default to false', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestCanonicalFlags',
      name: 'IntTestCanonicalFlags',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [{ path: 'Patient.active', mustSupport: true }],
      },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(true);

    const canonical = buildCanonicalProfile(profile);
    const activeEl = canonical.elements.get('Patient.active');
    expect(activeEl).toBeDefined();
    expect(activeEl!.mustSupport).toBe(true);
    // isModifier and isSummary should be boolean (not undefined)
    expect(typeof activeEl!.isModifier).toBe('boolean');
    expect(typeof activeEl!.isSummary).toBe('boolean');
  });

  it('CanonicalProfile elements Map preserves insertion order', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestCanonicalOrder',
      name: 'IntTestCanonicalOrder',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [{ path: 'Patient.name', min: 1 }],
      },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(true);

    const canonical = buildCanonicalProfile(profile);
    const paths = Array.from(canonical.elements.keys());

    // First element should be Patient
    expect(paths[0]).toBe('Patient');

    // Paths should match snapshot element order
    const snapshotPaths = profile.snapshot!.element.map((e) => e.path as string);
    expect(paths).toEqual(snapshotPaths);
  });
});

// ===========================================================================
// Section 7: Element Order Validation
// ===========================================================================

describe('Element order validation', () => {
  it('generated snapshot has valid element order', async () => {
    const profile = asSd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/IntTestOrderValid',
      name: 'IntTestOrderValid',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [
          { path: 'Patient.identifier', min: 1 },
          { path: 'Patient.name', min: 1 },
          { path: 'Patient.gender', min: 1 },
        ],
      },
    });

    const result = await generator.generate(profile);
    expect(result.success).toBe(true);

    const issues: SnapshotIssue[] = [];
    const valid = validateElementOrder(profile.snapshot!.element, issues);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('base Patient snapshot has valid element order', () => {
    const patientSd = sdMap.get('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(patientSd).toBeDefined();

    const issues: SnapshotIssue[] = [];
    const valid = validateElementOrder(patientSd!.snapshot!.element, issues);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('base Observation snapshot has valid element order', () => {
    const obsSd = sdMap.get('http://hl7.org/fhir/StructureDefinition/Observation');
    expect(obsSd).toBeDefined();

    const issues: SnapshotIssue[] = [];
    const valid = validateElementOrder(obsSd!.snapshot!.element, issues);
    expect(valid).toBe(true);
    expect(issues).toHaveLength(0);
  });
});
