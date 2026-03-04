/**
 * fhir-validator — Validation Rules: Fixed/Pattern & Reference Tests
 *
 * Tests for deepEqual, validateFixed, matchesPattern, validatePattern,
 * extractReferenceType, and validateReference.
 *
 * Includes:
 * - Unit tests for each function
 * - JSON fixture-driven tests (6 fixed + 6 pattern + 5 reference fixtures)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanonicalElement } from '../../model/canonical-profile.js';
import type { ValidationIssue } from '../types.js';
import {
  deepEqual,
  validateFixed,
  matchesPattern,
  validatePattern,
  extractReferenceType,
  validateReference,
} from '../validation-rules.js';

// =============================================================================
// Fixture loader
// =============================================================================

const FIXTURE_BASE = resolve(__dirname, 'fixtures', 'validation-rules');

function loadFixture(subfolder: string, filename: string): any {
  const raw = readFileSync(resolve(FIXTURE_BASE, subfolder, filename), 'utf-8');
  return JSON.parse(raw);
}

function toElement(raw: any): CanonicalElement {
  return {
    path: raw.path,
    id: raw.id,
    min: raw.min,
    max: raw.max === 'unbounded' ? 'unbounded' : raw.max,
    types: raw.types ?? [],
    constraints: raw.constraints ?? [],
    mustSupport: raw.mustSupport ?? false,
    isModifier: raw.isModifier ?? false,
    isSummary: raw.isSummary ?? false,
    fixed: raw.fixed,
    pattern: raw.pattern,
  };
}

// =============================================================================
// Section 1: deepEqual — Unit Tests
// =============================================================================

describe('deepEqual', () => {
  // --- Primitives ---

  it('equal strings', () => {
    expect(deepEqual('hello', 'hello')).toBe(true);
  });

  it('different strings', () => {
    expect(deepEqual('hello', 'world')).toBe(false);
  });

  it('equal numbers', () => {
    expect(deepEqual(42, 42)).toBe(true);
  });

  it('different numbers', () => {
    expect(deepEqual(42, 43)).toBe(false);
  });

  it('equal booleans', () => {
    expect(deepEqual(true, true)).toBe(true);
  });

  it('different booleans', () => {
    expect(deepEqual(true, false)).toBe(false);
  });

  it('null === null', () => {
    expect(deepEqual(null, null)).toBe(true);
  });

  it('undefined === undefined', () => {
    expect(deepEqual(undefined, undefined)).toBe(true);
  });

  it('null !== undefined', () => {
    expect(deepEqual(null, undefined)).toBe(false);
  });

  it('string !== number', () => {
    expect(deepEqual('42', 42)).toBe(false);
  });

  // --- Arrays ---

  it('equal empty arrays', () => {
    expect(deepEqual([], [])).toBe(true);
  });

  it('equal arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('different length arrays', () => {
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });

  it('different element arrays', () => {
    expect(deepEqual([1, 2, 3], [1, 2, 4])).toBe(false);
  });

  it('array vs non-array', () => {
    expect(deepEqual([1], 1)).toBe(false);
  });

  it('nested arrays', () => {
    expect(deepEqual([[1, 2], [3]], [[1, 2], [3]])).toBe(true);
  });

  // --- Objects ---

  it('equal empty objects', () => {
    expect(deepEqual({}, {})).toBe(true);
  });

  it('equal objects', () => {
    expect(deepEqual({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
  });

  it('different values', () => {
    expect(deepEqual({ a: 1 }, { a: 2 })).toBe(false);
  });

  it('different keys', () => {
    expect(deepEqual({ a: 1 }, { b: 1 })).toBe(false);
  });

  it('extra key in first', () => {
    expect(deepEqual({ a: 1, b: 2 }, { a: 1 })).toBe(false);
  });

  it('extra key in second', () => {
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
  });

  it('nested objects', () => {
    expect(deepEqual(
      { a: { b: { c: 1 } } },
      { a: { b: { c: 1 } } },
    )).toBe(true);
  });

  it('nested objects different', () => {
    expect(deepEqual(
      { a: { b: { c: 1 } } },
      { a: { b: { c: 2 } } },
    )).toBe(false);
  });

  // --- Complex FHIR-like structures ---

  it('equal Coding objects', () => {
    expect(deepEqual(
      { system: 'http://loinc.org', code: '8480-6', display: 'Systolic BP' },
      { system: 'http://loinc.org', code: '8480-6', display: 'Systolic BP' },
    )).toBe(true);
  });

  it('CodeableConcept with nested coding array', () => {
    expect(deepEqual(
      { coding: [{ system: 'x', code: 'y' }], text: 'z' },
      { coding: [{ system: 'x', code: 'y' }], text: 'z' },
    )).toBe(true);
  });
});

// =============================================================================
// Section 2: validateFixed — Unit Tests
// =============================================================================

describe('validateFixed', () => {
  function makeElement(fixed?: unknown, path = 'Test.field'): CanonicalElement {
    return {
      path,
      id: path,
      min: 0,
      max: 1,
      types: [],
      constraints: [],
      mustSupport: false,
      isModifier: false,
      isSummary: false,
      fixed,
    };
  }

  it('no fixed constraint → valid', () => {
    const issues: ValidationIssue[] = [];
    validateFixed(makeElement(undefined), 'anything', issues);
    expect(issues).toHaveLength(0);
  });

  it('matching string → valid', () => {
    const issues: ValidationIssue[] = [];
    validateFixed(makeElement('male'), 'male', issues);
    expect(issues).toHaveLength(0);
  });

  it('different string → FIXED_VALUE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    validateFixed(makeElement('male', 'Patient.gender'), 'female', issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('FIXED_VALUE_MISMATCH');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('Patient.gender');
    expect(issues[0].message).toContain('male');
    expect(issues[0].message).toContain('female');
  });

  it('matching number → valid', () => {
    const issues: ValidationIssue[] = [];
    validateFixed(makeElement(42), 42, issues);
    expect(issues).toHaveLength(0);
  });

  it('different number → FIXED_VALUE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    validateFixed(makeElement(42), 43, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('FIXED_VALUE_MISMATCH');
  });

  it('matching boolean → valid', () => {
    const issues: ValidationIssue[] = [];
    validateFixed(makeElement(true), true, issues);
    expect(issues).toHaveLength(0);
  });

  it('different boolean → FIXED_VALUE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    validateFixed(makeElement(true), false, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('FIXED_VALUE_MISMATCH');
  });

  it('matching object → valid', () => {
    const issues: ValidationIssue[] = [];
    const fixed = { system: 'http://loinc.org', code: '8480-6' };
    validateFixed(makeElement(fixed), { system: 'http://loinc.org', code: '8480-6' }, issues);
    expect(issues).toHaveLength(0);
  });

  it('different object → FIXED_VALUE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    const fixed = { system: 'http://loinc.org', code: '8480-6' };
    validateFixed(makeElement(fixed), { system: 'http://loinc.org', code: '8462-4' }, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('FIXED_VALUE_MISMATCH');
  });

  it('extra field in value → FIXED_VALUE_MISMATCH (exact match required)', () => {
    const issues: ValidationIssue[] = [];
    const fixed = { value: 120 };
    validateFixed(makeElement(fixed), { value: 120, unit: 'mmHg' }, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('FIXED_VALUE_MISMATCH');
  });

  it('null value → skipped', () => {
    const issues: ValidationIssue[] = [];
    validateFixed(makeElement('male'), null, issues);
    expect(issues).toHaveLength(0);
  });

  it('undefined value → skipped', () => {
    const issues: ValidationIssue[] = [];
    validateFixed(makeElement('male'), undefined, issues);
    expect(issues).toHaveLength(0);
  });

  it('fixed null, value null → valid (both null)', () => {
    const issues: ValidationIssue[] = [];
    // Note: fixed=null means there IS a constraint (fixed to null)
    // but value=null is skipped by the null guard
    validateFixed(makeElement(null), null, issues);
    expect(issues).toHaveLength(0);
  });

  it('diagnostics include expected and actual', () => {
    const issues: ValidationIssue[] = [];
    validateFixed(makeElement('expected'), 'actual', issues);
    expect(issues[0].diagnostics).toContain('Expected');
    expect(issues[0].diagnostics).toContain('Actual');
  });
});

// =============================================================================
// Section 3: matchesPattern — Unit Tests
// =============================================================================

describe('matchesPattern', () => {
  // --- Primitives ---

  it('equal strings match', () => {
    expect(matchesPattern('hello', 'hello')).toBe(true);
  });

  it('different strings do not match', () => {
    expect(matchesPattern('hello', 'world')).toBe(false);
  });

  it('equal numbers match', () => {
    expect(matchesPattern(42, 42)).toBe(true);
  });

  it('different numbers do not match', () => {
    expect(matchesPattern(42, 43)).toBe(false);
  });

  it('null pattern matches null value', () => {
    expect(matchesPattern(null, null)).toBe(true);
  });

  it('null pattern does not match string', () => {
    expect(matchesPattern('hello', null)).toBe(false);
  });

  // --- Object subset matching ---

  it('value has all pattern fields → match', () => {
    expect(matchesPattern(
      { system: 'http://loinc.org', code: '8480-6', display: 'Systolic BP' },
      { system: 'http://loinc.org' },
    )).toBe(true);
  });

  it('value missing pattern field → no match', () => {
    expect(matchesPattern(
      { code: '8480-6' },
      { system: 'http://loinc.org' },
    )).toBe(false);
  });

  it('value has different value for pattern field → no match', () => {
    expect(matchesPattern(
      { system: 'http://snomed.info/sct' },
      { system: 'http://loinc.org' },
    )).toBe(false);
  });

  it('empty pattern matches any object', () => {
    expect(matchesPattern({ a: 1, b: 2 }, {})).toBe(true);
  });

  it('pattern against non-object → no match', () => {
    expect(matchesPattern('string', { key: 'value' })).toBe(false);
  });

  it('pattern against null → no match', () => {
    expect(matchesPattern(null, { key: 'value' })).toBe(false);
  });

  // --- Nested objects ---

  it('nested pattern match', () => {
    expect(matchesPattern(
      { a: { b: 1, c: 2 }, d: 3 },
      { a: { b: 1 } },
    )).toBe(true);
  });

  it('nested pattern mismatch', () => {
    expect(matchesPattern(
      { a: { b: 1, c: 2 } },
      { a: { b: 99 } },
    )).toBe(false);
  });

  // --- Array patterns ---

  it('array pattern: each pattern element found in value', () => {
    expect(matchesPattern(
      [{ system: 'http://loinc.org', code: '8480-6' }, { system: 'http://snomed.info/sct', code: '123' }],
      [{ system: 'http://loinc.org' }],
    )).toBe(true);
  });

  it('array pattern: pattern element not found in value', () => {
    expect(matchesPattern(
      [{ system: 'http://snomed.info/sct', code: '123' }],
      [{ system: 'http://loinc.org' }],
    )).toBe(false);
  });

  it('array pattern against non-array → no match', () => {
    expect(matchesPattern('not-array', [1, 2])).toBe(false);
  });
});

// =============================================================================
// Section 4: validatePattern — Unit Tests
// =============================================================================

describe('validatePattern', () => {
  function makeElement(pattern?: unknown, path = 'Test.field'): CanonicalElement {
    return {
      path,
      id: path,
      min: 0,
      max: 1,
      types: [],
      constraints: [],
      mustSupport: false,
      isModifier: false,
      isSummary: false,
      pattern,
    };
  }

  it('no pattern constraint → valid', () => {
    const issues: ValidationIssue[] = [];
    validatePattern(makeElement(undefined), 'anything', issues);
    expect(issues).toHaveLength(0);
  });

  it('matching pattern → valid', () => {
    const issues: ValidationIssue[] = [];
    validatePattern(
      makeElement({ system: 'http://loinc.org' }),
      { system: 'http://loinc.org', code: '8480-6' },
      issues,
    );
    expect(issues).toHaveLength(0);
  });

  it('mismatching pattern → PATTERN_VALUE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    validatePattern(
      makeElement({ system: 'http://loinc.org' }, 'Observation.code'),
      { system: 'http://snomed.info/sct' },
      issues,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('PATTERN_VALUE_MISMATCH');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('Observation.code');
  });

  it('null value → skipped', () => {
    const issues: ValidationIssue[] = [];
    validatePattern(makeElement({ system: 'x' }), null, issues);
    expect(issues).toHaveLength(0);
  });

  it('undefined value → skipped', () => {
    const issues: ValidationIssue[] = [];
    validatePattern(makeElement({ system: 'x' }), undefined, issues);
    expect(issues).toHaveLength(0);
  });

  it('diagnostics include pattern and actual', () => {
    const issues: ValidationIssue[] = [];
    validatePattern(makeElement('expected'), 'actual', issues);
    expect(issues[0].diagnostics).toContain('Pattern');
    expect(issues[0].diagnostics).toContain('Actual');
  });
});

// =============================================================================
// Section 5: extractReferenceType — Unit Tests
// =============================================================================

describe('extractReferenceType', () => {
  it('relative reference: Patient/123 → Patient', () => {
    expect(extractReferenceType('Patient/123')).toBe('Patient');
  });

  it('relative reference: Observation/456 → Observation', () => {
    expect(extractReferenceType('Observation/456')).toBe('Observation');
  });

  it('absolute URL: http://example.org/fhir/Patient/123 → Patient', () => {
    expect(extractReferenceType('http://example.org/fhir/Patient/123')).toBe('Patient');
  });

  it('absolute URL with history: Patient/123/_history/1 → Patient', () => {
    expect(extractReferenceType('Patient/123/_history/1')).toBe('Patient');
  });

  it('URN reference → undefined', () => {
    expect(extractReferenceType('urn:uuid:550e8400-e29b-41d4-a716-446655440000')).toBeUndefined();
  });

  it('fragment reference → undefined', () => {
    expect(extractReferenceType('#contained-1')).toBeUndefined();
  });

  it('empty string → undefined', () => {
    expect(extractReferenceType('')).toBeUndefined();
  });

  it('undefined → undefined', () => {
    expect(extractReferenceType(undefined)).toBeUndefined();
  });

  it('no slash → undefined', () => {
    expect(extractReferenceType('just-a-string')).toBeUndefined();
  });

  it('lowercase path → undefined (no uppercase segment)', () => {
    expect(extractReferenceType('foo/bar')).toBeUndefined();
  });
});

// =============================================================================
// Section 6: validateReference — Unit Tests
// =============================================================================

describe('validateReference', () => {
  function makeRefElement(
    targetProfiles: string[],
    path = 'Test.subject',
  ): CanonicalElement {
    return {
      path,
      id: path,
      min: 0,
      max: 1,
      types: [{ code: 'Reference', targetProfiles }],
      constraints: [],
      mustSupport: false,
      isModifier: false,
      isSummary: false,
    };
  }

  it('matching target → valid', () => {
    const issues: ValidationIssue[] = [];
    validateReference(
      makeRefElement(['http://hl7.org/fhir/StructureDefinition/Patient']),
      { reference: 'Patient/123' },
      issues,
    );
    expect(issues).toHaveLength(0);
  });

  it('wrong target → REFERENCE_TARGET_MISMATCH error', () => {
    const issues: ValidationIssue[] = [];
    validateReference(
      makeRefElement(['http://hl7.org/fhir/StructureDefinition/Patient'], 'Encounter.subject'),
      { reference: 'Observation/456' },
      issues,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('REFERENCE_TARGET_MISMATCH');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('Patient');
    expect(issues[0].message).toContain('Observation');
  });

  it('no targetProfiles → valid (any reference)', () => {
    const issues: ValidationIssue[] = [];
    const element: CanonicalElement = {
      path: 'Test.ref',
      id: 'Test.ref',
      min: 0,
      max: 1,
      types: [{ code: 'Reference' }],
      constraints: [],
      mustSupport: false,
      isModifier: false,
      isSummary: false,
    };
    validateReference(element, { reference: 'Anything/999' }, issues);
    expect(issues).toHaveLength(0);
  });

  it('URN reference → warning', () => {
    const issues: ValidationIssue[] = [];
    validateReference(
      makeRefElement(['http://hl7.org/fhir/StructureDefinition/Patient']),
      { reference: 'urn:uuid:abc-123' },
      issues,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].code).toBe('REFERENCE_TARGET_MISMATCH');
  });

  it('fragment reference → warning', () => {
    const issues: ValidationIssue[] = [];
    validateReference(
      makeRefElement(['http://hl7.org/fhir/StructureDefinition/Patient']),
      { reference: '#contained-1' },
      issues,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].severity).toBe('warning');
  });

  it('non-Reference value → skipped', () => {
    const issues: ValidationIssue[] = [];
    validateReference(
      makeRefElement(['http://hl7.org/fhir/StructureDefinition/Patient']),
      'not-a-reference-object',
      issues,
    );
    expect(issues).toHaveLength(0);
  });

  it('null value → skipped', () => {
    const issues: ValidationIssue[] = [];
    validateReference(
      makeRefElement(['http://hl7.org/fhir/StructureDefinition/Patient']),
      null,
      issues,
    );
    expect(issues).toHaveLength(0);
  });

  it('multiple target profiles — one matches → valid', () => {
    const issues: ValidationIssue[] = [];
    validateReference(
      makeRefElement([
        'http://hl7.org/fhir/StructureDefinition/Patient',
        'http://hl7.org/fhir/StructureDefinition/Group',
      ]),
      { reference: 'Group/456' },
      issues,
    );
    expect(issues).toHaveLength(0);
  });

  it('multiple target profiles — none match → error', () => {
    const issues: ValidationIssue[] = [];
    validateReference(
      makeRefElement([
        'http://hl7.org/fhir/StructureDefinition/Patient',
        'http://hl7.org/fhir/StructureDefinition/Group',
      ]),
      { reference: 'Device/789' },
      issues,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('REFERENCE_TARGET_MISMATCH');
  });

  it('absolute URL reference → correctly extracts type', () => {
    const issues: ValidationIssue[] = [];
    validateReference(
      makeRefElement(['http://hl7.org/fhir/StructureDefinition/Patient']),
      { reference: 'http://example.org/fhir/Patient/123' },
      issues,
    );
    expect(issues).toHaveLength(0);
  });

  it('diagnostics include reference and profiles', () => {
    const issues: ValidationIssue[] = [];
    validateReference(
      makeRefElement(['http://hl7.org/fhir/StructureDefinition/Patient']),
      { reference: 'Observation/456' },
      issues,
    );
    expect(issues[0].diagnostics).toContain('Observation/456');
    expect(issues[0].diagnostics).toContain('StructureDefinition/Patient');
  });
});

// =============================================================================
// Section 7: Fixture-driven — Fixed
// =============================================================================

describe('Fixture: fixed/01-fixed-string-match', () => {
  const fixture = loadFixture('fixed', '01-fixed-string-match.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateFixed(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
  });
});

describe('Fixture: fixed/02-fixed-string-mismatch', () => {
  const fixture = loadFixture('fixed', '02-fixed-string-mismatch.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateFixed(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
    expect(issues[0].code).toBe(fixture.expectedIssues[0].code);
    expect(issues[0].severity).toBe(fixture.expectedIssues[0].severity);
  });
});

describe('Fixture: fixed/03-fixed-coding-match', () => {
  const fixture = loadFixture('fixed', '03-fixed-coding-match.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateFixed(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
  });
});

describe('Fixture: fixed/04-fixed-coding-mismatch', () => {
  const fixture = loadFixture('fixed', '04-fixed-coding-mismatch.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateFixed(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
    expect(issues[0].code).toBe(fixture.expectedIssues[0].code);
  });
});

describe('Fixture: fixed/05-fixed-quantity', () => {
  const fixture = loadFixture('fixed', '05-fixed-quantity.json');

  for (const scenario of fixture.scenarios) {
    it(scenario.label, () => {
      const element = toElement(scenario.element);
      const issues: ValidationIssue[] = [];
      validateFixed(element, scenario.value, issues);
      expect(issues).toHaveLength(scenario.expectedIssueCount);
      if (scenario.expectedIssues) {
        expect(issues[0].code).toBe(scenario.expectedIssues[0].code);
      }
    });
  }
});

describe('Fixture: fixed/06-fixed-no-constraint', () => {
  const fixture = loadFixture('fixed', '06-fixed-no-constraint.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateFixed(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
  });
});

// =============================================================================
// Section 8: Fixture-driven — Pattern
// =============================================================================

describe('Fixture: pattern/01-pattern-subset-match', () => {
  const fixture = loadFixture('pattern', '01-pattern-subset-match.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validatePattern(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
  });
});

describe('Fixture: pattern/02-pattern-system-mismatch', () => {
  const fixture = loadFixture('pattern', '02-pattern-system-mismatch.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validatePattern(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
    expect(issues[0].code).toBe(fixture.expectedIssues[0].code);
  });
});

describe('Fixture: pattern/03-pattern-primitive', () => {
  const fixture = loadFixture('pattern', '03-pattern-primitive.json');

  for (const scenario of fixture.scenarios) {
    it(scenario.label, () => {
      const element = toElement(scenario.element);
      const issues: ValidationIssue[] = [];
      validatePattern(element, scenario.value, issues);
      expect(issues).toHaveLength(scenario.expectedIssueCount);
      if (scenario.expectedIssues) {
        expect(issues[0].code).toBe(scenario.expectedIssues[0].code);
      }
    });
  }
});

describe('Fixture: pattern/04-pattern-nested', () => {
  const fixture = loadFixture('pattern', '04-pattern-nested.json');

  for (const scenario of fixture.scenarios) {
    it(scenario.label, () => {
      const element = toElement(scenario.element);
      const issues: ValidationIssue[] = [];
      validatePattern(element, scenario.value, issues);
      expect(issues).toHaveLength(scenario.expectedIssueCount);
      if (scenario.expectedIssues) {
        expect(issues[0].code).toBe(scenario.expectedIssues[0].code);
      }
    });
  }
});

describe('Fixture: pattern/05-pattern-no-constraint', () => {
  const fixture = loadFixture('pattern', '05-pattern-no-constraint.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validatePattern(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
  });
});

describe('Fixture: pattern/06-pattern-missing-field', () => {
  const fixture = loadFixture('pattern', '06-pattern-missing-field.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validatePattern(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
    expect(issues[0].code).toBe(fixture.expectedIssues[0].code);
  });
});

// =============================================================================
// Section 9: Fixture-driven — Reference
// =============================================================================

describe('Fixture: reference/01-reference-valid-target', () => {
  const fixture = loadFixture('reference', '01-reference-valid-target.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateReference(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
  });
});

describe('Fixture: reference/02-reference-wrong-target', () => {
  const fixture = loadFixture('reference', '02-reference-wrong-target.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateReference(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
    expect(issues[0].code).toBe(fixture.expectedIssues[0].code);
    expect(issues[0].severity).toBe(fixture.expectedIssues[0].severity);
  });
});

describe('Fixture: reference/03-reference-no-constraint', () => {
  const fixture = loadFixture('reference', '03-reference-no-constraint.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateReference(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
  });
});

describe('Fixture: reference/04-reference-urn-warning', () => {
  const fixture = loadFixture('reference', '04-reference-urn-warning.json');

  it(fixture.description, () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateReference(element, fixture.value, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
    expect(issues[0].code).toBe(fixture.expectedIssues[0].code);
    expect(issues[0].severity).toBe(fixture.expectedIssues[0].severity);
  });
});

describe('Fixture: reference/05-reference-multiple-targets', () => {
  const fixture = loadFixture('reference', '05-reference-multiple-targets.json');

  for (const scenario of fixture.scenarios) {
    it(scenario.label, () => {
      const element = toElement(scenario.element);
      const issues: ValidationIssue[] = [];
      validateReference(element, scenario.value, issues);
      expect(issues).toHaveLength(scenario.expectedIssueCount);
      if (scenario.expectedIssues) {
        expect(issues[0].code).toBe(scenario.expectedIssues[0].code);
        if (scenario.expectedIssues[0].severity) {
          expect(issues[0].severity).toBe(scenario.expectedIssues[0].severity);
        }
      }
    });
  }
});

// =============================================================================
// Section 10: Barrel exports
// =============================================================================

describe('Barrel exports (fixed/pattern/reference)', () => {
  it('all new functions are importable from index', async () => {
    const mod = await import('../index.js');
    expect(mod.deepEqual).toBeDefined();
    expect(mod.validateFixed).toBeDefined();
    expect(mod.matchesPattern).toBeDefined();
    expect(mod.validatePattern).toBeDefined();
    expect(mod.extractReferenceType).toBeDefined();
    expect(mod.validateReference).toBeDefined();
  });
});
