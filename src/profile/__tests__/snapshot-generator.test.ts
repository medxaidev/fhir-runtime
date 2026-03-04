/**
 * snapshot-generator.test.ts — Unit tests for the SnapshotGenerator orchestrator.
 *
 * Covers:
 * - Input validation (missing url, missing baseDefinition, root types)
 * - Base loading (found, not found, missing snapshot → recursive generation)
 * - Circular dependency detection (self-ref, A→B→A, stack cleanup)
 * - End-to-end generation (simple profiles, multi-level inheritance)
 * - Post-processing (element IDs, unconsumed diff, caching, base immutability)
 *
 * Fixture-based tests across 5 categories (25 JSON fixtures).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { StructureDefinition, ElementDefinition } from '../../model/index.js';
import type { FhirContext } from '../../context/types.js';
import { SnapshotGenerator } from '../snapshot-generator.js';
import {
  SnapshotCircularDependencyError,
  BaseNotFoundError,
  UnconsumedDifferentialError,
} from '../errors.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

function loadFixture(category: string, name: string): Record<string, unknown> {
  const filePath = resolve(FIXTURES_DIR, category, `${name}.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/** Cast a plain object to StructureDefinition. */
function sd(obj: Record<string, unknown>): StructureDefinition {
  return obj as unknown as StructureDefinition;
}

/** Find element by path in snapshot. */
function findByPath(elements: ElementDefinition[], path: string): ElementDefinition | undefined {
  return elements.find((e) => (e.path as string) === path);
}

/**
 * Create a mock FhirContext that resolves SDs from a map.
 */
function createMockContext(sdMap: Map<string, StructureDefinition>): FhirContext {
  return {
    loadStructureDefinition: vi.fn(async (url: string) => {
      const found = sdMap.get(url);
      if (!found) throw new Error(`Not found: ${url}`);
      return found;
    }),
    getStructureDefinition: vi.fn((url: string) => sdMap.get(url)),
    hasStructureDefinition: vi.fn((url: string) => sdMap.has(url)),
    resolveInheritanceChain: vi.fn(async () => []),
    registerStructureDefinition: vi.fn((registeredSd: StructureDefinition) => {
      sdMap.set(registeredSd.url as string, registeredSd);
    }),
    preloadCoreDefinitions: vi.fn(async () => {}),
    getStatistics: vi.fn(() => ({
      registeredDefinitions: sdMap.size,
      loadedFromLoaders: 0,
      cacheHits: 0,
      cacheMisses: 0,
      resolvedChains: 0,
    })),
    dispose: vi.fn(),
  } as unknown as FhirContext;
}

// ===========================================================================
// Section 1: Input Validation
// ===========================================================================

describe('Input validation', () => {
  it('rejects SD with missing url', async () => {
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);
    const badSd = sd({
      resourceType: 'StructureDefinition',
      name: 'NoUrl',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
    });
    const result = await gen.generate(badSd);
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === 'INTERNAL_ERROR')).toBe(true);
  });

  it('rejects non-root SD with missing baseDefinition', async () => {
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);
    const badSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/NoBase',
      name: 'NoBase',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
    });
    const result = await gen.generate(badSd);
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === 'BASE_NOT_FOUND')).toBe(true);
  });

  it('accepts root type Element without baseDefinition', async () => {
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);
    const rootSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Element',
      name: 'Element',
      status: 'active',
      kind: 'complex-type',
      abstract: true,
      type: 'Element',
      differential: { element: [] },
    });
    // Root type with no baseDefinition should not produce BASE_NOT_FOUND
    const result = await gen.generate(rootSd);
    const baseErrors = result.issues.filter((i) => i.code === 'BASE_NOT_FOUND');
    expect(baseErrors).toHaveLength(0);
  });

  it('accepts root type Resource without baseDefinition', async () => {
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);
    const rootSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Resource',
      name: 'Resource',
      status: 'active',
      kind: 'resource',
      abstract: true,
      type: 'Resource',
      differential: { element: [] },
    });
    const result = await gen.generate(rootSd);
    const baseErrors = result.issues.filter((i) => i.code === 'BASE_NOT_FOUND');
    expect(baseErrors).toHaveLength(0);
  });
});

// ===========================================================================
// Section 2: Base Loading
// ===========================================================================

