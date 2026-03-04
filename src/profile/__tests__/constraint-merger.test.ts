/**
 * constraint-merger.test.ts — Unit tests for fhir-profile constraint merging engine.
 *
 * Covers all merge strategies from HAPI updateFromDefinition/updateFromBase:
 * - Cardinality merging (min/max validation + slice exception)
 * - Type compatibility checking (subset, wildcards, special allowances)
 * - Binding strength validation (REQUIRED relaxation guard)
 * - Constraint list append/dedup by key
 * - Documentation/value/flag overwrite
 * - Base traceability (setBaseTraceability)
 * - isLargerMax utility
 * - Full mergeConstraints integration
 * - Fixture-based tests (25 JSON fixtures across 5 categories)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ElementDefinition } from '../../model/index.js';
import type { SnapshotIssue } from '../types.js';
import {
  mergeConstraints,
  setBaseTraceability,
  mergeCardinality,
  mergeTypes,
  mergeBinding,
  mergeConstraintList,
  isLargerMax,
} from '../constraint-merger.js';

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

/** Create a minimal ElementDefinition for testing. Casts handle branded types. */
function ed(overrides: Record<string, unknown>): ElementDefinition {
  return { path: 'Test.element', ...overrides } as unknown as ElementDefinition;
}

/** Cast a plain object to ElementDefinitionBinding. */
function binding(obj: Record<string, unknown>) {
  return obj as unknown as ElementDefinition['binding'];
}

/** Cast a plain array to ElementDefinitionConstraint[]. */
function constraints(arr: Record<string, unknown>[]) {
  return arr as unknown as NonNullable<ElementDefinition['constraint']>;
}

// ===========================================================================
// Section 1: isLargerMax
// ===========================================================================

describe('isLargerMax', () => {
  it('returns true when a > b (numbers)', () => {
    expect(isLargerMax('5', '3')).toBe(true);
  });

  it('returns false when a < b (numbers)', () => {
    expect(isLargerMax('3', '5')).toBe(false);
  });

  it('returns false when a === b', () => {
    expect(isLargerMax('3', '3')).toBe(false);
  });

  it('returns true when a is * and b is number', () => {
    expect(isLargerMax('*', '3')).toBe(true);
  });

  it('returns false when a is number and b is *', () => {
    expect(isLargerMax('3', '*')).toBe(false);
  });

  it('returns false when both are *', () => {
    expect(isLargerMax('*', '*')).toBe(false);
  });

  it('returns true for * vs 0', () => {
    expect(isLargerMax('*', '0')).toBe(true);
  });

  it('returns true for 1 vs 0', () => {
    expect(isLargerMax('1', '0')).toBe(true);
  });
});

// ===========================================================================
// Section 2: mergeCardinality (unit tests)
// ===========================================================================

describe('mergeCardinality', () => {
  it('tightens min without issue', () => {
    const dest = ed({ min: 0, max: '*' });
    const source = ed({ min: 1 });
    const issues: SnapshotIssue[] = [];
    mergeCardinality(dest, source, issues);
    expect(dest.min).toBe(1);
    expect(issues).toHaveLength(0);
  });

  it('tightens max without issue', () => {
    const dest = ed({ min: 0, max: '*' });
    const source = ed({ max: '1' });
    const issues: SnapshotIssue[] = [];
    mergeCardinality(dest, source, issues);
    expect(dest.max).toBe('1');
    expect(issues).toHaveLength(0);
  });

  it('records error when loosening min', () => {
    const dest = ed({ min: 1, max: '*' });
    const source = ed({ min: 0 });
    const issues: SnapshotIssue[] = [];
    mergeCardinality(dest, source, issues);
    expect(dest.min).toBe(0); // still applied
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('CARDINALITY_VIOLATION');
  });

  it('records error when widening max', () => {
    const dest = ed({ min: 0, max: '1' });
    const source = ed({ max: '*' });
    const issues: SnapshotIssue[] = [];
    mergeCardinality(dest, source, issues);
    expect(dest.max).toBe('*'); // still applied
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('CARDINALITY_VIOLATION');
  });

  it('allows slice to have min < base min (slice exception)', () => {
    const dest = ed({ min: 1, max: '*' });
    const source = ed({ min: 0, sliceName: 'MRN' });
    const issues: SnapshotIssue[] = [];
    mergeCardinality(dest, source, issues);
    expect(dest.min).toBe(0);
    expect(issues).toHaveLength(0);
  });

  it('does not touch min/max when source has neither', () => {
    const dest = ed({ min: 1, max: '5' });
    const source = ed({});
    const issues: SnapshotIssue[] = [];
    mergeCardinality(dest, source, issues);
    expect(dest.min).toBe(1);
    expect(dest.max).toBe('5');
    expect(issues).toHaveLength(0);
  });
});

