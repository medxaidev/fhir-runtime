/**
 * element-sorter.test.ts — Unit tests for the element sorter module.
 *
 * Covers:
 * - findBaseIndex (exact match, choice type, slice name, not found)
 * - sortDifferential (already sorted, out of order, choice types, children, unknown paths)
 * - validateElementOrder (valid, child-before-parent, sliced, deep nesting)
 * - ensureElementIds (basic, sliced, preserve existing, empty, nested)
 *
 * Fixture-based tests across 4 categories (20 JSON fixtures).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementDefinition } from '../../model/index.js';
import type { SnapshotIssue } from '../types.js';
import {
  findBaseIndex,
  sortDifferential,
  validateElementOrder,
  ensureElementIds,
} from '../element-sorter.js';

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

/** Cast a plain object to ElementDefinition. */
function ed(obj: Record<string, unknown>): ElementDefinition {
  return obj as unknown as ElementDefinition;
}

/** Cast array of plain objects to ElementDefinition[]. */
function eds(arr: Record<string, unknown>[]): ElementDefinition[] {
  return arr.map(ed);
}

/** Extract paths from elements for easy comparison. */
function paths(elements: readonly ElementDefinition[]): string[] {
  return elements.map((e) => e.path as string);
}

// ===========================================================================
// Section 1: findBaseIndex
// ===========================================================================