describe('Base loading', () => {
  it('loads base SD and generates snapshot', async () => {
    const baseSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { path: 'Patient', min: 0, max: '*' },
          { path: 'Patient.id', min: 0, max: '1' },
          { path: 'Patient.name', min: 0, max: '*' },
        ],
      },
    });
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/MyPatient',
      name: 'MyPatient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSd.url as string, baseSd);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    const result = await gen.generate(profileSd);
    expect(result.success).toBe(true);
    expect(profileSd.snapshot?.element).toHaveLength(3);
    expect(findByPath(profileSd.snapshot!.element, 'Patient.name')?.min).toBe(1);
  });

  it('reports error when base SD not found', async () => {
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/MyProfile',
      name: 'MyProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/NonExistent',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });

    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);

    const result = await gen.generate(profileSd);
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === 'BASE_NOT_FOUND')).toBe(true);
  });

  it('throws BaseNotFoundError in throwOnError mode', async () => {
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/ThrowProfile',
      name: 'ThrowProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/NonExistent',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });

    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx, { throwOnError: true });

    await expect(gen.generate(profileSd)).rejects.toThrow(BaseNotFoundError);
  });

  it('recursively generates base snapshot when missing', async () => {
    const grandBase = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { path: 'Patient', min: 0, max: '*' },
          { path: 'Patient.name', min: 0, max: '*' },
        ],
      },
    });
    const baseSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/BaseProfile',
      name: 'BaseProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });
    const derivedSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/DerivedProfile',
      name: 'DerivedProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/BaseProfile',
      differential: { element: [{ path: 'Patient.name', short: 'Required name' }] },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(grandBase.url as string, grandBase);
    sdMap.set(baseSd.url as string, baseSd);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    const result = await gen.generate(derivedSd);
    expect(result.success).toBe(true);
    const nameEl = findByPath(derivedSd.snapshot!.element, 'Patient.name');
    expect(nameEl?.min).toBe(1);
    expect(nameEl?.short).toBe('Required name');
  });

  it('clones base snapshot when differential is empty', async () => {
    const baseSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { path: 'Patient', min: 0, max: '*' },
          { path: 'Patient.id', min: 0, max: '1' },
          { path: 'Patient.name', min: 0, max: '*' },
        ],
      },
    });
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/EmptyDiff',
      name: 'EmptyDiff',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: { element: [] },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSd.url as string, baseSd);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    const result = await gen.generate(profileSd);
    expect(result.success).toBe(true);
    expect(profileSd.snapshot?.element).toHaveLength(3);
  });
});

// ===========================================================================
// Section 3: Circular Dependency Detection
// ===========================================================================

describe('Circular dependency detection', () => {
  it('detects self-reference', async () => {
    const selfRef = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/SelfRef',
      name: 'SelfRef',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/SelfRef',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(selfRef.url as string, selfRef);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    await expect(gen.generate(selfRef)).rejects.toThrow(SnapshotCircularDependencyError);
  });

  it('detects A→B→A cycle', async () => {
    const sdA = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/ProfileA',
      name: 'ProfileA',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/ProfileB',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });
    const sdB = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/ProfileB',
      name: 'ProfileB',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/ProfileA',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(sdA.url as string, sdA);
    sdMap.set(sdB.url as string, sdB);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    await expect(gen.generate(sdA)).rejects.toThrow(SnapshotCircularDependencyError);
  });

  it('cleans up generation stack after error', async () => {
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/StackCleanup',
      name: 'StackCleanup',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/NonExistent',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });

    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);

    // First call fails (base not found)
    await gen.generate(profileSd);
    // Second call should NOT throw circular dependency
    const result = await gen.generate(profileSd);
    expect(result.success).toBe(false);
    // Should be BASE_NOT_FOUND, not CIRCULAR_DEPENDENCY
    expect(result.issues.some((i) => i.code === 'BASE_NOT_FOUND')).toBe(true);
  });

  it('does not falsely detect cycle in valid chain', async () => {
    const patientSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { path: 'Patient', min: 0, max: '*' },
          { path: 'Patient.name', min: 0, max: '*' },
        ],
      },
    });
    const profileB = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/ProfileB',
      name: 'ProfileB',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });
    const profileA = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/ProfileA',
      name: 'ProfileA',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/ProfileB',
      differential: { element: [{ path: 'Patient.name', short: 'Required name' }] },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(patientSd.url as string, patientSd);
    sdMap.set(profileB.url as string, profileB);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    const result = await gen.generate(profileA);
    expect(result.success).toBe(true);
  });

  it('clears snapshot on circular dependency throw', async () => {
    const selfRef = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/ClearSnapshot',
      name: 'ClearSnapshot',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/ClearSnapshot',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(selfRef.url as string, selfRef);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    try {
      await gen.generate(selfRef);
    } catch {
      // expected
    }
    expect(selfRef.snapshot).toBeUndefined();
  });
});