// ===========================================================================
// Section 3: mergeTypes (unit tests)
// ===========================================================================

describe('mergeTypes', () => {
  it('returns base types when diff is undefined', () => {
    const base = [{ code: 'string' }] as ElementDefinition['type'];
    const result = mergeTypes(base, undefined, [], 'Test.x');
    expect(result).toHaveLength(1);
    expect(result![0].code).toBe('string');
  });

  it('replaces base types with compatible derived types', () => {
    const base = [{ code: 'Quantity' }, { code: 'string' }] as ElementDefinition['type'];
    const diff = [{ code: 'Quantity' }] as ElementDefinition['type'];
    const issues: SnapshotIssue[] = [];
    const result = mergeTypes(base, diff, issues, 'Obs.value');
    expect(result).toHaveLength(1);
    expect(result![0].code).toBe('Quantity');
    expect(issues).toHaveLength(0);
  });

  it('records error for incompatible type', () => {
    const base = [{ code: 'Quantity' }, { code: 'string' }] as ElementDefinition['type'];
    const diff = [{ code: 'Reference' }] as ElementDefinition['type'];
    const issues: SnapshotIssue[] = [];
    const result = mergeTypes(base, diff, issues, 'Obs.value');
    expect(result).toHaveLength(1);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('TYPE_INCOMPATIBLE');
  });

  it('allows Extension type against any base', () => {
    const base = [{ code: 'string' }] as ElementDefinition['type'];
    const diff = [{ code: 'Extension' }] as ElementDefinition['type'];
    const issues: SnapshotIssue[] = [];
    mergeTypes(base, diff, issues, 'Test.x');
    expect(issues).toHaveLength(0);
  });

  it('allows any type against Resource base', () => {
    const base = [{ code: 'Resource' }] as ElementDefinition['type'];
    const diff = [{ code: 'Patient' }] as ElementDefinition['type'];
    const issues: SnapshotIssue[] = [];
    mergeTypes(base, diff, issues, 'Bundle.entry.resource');
    expect(issues).toHaveLength(0);
  });

  it('allows uri vs string (historical workaround)', () => {
    const base = [{ code: 'string' }] as ElementDefinition['type'];
    const diff = [{ code: 'uri' }] as ElementDefinition['type'];
    const issues: SnapshotIssue[] = [];
    mergeTypes(base, diff, issues, 'Test.x');
    expect(issues).toHaveLength(0);
  });

  it('allows * wildcard base', () => {
    const base = [{ code: '*' }] as ElementDefinition['type'];
    const diff = [{ code: 'Quantity' }] as ElementDefinition['type'];
    const issues: SnapshotIssue[] = [];
    mergeTypes(base, diff, issues, 'Test.x');
    expect(issues).toHaveLength(0);
  });
});

// ===========================================================================
// Section 4: mergeBinding (unit tests)
// ===========================================================================

