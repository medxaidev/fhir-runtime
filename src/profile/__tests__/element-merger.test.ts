/**
 * element-merger.test.ts — Unit tests for fhir-profile core merge loop.
 *
 * Covers all four branches of processPaths:
 * - Branch A: No diff match — inherit base as-is
 * - Branch B: Single diff match — merge constraints
 * - Branch C: Type slicing — multiple diffs constrain different types
 * - Branch D: Explicit slicing — multiple diffs with sliceNames
 *
 * Plus: datatype expansion, choice type narrowing, recursion depth guard,
 * diff consumed tracking, unconsumed diff warnings, and base traceability.
 *
 * Fixture-based tests across 5 categories (25 JSON fixtures).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementDefinition } from '../../model/index.js';
import type { SnapshotIssue } from '../types.js';
import { createDiffTracker } from '../types.js';
import {
  mergeSnapshot,
  processPaths,
  createMergeContext,
} from '../element-merger.js';
import type { MergeContext } from '../element-merger.js';

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

/** Cast plain objects to ElementDefinition[]. */
function eds(arr: Record<string, unknown>[]): ElementDefinition[] {
  return arr as unknown as ElementDefinition[];
}

/** Find element by path in result. */
function findByPath(elements: ElementDefinition[], path: string): ElementDefinition | undefined {
  return elements.find((e) => (e.path as string) === path);
}

/** Create a MergeContext with optional datatype cache from fixture. */
function ctxFromFixture(fixture: Record<string, unknown>): MergeContext {
  const ctx = createMergeContext('http://test.org/profile');
  const dtCache = fixture.datatypeCache as Record<string, Record<string, unknown>[]> | undefined;
  if (dtCache) {
    for (const [url, elements] of Object.entries(dtCache)) {
      ctx.datatypeCache.set(url, eds(elements));
    }
  }
  return ctx;
}

// ===========================================================================
// Section 1: mergeSnapshot — basic integration
// ===========================================================================

describe('mergeSnapshot', () => {
  it('returns base as-is when diff is empty', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.id', min: 0, max: '1' },
    ]);
    const { elements, issues } = mergeSnapshot(base, []);
    expect(elements).toHaveLength(2);
    expect(elements[0].path).toBe('Patient');
    expect(elements[1].path).toBe('Patient.id');
    expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('merges single diff element', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diff = eds([{ path: 'Patient.name', min: 1 }]);
    const { elements } = mergeSnapshot(base, diff);
    expect(elements).toHaveLength(2);
    expect(findByPath(elements, 'Patient.name')?.min).toBe(1);
  });

  it('preserves element order', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.id', min: 0, max: '1' },
      { path: 'Patient.name', min: 0, max: '*' },
      { path: 'Patient.birthDate', min: 0, max: '1' },
    ]);
    const diff = eds([{ path: 'Patient.birthDate', min: 1 }]);
    const { elements } = mergeSnapshot(base, diff);
    expect(elements.map((e) => e.path)).toEqual([
      'Patient', 'Patient.id', 'Patient.name', 'Patient.birthDate',
    ]);
  });

  it('sets base traceability on all elements', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.active', min: 0, max: '1' },
    ]);
    const { elements } = mergeSnapshot(base, []);
    expect(elements[1].base).toBeDefined();
    expect(elements[1].base!.path).toBe('Patient.active');
  });

  it('reports unconsumed diff elements as warnings', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diff = eds([{ path: 'Patient.nonExistent', min: 1 }]);
    const { issues } = mergeSnapshot(base, diff);
    const unconsumed = issues.filter((i) => i.code === 'DIFFERENTIAL_NOT_CONSUMED');
    expect(unconsumed.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Section 2: Branch A — No diff match (inherit base)
// ===========================================================================

describe('Branch A: inherit base as-is', () => {
  it('copies all base elements when diff is empty', () => {
    const base = eds([
      { path: 'Observation', min: 0, max: '*' },
      { path: 'Observation.status', min: 1, max: '1' },
      { path: 'Observation.code', min: 1, max: '1' },
    ]);
    const { elements } = mergeSnapshot(base, []);
    expect(elements).toHaveLength(3);
    expect(elements[1].min).toBe(1);
  });

  it('preserves base children when no diff', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
      { path: 'Patient.name.family', min: 0, max: '1' },
      { path: 'Patient.name.given', min: 0, max: '*' },
    ]);
    const { elements } = mergeSnapshot(base, []);
    expect(elements).toHaveLength(4);
    expect(elements.map((e) => e.path)).toEqual([
      'Patient', 'Patient.name', 'Patient.name.family', 'Patient.name.given',
    ]);
  });

  it('does not mutate original base elements', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*', short: 'Original' },
    ]);
    const diff = eds([{ path: 'Patient.name', short: 'Modified' }]);
    mergeSnapshot(base, diff);
    expect(base[1].short).toBe('Original'); // unchanged
  });
});