// ===========================================================================
// Section 4: End-to-End Generation
// ===========================================================================

describe('End-to-end generation', () => {
  it('generates snapshot with cardinality + mustSupport', async () => {
    const baseSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { path: 'Patient', min: 0, max: '*' },
          { path: 'Patient.id', min: 0, max: '1' },
          { path: 'Patient.identifier', min: 0, max: '*' },
          { path: 'Patient.name', min: 0, max: '*' },
          { path: 'Patient.birthDate', min: 0, max: '1' },
        ],
      },
    });
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/SimpleProfile',
      name: 'SimpleProfile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: {
        element: [
          { path: 'Patient.identifier', min: 1, mustSupport: true },
          { path: 'Patient.name', min: 1, mustSupport: true },
        ],
      },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSd.url as string, baseSd);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    const result = await gen.generate(profileSd);
    expect(result.success).toBe(true);
    expect(profileSd.snapshot?.element).toHaveLength(5);
    expect(findByPath(profileSd.snapshot!.element, 'Patient.identifier')?.min).toBe(1);
    expect(findByPath(profileSd.snapshot!.element, 'Patient.identifier')?.mustSupport).toBe(true);
    expect(findByPath(profileSd.snapshot!.element, 'Patient.name')?.min).toBe(1);
    expect(findByPath(profileSd.snapshot!.element, 'Patient.birthDate')?.min).toBe(0);
  });

  it('generates snapshot with documentation overrides', async () => {
    const baseSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Observation',
      name: 'Observation',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Observation',
      snapshot: {
        element: [
          { path: 'Observation', min: 0, max: '*' },
          { path: 'Observation.status', min: 1, max: '1', short: 'Status' },
          { path: 'Observation.code', min: 1, max: '1', short: 'Type of observation' },
          { path: 'Observation.subject', min: 0, max: '1' },
        ],
      },
    });
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/VitalSign',
      name: 'VitalSign',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Observation',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Observation',
      differential: {
        element: [
          { path: 'Observation.code', short: 'Vital sign code', definition: 'Must be a vital sign LOINC code' },
          { path: 'Observation.subject', min: 1, short: 'Patient reference' },
        ],
      },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSd.url as string, baseSd);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    const result = await gen.generate(profileSd);
    expect(result.success).toBe(true);
    expect(findByPath(profileSd.snapshot!.element, 'Observation.code')?.short).toBe('Vital sign code');
    expect(findByPath(profileSd.snapshot!.element, 'Observation.subject')?.min).toBe(1);
    expect(findByPath(profileSd.snapshot!.element, 'Observation.status')?.short).toBe('Status');
  });

  it('handles multi-level inheritance', async () => {
    const patientSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { path: 'Patient', min: 0, max: '*' },
          { path: 'Patient.identifier', min: 0, max: '*' },
          { path: 'Patient.name', min: 0, max: '*' },
          { path: 'Patient.birthDate', min: 0, max: '1' },
        ],
      },
    });
    const baseSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/BasePatient',
      name: 'BasePatient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: {
        element: [
          { path: 'Patient.identifier', min: 1 },
          { path: 'Patient.name', min: 1 },
        ],
      },
    });
    const derivedSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/DerivedPatient',
      name: 'DerivedPatient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://example.org/BasePatient',
      differential: {
        element: [{ path: 'Patient.birthDate', min: 1, mustSupport: true }],
      },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(patientSd.url as string, patientSd);
    sdMap.set(baseSd.url as string, baseSd);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    const result = await gen.generate(derivedSd);
    expect(result.success).toBe(true);
    expect(findByPath(derivedSd.snapshot!.element, 'Patient.identifier')?.min).toBe(1);
    expect(findByPath(derivedSd.snapshot!.element, 'Patient.name')?.min).toBe(1);
    expect(findByPath(derivedSd.snapshot!.element, 'Patient.birthDate')?.min).toBe(1);
    expect(findByPath(derivedSd.snapshot!.element, 'Patient.birthDate')?.mustSupport).toBe(true);
  });

  it('handles no differential property at all', async () => {
    const baseSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { path: 'Patient', min: 0, max: '*' },
          { path: 'Patient.name', min: 0, max: '*' },
        ],
      },
    });
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/NoDiff',
      name: 'NoDiff',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSd.url as string, baseSd);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    const result = await gen.generate(profileSd);
    expect(result.success).toBe(true);
    expect(profileSd.snapshot?.element).toHaveLength(2);
  });

  it('generates snapshot with fixed value', async () => {
    const baseSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Observation',
      name: 'Observation',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Observation',
      snapshot: {
        element: [
          { path: 'Observation', min: 0, max: '*' },
          { path: 'Observation.status', min: 1, max: '1' },
          { path: 'Observation.code', min: 1, max: '1' },
        ],
      },
    });
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/FixedStatus',
      name: 'FixedStatus',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Observation',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Observation',
      differential: {
        element: [{ path: 'Observation.status', fixed: 'final' }],
      },
    });

    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSd.url as string, baseSd);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);

    const result = await gen.generate(profileSd);
    expect(result.success).toBe(true);
    expect(findByPath(profileSd.snapshot!.element, 'Observation.status')?.fixed).toBe('final');
  });
});

