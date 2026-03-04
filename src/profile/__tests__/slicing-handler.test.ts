/**
 * slicing-handler.test.ts — Unit tests for the slicing handler module.
 *
 * Covers:
 * - makeExtensionSlicing (default extension slicing generation)
 * - getSliceSiblings (base slice sibling collection)
 * - validateSlicingCompatibility (discriminator, ordered, rules checks)
 * - diffsConstrainTypes (type slicing detection)
 * - handleNewSlicing (Case A: new slicing on unsliced base)
 * - handleExistingSlicing (Case B: modifying/extending existing slicing)
 * - Closed slicing rejection
 *
 * Fixture-based tests across 7 categories (35 JSON fixtures).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementDefinition, ElementDefinitionSlicing } from '../../model/index.js';
import type { DiffElementTracker, SnapshotIssue } from '../types.js';
import { createDiffTracker } from '../types.js';
import { createMergeContext } from '../element-merger.js';
import {
  makeExtensionSlicing,
  getSliceSiblings,
  validateSlicingCompatibility,
  diffsConstrainTypes,
  handleNewSlicing,
  handleExistingSlicing,
} from '../slicing-handler.js';

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

/** Cast a plain object to ElementDefinitionSlicing. */
function slicing(obj: Record<string, unknown>): ElementDefinitionSlicing {
  return obj as unknown as ElementDefinitionSlicing;
}

/** Create DiffElementTracker[] from plain objects. */
function trackers(arr: Record<string, unknown>[]): DiffElementTracker[] {
  return arr.map((o) => createDiffTracker(ed(o)));
}

/** Find elements with a specific sliceName in a result array. */
function findSlices(elements: ElementDefinition[]): ElementDefinition[] {
  return elements.filter((e) => e.sliceName !== undefined);
}

/** Find the slicing root (element with slicing but no sliceName). */
function findSlicingRoot(elements: ElementDefinition[], path: string): ElementDefinition | undefined {
  return elements.find((e) => (e.path as string) === path && e.slicing !== undefined && !e.sliceName);
}

// ===========================================================================
// Section 1: makeExtensionSlicing
// ===========================================================================

describe('makeExtensionSlicing', () => {
  it('returns slicing with value/url discriminator', () => {
    const s = makeExtensionSlicing();
    expect(s.discriminator).toHaveLength(1);
    expect(s.discriminator![0].type).toBe('value');
    expect(s.discriminator![0].path).toBe('url');
  });

  it('has rules=open', () => {
    const s = makeExtensionSlicing();
    expect(s.rules).toBe('open');
  });

  it('has ordered=false', () => {
    const s = makeExtensionSlicing();
    expect(s.ordered).toBe(false);
  });

  it('returns a new object each time', () => {
    const s1 = makeExtensionSlicing();
    const s2 = makeExtensionSlicing();
    expect(s1).not.toBe(s2);
    expect(s1).toEqual(s2);
  });

  it('discriminator objects are independent', () => {
    const s1 = makeExtensionSlicing();
    const s2 = makeExtensionSlicing();
    expect(s1.discriminator![0]).not.toBe(s2.discriminator![0]);
  });
});

// ===========================================================================
// Section 2: getSliceSiblings
// ===========================================================================