// ===========================================================================
// Section 3: Branch B — Single diff match
// ===========================================================================

describe('Branch B: single diff match', () => {
  it('merges cardinality constraint', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*' },
    ]);
    const diff = eds([{ path: 'Patient.identifier', min: 1 }]);
    const { elements } = mergeSnapshot(base, diff);
    expect(findByPath(elements, 'Patient.identifier')?.min).toBe(1);
  });

  it('merges documentation fields', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*', short: 'Old' },
    ]);
    const diff = eds([{ path: 'Patient.name', short: 'New', definition: 'Updated' }]);
    const { elements } = mergeSnapshot(base, diff);
    const name = findByPath(elements, 'Patient.name')!;
    expect(name.short).toBe('New');
    expect(name.definition).toBe('Updated');
  });

  it('merges mustSupport flag', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.birthDate', min: 0, max: '1' },
    ]);
    const diff = eds([{ path: 'Patient.birthDate', mustSupport: true }]);
    const { elements } = mergeSnapshot(base, diff);
    expect(findByPath(elements, 'Patient.birthDate')?.mustSupport).toBe(true);
  });

  it('merges fixed value', () => {
    const base = eds([
      { path: 'Observation', min: 0, max: '*' },
      { path: 'Observation.status', min: 1, max: '1' },
    ]);
    const diff = eds([{ path: 'Observation.status', fixed: 'final' }]);
    const { elements } = mergeSnapshot(base, diff);
    expect(findByPath(elements, 'Observation.status')?.fixed).toBe('final');
  });

  it('marks diff element as consumed', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diff = eds([{ path: 'Patient.name', min: 1 }]);
    const trackers = diff.map(createDiffTracker);
    const ctx = createMergeContext('http://test.org');
    const result: ElementDefinition[] = [];
    processPaths(ctx, result, base, 0, base.length - 1, trackers, 0, trackers.length - 1, 'Patient', 'Patient');
    expect(trackers[0].consumed).toBe(true);
  });

  it('handles multiple diff elements on different paths', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
      { path: 'Patient.birthDate', min: 0, max: '1' },
    ]);
    const diff = eds([
      { path: 'Patient.identifier', min: 1 },
      { path: 'Patient.name', min: 1 },
      { path: 'Patient.birthDate', mustSupport: true },
    ]);
    const { elements } = mergeSnapshot(base, diff);
    expect(findByPath(elements, 'Patient.identifier')?.min).toBe(1);
    expect(findByPath(elements, 'Patient.name')?.min).toBe(1);
    expect(findByPath(elements, 'Patient.birthDate')?.mustSupport).toBe(true);
  });
});

// ===========================================================================
// Section 4: Choice type narrowing
// ===========================================================================