describe('mergeBinding', () => {
  it('returns diff binding when base is undefined', () => {
    const diff = binding({ strength: 'required', valueSet: 'http://example.org/vs' });
    const result = mergeBinding(undefined, diff, [], 'Test.x');
    expect(result?.strength).toBe('required');
  });

  it('returns base binding when diff is undefined', () => {
    const base = binding({ strength: 'extensible', valueSet: 'http://example.org/vs' });
    const result = mergeBinding(base, undefined, [], 'Test.x');
    expect(result?.strength).toBe('extensible');
  });

  it('allows tightening from extensible to required', () => {
    const base = binding({ strength: 'extensible' });
    const diff = binding({ strength: 'required', valueSet: 'http://example.org/vs' });
    const issues: SnapshotIssue[] = [];
    const result = mergeBinding(base, diff, issues, 'Test.x');
    expect(result?.strength).toBe('required');
    expect(issues).toHaveLength(0);
  });

  it('records error when relaxing REQUIRED binding', () => {
    const base = binding({ strength: 'required', valueSet: 'http://hl7.org/fhir/ValueSet/gender' });
    const diff = binding({ strength: 'extensible', valueSet: 'http://example.org/vs' });
    const issues: SnapshotIssue[] = [];
    const result = mergeBinding(base, diff, issues, 'Patient.gender');
    expect(result?.strength).toBe('extensible'); // still applied
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('BINDING_VIOLATION');
  });

  it('allows same REQUIRED strength with different valueSet', () => {
    const base = binding({ strength: 'required', valueSet: 'http://hl7.org/fhir/ValueSet/a' });
    const diff = binding({ strength: 'required', valueSet: 'http://example.org/ValueSet/b' });
    const issues: SnapshotIssue[] = [];
    mergeBinding(base, diff, issues, 'Test.x');
    expect(issues).toHaveLength(0);
  });
});

// ===========================================================================
// Section 5: mergeConstraintList (unit tests)
// ===========================================================================

describe('mergeConstraintList', () => {
  it('returns diff constraints when base is undefined', () => {
    const diff = constraints([{ key: 'c1', severity: 'error', human: 'Test' }]);
    const result = mergeConstraintList(undefined, diff);
    expect(result).toHaveLength(1);
  });

  it('returns base constraints when diff is undefined', () => {
    const base = constraints([{ key: 'c1', severity: 'error', human: 'Test' }]);
    const result = mergeConstraintList(base, undefined);
    expect(result).toHaveLength(1);
  });

  it('appends new constraints', () => {
    const base = constraints([{ key: 'c1', severity: 'error', human: 'Base' }]);
    const diff = constraints([{ key: 'c2', severity: 'warning', human: 'Diff' }]);
    const result = mergeConstraintList(base, diff);
    expect(result).toHaveLength(2);
    expect(result!.map((c) => c.key)).toEqual(['c1', 'c2']);
  });

  it('replaces constraint with same key', () => {
    const base = constraints([{ key: 'c1', severity: 'error', human: 'Original' }]);
    const diff = constraints([{ key: 'c1', severity: 'error', human: 'Updated' }]);
    const result = mergeConstraintList(base, diff);
    expect(result).toHaveLength(1);
    expect(result![0].human).toBe('Updated');
  });

  it('handles mix of new and replacement', () => {
    const base = constraints([
      { key: 'c1', severity: 'error', human: 'Base1' },
      { key: 'c2', severity: 'warning', human: 'Base2' },
    ]);
    const diff = constraints([
      { key: 'c1', severity: 'error', human: 'Updated1' },
      { key: 'c3', severity: 'error', human: 'New3' },
    ]);
    const result = mergeConstraintList(base, diff);
    expect(result).toHaveLength(3);
    expect(result![0].human).toBe('Updated1');
    expect(result![1].human).toBe('Base2');
    expect(result![2].human).toBe('New3');
  });
});

// ===========================================================================
// Section 6: setBaseTraceability (unit tests)
// ===========================================================================

