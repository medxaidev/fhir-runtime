/**
 * fhir-validator — Validation Rules Tests
 *
 * Tests for validateCardinality, validateRequired, validateType,
 * validateChoiceType, and inferFhirType.
 *
 * Includes:
 * - Unit tests for each function
 * - JSON fixture-driven tests (6 cardinality + 6 type fixtures)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanonicalElement } from '../../model/canonical-profile.js';
import type { ValidationIssue } from '../types.js';
import {
  validateCardinality,
  validateRequired,
  validateType,
  validateChoiceType,
  inferFhirType,
} from '../validation-rules.js';

// =============================================================================
// Fixture loader
// =============================================================================

const FIXTURE_BASE = resolve(__dirname, 'fixtures', 'validation-rules');

function loadFixture(subfolder: string, filename: string): any {
  const raw = readFileSync(resolve(FIXTURE_BASE, subfolder, filename), 'utf-8');
  return JSON.parse(raw);
}

/**
 * Build a minimal CanonicalElement from fixture JSON.
 * Fixture JSON uses "unbounded" as a string for max, which we need to keep as-is.
 */
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
  };
}

// =============================================================================
// Section 1: validateCardinality — Unit Tests
// =============================================================================

describe('validateCardinality', () => {
  function makeElement(min: number, max: number | 'unbounded', path = 'Test.field'): CanonicalElement {
    return {
      path,
      id: path,
      min,
      max,
      types: [],
      constraints: [],
      mustSupport: false,
      isModifier: false,
      isSummary: false,
    };
  }

  // --- Valid cases ---

  it('min=0, max=1, count=0 → valid', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(0, 1), [], issues);
    expect(issues).toHaveLength(0);
  });

  it('min=0, max=1, count=1 → valid', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(0, 1), ['a'], issues);
    expect(issues).toHaveLength(0);
  });

  it('min=1, max=1, count=1 → valid', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(1, 1), ['a'], issues);
    expect(issues).toHaveLength(0);
  });

  it('min=0, max=unbounded, count=0 → valid', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(0, 'unbounded'), [], issues);
    expect(issues).toHaveLength(0);
  });

  it('min=1, max=unbounded, count=5 → valid', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(1, 'unbounded'), [1, 2, 3, 4, 5], issues);
    expect(issues).toHaveLength(0);
  });

  it('min=2, max=5, count=3 → valid', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(2, 5), [1, 2, 3], issues);
    expect(issues).toHaveLength(0);
  });

  // --- Min violations ---

  it('min=1, max=1, count=0 → CARDINALITY_MIN_VIOLATION', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(1, 1), [], issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('CARDINALITY_MIN_VIOLATION');
    expect(issues[0].severity).toBe('error');
  });

  it('min=1, max=unbounded, count=0 → CARDINALITY_MIN_VIOLATION', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(1, 'unbounded'), [], issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('CARDINALITY_MIN_VIOLATION');
  });

  it('min=2, max=5, count=1 → CARDINALITY_MIN_VIOLATION', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(2, 5), [1], issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('CARDINALITY_MIN_VIOLATION');
    expect(issues[0].message).toContain('at least 2');
    expect(issues[0].message).toContain('found 1');
  });

  // --- Max violations ---

  it('min=0, max=1, count=2 → CARDINALITY_MAX_VIOLATION', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(0, 1), ['a', 'b'], issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('CARDINALITY_MAX_VIOLATION');
    expect(issues[0].severity).toBe('error');
  });

  it('min=2, max=5, count=6 → CARDINALITY_MAX_VIOLATION', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(2, 5), [1, 2, 3, 4, 5, 6], issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('CARDINALITY_MAX_VIOLATION');
    expect(issues[0].message).toContain('at most 5');
    expect(issues[0].message).toContain('found 6');
  });

  it('min=0, max=0, count=1 → CARDINALITY_MAX_VIOLATION (prohibited element)', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(0, 0), ['a'], issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('CARDINALITY_MAX_VIOLATION');
  });

  // --- Message content ---

  it('error message includes element path', () => {
    const issues: ValidationIssue[] = [];
    validateCardinality(makeElement(1, 1, 'Patient.name'), [], issues);
    expect(issues[0].message).toContain('Patient.name');
    expect(issues[0].path).toBe('Patient.name');
  });

  it('unbounded max never produces max violation', () => {
    const issues: ValidationIssue[] = [];
    const bigArray = Array.from({ length: 1000 }, (_, i) => i);
    validateCardinality(makeElement(0, 'unbounded'), bigArray, issues);
    expect(issues).toHaveLength(0);
  });
});