describe('findBaseIndex', () => {
  const base = eds([
    { path: 'Patient' },
    { path: 'Patient.id' },
    { path: 'Patient.identifier' },
    { path: 'Patient.name' },
    { path: 'Patient.gender' },
  ]);

  it('finds exact path match', () => {
    expect(findBaseIndex(base, 'Patient.name')).toBe(3);
  });

  it('finds root element', () => {
    expect(findBaseIndex(base, 'Patient')).toBe(0);
  });

  it('returns -1 for unknown path', () => {
    expect(findBaseIndex(base, 'Patient.nonExistent')).toBe(-1);
  });

  it('finds first occurrence when no sliceName', () => {
    expect(findBaseIndex(base, 'Patient.identifier')).toBe(2);
  });

  it('finds choice type match', () => {
    const choiceBase = eds([
      { path: 'Observation' },
      { path: 'Observation.code' },
      { path: 'Observation.value[x]' },
      { path: 'Observation.component' },
    ]);
    expect(findBaseIndex(choiceBase, 'Observation.valueString')).toBe(2);
    expect(findBaseIndex(choiceBase, 'Observation.valueQuantity')).toBe(2);
  });

  it('finds slice by sliceName', () => {
    const slicedBase = eds([
      { path: 'Patient.identifier', slicing: { rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN' },
      { path: 'Patient.identifier', sliceName: 'SSN' },
    ]);
    expect(findBaseIndex(slicedBase, 'Patient.identifier', 'SSN')).toBe(2);
    expect(findBaseIndex(slicedBase, 'Patient.identifier', 'MRN')).toBe(1);
  });

  it('falls back to path match when sliceName not found', () => {
    const slicedBase = eds([
      { path: 'Patient.identifier', slicing: { rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN' },
    ]);
    expect(findBaseIndex(slicedBase, 'Patient.identifier', 'Unknown')).toBe(0);
  });
});

// ===========================================================================
// Section 2: sortDifferential
// ===========================================================================

describe('sortDifferential', () => {
  it('returns same order when already sorted', () => {
    const base = eds([
      { path: 'Patient' },
      { path: 'Patient.identifier' },
      { path: 'Patient.name' },
      { path: 'Patient.gender' },
    ]);
    const diff = eds([
      { path: 'Patient' },
      { path: 'Patient.identifier', min: 1 },
      { path: 'Patient.name', min: 1 },
    ]);
    const issues: SnapshotIssue[] = [];
    const sorted = sortDifferential(diff, base, issues);
    expect(paths(sorted)).toEqual(['Patient', 'Patient.identifier', 'Patient.name']);
    expect(issues).toHaveLength(0);
  });

  it('reorders out-of-order elements', () => {
    const base = eds([
      { path: 'Patient' },
      { path: 'Patient.identifier' },
      { path: 'Patient.name' },
      { path: 'Patient.gender' },
    ]);
    const diff = eds([
      { path: 'Patient' },
      { path: 'Patient.gender', min: 1 },
      { path: 'Patient.identifier', min: 1 },
    ]);
    const issues: SnapshotIssue[] = [];
    const sorted = sortDifferential(diff, base, issues);
    expect(paths(sorted)).toEqual(['Patient', 'Patient.identifier', 'Patient.gender']);
  });

  it('handles choice type paths', () => {
    const base = eds([
      { path: 'Observation' },
      { path: 'Observation.code' },
      { path: 'Observation.value[x]' },
      { path: 'Observation.component' },
    ]);
    const diff = eds([
      { path: 'Observation' },
      { path: 'Observation.component', min: 1 },
      { path: 'Observation.valueQuantity' },
    ]);
    const issues: SnapshotIssue[] = [];
    const sorted = sortDifferential(diff, base, issues);
    expect(paths(sorted)).toEqual([
      'Observation',
      'Observation.valueQuantity',
      'Observation.component',
    ]);
  });

  it('keeps children under their parent', () => {
    const base = eds([
      { path: 'Patient' },
      { path: 'Patient.identifier' },
      { path: 'Patient.identifier.system' },
      { path: 'Patient.identifier.value' },
      { path: 'Patient.name' },
      { path: 'Patient.name.family' },
    ]);
    const diff = eds([
      { path: 'Patient' },
      { path: 'Patient.name', min: 1 },
      { path: 'Patient.name.family', min: 1 },
      { path: 'Patient.identifier', min: 1 },
      { path: 'Patient.identifier.system', min: 1 },
    ]);
    const issues: SnapshotIssue[] = [];
    const sorted = sortDifferential(diff, base, issues);
    expect(paths(sorted)).toEqual([
      'Patient',
      'Patient.identifier',
      'Patient.identifier.system',
      'Patient.name',
      'Patient.name.family',
    ]);
  });

  it('warns about unknown paths', () => {
    const base = eds([
      { path: 'Patient' },
      { path: 'Patient.identifier' },
      { path: 'Patient.name' },
    ]);
    const diff = eds([
      { path: 'Patient' },
      { path: 'Patient.nonExistent', min: 1 },
      { path: 'Patient.identifier', min: 1 },
    ]);
    const issues: SnapshotIssue[] = [];
    const sorted = sortDifferential(diff, base, issues);
    // Unknown path goes to end
    expect(paths(sorted)).toEqual(['Patient', 'Patient.identifier', 'Patient.nonExistent']);
    expect(issues.some((i) => i.code === 'PATH_NOT_FOUND')).toBe(true);
  });

  it('handles single element differential', () => {
    const base = eds([{ path: 'Patient' }]);
    const diff = eds([{ path: 'Patient' }]);
    const issues: SnapshotIssue[] = [];
    const sorted = sortDifferential(diff, base, issues);
    expect(sorted).toHaveLength(1);
    expect(paths(sorted)).toEqual(['Patient']);
  });

  it('handles empty differential', () => {
    const base = eds([{ path: 'Patient' }]);
    const diff: ElementDefinition[] = [];
    const issues: SnapshotIssue[] = [];
    const sorted = sortDifferential(diff, base, issues);
    expect(sorted).toHaveLength(0);
  });
});

// ===========================================================================
// Section 3: validateElementOrder
// ===========================================================================

describe('validateElementOrder', () => {
  it('returns true for valid order', () => {
    const snapshot = eds([
      { path: 'Patient' },
      { path: 'Patient.id' },
      { path: 'Patient.identifier' },
      { path: 'Patient.identifier.system' },
      { path: 'Patient.name' },
    ]);
    const issues: SnapshotIssue[] = [];
    expect(validateElementOrder(snapshot, issues)).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('detects child before parent', () => {
    const snapshot = eds([
      { path: 'Patient' },
      { path: 'Patient.name.given' },
      { path: 'Patient.name' },
    ]);
    const issues: SnapshotIssue[] = [];
    expect(validateElementOrder(snapshot, issues)).toBe(false);
    expect(issues.length).toBeGreaterThan(0);
  });

  it('accepts sliced elements after root', () => {
    const snapshot = eds([
      { path: 'Patient' },
      { path: 'Patient.identifier', slicing: { rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN' },
      { path: 'Patient.identifier', sliceName: 'SSN' },
      { path: 'Patient.name' },
    ]);
    const issues: SnapshotIssue[] = [];
    expect(validateElementOrder(snapshot, issues)).toBe(true);
  });

  it('accepts single element', () => {
    const snapshot = eds([{ path: 'Patient' }]);
    const issues: SnapshotIssue[] = [];
    expect(validateElementOrder(snapshot, issues)).toBe(true);
  });

  it('accepts deeply nested valid order', () => {
    const snapshot = eds([
      { path: 'Patient' },
      { path: 'Patient.contact' },
      { path: 'Patient.contact.name' },
      { path: 'Patient.contact.name.given' },
      { path: 'Patient.contact.name.family' },
      { path: 'Patient.contact.telecom' },
    ]);
    const issues: SnapshotIssue[] = [];
    expect(validateElementOrder(snapshot, issues)).toBe(true);
  });

  it('handles empty snapshot', () => {
    const issues: SnapshotIssue[] = [];
    expect(validateElementOrder([], issues)).toBe(true);
  });
});

// ===========================================================================
// Section 4: ensureElementIds
// ===========================================================================

describe('ensureElementIds', () => {
  it('generates ids from path', () => {
    const elements = eds([
      { path: 'Patient' },
      { path: 'Patient.id' },
      { path: 'Patient.identifier' },
    ]);
    ensureElementIds(elements);
    expect(elements.map((e) => e.id)).toEqual(['Patient', 'Patient.id', 'Patient.identifier']);
  });

  it('generates path:sliceName for sliced elements', () => {
    const elements = eds([
      { path: 'Patient' },
      { path: 'Patient.identifier' },
      { path: 'Patient.identifier', sliceName: 'MRN' },
      { path: 'Patient.identifier', sliceName: 'SSN' },
    ]);
    ensureElementIds(elements);
    expect(elements[2].id).toBe('Patient.identifier:MRN');
    expect(elements[3].id).toBe('Patient.identifier:SSN');
  });

  it('preserves existing ids', () => {
    const elements = eds([
      { path: 'Patient', id: 'Patient' },
      { path: 'Patient.identifier' },
      { path: 'Patient.name', id: 'custom-id' },
    ]);
    ensureElementIds(elements);
    expect(elements[0].id).toBe('Patient');
    expect(elements[1].id).toBe('Patient.identifier');
    expect(elements[2].id).toBe('custom-id');
  });

  it('handles empty array', () => {
    const elements: ElementDefinition[] = [];
    ensureElementIds(elements);
    expect(elements).toHaveLength(0);
  });

  it('handles elements without path', () => {
    const elements = eds([
      { path: 'Patient' },
      {},
      { path: 'Patient.name' },
    ]);
    ensureElementIds(elements);
    expect(elements[0].id).toBe('Patient');
    expect(elements[1].id).toBeUndefined();
    expect(elements[2].id).toBe('Patient.name');
  });

  it('uses resourceType for root element', () => {
    const elements = eds([
      { path: 'Patient' },
      { path: 'Patient.name' },
    ]);
    ensureElementIds(elements, 'Patient');
    expect(elements[0].id).toBe('Patient');
  });
});

// ===========================================================================
// Section 5: Fixture-based tests — 23-sort-differential
// ===========================================================================

describe('Fixture: 23-sort-differential', () => {
  function runSort(fixture: Record<string, unknown>) {
    const base = eds(fixture.baseSnapshot as Record<string, unknown>[]);
    const diff = eds(fixture.differential as Record<string, unknown>[]);
    const issues: SnapshotIssue[] = [];
    const sorted = sortDifferential(diff, base, issues);
    return { sorted, issues };
  }

  it('already-sorted', () => {
    const fixture = loadFixture('23-sort-differential', 'already-sorted');
    const expected = fixture.expected as any;
    const { sorted, issues } = runSort(fixture);
    expect(paths(sorted)).toEqual(expected.order);
    expect(issues).toHaveLength(expected.issueCount);
  });

  it('out-of-order', () => {
    const fixture = loadFixture('23-sort-differential', 'out-of-order');
    const expected = fixture.expected as any;
    const { sorted, issues } = runSort(fixture);
    expect(paths(sorted)).toEqual(expected.order);
    expect(issues).toHaveLength(expected.issueCount);
  });

  it('choice-type-sort', () => {
    const fixture = loadFixture('23-sort-differential', 'choice-type-sort');
    const expected = fixture.expected as any;
    const { sorted, issues } = runSort(fixture);
    expect(paths(sorted)).toEqual(expected.order);
    expect(issues).toHaveLength(expected.issueCount);
  });

  it('with-children', () => {
    const fixture = loadFixture('23-sort-differential', 'with-children');
    const expected = fixture.expected as any;
    const { sorted, issues } = runSort(fixture);
    expect(paths(sorted)).toEqual(expected.order);
    expect(issues).toHaveLength(expected.issueCount);
  });

  it('unknown-path-warning', () => {
    const fixture = loadFixture('23-sort-differential', 'unknown-path-warning');
    const expected = fixture.expected as any;
    const { sorted, issues } = runSort(fixture);
    expect(paths(sorted)).toEqual(expected.order);
    expect(issues.length).toBeGreaterThanOrEqual(expected.issueCount);
    expect(issues.some((i) => i.code === expected.issueCode)).toBe(true);
  });
});

// ===========================================================================
// Section 6: Fixture-based tests — 24-find-base-index
// ===========================================================================

describe('Fixture: 24-find-base-index', () => {
  it('exact-match', () => {
    const fixture = loadFixture('24-find-base-index', 'exact-match');
    const base = eds(fixture.baseSnapshot as Record<string, unknown>[]);
    expect(findBaseIndex(base, fixture.path as string)).toBe((fixture.expected as any).index);
  });

  it('choice-type-match', () => {
    const fixture = loadFixture('24-find-base-index', 'choice-type-match');
    const base = eds(fixture.baseSnapshot as Record<string, unknown>[]);
    expect(findBaseIndex(base, fixture.path as string)).toBe((fixture.expected as any).index);
  });

  it('not-found', () => {
    const fixture = loadFixture('24-find-base-index', 'not-found');
    const base = eds(fixture.baseSnapshot as Record<string, unknown>[]);
    expect(findBaseIndex(base, fixture.path as string)).toBe((fixture.expected as any).index);
  });

  it('slice-name-match', () => {
    const fixture = loadFixture('24-find-base-index', 'slice-name-match');
    const base = eds(fixture.baseSnapshot as Record<string, unknown>[]);
    expect(findBaseIndex(base, fixture.path as string, fixture.sliceName as string)).toBe(
      (fixture.expected as any).index,
    );
  });

  it('root-element', () => {
    const fixture = loadFixture('24-find-base-index', 'root-element');
    const base = eds(fixture.baseSnapshot as Record<string, unknown>[]);
    expect(findBaseIndex(base, fixture.path as string)).toBe((fixture.expected as any).index);
  });
});

// ===========================================================================
// Section 7: Fixture-based tests — 25-validate-order
// ===========================================================================

describe('Fixture: 25-validate-order', () => {
  function runValidation(fixture: Record<string, unknown>) {
    const snapshot = eds(fixture.snapshot as Record<string, unknown>[]);
    const issues: SnapshotIssue[] = [];
    const valid = validateElementOrder(snapshot, issues);
    return { valid, issues };
  }

  it('valid-order', () => {
    const fixture = loadFixture('25-validate-order', 'valid-order');
    const expected = fixture.expected as any;
    const { valid, issues } = runValidation(fixture);
    expect(valid).toBe(expected.valid);
    expect(issues).toHaveLength(expected.issueCount);
  });

  it('child-before-parent', () => {
    const fixture = loadFixture('25-validate-order', 'child-before-parent');
    const expected = fixture.expected as any;
    const { valid, issues } = runValidation(fixture);
    expect(valid).toBe(expected.valid);
    expect(issues.length).toBeGreaterThanOrEqual(expected.issueCount);
  });

  it('sliced-order', () => {
    const fixture = loadFixture('25-validate-order', 'sliced-order');
    const expected = fixture.expected as any;
    const { valid, issues } = runValidation(fixture);
    expect(valid).toBe(expected.valid);
    expect(issues).toHaveLength(expected.issueCount);
  });

  it('single-element', () => {
    const fixture = loadFixture('25-validate-order', 'single-element');
    const expected = fixture.expected as any;
    const { valid, issues } = runValidation(fixture);
    expect(valid).toBe(expected.valid);
    expect(issues).toHaveLength(expected.issueCount);
  });

  it('deep-nesting', () => {
    const fixture = loadFixture('25-validate-order', 'deep-nesting');
    const expected = fixture.expected as any;
    const { valid, issues } = runValidation(fixture);
    expect(valid).toBe(expected.valid);
    expect(issues).toHaveLength(expected.issueCount);
  });
});

// ===========================================================================
// Section 8: Fixture-based tests — 26-ensure-element-ids
// ===========================================================================

describe('Fixture: 26-ensure-element-ids', () => {
  it('basic-ids', () => {
    const fixture = loadFixture('26-ensure-element-ids', 'basic-ids');
    const expected = fixture.expected as any;
    const elements = eds(fixture.elements as Record<string, unknown>[]);
    ensureElementIds(elements);
    expect(elements.map((e) => e.id)).toEqual(expected.ids);
  });

  it('sliced-ids', () => {
    const fixture = loadFixture('26-ensure-element-ids', 'sliced-ids');
    const expected = fixture.expected as any;
    const elements = eds(fixture.elements as Record<string, unknown>[]);
    ensureElementIds(elements);
    expect(elements.map((e) => e.id)).toEqual(expected.ids);
  });

  it('preserve-existing-ids', () => {
    const fixture = loadFixture('26-ensure-element-ids', 'preserve-existing-ids');
    const expected = fixture.expected as any;
    const elements = eds(fixture.elements as Record<string, unknown>[]);
    ensureElementIds(elements);
    expect(elements.map((e) => e.id)).toEqual(expected.ids);
  });

  it('empty-elements', () => {
    const fixture = loadFixture('26-ensure-element-ids', 'empty-elements');
    const expected = fixture.expected as any;
    const elements = eds(fixture.elements as Record<string, unknown>[]);
    ensureElementIds(elements);
    expect(elements.map((e) => e.id)).toEqual(expected.ids);
  });

  it('nested-sliced-ids', () => {
    const fixture = loadFixture('26-ensure-element-ids', 'nested-sliced-ids');
    const expected = fixture.expected as any;
    const elements = eds(fixture.elements as Record<string, unknown>[]);
    ensureElementIds(elements);
    expect(elements.map((e) => e.id)).toEqual(expected.ids);
  });
});
