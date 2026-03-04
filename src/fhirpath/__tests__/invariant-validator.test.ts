/**
 * Tests for Invariant Validator Integration (Task 6.8)
 */

import { describe, test, expect } from 'vitest';
import {
  validateInvariants,
  validateSingleInvariant,
  validateAllInvariants,
} from '../../validator/invariant-validator.js';
import type { CanonicalElement, Invariant } from '../../model/canonical-profile.js';
import type { ValidationIssue } from '../../validator/types.js';
import { evalFhirPathBoolean } from '../parse.js';

import fs from 'node:fs';
import path from 'node:path';

// =============================================================================
// Helpers
// =============================================================================

function makeElement(constraints: Invariant[], elementPath = 'Patient'): CanonicalElement {
  return {
    path: elementPath,
    id: elementPath,
    min: 0,
    max: 'unbounded',
    types: [],
    constraints,
    mustSupport: false,
    isModifier: false,
    isSummary: false,
  };
}

function makeInvariant(overrides: Partial<Invariant> & { key: string }): Invariant {
  return {
    severity: 'error',
    human: `Constraint ${overrides.key}`,
    ...overrides,
  };
}

// =============================================================================
// §1 validateSingleInvariant — Core Behavior
// =============================================================================

describe('validateSingleInvariant: core behavior', () => {
  test('passing invariant produces no issues', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({ key: 'test-1', expression: 'name.exists()' });
    const value = { resourceType: 'Patient', name: [{ family: 'Smith' }] };
    validateSingleInvariant(constraint, 'Patient', value, value, issues);
    expect(issues).toHaveLength(0);
  });

  test('failing invariant produces INVARIANT_VIOLATION issue', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({ key: 'test-2', expression: 'name.exists()' });
    const value = { resourceType: 'Patient' };
    validateSingleInvariant(constraint, 'Patient', value, value, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVARIANT_VIOLATION');
    expect(issues[0].path).toBe('Patient');
    expect(issues[0].expression).toBe('name.exists()');
  });

  test('constraint without expression is skipped', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({ key: 'test-3' }); // no expression
    validateSingleInvariant(constraint, 'Patient', {}, {}, issues);
    expect(issues).toHaveLength(0);
  });

  test('error severity constraint produces error issue', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({ key: 'err-1', severity: 'error', expression: 'false' });
    validateSingleInvariant(constraint, 'Patient', {}, {}, issues);
    expect(issues[0].severity).toBe('error');
  });

  test('warning severity constraint produces warning issue', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({ key: 'warn-1', severity: 'warning', expression: 'false' });
    validateSingleInvariant(constraint, 'Patient', {}, {}, issues);
    expect(issues[0].severity).toBe('warning');
  });

  test('diagnostics includes constraint key', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({ key: 'diag-1', expression: 'false' });
    validateSingleInvariant(constraint, 'Patient.name', {}, {}, issues);
    expect(issues[0].diagnostics).toContain('diag-1');
    expect(issues[0].path).toBe('Patient.name');
  });

  test('human message is used in issue message', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({
      key: 'msg-1',
      human: 'Name is required',
      expression: 'false',
    });
    validateSingleInvariant(constraint, 'Patient', {}, {}, issues);
    expect(issues[0].message).toBe('Name is required');
  });
});

// =============================================================================
// §2 validateSingleInvariant — Error Handling
// =============================================================================

describe('validateSingleInvariant: error handling', () => {
  test('invalid expression produces INVARIANT_EVALUATION_ERROR', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({
      key: 'bad-1',
      expression: '!!!invalid!!!',
    });
    validateSingleInvariant(constraint, 'Patient', {}, {}, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVARIANT_EVALUATION_ERROR');
    expect(issues[0].severity).toBe('warning');
  });

  test('evaluation error includes constraint key in message', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({
      key: 'bad-2',
      expression: '(((',
    });
    validateSingleInvariant(constraint, 'Patient', {}, {}, issues);
    expect(issues[0].message).toContain('bad-2');
  });

  test('evaluation error includes expression in issue', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({
      key: 'bad-3',
      expression: '!!!',
    });
    validateSingleInvariant(constraint, 'Patient', {}, {}, issues);
    expect(issues[0].expression).toBe('!!!');
  });

  test('evaluation error has diagnostics', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({
      key: 'bad-4',
      expression: '(((',
    });
    validateSingleInvariant(constraint, 'Patient', {}, {}, issues);
    expect(issues[0].diagnostics).toBeTruthy();
  });

  test('evaluation error does not throw', () => {
    const issues: ValidationIssue[] = [];
    const constraint = makeInvariant({
      key: 'bad-5',
      expression: '!!!invalid!!!',
    });
    // Should not throw
    expect(() => {
      validateSingleInvariant(constraint, 'Patient', {}, {}, issues);
    }).not.toThrow();
  });
});