describe('setBaseTraceability', () => {
  it('copies path/min/max from base when base has no .base', () => {
    const dest = ed({ path: 'MyProfile.name' });
    const base = ed({ path: 'Patient.name', min: 0, max: '*' });
    setBaseTraceability(dest, base);
    expect(dest.base).toBeDefined();
    expect(dest.base!.path).toBe('Patient.name');
    expect(dest.base!.min).toBe(0);
    expect(dest.base!.max).toBe('*');
  });

  it('copies from base.base when base already has .base (ancestry preservation)', () => {
    const dest = ed({ path: 'MyProfile.name' });
    const base = ed({
      path: 'USCorePatient.name',
      min: 1,
      max: '*',
      base: { path: 'Patient.name', min: 0, max: '*' },
    });
    setBaseTraceability(dest, base);
    expect(dest.base!.path).toBe('Patient.name');
    expect(dest.base!.min).toBe(0);
    expect(dest.base!.max).toBe('*');
  });

  it('uses defaults when base has no min/max', () => {
    const dest = ed({ path: 'Test.x' });
    const base = ed({ path: 'Base.x' });
    setBaseTraceability(dest, base);
    expect(dest.base!.path).toBe('Base.x');
    expect(dest.base!.min).toBe(0);
    expect(dest.base!.max).toBe('*');
  });
});

// ===========================================================================
// Section 7: mergeConstraints — full integration (unit tests)
// ===========================================================================