describe('getSliceSiblings', () => {
  it('returns slice siblings with same path', () => {
    const elements = eds([
      { path: 'Patient.identifier', slicing: { rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN' },
      { path: 'Patient.identifier', sliceName: 'SSN' },
      { path: 'Patient.name' },
    ]);
    const siblings = getSliceSiblings(elements, 0);
    expect(siblings).toHaveLength(2);
  });

  it('includes child elements of slices', () => {
    const elements = eds([
      { path: 'Patient.identifier', slicing: { rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN' },
      { path: 'Patient.identifier.system' },
      { path: 'Patient.identifier.value' },
      { path: 'Patient.identifier', sliceName: 'SSN' },
      { path: 'Patient.name' },
    ]);
    const siblings = getSliceSiblings(elements, 0);
    expect(siblings).toHaveLength(4); // MRN + system + value + SSN
  });

  it('returns empty for no siblings', () => {
    const elements = eds([
      { path: 'Patient.identifier', slicing: { rules: 'open' } },
      { path: 'Patient.name' },
    ]);
    const siblings = getSliceSiblings(elements, 0);
    expect(siblings).toHaveLength(0);
  });

  it('returns empty for invalid index', () => {
    const elements = eds([
      { path: 'Patient.identifier', sliceName: 'MRN' },
    ]);
    expect(getSliceSiblings(elements, -1)).toHaveLength(0);
    expect(getSliceSiblings(elements, 100)).toHaveLength(0);
  });

  it('stops at next non-child, non-same-path element', () => {
    const elements = eds([
      { path: 'Patient.identifier', slicing: { rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN' },
      { path: 'Patient.identifier.system' },
      { path: 'Patient.name' },
      { path: 'Patient.identifier', sliceName: 'Late' },
    ]);
    const siblings = getSliceSiblings(elements, 0);
    // Stops at Patient.name, does not include Late
    expect(siblings).toHaveLength(2); // MRN + system
  });
});

// ===========================================================================
// Section 3: validateSlicingCompatibility
// ===========================================================================

describe('validateSlicingCompatibility', () => {
  it('returns true for matching discriminators', () => {
    const base = slicing({
      discriminator: [{ type: 'value', path: 'system' }],
      rules: 'open',
      ordered: false,
    });
    const diff = slicing({
      discriminator: [{ type: 'value', path: 'system' }],
      rules: 'open',
      ordered: false,
    });
    const issues: SnapshotIssue[] = [];
    expect(validateSlicingCompatibility(base, diff, issues, 'Patient.identifier')).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('rejects mismatched discriminator type', () => {
    const base = slicing({
      discriminator: [{ type: 'value', path: 'system' }],
      rules: 'open',
    });
    const diff = slicing({
      discriminator: [{ type: 'pattern', path: 'system' }],
      rules: 'open',
    });
    const issues: SnapshotIssue[] = [];
    expect(validateSlicingCompatibility(base, diff, issues, 'Patient.identifier')).toBe(false);
    expect(issues.some((i) => i.code === 'SLICING_ERROR')).toBe(true);
  });

  it('rejects mismatched discriminator count', () => {
    const base = slicing({
      discriminator: [{ type: 'value', path: 'system' }],
      rules: 'open',
    });
    const diff = slicing({
      discriminator: [
        { type: 'value', path: 'system' },
        { type: 'value', path: 'value' },
      ],
      rules: 'open',
    });
    const issues: SnapshotIssue[] = [];
    expect(validateSlicingCompatibility(base, diff, issues, 'Patient.identifier')).toBe(false);
  });

  it('rejects ordered relaxation (true → false)', () => {
    const base = slicing({
      discriminator: [{ type: 'value', path: 'code' }],
      rules: 'open',
      ordered: true,
    });
    const diff = slicing({
      discriminator: [{ type: 'value', path: 'code' }],
      rules: 'open',
      ordered: false,
    });
    const issues: SnapshotIssue[] = [];
    expect(validateSlicingCompatibility(base, diff, issues, 'Observation.component')).toBe(false);
  });

  it('rejects rules relaxation (closed → open)', () => {
    const base = slicing({
      discriminator: [{ type: 'value', path: 'system' }],
      rules: 'closed',
    });
    const diff = slicing({
      discriminator: [{ type: 'value', path: 'system' }],
      rules: 'open',
    });
    const issues: SnapshotIssue[] = [];
    expect(validateSlicingCompatibility(base, diff, issues, 'Patient.identifier')).toBe(false);
  });

  it('allows rules tightening (open → closed)', () => {
    const base = slicing({
      discriminator: [{ type: 'value', path: 'system' }],
      rules: 'open',
    });
    const diff = slicing({
      discriminator: [{ type: 'value', path: 'system' }],
      rules: 'closed',
    });
    const issues: SnapshotIssue[] = [];
    expect(validateSlicingCompatibility(base, diff, issues, 'Patient.identifier')).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('allows diff with no discriminators (inherits base)', () => {
    const base = slicing({
      discriminator: [{ type: 'value', path: 'system' }],
      rules: 'open',
    });
    const diff = slicing({ rules: 'open' });
    const issues: SnapshotIssue[] = [];
    expect(validateSlicingCompatibility(base, diff, issues, 'Patient.identifier')).toBe(true);
  });
});

// ===========================================================================
// Section 4: diffsConstrainTypes
// ===========================================================================

describe('diffsConstrainTypes', () => {
  it('detects choice type slicing with concrete paths', () => {
    const diffs = trackers([
      { path: 'Observation.valueQuantity', type: [{ code: 'Quantity' }] },
      { path: 'Observation.valueString', type: [{ code: 'string' }] },
    ]);
    expect(diffsConstrainTypes(diffs, 'Observation.value[x]', undefined)).toBe(true);
  });

  it('detects type slicing with different type constraints', () => {
    const diffs = trackers([
      { path: 'Observation.value[x]', type: [{ code: 'Quantity' }] },
      { path: 'Observation.value[x]', type: [{ code: 'string' }] },
    ]);
    expect(diffsConstrainTypes(diffs, 'Observation.value[x]', undefined)).toBe(true);
  });

  it('returns false for same type constraints', () => {
    const diffs = trackers([
      { path: 'Patient.identifier', type: [{ code: 'Identifier' }], sliceName: 'MRN' },
      { path: 'Patient.identifier', type: [{ code: 'Identifier' }], sliceName: 'SSN' },
    ]);
    expect(diffsConstrainTypes(diffs, 'Patient.identifier', undefined)).toBe(false);
  });

  it('returns false for single diff match', () => {
    const diffs = trackers([
      { path: 'Observation.valueQuantity', type: [{ code: 'Quantity' }] },
    ]);
    expect(diffsConstrainTypes(diffs, 'Observation.value[x]', undefined)).toBe(false);
  });

  it('returns false for diffs without type constraints', () => {
    const diffs = trackers([
      { path: 'Patient.identifier', sliceName: 'MRN' },
      { path: 'Patient.identifier', sliceName: 'SSN' },
    ]);
    expect(diffsConstrainTypes(diffs, 'Patient.identifier', undefined)).toBe(false);
  });
});

// ===========================================================================
// Section 5: handleNewSlicing (Case A)
// ===========================================================================

describe('handleNewSlicing', () => {
  it('creates slicing root with diff slicing definition', () => {
    const baseElements = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.identifier', slicing: { discriminator: [{ type: 'value', path: 'system' }], rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN', min: 1 },
    ]);
    const allTrackers = diffMatches;
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleNewSlicing(
      ctx, result,
      baseElements[1], // Patient.identifier
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, allTrackers, 0, allTrackers.length - 1,
      'Patient', 'Patient', 'Patient.identifier',
    );

    const root = findSlicingRoot(result, 'Patient.identifier');
    expect(root).toBeDefined();
    expect(root!.slicing).toBeDefined();
    expect(root!.slicing!.rules).toBe('open');

    const slices = findSlices(result);
    expect(slices).toHaveLength(1);
    expect(slices[0].sliceName).toBe('MRN');
  });

  it('creates multiple slices', () => {
    const baseElements = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.identifier', slicing: { discriminator: [{ type: 'value', path: 'system' }], rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN', min: 1 },
      { path: 'Patient.identifier', sliceName: 'SSN', min: 0 },
    ]);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleNewSlicing(
      ctx, result,
      baseElements[1],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.identifier',
    );

    const slices = findSlices(result);
    expect(slices).toHaveLength(2);
    expect(slices.map((s) => s.sliceName)).toEqual(['MRN', 'SSN']);
  });

  it('synthesizes slicing when no explicit definition', () => {
    const baseElements = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.identifier', sliceName: 'MRN', min: 1 },
      { path: 'Patient.identifier', sliceName: 'SSN', min: 0 },
    ]);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleNewSlicing(
      ctx, result,
      baseElements[1],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.identifier',
    );

    const root = findSlicingRoot(result, 'Patient.identifier');
    expect(root).toBeDefined();
    expect(root!.slicing).toBeDefined();
    expect(root!.slicing!.rules).toBe('open');
  });

  it('auto-generates extension slicing for .extension path', () => {
    const baseElements = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.extension', min: 0, max: '*' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.extension', sliceName: 'birthPlace', min: 0 },
    ]);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleNewSlicing(
      ctx, result,
      baseElements[1],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.extension',
    );

    const root = findSlicingRoot(result, 'Patient.extension');
    expect(root).toBeDefined();
    expect(root!.slicing!.discriminator![0].type).toBe('value');
    expect(root!.slicing!.discriminator![0].path).toBe('url');
  });

  it('marks all diff entries as consumed', () => {
    const baseElements = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.identifier', slicing: { discriminator: [{ type: 'value', path: 'system' }], rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN', min: 1 },
    ]);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleNewSlicing(
      ctx, result,
      baseElements[1],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.identifier',
    );

    expect(diffMatches.every((dm) => dm.consumed)).toBe(true);
  });
});