// =============================================================================
// §3 validateInvariants — Element-level
// =============================================================================

describe('validateInvariants: element-level', () => {
  test('validates all constraints on element', () => {
    const issues: ValidationIssue[] = [];
    const element = makeElement([
      makeInvariant({ key: 'c1', expression: 'name.exists()' }),
      makeInvariant({ key: 'c2', expression: 'active.exists()' }),
    ]);
    const value = { resourceType: 'Patient', name: [{ family: 'Smith' }] };
    validateInvariants(element, value, value, issues);
    // c1 passes, c2 fails
    expect(issues).toHaveLength(1);
    expect(issues[0].diagnostics).toContain('c2');
  });

  test('empty constraints produces no issues', () => {
    const issues: ValidationIssue[] = [];
    const element = makeElement([]);
    validateInvariants(element, {}, {}, issues);
    expect(issues).toHaveLength(0);
  });

  test('skipInvariants option skips all validation', () => {
    const issues: ValidationIssue[] = [];
    const element = makeElement([
      makeInvariant({ key: 'skip-1', expression: 'false' }),
    ]);
    validateInvariants(element, {}, {}, issues, { skipInvariants: true });
    expect(issues).toHaveLength(0);
  });

  test('multiple failing constraints produce multiple issues', () => {
    const issues: ValidationIssue[] = [];
    const element = makeElement([
      makeInvariant({ key: 'f1', expression: 'false' }),
      makeInvariant({ key: 'f2', expression: 'false' }),
      makeInvariant({ key: 'f3', expression: 'false' }),
    ]);
    validateInvariants(element, {}, {}, issues);
    expect(issues).toHaveLength(3);
  });

  test('mixed passing and failing constraints', () => {
    const issues: ValidationIssue[] = [];
    const element = makeElement([
      makeInvariant({ key: 'p1', expression: 'true' }),
      makeInvariant({ key: 'f1', expression: 'false' }),
      makeInvariant({ key: 'p2', expression: 'true' }),
    ]);
    validateInvariants(element, {}, {}, issues);
    expect(issues).toHaveLength(1);
    expect(issues[0].diagnostics).toContain('f1');
  });

  test('skipInheritedInvariants filters by source', () => {
    const issues: ValidationIssue[] = [];
    const element = makeElement([
      makeInvariant({ key: 'local', expression: 'false', source: 'http://my-profile' }),
      makeInvariant({ key: 'inherited', expression: 'false', source: 'http://base-profile' }),
    ]);
    validateInvariants(element, {}, {}, issues, {
      skipInheritedInvariants: true,
      currentProfileUrl: 'http://my-profile',
    });
    // Only local constraint should be evaluated
    expect(issues).toHaveLength(1);
    expect(issues[0].diagnostics).toContain('local');
  });
});

// =============================================================================
// §4 validateAllInvariants — Batch
// =============================================================================

describe('validateAllInvariants: batch', () => {
  test('validates multiple elements', () => {
    const elements = [
      {
        element: makeElement([makeInvariant({ key: 'e1', expression: 'true' })], 'Patient.name'),
        values: [{ family: 'Smith' }],
      },
      {
        element: makeElement([makeInvariant({ key: 'e2', expression: 'false' })], 'Patient.active'),
        values: [true],
      },
    ];
    const issues = validateAllInvariants(elements, { resourceType: 'Patient' });
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toBe('Patient.active');
  });

  test('validates multiple values per element', () => {
    const elements = [
      {
        element: makeElement([
          makeInvariant({ key: 'tel-1', expression: "system.exists()" }),
        ], 'Patient.telecom'),
        values: [
          { system: 'phone', value: '555-1234' },
          { value: 'no-system' }, // missing system
        ],
      },
    ];
    const issues = validateAllInvariants(elements, { resourceType: 'Patient' });
    expect(issues).toHaveLength(1);
  });

  test('skipInvariants returns empty array', () => {
    const elements = [
      {
        element: makeElement([makeInvariant({ key: 'skip', expression: 'false' })]),
        values: [{}],
      },
    ];
    const issues = validateAllInvariants(elements, {}, { skipInvariants: true });
    expect(issues).toHaveLength(0);
  });

  test('empty elements array returns empty issues', () => {
    const issues = validateAllInvariants([], {});
    expect(issues).toHaveLength(0);
  });

  test('element with empty values array produces no issues', () => {
    const elements = [
      {
        element: makeElement([makeInvariant({ key: 'no-val', expression: 'false' })]),
        values: [],
      },
    ];
    const issues = validateAllInvariants(elements, {});
    expect(issues).toHaveLength(0);
  });
});

