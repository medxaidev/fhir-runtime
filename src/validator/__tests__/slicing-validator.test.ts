/**
 * fhir-validator — Slicing Validator Tests
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanonicalElement, SlicingDiscriminatorDef } from '../../model/canonical-profile.js';
import type { ValidationIssue } from '../types.js';
import {
  validateSlicing, findMatchingSlice, matchesDiscriminator,
  isSliceOrderValid, extractValueAtPath, getSliceDiscriminatorValue, getSliceTypes,
} from '../slicing-validator.js';

const FIXTURE_BASE = resolve(__dirname, 'fixtures', 'slicing');
function loadFixture(sub: string, file: string): any {
  return JSON.parse(readFileSync(resolve(FIXTURE_BASE, sub, file), 'utf-8'));
}
function toElement(raw: any): CanonicalElement {
  return {
    path: raw.path, id: raw.id, min: raw.min,
    max: raw.max === 'unbounded' ? 'unbounded' : raw.max,
    types: raw.types ?? [], constraints: raw.constraints ?? [],
    mustSupport: raw.mustSupport ?? false, isModifier: raw.isModifier ?? false,
    isSummary: raw.isSummary ?? false,
    slicing: raw.slicing ? { discriminators: raw.slicing.discriminators, rules: raw.slicing.rules, ordered: raw.slicing.ordered } : undefined,
    sliceName: raw.sliceName, fixed: raw.fixed, pattern: raw.pattern,
  };
}
function makeSlice(overrides: Partial<CanonicalElement> = {}): CanonicalElement {
  return { path: 'T', id: 'T:A', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false, sliceName: 'A', ...overrides };
}

// === extractValueAtPath ===
describe('extractValueAtPath', () => {
  it('simple property', () => { expect(extractValueAtPath({ system: 'x' }, 'system')).toBe('x'); });
  it('nested', () => { expect(extractValueAtPath({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1); });
  it('$this', () => { const v = { x: 1 }; expect(extractValueAtPath(v, '$this')).toBe(v); });
  it('missing → undefined', () => { expect(extractValueAtPath({ a: 1 }, 'b')).toBeUndefined(); });
  it('null → undefined', () => { expect(extractValueAtPath(null, 'a')).toBeUndefined(); });
  it('array auto-selects first', () => { expect(extractValueAtPath({ c: [{ s: 'x' }, { s: 'y' }] }, 'c.s')).toBe('x'); });
  it('empty array → undefined', () => { expect(extractValueAtPath({ c: [] }, 'c.s')).toBeUndefined(); });
  it('deep path', () => { expect(extractValueAtPath({ a: { b: { c: { d: 42 } } } }, 'a.b.c.d')).toBe(42); });
  it('primitive with path → undefined', () => { expect(extractValueAtPath('hello', 'length')).toBeUndefined(); });
});

// === getSliceDiscriminatorValue ===
describe('getSliceDiscriminatorValue', () => {
  it('fixed value at path', () => { expect(getSliceDiscriminatorValue(makeSlice({ fixed: { system: 'x' } }), 'system')).toBe('x'); });
  it('pattern value at path', () => { expect(getSliceDiscriminatorValue(makeSlice({ pattern: { system: 'y' } }), 'system')).toBe('y'); });
  it('$this returns entire fixed', () => { expect(getSliceDiscriminatorValue(makeSlice({ fixed: 'hello' }), '$this')).toBe('hello'); });
  it('no fixed/pattern → undefined', () => { expect(getSliceDiscriminatorValue(makeSlice({}), 'system')).toBeUndefined(); });
  it('fixed takes precedence', () => { expect(getSliceDiscriminatorValue(makeSlice({ fixed: { s: 'f' }, pattern: { s: 'p' } }), 's')).toBe('f'); });
});

// === getSliceTypes ===
describe('getSliceTypes', () => {
  it('returns codes', () => { expect(getSliceTypes(makeSlice({ types: [{ code: 'Quantity' }] }), '$this')).toEqual(['Quantity']); });
  it('empty', () => { expect(getSliceTypes(makeSlice({}), '$this')).toEqual([]); });
});

// === matchesDiscriminator ===
describe('matchesDiscriminator', () => {
  it('value match', () => { expect(matchesDiscriminator({ system: 'x' }, makeSlice({ fixed: { system: 'x' } }), { type: 'value', path: 'system' })).toBe(true); });
  it('value mismatch', () => { expect(matchesDiscriminator({ system: 'y' }, makeSlice({ fixed: { system: 'x' } }), { type: 'value', path: 'system' })).toBe(false); });
  it('value no constraint → true', () => { expect(matchesDiscriminator({ system: 'y' }, makeSlice({}), { type: 'value', path: 'system' })).toBe(true); });
  it('pattern match', () => { expect(matchesDiscriminator({ coding: [{ system: 'x', code: '1' }] }, makeSlice({ pattern: { coding: [{ system: 'x' }] } }), { type: 'pattern', path: '$this' })).toBe(true); });
  it('pattern mismatch', () => { expect(matchesDiscriminator({ coding: [{ system: 'y' }] }, makeSlice({ pattern: { coding: [{ system: 'x' }] } }), { type: 'pattern', path: '$this' })).toBe(false); });
  it('type match', () => { expect(matchesDiscriminator({ value: { value: 1, unit: 'mg', system: 'http://u', code: 'mg' } }, makeSlice({ types: [{ code: 'Quantity' }] }), { type: 'type', path: 'value' })).toBe(true); });
  it('type mismatch', () => { expect(matchesDiscriminator({ value: 'str' }, makeSlice({ types: [{ code: 'Quantity' }] }), { type: 'type', path: 'value' })).toBe(false); });
  it('exists true', () => { expect(matchesDiscriminator({ vQ: 1 }, makeSlice({}), { type: 'exists', path: 'vQ' })).toBe(true); });
  it('exists false', () => { expect(matchesDiscriminator({ vS: 'x' }, makeSlice({}), { type: 'exists', path: 'vQ' })).toBe(false); });
  it('profile → true', () => { expect(matchesDiscriminator({}, makeSlice({}), { type: 'profile', path: '$this' })).toBe(true); });
  it('unknown → false', () => { expect(matchesDiscriminator({}, makeSlice({}), { type: 'unknown' as any, path: '$this' })).toBe(false); });
});

// === findMatchingSlice ===
describe('findMatchingSlice', () => {
  const d: SlicingDiscriminatorDef[] = [{ type: 'value', path: 'system' }];
  const s1 = makeSlice({ sliceName: 'A', fixed: { system: 'a' } });
  const s2 = makeSlice({ sliceName: 'B', fixed: { system: 'b' } });
  it('matches first', () => { expect(findMatchingSlice({ system: 'a' }, [s1, s2], d)?.sliceName).toBe('A'); });
  it('matches second', () => { expect(findMatchingSlice({ system: 'b' }, [s1, s2], d)?.sliceName).toBe('B'); });
  it('no match', () => { expect(findMatchingSlice({ system: 'x' }, [s1], d)).toBeUndefined(); });
  it('empty slices', () => { expect(findMatchingSlice({ system: 'a' }, [], d)).toBeUndefined(); });
  it('no sliceName skipped', () => { const ns = makeSlice({ sliceName: undefined, fixed: { system: 'a' } }); expect(findMatchingSlice({ system: 'a' }, [ns], d)).toBeUndefined(); });
});

// === isSliceOrderValid ===
describe('isSliceOrderValid', () => {
  const d: SlicingDiscriminatorDef[] = [{ type: 'value', path: 'c' }];
  const sA = makeSlice({ sliceName: 'A', fixed: { c: 'a' } });
  const sB = makeSlice({ sliceName: 'B', fixed: { c: 'b' } });
  it('correct order', () => { expect(isSliceOrderValid([{ c: 'a' }, { c: 'b' }], [sA, sB], d)).toBe(true); });
  it('wrong order', () => { expect(isSliceOrderValid([{ c: 'b' }, { c: 'a' }], [sA, sB], d)).toBe(false); });
  it('single', () => { expect(isSliceOrderValid([{ c: 'b' }], [sA, sB], d)).toBe(true); });
  it('unmatched ignored', () => { expect(isSliceOrderValid([{ c: 'a' }, { c: 'x' }, { c: 'b' }], [sA, sB], d)).toBe(true); });
  it('empty', () => { expect(isSliceOrderValid([], [sA], d)).toBe(true); });
});

// === validateSlicing unit ===
describe('validateSlicing', () => {
  it('no slicing → no issues', () => {
    const r = makeSlice({ sliceName: undefined, slicing: undefined, max: 'unbounded' as any });
    const i: ValidationIssue[] = []; validateSlicing(r, [], [{}], i); expect(i).toHaveLength(0);
  });
  it('closed + unmatched → SLICING_NO_MATCH', () => {
    const r = makeSlice({ sliceName: undefined, max: 'unbounded' as any, slicing: { discriminators: [{ type: 'value', path: 'system' }], rules: 'closed', ordered: false } });
    const s = [makeSlice({ fixed: { system: 'x' } })];
    const i: ValidationIssue[] = []; validateSlicing(r, s, [{ system: 'y' }], i);
    expect(i.some(x => x.code === 'SLICING_NO_MATCH')).toBe(true);
  });
  it('open + unmatched → no error', () => {
    const r = makeSlice({ sliceName: undefined, max: 'unbounded' as any, slicing: { discriminators: [{ type: 'value', path: 'system' }], rules: 'open', ordered: false } });
    const s = [makeSlice({ fixed: { system: 'x' } })];
    const i: ValidationIssue[] = []; validateSlicing(r, s, [{ system: 'y' }], i); expect(i).toHaveLength(0);
  });
  it('ordered wrong → SLICING_ORDER_VIOLATION', () => {
    const r = makeSlice({ sliceName: undefined, max: 'unbounded' as any, slicing: { discriminators: [{ type: 'value', path: 'c' }], rules: 'open', ordered: true } });
    const s = [makeSlice({ sliceName: 'A', fixed: { c: 'a' } }), makeSlice({ sliceName: 'B', fixed: { c: 'b' } })];
    const i: ValidationIssue[] = []; validateSlicing(r, s, [{ c: 'b' }, { c: 'a' }], i);
    expect(i.some(x => x.code === 'SLICING_ORDER_VIOLATION')).toBe(true);
  });
  it('slice min violation', () => {
    const r = makeSlice({ sliceName: undefined, max: 'unbounded' as any, slicing: { discriminators: [{ type: 'value', path: 's' }], rules: 'open', ordered: false } });
    const s = [makeSlice({ min: 1, fixed: { s: 'x' } })];
    const i: ValidationIssue[] = []; validateSlicing(r, s, [], i);
    expect(i.some(x => x.code === 'CARDINALITY_MIN_VIOLATION')).toBe(true);
  });
  it('openAtEnd unmatched before matched → error', () => {
    const r = makeSlice({ sliceName: undefined, max: 'unbounded' as any, slicing: { discriminators: [{ type: 'value', path: 's' }], rules: 'openAtEnd', ordered: false } });
    const s = [makeSlice({ fixed: { s: 'x' } })];
    const i: ValidationIssue[] = []; validateSlicing(r, s, [{ s: 'y' }, { s: 'x' }], i);
    expect(i.some(x => x.code === 'SLICING_NO_MATCH')).toBe(true);
  });
});

// === Fixture: discriminator ===
function runFixtureScenarios(sub: string, file: string) {
  const f = loadFixture(sub, file);
  const root = toElement(f.slicingRoot);
  const slices = (f.slices ?? []).map(toElement);
  if (f.scenarios) {
    for (const sc of f.scenarios) {
      it(sc.label, () => {
        const i: ValidationIssue[] = []; validateSlicing(root, slices, sc.values, i);
        expect(i).toHaveLength(sc.expectedIssueCount);
        if (sc.expectedIssueCodes) sc.expectedIssueCodes.forEach((c: string, idx: number) => expect(i[idx].code).toBe(c));
      });
    }
  } else {
    it(f.description, () => {
      const i: ValidationIssue[] = []; validateSlicing(root, slices, f.values, i);
      expect(i).toHaveLength(f.expectedIssueCount);
      if (f.expectedIssueCodes) f.expectedIssueCodes.forEach((c: string, idx: number) => expect(i[idx].code).toBe(c));
    });
  }
}

describe('Fixture: disc/01', () => { runFixtureScenarios('discriminator', '01-value-discriminator-system.json'); });
describe('Fixture: disc/02', () => { runFixtureScenarios('discriminator', '02-value-discriminator-url.json'); });
describe('Fixture: disc/03', () => { runFixtureScenarios('discriminator', '03-type-discriminator.json'); });
describe('Fixture: disc/04', () => { runFixtureScenarios('discriminator', '04-exists-discriminator.json'); });
describe('Fixture: disc/05', () => { runFixtureScenarios('discriminator', '05-multiple-discriminators.json'); });
describe('Fixture: disc/06', () => { runFixtureScenarios('discriminator', '06-pattern-discriminator.json'); });

// === Fixture: rules ===
describe('Fixture: rules/01', () => { runFixtureScenarios('rules', '01-closed-unmatched.json'); });
describe('Fixture: rules/02', () => { runFixtureScenarios('rules', '02-open-unmatched.json'); });
describe('Fixture: rules/03', () => { runFixtureScenarios('rules', '03-openAtEnd-valid.json'); });
describe('Fixture: rules/04', () => { runFixtureScenarios('rules', '04-closed-empty.json'); });
describe('Fixture: rules/05', () => { runFixtureScenarios('rules', '05-no-slicing-definition.json'); });

// === Fixture: order ===
describe('Fixture: order/01', () => { runFixtureScenarios('order', '01-ordered-correct.json'); });
describe('Fixture: order/02', () => { runFixtureScenarios('order', '02-ordered-wrong.json'); });
describe('Fixture: order/03', () => { runFixtureScenarios('order', '03-ordered-single-slice.json'); });
describe('Fixture: order/04', () => { runFixtureScenarios('order', '04-unordered-any-order.json'); });
describe('Fixture: order/05', () => { runFixtureScenarios('order', '05-slice-cardinality-max.json'); });

// === Barrel exports ===
describe('Barrel exports (slicing)', () => {
  it('all functions importable from index', async () => {
    const m = await import('../index.js');
    expect(m.validateSlicing).toBeDefined();
    expect(m.findMatchingSlice).toBeDefined();
    expect(m.matchesDiscriminator).toBeDefined();
    expect(m.isSliceOrderValid).toBeDefined();
    expect(m.extractValueAtPath).toBeDefined();
    expect(m.getSliceDiscriminatorValue).toBeDefined();
    expect(m.getSliceTypes).toBeDefined();
  });
});