// =============================================================================
// Section 2: validateRequired — Unit Tests
// =============================================================================

describe('validateRequired', () => {
  function makeElement(min: number, path = 'Test.field'): CanonicalElement {
    return {
      path,
      id: path,
      min,
      max: 'unbounded',
      types: [],
      constraints: [],
      mustSupport: false,
      isModifier: false,
      isSummary: false,
    };
  }

  it('min=0, exists=false → valid (optional)', () => {
    const issues: ValidationIssue[] = [];
    validateRequired(makeElement(0), false, issues);
    expect(issues).toHaveLength(0);
  });

  it('min=0, exists=true → valid', () => {
    const issues: ValidationIssue[] = [];
    validateRequired(makeElement(0), true, issues);
    expect(issues).toHaveLength(0);
  });

  it('min=1, exists=true → valid', () => {
    const issues: ValidationIssue[] = [];
    validateRequired(makeElement(1), true, issues);
    expect(issues).toHaveLength(0);
  });

  it('min=1, exists=false → REQUIRED_ELEMENT_MISSING', () => {
    const issues: ValidationIssue[] = [];
    validateRequired(makeElement(1, 'Patient.name'), false, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('REQUIRED_ELEMENT_MISSING');
    expect(issues[0].severity).toBe('error');
    expect(issues[0].message).toContain('Patient.name');
    expect(issues[0].message).toContain('min=1');
  });

  it('min=2, exists=false → REQUIRED_ELEMENT_MISSING', () => {
    const issues: ValidationIssue[] = [];
    validateRequired(makeElement(2), false, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('REQUIRED_ELEMENT_MISSING');
  });
});

// =============================================================================
// Section 3: inferFhirType — Unit Tests
// =============================================================================

describe('inferFhirType', () => {
  // --- Primitives ---

  it('infers string from string value', () => {
    expect(inferFhirType('hello')).toBe('string');
  });

  it('infers string from empty string', () => {
    expect(inferFhirType('')).toBe('string');
  });

  it('infers boolean from true', () => {
    expect(inferFhirType(true)).toBe('boolean');
  });

  it('infers boolean from false', () => {
    expect(inferFhirType(false)).toBe('boolean');
  });

  it('infers integer from whole number', () => {
    expect(inferFhirType(42)).toBe('integer');
  });

  it('infers integer from 0', () => {
    expect(inferFhirType(0)).toBe('integer');
  });

  it('infers integer from negative integer', () => {
    expect(inferFhirType(-5)).toBe('integer');
  });

  it('infers decimal from float', () => {
    expect(inferFhirType(3.14)).toBe('decimal');
  });

  it('infers null from null', () => {
    expect(inferFhirType(null)).toBe('null');
  });

  it('infers null from undefined', () => {
    expect(inferFhirType(undefined)).toBe('null');
  });

  it('infers array from array', () => {
    expect(inferFhirType([1, 2, 3])).toBe('array');
  });

  // --- Complex types ---

  it('infers Coding from { system, code }', () => {
    expect(inferFhirType({ system: 'http://loinc.org', code: '8480-6' })).toBe('Coding');
  });

  it('infers CodeableConcept from { coding: [...] }', () => {
    expect(inferFhirType({ coding: [{ system: 'x', code: 'y' }] })).toBe('CodeableConcept');
  });

  it('infers Quantity from { value, unit }', () => {
    expect(inferFhirType({ value: 120, unit: 'mmHg' })).toBe('Quantity');
  });

  it('infers Quantity from { value, system, code }', () => {
    expect(inferFhirType({ value: 120, system: 'http://unitsofmeasure.org', code: 'mm[Hg]' })).toBe('Quantity');
  });

  it('infers Reference from { reference }', () => {
    expect(inferFhirType({ reference: 'Patient/123' })).toBe('Reference');
  });

  it('infers Reference from { reference, display }', () => {
    expect(inferFhirType({ reference: 'Patient/123', display: 'John' })).toBe('Reference');
  });

  it('infers Period from { start, end }', () => {
    expect(inferFhirType({ start: '2026-01-01', end: '2026-12-31' })).toBe('Period');
  });

  it('infers Period from { start } only', () => {
    expect(inferFhirType({ start: '2026-01-01' })).toBe('Period');
  });

  it('infers Ratio from { numerator, denominator }', () => {
    expect(inferFhirType({
      numerator: { value: 1, unit: 'mg' },
      denominator: { value: 1, unit: 'mL' },
    })).toBe('Ratio');
  });

  it('infers HumanName from { family }', () => {
    expect(inferFhirType({ family: 'Smith' })).toBe('HumanName');
  });

  it('infers HumanName from { given: [...] }', () => {
    expect(inferFhirType({ given: ['John'] })).toBe('HumanName');
  });

  it('infers Address from { line, city }', () => {
    expect(inferFhirType({ line: ['123 Main St'], city: 'Springfield' })).toBe('Address');
  });

  it('infers Address from { city, state }', () => {
    expect(inferFhirType({ city: 'Springfield', state: 'IL' })).toBe('Address');
  });

  it('infers Identifier from { system, value } (no code)', () => {
    expect(inferFhirType({ system: 'urn:oid:1.2.3', value: 'MRN-001' })).toBe('Identifier');
  });

  it('infers Attachment from { contentType }', () => {
    expect(inferFhirType({ contentType: 'application/pdf' })).toBe('Attachment');
  });

  it('infers Extension from { url, valueString }', () => {
    expect(inferFhirType({ url: 'http://example.org/ext', valueString: 'hello' })).toBe('Extension');
  });

  it('infers Meta from { versionId }', () => {
    expect(inferFhirType({ versionId: '1' })).toBe('Meta');
  });

  it('infers Narrative from { status, div }', () => {
    expect(inferFhirType({ status: 'generated', div: '<div>text</div>' })).toBe('Narrative');
  });

  it('infers BackboneElement from generic object', () => {
    expect(inferFhirType({ foo: 'bar', baz: 42 })).toBe('BackboneElement');
  });
});

// =============================================================================
// Section 4: validateType — Unit Tests
// =============================================================================

describe('validateType', () => {
  function makeElement(types: string[], path = 'Test.field'): CanonicalElement {
    return {
      path,
      id: path,
      min: 0,
      max: 1,
      types: types.map((code) => ({ code })),
      constraints: [],
      mustSupport: false,
      isModifier: false,
      isSummary: false,
    };
  }

  // --- Valid matches ---

  it('string value matches string type', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['string']), 'hello', issues);
    expect(issues).toHaveLength(0);
  });

  it('string value matches code type (string-like)', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['code']), 'male', issues);
    expect(issues).toHaveLength(0);
  });

  it('string value matches uri type (string-like)', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['uri']), 'http://example.org', issues);
    expect(issues).toHaveLength(0);
  });

  it('boolean value matches boolean type', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['boolean']), true, issues);
    expect(issues).toHaveLength(0);
  });

  it('integer value matches integer type', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['integer']), 42, issues);
    expect(issues).toHaveLength(0);
  });

  it('integer value matches decimal type', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['decimal']), 42, issues);
    expect(issues).toHaveLength(0);
  });

  it('integer value matches positiveInt type', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['positiveInt']), 5, issues);
    expect(issues).toHaveLength(0);
  });

  it('integer value matches unsignedInt type', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['unsignedInt']), 0, issues);
    expect(issues).toHaveLength(0);
  });

  it('Quantity object matches Quantity type', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['Quantity']), { value: 120, unit: 'mmHg' }, issues);
    expect(issues).toHaveLength(0);
  });

  it('Quantity object matches Age type (sub-type)', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['Age']), { value: 30, unit: 'years' }, issues);
    expect(issues).toHaveLength(0);
  });

  it('Reference object matches Reference type', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['Reference']), { reference: 'Patient/1' }, issues);
    expect(issues).toHaveLength(0);
  });

  // --- Mismatches ---

  it('number for string type → TYPE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['string']), 42, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('TYPE_MISMATCH');
    expect(issues[0].severity).toBe('error');
  });

  it('string for boolean type → TYPE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['boolean']), 'true', issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('TYPE_MISMATCH');
  });

  it('decimal for integer type → TYPE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['integer']), 3.14, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('TYPE_MISMATCH');
  });

  it('boolean for integer type → TYPE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['integer']), false, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('TYPE_MISMATCH');
  });

  it('string for Coding type → TYPE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['Coding']), 'some-code', issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('TYPE_MISMATCH');
  });

  // --- Special cases ---

  it('no type constraints → no validation', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement([]), 'anything', issues);
    expect(issues).toHaveLength(0);
  });

  it('null value → skipped', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['string']), null, issues);
    expect(issues).toHaveLength(0);
  });

  it('undefined value → skipped', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['string']), undefined, issues);
    expect(issues).toHaveLength(0);
  });

  // --- Choice types (multiple allowed) ---

  it('string matches [string, Quantity]', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['string', 'Quantity']), 'hello', issues);
    expect(issues).toHaveLength(0);
  });

  it('Quantity matches [string, Quantity]', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['string', 'Quantity']), { value: 120, unit: 'mmHg' }, issues);
    expect(issues).toHaveLength(0);
  });

  it('boolean does NOT match [string, Quantity] → TYPE_MISMATCH', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['string', 'Quantity']), true, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('TYPE_MISMATCH');
  });

  // --- Error message content ---

  it('error message includes path and types', () => {
    const issues: ValidationIssue[] = [];
    validateType(makeElement(['string'], 'Patient.gender'), 42, issues);
    expect(issues[0].message).toContain('Patient.gender');
    expect(issues[0].message).toContain('string');
    expect(issues[0].message).toContain('integer');
    expect(issues[0].path).toBe('Patient.gender');
    expect(issues[0].diagnostics).toBeDefined();
  });

  // --- BackboneElement compatibility ---

  it('generic object matches any complex type via BackboneElement fallback', () => {
    const issues: ValidationIssue[] = [];
    // A generic object that doesn't match any specific complex type
    // should still be compatible with complex types via BackboneElement
    validateType(makeElement(['Element']), { foo: 'bar' }, issues);
    expect(issues).toHaveLength(0);
  });
});