// =============================================================================
// §5 evalFhirPathBoolean — Direct Usage
// =============================================================================

describe('evalFhirPathBoolean: invariant patterns', () => {
  test('simple exists check', () => {
    const patient = { resourceType: 'Patient', name: [{ family: 'Smith' }] };
    expect(evalFhirPathBoolean('Patient.name.exists()', patient)).toBe(true);
    expect(evalFhirPathBoolean('Patient.telecom.exists()', patient)).toBe(false);
  });

  test('all() with nested condition', () => {
    const patient = {
      resourceType: 'Patient',
      telecom: [
        { system: 'phone', value: '555-1234' },
        { system: 'email', value: 'test@example.com' },
      ],
    };
    expect(evalFhirPathBoolean(
      'Patient.telecom.all(system.exists() and value.exists())',
      patient,
    )).toBe(true);
  });

  test('implies operator for conditional invariants', () => {
    expect(evalFhirPathBoolean('true implies true', [])).toBe(true);
    expect(evalFhirPathBoolean('true implies false', [])).toBe(false);
    expect(evalFhirPathBoolean('false implies false', [])).toBe(true);
  });

  test('complex chained expression', () => {
    const patient = {
      resourceType: 'Patient',
      name: [
        { use: 'official', family: 'Smith', given: ['John'] },
      ],
    };
    expect(evalFhirPathBoolean(
      "Patient.name.where(use = 'official').family.exists()",
      patient,
    )).toBe(true);
  });

  test('count-based invariant', () => {
    const patient = {
      resourceType: 'Patient',
      name: [{ family: 'A' }, { family: 'B' }],
    };
    expect(evalFhirPathBoolean('Patient.name.count() >= 1', patient)).toBe(true);
    expect(evalFhirPathBoolean('Patient.name.count() > 5', patient)).toBe(false);
  });

  test('or-based invariant', () => {
    const contact = { name: { family: 'Emergency' } };
    expect(evalFhirPathBoolean(
      'name.exists() or telecom.exists() or organization.exists()',
      contact,
    )).toBe(true);
  });
});

// =============================================================================
// §6 Fixture-driven invariant tests
// =============================================================================

const fixtureDir = path.join(__dirname, 'fixtures', '03-invariants');

describe('Fixture: simple invariants', () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, '01-simple-invariants.json'), 'utf-8'),
  );
  for (const tc of fixture.tests) {
    test(tc.description, () => {
      expect(evalFhirPathBoolean(tc.expression, tc.value)).toBe(tc.expected);
    });
  }
});

describe('Fixture: complex invariants', () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, '02-complex-invariants.json'), 'utf-8'),
  );
  for (const tc of fixture.tests) {
    test(tc.description, () => {
      expect(evalFhirPathBoolean(tc.expression, tc.value)).toBe(tc.expected);
    });
  }
});

describe('Fixture: patient invariants', () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, '03-patient-invariants.json'), 'utf-8'),
  );
  for (const tc of fixture.tests) {
    test(tc.description, () => {
      const issues: ValidationIssue[] = [];
      const element = makeElement([tc.invariant], 'Patient.contact');
      validateSingleInvariant(tc.invariant, element.path, tc.value, tc.resource, issues);
      if (tc.expectedValid) {
        expect(issues).toHaveLength(0);
      } else {
        expect(issues.length).toBeGreaterThan(0);
        expect(issues[0].code).toBe('INVARIANT_VIOLATION');
      }
    });
  }
});

describe('Fixture: observation invariants', () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, '04-observation-invariants.json'), 'utf-8'),
  );
  for (const tc of fixture.tests) {
    test(tc.description, () => {
      const issues: ValidationIssue[] = [];
      validateSingleInvariant(tc.invariant, 'Observation', tc.value, tc.resource, issues);
      if (tc.expectedValid) {
        expect(issues).toHaveLength(0);
      } else {
        expect(issues.length).toBeGreaterThan(0);
      }
    });
  }
});

describe('Fixture: edge cases', () => {
  const fixture = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, '05-edge-cases.json'), 'utf-8'),
  );
  for (const tc of fixture.tests) {
    test(tc.description, () => {
      expect(evalFhirPathBoolean(tc.expression, tc.value)).toBe(tc.expected);
    });
  }
});