describe('Choice type narrowing', () => {
  it('narrows value[x] to valueQuantity', () => {
    const base = eds([
      { path: 'Observation', min: 0, max: '*' },
      { path: 'Observation.value[x]', min: 0, max: '1', type: [{ code: 'Quantity' }, { code: 'string' }, { code: 'CodeableConcept' }] },
    ]);
    const diff = eds([{ path: 'Observation.valueQuantity', min: 1 }]);
    const { elements } = mergeSnapshot(base, diff);
    const val = elements[1];
    expect(val.min).toBe(1);
    expect(val.type).toHaveLength(1);
    expect(val.type![0].code).toBe('Quantity');
  });

  it('narrows value[x] to valueString', () => {
    const base = eds([
      { path: 'Observation', min: 0, max: '*' },
      { path: 'Observation.value[x]', min: 0, max: '1', type: [{ code: 'Quantity' }, { code: 'string' }] },
    ]);
    const diff = eds([{ path: 'Observation.valueString', short: 'Text' }]);
    const { elements } = mergeSnapshot(base, diff);
    expect(elements[1].type).toHaveLength(1);
    expect(elements[1].type![0].code).toBe('string');
    expect(elements[1].short).toBe('Text');
  });

  it('does not narrow when diff uses [x] path', () => {
    const base = eds([
      { path: 'Observation', min: 0, max: '*' },
      { path: 'Observation.value[x]', min: 0, max: '1', type: [{ code: 'Quantity' }, { code: 'string' }] },
    ]);
    const diff = eds([{ path: 'Observation.value[x]', min: 1 }]);
    const { elements } = mergeSnapshot(base, diff);
    expect(elements[1].type).toHaveLength(2);
    expect(elements[1].min).toBe(1);
  });

  it('narrows effective[x] to effectiveDateTime', () => {
    const base = eds([
      { path: 'Observation', min: 0, max: '*' },
      { path: 'Observation.effective[x]', min: 0, max: '1', type: [{ code: 'dateTime' }, { code: 'Period' }] },
    ]);
    const diff = eds([{ path: 'Observation.effectiveDateTime', min: 1 }]);
    const { elements } = mergeSnapshot(base, diff);
    expect(elements[1].type).toHaveLength(1);
    expect(elements[1].type![0].code).toBe('dateTime');
  });
});

// ===========================================================================
// Section 5: Datatype expansion
// ===========================================================================