// ===========================================================================
// Section 5: Post-processing
// ===========================================================================

describe('Post-processing', () => {
  let baseSd: StructureDefinition;
  let sdMap: Map<string, StructureDefinition>;

  beforeEach(() => {
    baseSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: {
        element: [
          { path: 'Patient', min: 0, max: '*' },
          { path: 'Patient.name', min: 0, max: '*', short: 'Original' },
        ],
      },
    });
    sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSd.url as string, baseSd);
  });

  it('generates element IDs for all elements', async () => {
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/IdTest',
      name: 'IdTest',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });

    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const result = await gen.generate(profileSd);
    expect(result.success).toBe(true);
    for (const el of profileSd.snapshot!.element) {
      expect(el.id).toBeDefined();
    }
  });

  it('reports unconsumed diff as warning', async () => {
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/UnconsumedTest',
      name: 'UnconsumedTest',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: {
        element: [
          { path: 'Patient.name', min: 1 },
          { path: 'Patient.nonExistent', min: 1 },
        ],
      },
    });

    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const result = await gen.generate(profileSd);
    const unconsumed = result.issues.filter((i) => i.code === 'DIFFERENTIAL_NOT_CONSUMED');
    expect(unconsumed.length).toBeGreaterThan(0);
    expect(unconsumed.some((i) => i.path === 'Patient.nonExistent')).toBe(true);
  });

  it('throws UnconsumedDifferentialError in throwOnError mode', async () => {
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/ThrowUnconsumed',
      name: 'ThrowUnconsumed',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: {
        element: [{ path: 'Patient.nonExistent', min: 1 }],
      },
    });

    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx, { throwOnError: true });
    await expect(gen.generate(profileSd)).rejects.toThrow(UnconsumedDifferentialError);
  });

  it('caches generated SD back into context', async () => {
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/CacheTest',
      name: 'CacheTest',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: { element: [{ path: 'Patient.name', min: 1 }] },
    });

    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    await gen.generate(profileSd);
    expect(ctx.registerStructureDefinition).toHaveBeenCalled();
    // After caching, the SD should be in the map
    expect(sdMap.has('http://example.org/CacheTest')).toBe(true);
  });

  it('does not mutate base SD snapshot', async () => {
    const profileSd = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/NoMutate',
      name: 'NoMutate',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      differential: { element: [{ path: 'Patient.name', min: 1, short: 'Modified' }] },
    });

    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    await gen.generate(profileSd);
    // Base should be unchanged
    const baseName = findByPath(baseSd.snapshot!.element, 'Patient.name');
    expect(baseName?.short).toBe('Original');
  });
});

// ===========================================================================
// Section 6: Fixture-based tests — 11-input-validation
// ===========================================================================