// ===========================================================================
// Section 6: handleExistingSlicing (Case B)
// ===========================================================================

describe('handleExistingSlicing', () => {
  it('modifies existing slice', () => {
    const baseElements = eds([
      { path: 'Patient.identifier', min: 0, max: '*', slicing: { discriminator: [{ type: 'value', path: 'system' }], rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN', min: 0, max: '1' },
      { path: 'Patient.identifier', sliceName: 'SSN', min: 0, max: '1' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.identifier', sliceName: 'MRN', min: 1 },
    ]);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleExistingSlicing(
      ctx, result,
      baseElements[0],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.identifier',
    );

    const slices = findSlices(result);
    expect(slices).toHaveLength(2);
    const mrn = slices.find((s) => s.sliceName === 'MRN');
    expect(mrn?.min).toBe(1);
    const ssn = slices.find((s) => s.sliceName === 'SSN');
    expect(ssn?.min).toBe(0);
  });

  it('adds new slice to open slicing', () => {
    const baseElements = eds([
      { path: 'Patient.identifier', min: 0, max: '*', slicing: { discriminator: [{ type: 'value', path: 'system' }], rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN', min: 0, max: '1' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.identifier', sliceName: 'SSN', min: 0, max: '1' },
    ]);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleExistingSlicing(
      ctx, result,
      baseElements[0],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.identifier',
    );

    const slices = findSlices(result);
    expect(slices).toHaveLength(2);
    expect(slices.map((s) => s.sliceName)).toContain('MRN');
    expect(slices.map((s) => s.sliceName)).toContain('SSN');
    expect(ctx.issues.filter((i) => i.code === 'SLICING_ERROR')).toHaveLength(0);
  });

  it('preserves unmatched base slices', () => {
    const baseElements = eds([
      { path: 'Patient.identifier', min: 0, max: '*', slicing: { discriminator: [{ type: 'value', path: 'system' }], rules: 'open' } },
      { path: 'Patient.identifier', sliceName: 'MRN', min: 0, max: '1' },
      { path: 'Patient.identifier', sliceName: 'SSN', min: 0, max: '1' },
      { path: 'Patient.identifier', sliceName: 'DL', min: 0, max: '1' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.identifier', sliceName: 'SSN', min: 1 },
    ]);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleExistingSlicing(
      ctx, result,
      baseElements[0],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.identifier',
    );

    const slices = findSlices(result);
    expect(slices).toHaveLength(3);
    expect(slices.map((s) => s.sliceName)).toEqual(['MRN', 'SSN', 'DL']);
    const ssn = slices.find((s) => s.sliceName === 'SSN');
    expect(ssn?.min).toBe(1);
    const mrn = slices.find((s) => s.sliceName === 'MRN');
    expect(mrn?.min).toBe(0);
  });

  it('rejects new slice on closed slicing', () => {
    const baseElements = eds([
      { path: 'Patient.identifier', min: 0, max: '*', slicing: { discriminator: [{ type: 'value', path: 'system' }], rules: 'closed' } },
      { path: 'Patient.identifier', sliceName: 'MRN', min: 0, max: '1' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.identifier', sliceName: 'SSN', min: 0, max: '1' },
    ]);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleExistingSlicing(
      ctx, result,
      baseElements[0],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.identifier',
    );

    expect(ctx.issues.some((i) => i.code === 'SLICING_ERROR')).toBe(true);
    expect(ctx.issues.some((i) => i.message.includes('Cannot add new slice'))).toBe(true);
  });

  it('merges slicing definition update', () => {
    const baseElements = eds([
      { path: 'Patient.identifier', min: 0, max: '*', slicing: { discriminator: [{ type: 'value', path: 'system' }], rules: 'open', description: 'Original' } },
      { path: 'Patient.identifier', sliceName: 'MRN', min: 0, max: '1' },
      { path: 'Patient.name', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.identifier', slicing: { discriminator: [{ type: 'value', path: 'system' }], rules: 'open', description: 'Updated' } },
    ]);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleExistingSlicing(
      ctx, result,
      baseElements[0],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.identifier',
    );

    const root = findSlicingRoot(result, 'Patient.identifier');
    expect(root).toBeDefined();
    expect(root!.slicing!.description).toBe('Updated');
  });
});

// ===========================================================================
// Section 7: Fixture-based tests — 16-new-slicing
// ===========================================================================

describe('Fixture: 16-new-slicing', () => {
  function runNewSlicing(fixture: Record<string, unknown>) {
    const baseElements = eds(fixture.baseElements as Record<string, unknown>[]);
    const diffElements = eds(fixture.diffElements as Record<string, unknown>[]);
    const diffMatches = diffElements.map(createDiffTracker);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    // Find the element being sliced (first diff's path)
    const slicePath = diffElements[0]?.path as string ?? '';
    const baseIdx = baseElements.findIndex((e) => (e.path as string) === slicePath);
    const baseEl = baseIdx >= 0 ? baseElements[baseIdx] : baseElements[1];

    handleNewSlicing(
      ctx, result, baseEl,
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      slicePath.split('.')[0], slicePath.split('.')[0], slicePath,
    );

    return { result, ctx, diffMatches };
  }

  it('basic-new-slicing', () => {
    const fixture = loadFixture('16-new-slicing', 'basic-new-slicing');
    const expected = fixture.expected as any;
    const { result } = runNewSlicing(fixture);
    expect(findSlicingRoot(result, 'Patient.identifier')).toBeDefined();
    expect(findSlices(result)).toHaveLength(expected.sliceCount);
  });

  it('multiple-slices', () => {
    const fixture = loadFixture('16-new-slicing', 'multiple-slices');
    const expected = fixture.expected as any;
    const { result } = runNewSlicing(fixture);
    expect(findSlices(result)).toHaveLength(expected.sliceCount);
    const names = findSlices(result).map((s) => s.sliceName);
    for (const n of expected.sliceNames) {
      expect(names).toContain(n);
    }
  });

  it('slicing-with-children', () => {
    const fixture = loadFixture('16-new-slicing', 'slicing-with-children');
    const expected = fixture.expected as any;
    const { result } = runNewSlicing(fixture);
    expect(findSlicingRoot(result, 'Patient.identifier')).toBeDefined();
    expect(findSlices(result)).toHaveLength(expected.sliceCount);
  });

  it('no-slicing-def', () => {
    const fixture = loadFixture('16-new-slicing', 'no-slicing-def');
    const expected = fixture.expected as any;
    const { result } = runNewSlicing(fixture);
    const root = findSlicingRoot(result, 'Patient.identifier');
    expect(root).toBeDefined();
    expect(root!.slicing!.rules).toBe(expected.slicingRules);
    expect(findSlices(result)).toHaveLength(expected.sliceCount);
  });

  it('ordered-slicing', () => {
    const fixture = loadFixture('16-new-slicing', 'ordered-slicing');
    const expected = fixture.expected as any;
    const { result } = runNewSlicing(fixture);
    const root = findSlicingRoot(result, 'Observation.component');
    expect(root).toBeDefined();
    expect(root!.slicing!.rules).toBe(expected.slicingRules);
    expect(root!.slicing!.ordered).toBe(expected.slicingOrdered);
    expect(findSlices(result)).toHaveLength(expected.sliceCount);
  });
});

// ===========================================================================
// Section 8: Fixture-based tests — 17-existing-slicing
// ===========================================================================

describe('Fixture: 17-existing-slicing', () => {
  function runExistingSlicing(fixture: Record<string, unknown>) {
    const baseElements = eds(fixture.baseElements as Record<string, unknown>[]);
    const diffElements = eds(fixture.diffElements as Record<string, unknown>[]);
    const diffMatches = diffElements.map(createDiffTracker);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    // Find the slicing root in base
    const slicingRoot = baseElements.find((e) => e.slicing !== undefined);
    if (!slicingRoot) return { result, ctx, diffMatches };

    const slicePath = slicingRoot.path as string;

    handleExistingSlicing(
      ctx, result, slicingRoot,
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      slicePath.split('.')[0], slicePath.split('.')[0], slicePath,
    );

    return { result, ctx, diffMatches };
  }

  it('modify-existing-slice', () => {
    const fixture = loadFixture('17-existing-slicing', 'modify-existing-slice');
    const expected = fixture.expected as any;
    const { result } = runExistingSlicing(fixture);
    const slices = findSlices(result);
    expect(slices).toHaveLength(expected.sliceCount);
    const mrn = slices.find((s) => s.sliceName === 'MRN');
    expect(mrn?.min).toBe(expected.mrnMin);
    const ssn = slices.find((s) => s.sliceName === 'SSN');
    expect(ssn?.min).toBe(expected.ssnMin);
  });

  it('add-new-slice-open', () => {
    const fixture = loadFixture('17-existing-slicing', 'add-new-slice-open');
    const expected = fixture.expected as any;
    const { result, ctx } = runExistingSlicing(fixture);
    const slices = findSlices(result);
    expect(slices).toHaveLength(expected.sliceCount);
    for (const n of expected.sliceNames) {
      expect(slices.map((s) => s.sliceName)).toContain(n);
    }
    expect(ctx.issues.filter((i) => i.code === 'SLICING_ERROR')).toHaveLength(0);
  });

  it('preserve-unmatched-base', () => {
    const fixture = loadFixture('17-existing-slicing', 'preserve-unmatched-base');
    const expected = fixture.expected as any;
    const { result } = runExistingSlicing(fixture);
    const slices = findSlices(result);
    expect(slices).toHaveLength(expected.sliceCount);
    expect(slices.map((s) => s.sliceName)).toEqual(expected.sliceNames);
  });

  it('merge-slicing-def', () => {
    const fixture = loadFixture('17-existing-slicing', 'merge-slicing-def');
    const expected = fixture.expected as any;
    const { result } = runExistingSlicing(fixture);
    const root = findSlicingRoot(result, 'Patient.identifier');
    expect(root).toBeDefined();
    expect(root!.slicing!.description).toBe(expected.slicingDescription);
  });

  it('no-diff-slices', () => {
    const fixture = loadFixture('17-existing-slicing', 'no-diff-slices');
    const expected = fixture.expected as any;
    const { result } = runExistingSlicing(fixture);
    const slices = findSlices(result);
    expect(slices).toHaveLength(expected.sliceCount);
    expect(slices.map((s) => s.sliceName)).toEqual(expected.sliceNames);
  });
});

// ===========================================================================
// Section 9: Fixture-based tests — 18-slicing-compatibility
// ===========================================================================

describe('Fixture: 18-slicing-compatibility', () => {
  function runCompatibility(fixture: Record<string, unknown>) {
    const base = slicing(fixture.baseSlicing as Record<string, unknown>);
    const diff = slicing(fixture.diffSlicing as Record<string, unknown>);
    const issues: SnapshotIssue[] = [];
    const result = validateSlicingCompatibility(base, diff, issues, 'test.path');
    return { result, issues };
  }

  it('matching-discriminators', () => {
    const fixture = loadFixture('18-slicing-compatibility', 'matching-discriminators');
    const expected = fixture.expected as any;
    const { result, issues } = runCompatibility(fixture);
    expect(result).toBe(expected.compatible);
    expect(issues).toHaveLength(expected.issueCount);
  });

  it('discriminator-mismatch', () => {
    const fixture = loadFixture('18-slicing-compatibility', 'discriminator-mismatch');
    const expected = fixture.expected as any;
    const { result, issues } = runCompatibility(fixture);
    expect(result).toBe(expected.compatible);
    expect(issues.length).toBeGreaterThanOrEqual(expected.issueCount);
    expect(issues.some((i) => i.code === expected.issueCode)).toBe(true);
  });

  it('ordered-relaxation', () => {
    const fixture = loadFixture('18-slicing-compatibility', 'ordered-relaxation');
    const expected = fixture.expected as any;
    const { result, issues } = runCompatibility(fixture);
    expect(result).toBe(expected.compatible);
    expect(issues.some((i) => i.code === expected.issueCode)).toBe(true);
  });

  it('rules-relaxation', () => {
    const fixture = loadFixture('18-slicing-compatibility', 'rules-relaxation');
    const expected = fixture.expected as any;
    const { result, issues } = runCompatibility(fixture);
    expect(result).toBe(expected.compatible);
    expect(issues.some((i) => i.code === expected.issueCode)).toBe(true);
  });

  it('rules-tightening', () => {
    const fixture = loadFixture('18-slicing-compatibility', 'rules-tightening');
    const expected = fixture.expected as any;
    const { result, issues } = runCompatibility(fixture);
    expect(result).toBe(expected.compatible);
    expect(issues).toHaveLength(expected.issueCount);
  });
});

// ===========================================================================
// Section 10: Fixture-based tests — 19-type-slicing
// ===========================================================================

describe('Fixture: 19-type-slicing', () => {
  function runTypeSlicing(fixture: Record<string, unknown>) {
    const diffs = trackers(fixture.diffMatches as Record<string, unknown>[]);
    const baseTypes = fixture.baseTypes as any[] | undefined;
    return diffsConstrainTypes(diffs, fixture.basePath as string, baseTypes as any);
  }

  it('choice-type-slicing', () => {
    const fixture = loadFixture('19-type-slicing', 'choice-type-slicing');
    expect(runTypeSlicing(fixture)).toBe((fixture.expected as any).isTypeSlicing);
  });

  it('different-type-constraints', () => {
    const fixture = loadFixture('19-type-slicing', 'different-type-constraints');
    expect(runTypeSlicing(fixture)).toBe((fixture.expected as any).isTypeSlicing);
  });

  it('same-type-not-type-slicing', () => {
    const fixture = loadFixture('19-type-slicing', 'same-type-not-type-slicing');
    expect(runTypeSlicing(fixture)).toBe((fixture.expected as any).isTypeSlicing);
  });

  it('single-diff-not-type-slicing', () => {
    const fixture = loadFixture('19-type-slicing', 'single-diff-not-type-slicing');
    expect(runTypeSlicing(fixture)).toBe((fixture.expected as any).isTypeSlicing);
  });

  it('no-types-not-type-slicing', () => {
    const fixture = loadFixture('19-type-slicing', 'no-types-not-type-slicing');
    expect(runTypeSlicing(fixture)).toBe((fixture.expected as any).isTypeSlicing);
  });
});

// ===========================================================================
// Section 11: Fixture-based tests — 20-extension-slicing
// ===========================================================================

describe('Fixture: 20-extension-slicing', () => {
  it('auto-extension-slicing', () => {
    const fixture = loadFixture('20-extension-slicing', 'auto-extension-slicing');
    const expected = fixture.expected as any;
    const s = makeExtensionSlicing();
    expect(s.discriminator![0].type).toBe(expected.discriminatorType);
    expect(s.discriminator![0].path).toBe(expected.discriminatorPath);
    expect(s.rules).toBe(expected.rules);
    expect(s.ordered).toBe(expected.ordered);
  });

  it('modifier-extension-slicing', () => {
    const fixture = loadFixture('20-extension-slicing', 'modifier-extension-slicing');
    const expected = fixture.expected as any;
    const s = makeExtensionSlicing();
    expect(s.discriminator![0].type).toBe(expected.discriminatorType);
    expect(s.discriminator![0].path).toBe(expected.discriminatorPath);
  });

  it('extension-with-explicit-slicing', () => {
    const fixture = loadFixture('20-extension-slicing', 'extension-with-explicit-slicing');
    const expected = fixture.expected as any;
    const baseElements = eds(fixture.baseElements as Record<string, unknown>[]);
    const diffElements = eds(fixture.diffElements as Record<string, unknown>[]);
    const diffMatches = diffElements.map(createDiffTracker);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleNewSlicing(
      ctx, result, baseElements[1],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.extension',
    );

    const root = findSlicingRoot(result, 'Patient.extension');
    expect(root!.slicing!.rules).toBe(expected.slicingRules);
    expect(findSlices(result)).toHaveLength(expected.sliceCount);
  });

  it('multiple-extension-slices', () => {
    const fixture = loadFixture('20-extension-slicing', 'multiple-extension-slices');
    const expected = fixture.expected as any;
    const baseElements = eds(fixture.baseElements as Record<string, unknown>[]);
    const diffElements = eds(fixture.diffElements as Record<string, unknown>[]);
    const diffMatches = diffElements.map(createDiffTracker);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleNewSlicing(
      ctx, result, baseElements[1],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.extension',
    );

    const root = findSlicingRoot(result, 'Patient.extension');
    expect(root!.slicing).toBeDefined();
    expect(findSlices(result)).toHaveLength(expected.sliceCount);
  });

  it('non-extension-no-auto', () => {
    // Non-extension paths should not get auto extension slicing
    const baseElements = eds([
      { path: 'Patient', min: 0, max: '*' },
      { path: 'Patient.identifier', min: 0, max: '*' },
    ]);
    const diffMatches = trackers([
      { path: 'Patient.identifier', sliceName: 'MRN', min: 1 },
    ]);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    handleNewSlicing(
      ctx, result, baseElements[1],
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      'Patient', 'Patient', 'Patient.identifier',
    );

    const root = findSlicingRoot(result, 'Patient.identifier');
    // Should have synthesized basic slicing, NOT extension slicing
    expect(root!.slicing).toBeDefined();
    // Extension slicing has discriminator with path='url'
    const hasUrlDisc = root!.slicing!.discriminator?.some((d) => d.path === 'url');
    expect(hasUrlDisc).toBeFalsy();
  });
});

// ===========================================================================
// Section 12: Fixture-based tests — 21-slice-siblings
// ===========================================================================

describe('Fixture: 21-slice-siblings', () => {
  it('basic-siblings', () => {
    const fixture = loadFixture('21-slice-siblings', 'basic-siblings');
    const expected = fixture.expected as any;
    const elements = eds(fixture.elements as Record<string, unknown>[]);
    const siblings = getSliceSiblings(elements, fixture.slicingRootIndex as number);
    expect(siblings).toHaveLength(expected.siblingCount);
  });

  it('siblings-with-children', () => {
    const fixture = loadFixture('21-slice-siblings', 'siblings-with-children');
    const expected = fixture.expected as any;
    const elements = eds(fixture.elements as Record<string, unknown>[]);
    const siblings = getSliceSiblings(elements, fixture.slicingRootIndex as number);
    expect(siblings).toHaveLength(expected.siblingCount);
  });

  it('no-siblings', () => {
    const fixture = loadFixture('21-slice-siblings', 'no-siblings');
    const expected = fixture.expected as any;
    const elements = eds(fixture.elements as Record<string, unknown>[]);
    const siblings = getSliceSiblings(elements, fixture.slicingRootIndex as number);
    expect(siblings).toHaveLength(expected.siblingCount);
  });

  it('single-sibling', () => {
    const fixture = loadFixture('21-slice-siblings', 'single-sibling');
    const expected = fixture.expected as any;
    const elements = eds(fixture.elements as Record<string, unknown>[]);
    const siblings = getSliceSiblings(elements, fixture.slicingRootIndex as number);
    expect(siblings).toHaveLength(expected.siblingCount);
  });

  it('invalid-index', () => {
    const fixture = loadFixture('21-slice-siblings', 'invalid-index');
    const expected = fixture.expected as any;
    const elements = eds(fixture.elements as Record<string, unknown>[]);
    const siblings = getSliceSiblings(elements, fixture.slicingRootIndex as number);
    expect(siblings).toHaveLength(expected.siblingCount);
  });
});

// ===========================================================================
// Section 13: Fixture-based tests — 22-closed-slicing
// ===========================================================================

describe('Fixture: 22-closed-slicing', () => {
  function runClosedSlicing(fixture: Record<string, unknown>) {
    const baseElements = eds(fixture.baseElements as Record<string, unknown>[]);
    const diffElements = eds(fixture.diffElements as Record<string, unknown>[]);
    const diffMatches = diffElements.map(createDiffTracker);
    const ctx = createMergeContext('http://example.org/test');
    const result: ElementDefinition[] = [];

    const slicingRoot = baseElements.find((e) => e.slicing !== undefined);
    if (!slicingRoot) return { result, ctx };

    const slicePath = slicingRoot.path as string;

    handleExistingSlicing(
      ctx, result, slicingRoot,
      { elements: baseElements, start: 0, end: baseElements.length - 1 },
      diffMatches, diffMatches, 0, diffMatches.length - 1,
      slicePath.split('.')[0], slicePath.split('.')[0], slicePath,
    );

    return { result, ctx };
  }

  it('reject-new-slice-closed', () => {
    const fixture = loadFixture('22-closed-slicing', 'reject-new-slice-closed');
    const expected = fixture.expected as any;
    const { ctx } = runClosedSlicing(fixture);
    expect(ctx.issues.some((i) => i.code === 'SLICING_ERROR')).toBe(expected.hasSlicingError);
    expect(ctx.issues.some((i) => i.message.includes(expected.errorMessage))).toBe(true);
  });

  it('allow-existing-slice-closed', () => {
    const fixture = loadFixture('22-closed-slicing', 'allow-existing-slice-closed');
    const expected = fixture.expected as any;
    const { result, ctx } = runClosedSlicing(fixture);
    expect(ctx.issues.some((i) => i.code === 'SLICING_ERROR')).toBe(expected.hasSlicingError);
    const mrn = findSlices(result).find((s) => s.sliceName === 'MRN');
    expect(mrn?.min).toBe(expected.mrnMin);
  });

  it('open-at-end-allows-new', () => {
    const fixture = loadFixture('22-closed-slicing', 'open-at-end-allows-new');
    const expected = fixture.expected as any;
    const { result, ctx } = runClosedSlicing(fixture);
    expect(ctx.issues.some((i) => i.code === 'SLICING_ERROR')).toBe(expected.hasSlicingError);
    expect(findSlices(result)).toHaveLength(expected.sliceCount);
  });

  it('open-allows-new', () => {
    const fixture = loadFixture('22-closed-slicing', 'open-allows-new');
    const expected = fixture.expected as any;
    const { result, ctx } = runClosedSlicing(fixture);
    expect(ctx.issues.some((i) => i.code === 'SLICING_ERROR')).toBe(expected.hasSlicingError);
    expect(findSlices(result)).toHaveLength(expected.sliceCount);
  });

  it('multiple-new-slices-closed', () => {
    const fixture = loadFixture('22-closed-slicing', 'multiple-new-slices-closed');
    const expected = fixture.expected as any;
    const { ctx } = runClosedSlicing(fixture);
    expect(ctx.issues.some((i) => i.code === 'SLICING_ERROR')).toBe(expected.hasSlicingError);
    const slicingErrors = ctx.issues.filter((i) => i.code === 'SLICING_ERROR');
    expect(slicingErrors).toHaveLength(expected.errorCount);
  });
});