// =============================================================================
// Section 5: validateChoiceType — Unit Tests
// =============================================================================

describe('validateChoiceType', () => {
  function makeElement(types: string[], path = 'Test.value[x]'): CanonicalElement {
    return {
      path,
      id: path,
      min: 0,
      max: 1,
      types: types.map((code) => ({ code })),
      constraints: [],
      mustSupport: false,
      isModifier: false,
      isSummary: false,
    };
  }

  it('Quantity suffix allowed in [string, Quantity]', () => {
    const issues: ValidationIssue[] = [];
    validateChoiceType(makeElement(['string', 'Quantity']), 'Quantity', issues);
    expect(issues).toHaveLength(0);
  });

  it('string suffix allowed in [string, Quantity]', () => {
    const issues: ValidationIssue[] = [];
    validateChoiceType(makeElement(['string', 'Quantity']), 'string', issues);
    expect(issues).toHaveLength(0);
  });

  it('Boolean suffix NOT allowed in [string, Quantity] → INVALID_CHOICE_TYPE', () => {
    const issues: ValidationIssue[] = [];
    validateChoiceType(makeElement(['string', 'Quantity']), 'Boolean', issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_CHOICE_TYPE');
    expect(issues[0].severity).toBe('error');
  });

  it('CodeableConcept suffix allowed in [CodeableConcept, Reference]', () => {
    const issues: ValidationIssue[] = [];
    validateChoiceType(makeElement(['CodeableConcept', 'Reference']), 'CodeableConcept', issues);
    expect(issues).toHaveLength(0);
  });

  it('DateTime suffix NOT allowed in [CodeableConcept, Reference] → INVALID_CHOICE_TYPE', () => {
    const issues: ValidationIssue[] = [];
    validateChoiceType(makeElement(['CodeableConcept', 'Reference']), 'DateTime', issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_CHOICE_TYPE');
    expect(issues[0].message).toContain('DateTime');
  });

  it('no type constraints → no validation', () => {
    const issues: ValidationIssue[] = [];
    validateChoiceType(makeElement([]), 'Quantity', issues);
    expect(issues).toHaveLength(0);
  });

  it('error message includes allowed types', () => {
    const issues: ValidationIssue[] = [];
    validateChoiceType(
      makeElement(['string', 'Quantity'], 'Observation.value[x]'),
      'Boolean',
      issues,
    );
    expect(issues[0].message).toContain('string');
    expect(issues[0].message).toContain('Quantity');
    expect(issues[0].path).toBe('Observation.value[x]');
  });
});

// =============================================================================
// Section 6: Fixture-driven — Cardinality
// =============================================================================

describe('Fixture: cardinality/01-optional-absent', () => {
  const fixture = loadFixture('cardinality', '01-optional-absent.json');

  it('optional element with no values → valid', () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateCardinality(element, fixture.values, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
  });
});

describe('Fixture: cardinality/02-required-missing', () => {
  const fixture = loadFixture('cardinality', '02-required-missing.json');

  it('required element with no values → CARDINALITY_MIN_VIOLATION', () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateCardinality(element, fixture.values, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
    expect(issues[0].code).toBe(fixture.expectedIssues[0].code);
    expect(issues[0].severity).toBe(fixture.expectedIssues[0].severity);
  });
});

describe('Fixture: cardinality/03-max-exceeded', () => {
  const fixture = loadFixture('cardinality', '03-max-exceeded.json');

  it('scalar element with 2 values → CARDINALITY_MAX_VIOLATION', () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateCardinality(element, fixture.values, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
    expect(issues[0].code).toBe(fixture.expectedIssues[0].code);
  });
});

describe('Fixture: cardinality/04-range-valid', () => {
  const fixture = loadFixture('cardinality', '04-range-valid.json');

  it('range cardinality with 3 values → valid', () => {
    const element = toElement(fixture.element);
    const issues: ValidationIssue[] = [];
    validateCardinality(element, fixture.values, issues);
    expect(issues).toHaveLength(fixture.expectedIssueCount);
  });
});

describe('Fixture: cardinality/05-range-both-violations', () => {
  const fixture = loadFixture('cardinality', '05-range-both-violations.json');

  it('below minimum → CARDINALITY_MIN_VIOLATION', () => {
    const scenario = fixture.scenarios[0];
    const element = toElement(scenario.element);
    const issues: ValidationIssue[] = [];
    validateCardinality(element, scenario.values, issues);
    expect(issues).toHaveLength(scenario.expectedIssueCount);
    expect(issues[0].code).toBe(scenario.expectedIssues[0].code);
  });

  it('above maximum → CARDINALITY_MAX_VIOLATION', () => {
    const scenario = fixture.scenarios[1];
    const element = toElement(scenario.element);
    const issues: ValidationIssue[] = [];
    validateCardinality(element, scenario.values, issues);
    expect(issues).toHaveLength(scenario.expectedIssueCount);
    expect(issues[0].code).toBe(scenario.expectedIssues[0].code);
  });
});

describe('Fixture: cardinality/06-unbounded-max', () => {
  const fixture = loadFixture('cardinality', '06-unbounded-max.json');
  const element = toElement(fixture.element);

  it('0 values → min violation', () => {
    const scenario = fixture.scenarios[0];
    const issues: ValidationIssue[] = [];
    validateCardinality(element, scenario.values, issues);
    expect(issues).toHaveLength(scenario.expectedIssueCount);
  });

  it('1 value → valid', () => {
    const scenario = fixture.scenarios[1];
    const issues: ValidationIssue[] = [];
    validateCardinality(element, scenario.values, issues);
    expect(issues).toHaveLength(scenario.expectedIssueCount);
  });

  it('5 values → valid', () => {
    const scenario = fixture.scenarios[2];
    const issues: ValidationIssue[] = [];
    validateCardinality(element, scenario.values, issues);
    expect(issues).toHaveLength(scenario.expectedIssueCount);
  });

  it('100 values → valid (unbounded)', () => {
    const scenario = fixture.scenarios[3];
    const values = Array.from({ length: scenario.valueCount }, (_, i) => ({ family: `Name${i}` }));
    const issues: ValidationIssue[] = [];
    validateCardinality(element, values, issues);
    expect(issues).toHaveLength(scenario.expectedIssueCount);
  });
});

// =============================================================================
// Section 7: Fixture-driven — Type: Primitives
// =============================================================================

describe('Fixture: type/01-primitive-types', () => {
  const fixture = loadFixture('type', '01-primitive-types.json');

  for (const scenario of fixture.scenarios) {
    it(scenario.label, () => {
      const element = toElement(scenario.element);
      const issues: ValidationIssue[] = [];
      validateType(element, scenario.value, issues);
      expect(issues).toHaveLength(scenario.expectedIssueCount);
    });
  }
});

// =============================================================================
// Section 8: Fixture-driven — Type: Mismatches
// =============================================================================

describe('Fixture: type/02-type-mismatches', () => {
  const fixture = loadFixture('type', '02-type-mismatches.json');

  for (const scenario of fixture.scenarios) {
    it(scenario.label, () => {
      const element = toElement(scenario.element);
      const issues: ValidationIssue[] = [];
      validateType(element, scenario.value, issues);
      expect(issues).toHaveLength(scenario.expectedIssueCount);
      if (scenario.expectedIssues) {
        expect(issues[0].code).toBe(scenario.expectedIssues[0].code);
      }
    });
  }
});

// =============================================================================
// Section 9: Fixture-driven — Type: Complex types
// =============================================================================

describe('Fixture: type/03-complex-types', () => {
  const fixture = loadFixture('type', '03-complex-types.json');

  for (const scenario of fixture.scenarios) {
    it(scenario.label, () => {
      const element = toElement(scenario.element);
      const issues: ValidationIssue[] = [];
      validateType(element, scenario.value, issues);
      expect(issues).toHaveLength(scenario.expectedIssueCount);
    });
  }
});

// =============================================================================
// Section 10: Fixture-driven — Type: Choice types
// =============================================================================

describe('Fixture: type/04-choice-types', () => {
  const fixture = loadFixture('type', '04-choice-types.json');

  for (const scenario of fixture.scenarios) {
    it(scenario.label, () => {
      const element = toElement(scenario.element);
      const issues: ValidationIssue[] = [];
      validateType(element, scenario.value, issues);
      expect(issues).toHaveLength(scenario.expectedIssueCount);
      if (scenario.expectedIssues) {
        expect(issues[0].code).toBe(scenario.expectedIssues[0].code);
      }
    });
  }
});

// =============================================================================
// Section 11: Fixture-driven — Type: Backbone & Special
// =============================================================================

describe('Fixture: type/05-backbone-and-special', () => {
  const fixture = loadFixture('type', '05-backbone-and-special.json');

  for (const scenario of fixture.scenarios) {
    it(scenario.label, () => {
      const element = toElement(scenario.element);
      const issues: ValidationIssue[] = [];
      validateType(element, scenario.value, issues);
      expect(issues).toHaveLength(scenario.expectedIssueCount);
    });
  }
});

// =============================================================================
// Section 12: Fixture-driven — Choice Type Suffix
// =============================================================================

describe('Fixture: type/06-choice-type-suffix', () => {
  const fixture = loadFixture('type', '06-choice-type-suffix.json');

  for (const scenario of fixture.scenarios) {
    it(scenario.label, () => {
      const element = toElement(scenario.element);
      const issues: ValidationIssue[] = [];
      validateChoiceType(element, scenario.suffix, issues);
      expect(issues).toHaveLength(scenario.expectedIssueCount);
      if (scenario.expectedIssues) {
        expect(issues[0].code).toBe(scenario.expectedIssues[0].code);
      }
    });
  }
});

// =============================================================================
// Section 13: Barrel exports
// =============================================================================

describe('Barrel exports', () => {
  it('all validation rule functions are importable from index', async () => {
    const mod = await import('../index.js');
    expect(mod.validateCardinality).toBeDefined();
    expect(mod.validateRequired).toBeDefined();
    expect(mod.validateType).toBeDefined();
    expect(mod.validateChoiceType).toBeDefined();
    expect(mod.inferFhirType).toBeDefined();
  });
});