describe('Fixture: 11-input-validation', () => {
  it('missing-url', async () => {
    const fixture = loadFixture('11-input-validation', 'missing-url');
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);
    const result = await gen.generate(sd(fixture.sd as Record<string, unknown>));
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === (fixture.expected as any).errorCode)).toBe(true);
  });

  it('missing-base-definition', async () => {
    const fixture = loadFixture('11-input-validation', 'missing-base-definition');
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);
    const result = await gen.generate(sd(fixture.sd as Record<string, unknown>));
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === (fixture.expected as any).errorCode)).toBe(true);
  });

  it('root-type-element', async () => {
    const fixture = loadFixture('11-input-validation', 'root-type-element');
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);
    const result = await gen.generate(sd(fixture.sd as Record<string, unknown>));
    const baseErrors = result.issues.filter((i) => i.code === 'BASE_NOT_FOUND');
    expect(baseErrors).toHaveLength(0);
  });

  it('root-type-resource', async () => {
    const fixture = loadFixture('11-input-validation', 'root-type-resource');
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);
    const result = await gen.generate(sd(fixture.sd as Record<string, unknown>));
    const baseErrors = result.issues.filter((i) => i.code === 'BASE_NOT_FOUND');
    expect(baseErrors).toHaveLength(0);
  });

  it('valid-minimal-profile', async () => {
    const fixture = loadFixture('11-input-validation', 'valid-minimal-profile');
    const fixtureSd = sd(fixture.sd as Record<string, unknown>);
    // Provide a base so it doesn't fail on loading
    const baseSdObj = sd({
      resourceType: 'StructureDefinition',
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient', status: 'active', kind: 'resource', abstract: false, type: 'Patient',
      snapshot: { element: [{ path: 'Patient', min: 0, max: '*' }, { path: 'Patient.name', min: 0, max: '*' }] },
    });
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSdObj.url as string, baseSdObj);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const result = await gen.generate(fixtureSd);
    expect(result.success).toBe(true);
  });
});

// ===========================================================================
// Section 7: Fixture-based tests — 12-base-loading
// ===========================================================================

describe('Fixture: 12-base-loading', () => {
  it('base-not-found', async () => {
    const fixture = loadFixture('12-base-loading', 'base-not-found');
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);
    const result = await gen.generate(sd(fixture.sd as Record<string, unknown>));
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === (fixture.expected as any).errorCode)).toBe(true);
  });

  it('base-has-snapshot', async () => {
    const fixture = loadFixture('12-base-loading', 'base-has-snapshot');
    const expected = fixture.expected as any;
    const baseSdObj = sd(fixture.baseSd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSdObj.url as string, baseSdObj);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    const result = await gen.generate(profileSd);
    expect(result.success).toBe(expected.success);
    expect(profileSd.snapshot?.element).toHaveLength(expected.snapshotElementCount);
    expect(findByPath(profileSd.snapshot!.element, 'Patient.name')?.min).toBe(expected.nameMin);
  });

  it('base-missing-snapshot', async () => {
    const fixture = loadFixture('12-base-loading', 'base-missing-snapshot');
    const expected = fixture.expected as any;
    const grandBaseSdObj = sd(fixture.grandBaseSd as Record<string, unknown>);
    const baseSdObj = sd(fixture.baseSd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(grandBaseSdObj.url as string, grandBaseSdObj);
    sdMap.set(baseSdObj.url as string, baseSdObj);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    const result = await gen.generate(profileSd);
    expect(result.success).toBe(expected.success);
    const nameEl = findByPath(profileSd.snapshot!.element, 'Patient.name');
    expect(nameEl?.min).toBe(expected.nameMin);
    expect(nameEl?.short).toBe(expected.nameShort);
  });

  it('empty-differential', async () => {
    const fixture = loadFixture('12-base-loading', 'empty-differential');
    const expected = fixture.expected as any;
    const baseSdObj = sd(fixture.baseSd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSdObj.url as string, baseSdObj);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    const result = await gen.generate(profileSd);
    expect(result.success).toBe(expected.success);
    expect(profileSd.snapshot?.element).toHaveLength(expected.snapshotElementCount);
  });

  it('throw-on-error-base', async () => {
    const fixture = loadFixture('12-base-loading', 'throw-on-error-base');
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx, { throwOnError: true });
    await expect(gen.generate(sd(fixture.sd as Record<string, unknown>))).rejects.toThrow(BaseNotFoundError);
  });
});

// ===========================================================================
// Section 8: Fixture-based tests — 13-circular-dependency
// ===========================================================================