describe('Datatype expansion', () => {
  it('expands Identifier children when diff constrains sub-elements', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*', type: [{ code: 'Identifier' }] },
    ]);
    const diff = eds([
      { path: 'Patient.identifier.system', min: 1, fixed: 'http://hospital.example.org/mrn' },
    ]);
    const ctx = createMergeContext('http://test.org');
    ctx.datatypeCache.set('http://hl7.org/fhir/StructureDefinition/Identifier', eds([
      { path: 'Identifier', min: 0, max: '*' },
      { path: 'Identifier.use', min: 0, max: '1' },
      { path: 'Identifier.system', min: 0, max: '1' },
      { path: 'Identifier.value', min: 0, max: '1' },
    ]));

    const { elements } = mergeSnapshot(base, diff, ctx);
    const system = findByPath(elements, 'Patient.identifier.system');
    expect(system).toBeDefined();
    expect(system!.min).toBe(1);
    expect(system!.fixed).toBe('http://hospital.example.org/mrn');
  });

  it('expands HumanName children', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*', type: [{ code: 'HumanName' }] },
    ]);
    const diff = eds([
      { path: 'Patient.name', min: 1 },
      { path: 'Patient.name.family', min: 1 },
    ]);
    const ctx = createMergeContext('http://test.org');
    ctx.datatypeCache.set('http://hl7.org/fhir/StructureDefinition/HumanName', eds([
      { path: 'HumanName', min: 0, max: '*' },
      { path: 'HumanName.use', min: 0, max: '1' },
      { path: 'HumanName.family', min: 0, max: '1' },
      { path: 'HumanName.given', min: 0, max: '*' },
    ]));

    const { elements } = mergeSnapshot(base, diff, ctx);
    expect(findByPath(elements, 'Patient.name')?.min).toBe(1);
    const family = findByPath(elements, 'Patient.name.family');
    expect(family).toBeDefined();
    expect(family!.min).toBe(1);
  });

  it('reports error when element has no type for expansion', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.extension', min: 0, max: '*' },
    ]);
    const diff = eds([{ path: 'Patient.extension.url', min: 1 }]);
    const ctx = createMergeContext('http://test.org');
    const { issues } = mergeSnapshot(base, diff, ctx);
    const errors = issues.filter((i) => i.code === 'INTERNAL_ERROR');
    expect(errors.length).toBeGreaterThan(0);
  });

  it('reports warning when datatype not in cache', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.contact', min: 0, max: '*', type: [{ code: 'BackboneElement' }] },
    ]);
    const diff = eds([{ path: 'Patient.contact.name', min: 1 }]);
    const ctx = createMergeContext('http://test.org');
    const { issues } = mergeSnapshot(base, diff, ctx);
    const warnings = issues.filter((i) => i.code === 'BASE_NOT_FOUND');
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('rewrites paths correctly during expansion', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*', type: [{ code: 'Identifier' }] },
    ]);
    const diff = eds([{ path: 'Patient.identifier.value', min: 1, short: 'MRN value' }]);
    const ctx = createMergeContext('http://test.org');
    ctx.datatypeCache.set('http://hl7.org/fhir/StructureDefinition/Identifier', eds([
      { path: 'Identifier', min: 0, max: '*' },
      { path: 'Identifier.system', min: 0, max: '1' },
      { path: 'Identifier.value', min: 0, max: '1' },
    ]));

    const { elements } = mergeSnapshot(base, diff, ctx);
    const val = findByPath(elements, 'Patient.identifier.value');
    expect(val).toBeDefined();
    expect(val!.path).toBe('Patient.identifier.value');
    expect(val!.min).toBe(1);
    expect(val!.short).toBe('MRN value');
  });
});

// ===========================================================================
// Section 6: Explicit slicing (Branch D)
// ===========================================================================

describe('Explicit slicing', () => {
  it('creates slicing root and slices', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*' },
    ]);
    const diff = eds([
      { path: 'Patient.identifier', slicing: { discriminator: [{ type: 'value', path: 'system' }], rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN', min: 1, max: '1' },
      { path: 'Patient.identifier', sliceName: 'SSN', min: 0, max: '1' },
    ]);
    const { elements } = mergeSnapshot(base, diff);

    // Should have: Patient, slicing root, MRN slice, SSN slice
    const identifiers = elements.filter((e) => (e.path as string) === 'Patient.identifier');
    expect(identifiers.length).toBeGreaterThanOrEqual(3);

    // Slicing root should have slicing info
    const root = identifiers[0];
    expect(root.slicing).toBeDefined();

    // Slices should have sliceNames
    const sliceNames = identifiers.filter((e) => e.sliceName).map((e) => e.sliceName);
    expect(sliceNames).toContain('MRN');
    expect(sliceNames).toContain('SSN');
  });

  it('creates single slice on extension', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.extension', min: 0, max: '*' },
    ]);
    const diff = eds([
      { path: 'Patient.extension', slicing: { discriminator: [{ type: 'value', path: 'url' }], rules: 'open' } },
      { path: 'Patient.extension', sliceName: 'birthPlace', min: 0, max: '1' },
    ]);
    const { elements } = mergeSnapshot(base, diff);
    const extensions = elements.filter((e) => (e.path as string) === 'Patient.extension');
    expect(extensions.length).toBeGreaterThanOrEqual(2);
    expect(extensions.some((e) => e.sliceName === 'birthPlace')).toBe(true);
  });
});

// ===========================================================================
// Section 7: Type slicing (Branch C)
// ===========================================================================