describe('mergeConstraints (integration)', () => {
  it('overwrites documentation fields', () => {
    const dest = ed({ short: 'Old', definition: 'Old def', mustSupport: false });
    const source = ed({ short: 'New', definition: 'New def', mustSupport: true });
    const issues: SnapshotIssue[] = [];
    mergeConstraints(dest, source, issues);
    expect(dest.short).toBe('New');
    expect(dest.definition).toBe('New def');
    expect(dest.mustSupport).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('overwrites fixed and pattern', () => {
    const dest = ed({});
    const source = ed({ fixed: 'http://example.org', pattern: { coding: [{ code: 'A' }] } });
    const issues: SnapshotIssue[] = [];
    mergeConstraints(dest, source, issues);
    expect(dest.fixed).toBe('http://example.org');
    expect(dest.pattern).toEqual({ coding: [{ code: 'A' }] });
  });

  it('warns on isSummary change when base already has it', () => {
    const dest = ed({ isSummary: true });
    const source = ed({ isSummary: false });
    const issues: SnapshotIssue[] = [];
    mergeConstraints(dest, source, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_CONSTRAINT');
    expect(dest.isSummary).toBe(true); // not changed
  });

  it('sets isSummary when base does not have it', () => {
    const dest = ed({});
    const source = ed({ isSummary: true });
    const issues: SnapshotIssue[] = [];
    mergeConstraints(dest, source, issues);
    expect(dest.isSummary).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('overwrites slicing and sliceName', () => {
    const dest = ed({});
    const source = ed({
      sliceName: 'MRN',
      slicing: { rules: 'open', discriminator: [{ type: 'value', path: 'system' }] },
    });
    const issues: SnapshotIssue[] = [];
    mergeConstraints(dest, source, issues);
    expect(dest.sliceName).toBe('MRN');
    expect(dest.slicing?.rules).toBe('open');
  });

  it('merges alias by union', () => {
    const dest = ed({ alias: ['a', 'b'] as any });
    const source = ed({ alias: ['b', 'c'] as any });
    const issues: SnapshotIssue[] = [];
    mergeConstraints(dest, source, issues);
    expect(dest.alias).toHaveLength(3);
    expect(dest.alias).toContain('a');
    expect(dest.alias).toContain('b');
    expect(dest.alias).toContain('c');
  });
});

// ===========================================================================
// Section 8: Fixture-based tests — 01-cardinality
// ===========================================================================

describe('Fixture: 01-cardinality', () => {
  const fixtures = [
    'valid-tighten-min',
    'valid-tighten-max',
    'invalid-loosen-min',
    'invalid-widen-max',
    'slice-min-exception',
  ];

  for (const name of fixtures) {
    it(`${name}`, () => {
      const fixture = loadFixture('01-cardinality', name);
      const base = fixture.base as Partial<ElementDefinition>;
      const diff = fixture.diff as Partial<ElementDefinition>;
      const expected = fixture.expected as Record<string, unknown>;

      const dest = ed(base);
      const source = ed(diff);
      const issues: SnapshotIssue[] = [];
      mergeCardinality(dest, source, issues);

      if (expected.min !== undefined) expect(dest.min).toBe(expected.min);
      if (expected.max !== undefined) expect(dest.max).toBe(expected.max);
      expect(issues).toHaveLength(expected.issueCount as number);
      if (expected.issueCode && issues.length > 0) {
        expect(issues[0].code).toBe(expected.issueCode);
      }
    });
  }
});

// ===========================================================================
// Section 9: Fixture-based tests — 02-types
// ===========================================================================

describe('Fixture: 02-types', () => {
  const fixtures = [
    'valid-subset',
    'valid-extension-wildcard',
    'valid-resource-compat',
    'invalid-incompatible',
    'valid-uri-string-compat',
  ];

  for (const name of fixtures) {
    it(`${name}`, () => {
      const fixture = loadFixture('02-types', name);
      const base = fixture.base as Record<string, unknown>;
      const diff = fixture.diff as Record<string, unknown>;
      const expected = fixture.expected as Record<string, unknown>;

      const issues: SnapshotIssue[] = [];
      const result = mergeTypes(
        base.type as ElementDefinition['type'],
        diff.type as ElementDefinition['type'],
        issues,
        base.path as string,
      );

      expect(result).toHaveLength(expected.typeCount as number);
      if (expected.typeCodes) {
        expect(result!.map((t) => t.code)).toEqual(expected.typeCodes);
      }
      expect(issues).toHaveLength(expected.issueCount as number);
      if (expected.issueCode && issues.length > 0) {
        expect(issues[0].code).toBe(expected.issueCode);
      }
    });
  }
});

// ===========================================================================
// Section 10: Fixture-based tests — 03-binding
// ===========================================================================

describe('Fixture: 03-binding', () => {
  const fixtures = [
    'valid-tighten-strength',
    'invalid-relax-required',
    'valid-same-required',
    'valid-add-binding',
    'valid-tighten-example-to-preferred',
  ];

  for (const name of fixtures) {
    it(`${name}`, () => {
      const fixture = loadFixture('03-binding', name);
      const base = fixture.base as Record<string, unknown>;
      const diff = fixture.diff as Record<string, unknown>;
      const expected = fixture.expected as Record<string, unknown>;

      const issues: SnapshotIssue[] = [];
      const result = mergeBinding(
        base.binding as ElementDefinition['binding'],
        diff.binding as ElementDefinition['binding'],
        issues,
        base.path as string,
      );

      expect(result?.strength).toBe(expected.strength);
      if (expected.valueSet) {
        expect(result?.valueSet).toBe(expected.valueSet);
      }
      expect(issues).toHaveLength(expected.issueCount as number);
      if (expected.issueCode && issues.length > 0) {
        expect(issues[0].code).toBe(expected.issueCode);
      }
    });
  }
});

// ===========================================================================
// Section 11: Fixture-based tests — 04-constraints
// ===========================================================================

describe('Fixture: 04-constraints', () => {
  const fixtures = [
    'append-new-constraint',
    'dedup-by-key',
    'multiple-append',
    'diff-only',
    'no-diff-constraints',
  ];

  for (const name of fixtures) {
    it(`${name}`, () => {
      const fixture = loadFixture('04-constraints', name);
      const base = fixture.base as Record<string, unknown>;
      const diff = fixture.diff as Record<string, unknown>;
      const expected = fixture.expected as Record<string, unknown>;

      const result = mergeConstraintList(
        base.constraint as ElementDefinition['constraint'],
        diff.constraint as ElementDefinition['constraint'],
      );

      expect(result).toHaveLength(expected.constraintCount as number);
      if (expected.constraintKeys) {
        expect(result!.map((c) => c.key)).toEqual(expected.constraintKeys);
      }
      if (expected.updatedKey) {
        const updated = result!.find((c) => c.key === expected.updatedKey);
        expect(updated?.human).toBe(expected.updatedHuman);
      }
    });
  }
});

// ===========================================================================
// Section 12: Fixture-based tests — 05-full-merge
// ===========================================================================

describe('Fixture: 05-full-merge', () => {
  it('documentation-overwrite', () => {
    const fixture = loadFixture('05-full-merge', 'documentation-overwrite');
    const dest = ed(fixture.base as Partial<ElementDefinition>);
    const source = ed(fixture.diff as Partial<ElementDefinition>);
    const expected = fixture.expected as Record<string, unknown>;
    const issues: SnapshotIssue[] = [];

    mergeConstraints(dest, source, issues);

    expect(dest.short).toBe(expected.short);
    expect(dest.definition).toBe(expected.definition);
    expect(dest.comment).toBe(expected.comment);
    expect(dest.mustSupport).toBe(expected.mustSupport);
    expect(dest.min).toBe(expected.min);
    expect(dest.max).toBe(expected.max);
    expect(issues).toHaveLength(expected.issueCount as number);
  });

  it('value-constraints-overwrite', () => {
    const fixture = loadFixture('05-full-merge', 'value-constraints-overwrite');
    const dest = ed(fixture.base as Partial<ElementDefinition>);
    const source = ed(fixture.diff as Partial<ElementDefinition>);
    const expected = fixture.expected as Record<string, unknown>;
    const issues: SnapshotIssue[] = [];

    mergeConstraints(dest, source, issues);

    expect(dest.min).toBe(expected.min);
    expect(dest.max).toBe(expected.max);
    expect(dest.fixed).toBe(expected.fixed);
    expect(dest.maxLength).toBe(expected.maxLength);
    expect(issues).toHaveLength(expected.issueCount as number);
  });

  it('combined-cardinality-type-binding', () => {
    const fixture = loadFixture('05-full-merge', 'combined-cardinality-type-binding');
    const dest = ed(fixture.base as Partial<ElementDefinition>);
    const source = ed(fixture.diff as Partial<ElementDefinition>);
    const expected = fixture.expected as Record<string, unknown>;
    const issues: SnapshotIssue[] = [];

    mergeConstraints(dest, source, issues);

    expect(dest.min).toBe(expected.min);
    expect(dest.max).toBe(expected.max);
    expect(dest.type).toHaveLength(expected.typeCount as number);
    expect(dest.binding?.strength).toBe(expected.bindingStrength);
    expect(dest.binding?.valueSet).toBe(expected.bindingValueSet);
    expect(issues).toHaveLength(expected.issueCount as number);
  });

  it('multiple-violations', () => {
    const fixture = loadFixture('05-full-merge', 'multiple-violations');
    const dest = ed(fixture.base as Partial<ElementDefinition>);
    const source = ed(fixture.diff as Partial<ElementDefinition>);
    const expected = fixture.expected as Record<string, unknown>;
    const issues: SnapshotIssue[] = [];

    mergeConstraints(dest, source, issues);

    expect(dest.min).toBe(expected.min);
    expect(dest.max).toBe(expected.max);
    expect(dest.short).toBe(expected.short);
    expect(issues).toHaveLength(expected.issueCount as number);
    const codes = issues.map((i) => i.code);
    expect(codes).toEqual(expected.issueCodes);
  });

  it('alias-example-mapping-union', () => {
    const fixture = loadFixture('05-full-merge', 'alias-example-mapping-union');
    const dest = ed(fixture.base as Partial<ElementDefinition>);
    const source = ed(fixture.diff as Partial<ElementDefinition>);
    const expected = fixture.expected as Record<string, unknown>;
    const issues: SnapshotIssue[] = [];

    mergeConstraints(dest, source, issues);

    expect(dest.alias).toHaveLength(expected.aliasCount as number);
    expect([...(dest.alias ?? [])].sort()).toEqual([...(expected.aliases as string[])].sort());
    expect(dest.example).toHaveLength(expected.exampleCount as number);
    expect(dest.example!.map((e) => e.label).sort()).toEqual(
      [...(expected.exampleLabels as string[])].sort(),
    );
    expect(dest.mapping).toHaveLength(expected.mappingCount as number);
    expect(dest.mapping!.map((m) => m.identity).sort()).toEqual(
      [...(expected.mappingIdentities as string[])].sort(),
    );
  });
});