describe('Fixture: 13-circular-dependency', () => {
  it('self-reference', async () => {
    const fixture = loadFixture('13-circular-dependency', 'self-reference');
    const selfRefSd = sd(fixture.sd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(selfRefSd.url as string, selfRefSd);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    await expect(gen.generate(selfRefSd)).rejects.toThrow(SnapshotCircularDependencyError);
  });

  it('two-profile-cycle', async () => {
    const fixture = loadFixture('13-circular-dependency', 'two-profile-cycle');
    const sdA = sd(fixture.sdA as Record<string, unknown>);
    const sdB = sd(fixture.sdB as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(sdA.url as string, sdA);
    sdMap.set(sdB.url as string, sdB);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    await expect(gen.generate(sdA)).rejects.toThrow(SnapshotCircularDependencyError);
  });

  it('stack-cleanup-on-error', async () => {
    const fixture = loadFixture('13-circular-dependency', 'stack-cleanup-on-error');
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    const ctx = createMockContext(new Map());
    const gen = new SnapshotGenerator(ctx);
    await gen.generate(profileSd); // first call fails
    const result = await gen.generate(profileSd); // should not throw circular
    expect(result.issues.some((i) => i.code === 'BASE_NOT_FOUND')).toBe(true);
  });

  it('no-cycle-chain', async () => {
    const fixture = loadFixture('13-circular-dependency', 'no-cycle-chain');
    const patientSdObj = sd(fixture.patientSd as Record<string, unknown>);
    const sdBObj = sd(fixture.sdB as Record<string, unknown>);
    const sdAObj = sd(fixture.sdA as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(patientSdObj.url as string, patientSdObj);
    sdMap.set(sdBObj.url as string, sdBObj);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const result = await gen.generate(sdAObj);
    expect(result.success).toBe(true);
    const expected = fixture.expected as any;
    const nameEl = findByPath(sdAObj.snapshot!.element, 'Patient.name');
    expect(nameEl?.min).toBe(expected.nameMin);
    expect(nameEl?.short).toBe(expected.nameShort);
  });

  it('snapshot-cleared-on-throw', async () => {
    const fixture = loadFixture('13-circular-dependency', 'snapshot-cleared-on-throw');
    const selfRefSd = sd(fixture.sd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(selfRefSd.url as string, selfRefSd);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    try { await gen.generate(selfRefSd); } catch { /* expected */ }
    expect(selfRefSd.snapshot).toBeUndefined();
  });
});

// ===========================================================================
// Section 9: Fixture-based tests — 14-end-to-end
// ===========================================================================

describe('Fixture: 14-end-to-end', () => {
  it('simple-constraint-profile', async () => {
    const fixture = loadFixture('14-end-to-end', 'simple-constraint-profile');
    const expected = fixture.expected as any;
    const baseSdObj = sd(fixture.baseSd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSdObj.url as string, baseSdObj);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    const result = await gen.generate(profileSd);
    expect(result.success).toBe(expected.success);
    expect(profileSd.snapshot?.element).toHaveLength(expected.snapshotElementCount);
    expect(findByPath(profileSd.snapshot!.element, 'Patient.identifier')?.min).toBe(expected.identifierMin);
    expect(findByPath(profileSd.snapshot!.element, 'Patient.identifier')?.mustSupport).toBe(expected.identifierMustSupport);
    expect(findByPath(profileSd.snapshot!.element, 'Patient.name')?.min).toBe(expected.nameMin);
    expect(findByPath(profileSd.snapshot!.element, 'Patient.birthDate')?.min).toBe(expected.birthDateMin);
  });

  it('documentation-override', async () => {
    const fixture = loadFixture('14-end-to-end', 'documentation-override');
    const expected = fixture.expected as any;
    const baseSdObj = sd(fixture.baseSd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSdObj.url as string, baseSdObj);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    const result = await gen.generate(profileSd);
    expect(result.success).toBe(expected.success);
    expect(findByPath(profileSd.snapshot!.element, 'Observation.code')?.short).toBe(expected.codeShort);
    expect(findByPath(profileSd.snapshot!.element, 'Observation.subject')?.min).toBe(expected.subjectMin);
    expect(findByPath(profileSd.snapshot!.element, 'Observation.status')?.short).toBe(expected.statusShort);
  });

  it('multi-level-inheritance', async () => {
    const fixture = loadFixture('14-end-to-end', 'multi-level-inheritance');
    const expected = fixture.expected as any;
    const patientSdObj = sd(fixture.patientSd as Record<string, unknown>);
    const baseSdObj = sd(fixture.baseSd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(patientSdObj.url as string, patientSdObj);
    sdMap.set(baseSdObj.url as string, baseSdObj);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const derivedSdObj = sd(fixture.sd as Record<string, unknown>);
    const result = await gen.generate(derivedSdObj);
    expect(result.success).toBe(expected.success);
    expect(findByPath(derivedSdObj.snapshot!.element, 'Patient.identifier')?.min).toBe(expected.identifierMin);
    expect(findByPath(derivedSdObj.snapshot!.element, 'Patient.name')?.min).toBe(expected.nameMin);
    expect(findByPath(derivedSdObj.snapshot!.element, 'Patient.birthDate')?.min).toBe(expected.birthDateMin);
    expect(findByPath(derivedSdObj.snapshot!.element, 'Patient.birthDate')?.mustSupport).toBe(expected.birthDateMustSupport);
  });

  it('no-diff-elements', async () => {
    const fixture = loadFixture('14-end-to-end', 'no-diff-elements');
    const expected = fixture.expected as any;
    const baseSdObj = sd(fixture.baseSd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSdObj.url as string, baseSdObj);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    const result = await gen.generate(profileSd);
    expect(result.success).toBe(expected.success);
    expect(profileSd.snapshot?.element).toHaveLength(expected.snapshotElementCount);
  });

  it('fixed-value-profile', async () => {
    const fixture = loadFixture('14-end-to-end', 'fixed-value-profile');
    const expected = fixture.expected as any;
    const baseSdObj = sd(fixture.baseSd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSdObj.url as string, baseSdObj);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    const result = await gen.generate(profileSd);
    expect(result.success).toBe(expected.success);
    expect(findByPath(profileSd.snapshot!.element, 'Observation.status')?.fixed).toBe(expected.statusFixed);
  });
});

// ===========================================================================
// Section 10: Fixture-based tests — 15-post-processing
// ===========================================================================

describe('Fixture: 15-post-processing', () => {
  function setupBase(fixture: Record<string, unknown>) {
    const baseSdObj = sd(fixture.baseSd as Record<string, unknown>);
    const sdMap = new Map<string, StructureDefinition>();
    sdMap.set(baseSdObj.url as string, baseSdObj);
    return { baseSdObj, sdMap };
  }

  it('element-ids-generated', async () => {
    const fixture = loadFixture('15-post-processing', 'element-ids-generated');
    const { sdMap } = setupBase(fixture);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    const result = await gen.generate(profileSd);
    expect(result.success).toBe(true);
    for (const el of profileSd.snapshot!.element) {
      expect(el.id).toBeDefined();
    }
  });

  it('unconsumed-diff-warning', async () => {
    const fixture = loadFixture('15-post-processing', 'unconsumed-diff-warning');
    const expected = fixture.expected as any;
    const { sdMap } = setupBase(fixture);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    const result = await gen.generate(profileSd);
    const unconsumed = result.issues.filter((i) => i.code === 'DIFFERENTIAL_NOT_CONSUMED');
    expect(unconsumed.length).toBeGreaterThan(0);
    expect(unconsumed.some((i) => i.path === expected.unconsumedPath)).toBe(true);
  });

  it('throw-on-unconsumed', async () => {
    const fixture = loadFixture('15-post-processing', 'throw-on-unconsumed');
    const { sdMap } = setupBase(fixture);
    const ctx = createMockContext(sdMap);
    const options = fixture.options as Record<string, unknown>;
    const gen = new SnapshotGenerator(ctx, options);
    await expect(gen.generate(sd(fixture.sd as Record<string, unknown>))).rejects.toThrow(UnconsumedDifferentialError);
  });

  it('cached-in-context', async () => {
    const fixture = loadFixture('15-post-processing', 'cached-in-context');
    const { sdMap } = setupBase(fixture);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    await gen.generate(profileSd);
    expect(ctx.registerStructureDefinition).toHaveBeenCalled();
    expect(sdMap.has(profileSd.url as string)).toBe(true);
  });

  it('base-not-mutated', async () => {
    const fixture = loadFixture('15-post-processing', 'base-not-mutated');
    const { baseSdObj, sdMap } = setupBase(fixture);
    const ctx = createMockContext(sdMap);
    const gen = new SnapshotGenerator(ctx);
    const profileSd = sd(fixture.sd as Record<string, unknown>);
    await gen.generate(profileSd);
    const baseName = findByPath(baseSdObj.snapshot!.element, 'Patient.name');
    expect(baseName?.short).toBe((fixture.expected as any).baseNameShortUnchanged);
  });
});