describe('Type slicing', () => {
  it('creates type slicing root for choice type with multiple concrete paths', () => {
    const base = eds([
      { path: 'Observation', min: 0, max: '*' },
      { path: 'Observation.value[x]', min: 0, max: '1', type: [{ code: 'Quantity' }, { code: 'string' }, { code: 'CodeableConcept' }] },
    ]);
    const diff = eds([
      { path: 'Observation.valueQuantity', short: 'Numeric' },
      { path: 'Observation.valueString', short: 'Text' },
    ]);
    const { elements } = mergeSnapshot(base, diff);

    // Should have slicing root + 2 type slices
    const valueElements = elements.filter((e) =>
      (e.path as string) === 'Observation.value[x]' ||
      (e.path as string)?.startsWith('Observation.value'),
    );
    expect(valueElements.length).toBeGreaterThanOrEqual(3);

    // Slicing root should have slicing info
    const root = valueElements[0];
    expect(root.slicing).toBeDefined();
  });
});

// ===========================================================================
// Section 8: Recursion depth guard
// ===========================================================================

describe('Recursion depth guard', () => {
  it('stops at max depth and records error', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const ctx = createMergeContext('http://test.org', { maxDepth: 0 });
    const result: ElementDefinition[] = [];
    const trackers = [createDiffTracker(eds([{ path: 'Patient.name', min: 1 }])[0])];
    processPaths(ctx, result, base, 0, base.length - 1, trackers, 0, 0, 'Patient', 'Patient');
    const depthErrors = ctx.issues.filter((i) => i.message.includes('recursion depth'));
    expect(depthErrors.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Section 9: Diff consumed tracking
// ===========================================================================

describe('Diff consumed tracking', () => {
  it('all diff elements consumed when they match base paths', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diff = eds([
      { path: 'Patient.identifier', min: 1 },
      { path: 'Patient.name', min: 1 },
    ]);
    const { issues } = mergeSnapshot(base, diff);
    const unconsumed = issues.filter((i) => i.code === 'DIFFERENTIAL_NOT_CONSUMED');
    expect(unconsumed).toHaveLength(0);
  });

  it('unconsumed diff produces warning', () => {
    const base = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diff = eds([{ path: 'Patient.nonExistent', min: 1 }]);
    const { issues } = mergeSnapshot(base, diff);
    const unconsumed = issues.filter((i) => i.code === 'DIFFERENTIAL_NOT_CONSUMED');
    expect(unconsumed.length).toBeGreaterThan(0);
  });
});

// ===========================================================================
// Section 10: Fixture-based tests — 06-inherit-base
// ===========================================================================

describe('Fixture: 06-inherit-base', () => {
  const fixtures = [
    'simple-inherit',
    'inherit-with-children',
    'partial-diff',
    'base-traceability',
    'empty-diff',
  ];

  for (const name of fixtures) {
    it(name, () => {
      const fixture = loadFixture('06-inherit-base', name);
      const base = eds(fixture.base as Record<string, unknown>[]);
      const diff = eds((fixture.diff as Record<string, unknown>[]) ?? []);
      const expected = fixture.expected as Record<string, unknown>;

      const { elements, issues } = mergeSnapshot(base, diff);

      if (expected.elementCount !== undefined) {
        expect(elements).toHaveLength(expected.elementCount as number);
      }
      if (expected.paths) {
        expect(elements.map((e) => e.path)).toEqual(expected.paths);
      }
      if (expected.nameMin !== undefined) {
        expect(findByPath(elements, 'Patient.name')?.min).toBe(expected.nameMin);
      }
      if (expected.nameShort !== undefined) {
        expect(findByPath(elements, 'Patient.name')?.short).toBe(expected.nameShort);
      }
      if (expected.birthDateMin !== undefined) {
        expect(findByPath(elements, 'Patient.birthDate')?.min).toBe(expected.birthDateMin);
      }
      if (expected.activeHasBase) {
        const active = findByPath(elements, 'Patient.active');
        expect(active?.base).toBeDefined();
        expect(active?.base?.path).toBe(expected.activeBasePath);
        expect(active?.base?.min).toBe(expected.activeBaseMin);
        expect(active?.base?.max).toBe(expected.activeBaseMax);
      }
    });
  }
});

// ===========================================================================
// Section 11: Fixture-based tests — 07-single-merge
// ===========================================================================

describe('Fixture: 07-single-merge', () => {
  const fixtures = [
    'tighten-cardinality',
    'overwrite-documentation',
    'set-must-support',
    'multiple-elements',
    'set-fixed-value',
  ];

  for (const name of fixtures) {
    it(name, () => {
      const fixture = loadFixture('07-single-merge', name);
      const base = eds(fixture.base as Record<string, unknown>[]);
      const diff = eds(fixture.diff as Record<string, unknown>[]);
      const expected = fixture.expected as Record<string, unknown>;

      const { elements, issues } = mergeSnapshot(base, diff);

      if (expected.elementCount !== undefined) {
        expect(elements).toHaveLength(expected.elementCount as number);
      }
      if (expected.identifierMin !== undefined) {
        expect(findByPath(elements, 'Patient.identifier')?.min).toBe(expected.identifierMin);
      }
      if (expected.identifierShort !== undefined) {
        expect(findByPath(elements, 'Patient.identifier')?.short).toBe(expected.identifierShort);
      }
      if (expected.nameShort !== undefined) {
        expect(findByPath(elements, 'Patient.name')?.short).toBe(expected.nameShort);
      }
      if (expected.nameDefinition !== undefined) {
        expect(findByPath(elements, 'Patient.name')?.definition).toBe(expected.nameDefinition);
      }
      if (expected.identifierMustSupport !== undefined) {
        expect(findByPath(elements, 'Patient.identifier')?.mustSupport).toBe(expected.identifierMustSupport);
      }
      if (expected.nameMustSupport !== undefined) {
        expect(findByPath(elements, 'Patient.name')?.mustSupport).toBe(expected.nameMustSupport);
      }
      if (expected.birthDateMustSupport !== undefined) {
        expect(findByPath(elements, 'Patient.birthDate')?.mustSupport).toBe(expected.birthDateMustSupport);
      }
      if (expected.codeShort !== undefined) {
        expect(findByPath(elements, 'Observation.code')?.short).toBe(expected.codeShort);
      }
      if (expected.subjectMin !== undefined) {
        expect(findByPath(elements, 'Observation.subject')?.min).toBe(expected.subjectMin);
      }
      if (expected.statusMin !== undefined) {
        expect(findByPath(elements, 'Observation.status')?.min).toBe(expected.statusMin);
      }
      if (expected.statusFixed !== undefined) {
        expect(findByPath(elements, 'Observation.status')?.fixed).toBe(expected.statusFixed);
      }
      if (expected.issueCount !== undefined) {
        expect(issues.filter((i) => i.severity === 'error')).toHaveLength(expected.issueCount as number);
      }
    });
  }
});

// ===========================================================================
// Section 12: Fixture-based tests — 08-datatype-expansion
// ===========================================================================

describe('Fixture: 08-datatype-expansion', () => {
  it('identifier-system', () => {
    const fixture = loadFixture('08-datatype-expansion', 'identifier-system');
    const base = eds(fixture.base as Record<string, unknown>[]);
    const diff = eds(fixture.diff as Record<string, unknown>[]);
    const expected = fixture.expected as Record<string, unknown>;
    const ctx = ctxFromFixture(fixture);

    const { elements } = mergeSnapshot(base, diff, ctx);
    const system = findByPath(elements, 'Patient.identifier.system');
    expect(!!system).toBe(expected.hasSystemElement);
    if (system) {
      expect(system.min).toBe(expected.systemMin);
      expect(system.fixed).toBe(expected.systemFixed);
    }
  });

  it('humanname-family', () => {
    const fixture = loadFixture('08-datatype-expansion', 'humanname-family');
    const base = eds(fixture.base as Record<string, unknown>[]);
    const diff = eds(fixture.diff as Record<string, unknown>[]);
    const expected = fixture.expected as Record<string, unknown>;
    const ctx = ctxFromFixture(fixture);

    const { elements } = mergeSnapshot(base, diff, ctx);
    expect(findByPath(elements, 'Patient.name')?.min).toBe(expected.nameMin);
    const family = findByPath(elements, 'Patient.name.family');
    expect(!!family).toBe(expected.hasFamilyElement);
    if (family) expect(family.min).toBe(expected.familyMin);
  });

  it('no-type-error', () => {
    const fixture = loadFixture('08-datatype-expansion', 'no-type-error');
    const base = eds(fixture.base as Record<string, unknown>[]);
    const diff = eds(fixture.diff as Record<string, unknown>[]);
    const expected = fixture.expected as Record<string, unknown>;
    const ctx = ctxFromFixture(fixture);

    const { issues } = mergeSnapshot(base, diff, ctx);
    if (expected.hasIssue) {
      expect(issues.some((i) => i.code === expected.issueCode)).toBe(true);
    }
  });

  it('missing-datatype', () => {
    const fixture = loadFixture('08-datatype-expansion', 'missing-datatype');
    const base = eds(fixture.base as Record<string, unknown>[]);
    const diff = eds(fixture.diff as Record<string, unknown>[]);
    const expected = fixture.expected as Record<string, unknown>;
    const ctx = ctxFromFixture(fixture);

    const { issues } = mergeSnapshot(base, diff, ctx);
    if (expected.hasIssue) {
      expect(issues.some((i) => i.code === expected.issueCode)).toBe(true);
    }
  });

  it('path-rewriting', () => {
    const fixture = loadFixture('08-datatype-expansion', 'path-rewriting');
    const base = eds(fixture.base as Record<string, unknown>[]);
    const diff = eds(fixture.diff as Record<string, unknown>[]);
    const expected = fixture.expected as Record<string, unknown>;
    const ctx = ctxFromFixture(fixture);

    const { elements } = mergeSnapshot(base, diff, ctx);
    const val = findByPath(elements, expected.valuePath as string);
    expect(!!val).toBe(expected.hasValueElement);
    if (val) {
      expect(val.min).toBe(expected.valueMin);
      expect(val.short).toBe(expected.valueShort);
    }
  });
});

// ===========================================================================
// Section 13: Fixture-based tests — 09-choice-type
// ===========================================================================

describe('Fixture: 09-choice-type', () => {
  const fixtures = [
    'narrow-to-quantity',
    'narrow-to-string',
    'keep-choice-path',
    'narrow-to-codeable-concept',
    'single-type-no-narrow',
  ];

  for (const name of fixtures) {
    it(name, () => {
      const fixture = loadFixture('09-choice-type', name);
      const base = eds(fixture.base as Record<string, unknown>[]);
      const diff = eds(fixture.diff as Record<string, unknown>[]);
      const expected = fixture.expected as Record<string, unknown>;

      const { elements, issues } = mergeSnapshot(base, diff);
      const valueEl = elements[1]; // The choice element is always at index 1

      if (expected.valueMin !== undefined) {
        expect(valueEl.min).toBe(expected.valueMin);
      }
      if (expected.valueTypeCount !== undefined) {
        expect(valueEl.type).toHaveLength(expected.valueTypeCount as number);
      }
      if (expected.valueTypeCode !== undefined) {
        expect(valueEl.type![0].code).toBe(expected.valueTypeCode);
      }
      if (expected.valueShort !== undefined) {
        expect(valueEl.short).toBe(expected.valueShort);
      }
      if (expected.issueCount !== undefined) {
        expect(issues.filter((i) => i.severity === 'error')).toHaveLength(expected.issueCount as number);
      }
    });
  }
});

// ===========================================================================
// Section 14: Fixture-based tests — 10-slicing
// ===========================================================================

describe('Fixture: 10-slicing', () => {
  it('explicit-slice-two', () => {
    const fixture = loadFixture('10-slicing', 'explicit-slice-two');
    const base = eds(fixture.base as Record<string, unknown>[]);
    const diff = eds(fixture.diff as Record<string, unknown>[]);
    const expected = fixture.expected as Record<string, unknown>;

    const { elements } = mergeSnapshot(base, diff);
    const identifiers = elements.filter((e) => (e.path as string) === 'Patient.identifier');
    expect(identifiers.length).toBeGreaterThanOrEqual((expected.elementCount as number) - 1);

    if (expected.hasSlicingRoot) {
      expect(identifiers[0].slicing).toBeDefined();
    }
    if (expected.sliceNames) {
      const names = identifiers.filter((e) => e.sliceName).map((e) => e.sliceName);
      for (const sn of expected.sliceNames as string[]) {
        expect(names).toContain(sn);
      }
    }
  });

  it('single-slice', () => {
    const fixture = loadFixture('10-slicing', 'single-slice');
    const base = eds(fixture.base as Record<string, unknown>[]);
    const diff = eds(fixture.diff as Record<string, unknown>[]);
    const expected = fixture.expected as Record<string, unknown>;

    const { elements } = mergeSnapshot(base, diff);
    const extensions = elements.filter((e) => (e.path as string) === 'Patient.extension');
    expect(extensions.length).toBeGreaterThanOrEqual(2);
    if (expected.sliceNames) {
      const names = extensions.filter((e) => e.sliceName).map((e) => e.sliceName);
      for (const sn of expected.sliceNames as string[]) {
        expect(names).toContain(sn);
      }
    }
  });

  it('type-slicing-choice', () => {
    const fixture = loadFixture('10-slicing', 'type-slicing-choice');
    const base = eds(fixture.base as Record<string, unknown>[]);
    const diff = eds(fixture.diff as Record<string, unknown>[]);
    const expected = fixture.expected as Record<string, unknown>;

    const { elements, issues } = mergeSnapshot(base, diff);
    const valueElements = elements.filter((e) =>
      ((e.path as string) ?? '').startsWith('Observation.value'),
    );
    expect(valueElements.length).toBeGreaterThanOrEqual(3);
    if (expected.hasSlicingRoot) {
      expect(valueElements[0].slicing).toBeDefined();
    }
    if (expected.issueCount !== undefined) {
      expect(issues.filter((i) => i.severity === 'error')).toHaveLength(expected.issueCount as number);
    }
  });

  it('diff-consumed-check', () => {
    const fixture = loadFixture('10-slicing', 'diff-consumed-check');
    const base = eds(fixture.base as Record<string, unknown>[]);
    const diff = eds(fixture.diff as Record<string, unknown>[]);
    const expected = fixture.expected as Record<string, unknown>;

    const { elements, issues } = mergeSnapshot(base, diff);
    if (expected.elementCount !== undefined) {
      expect(elements).toHaveLength(expected.elementCount as number);
    }
    if (expected.allConsumed) {
      const unconsumed = issues.filter((i) => i.code === 'DIFFERENTIAL_NOT_CONSUMED');
      expect(unconsumed).toHaveLength(0);
    }
  });

  it('unconsumed-diff-warning', () => {
    const fixture = loadFixture('10-slicing', 'unconsumed-diff-warning');
    const base = eds(fixture.base as Record<string, unknown>[]);
    const diff = eds(fixture.diff as Record<string, unknown>[]);
    const expected = fixture.expected as Record<string, unknown>;

    const { elements, issues } = mergeSnapshot(base, diff);
    if (expected.elementCount !== undefined) {
      expect(elements).toHaveLength(expected.elementCount as number);
    }
    if (expected.hasUnconsumedWarning) {
      const unconsumed = issues.filter((i) => i.code === 'DIFFERENTIAL_NOT_CONSUMED');
      expect(unconsumed.length).toBeGreaterThan(0);
    }
  });
});
