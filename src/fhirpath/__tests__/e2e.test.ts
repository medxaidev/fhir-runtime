/**
 * End-to-End FHIRPath Tests
 * 
 * Comprehensive integration tests using realistic FHIR resources.
 * Based on FHIRPath spec examples and real-world use cases.
 */

import { describe, test, expect } from 'vitest';
import { evalFhirPath, evalFhirPathTyped } from '../parse.js';
import { toTypedValue } from '../utils.js';

// =============================================================================
// Test Fixtures
// =============================================================================

const patient = {
  resourceType: 'Patient',
  id: 'example',
  active: true,
  name: [
    {
      use: 'official',
      family: 'Chalmers',
      given: ['Peter', 'James'],
    },
    {
      use: 'usual',
      given: ['Jim'],
    },
  ],
  telecom: [
    {
      system: 'phone',
      value: '(03) 5555 6473',
      use: 'work',
      rank: 1,
    },
    {
      system: 'email',
      value: 'jim@example.com',
      use: 'home',
    },
  ],
  gender: 'male',
  birthDate: '1974-12-25',
  address: [
    {
      use: 'home',
      type: 'both',
      line: ['534 Erewhon St'],
      city: 'PleasantVille',
      state: 'Vic',
      postalCode: '3999',
    },
  ],
  contact: [
    {
      relationship: [
        {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/v2-0131',
              code: 'N',
            },
          ],
        },
      ],
      name: {
        family: 'du Marché',
        given: ['Bénédicte'],
      },
      telecom: [
        {
          system: 'phone',
          value: '+33 (237) 998327',
        },
      ],
      address: {
        use: 'home',
        type: 'both',
        line: ['534 Erewhon St'],
        city: 'PleasantVille',
        state: 'Vic',
        postalCode: '3999',
      },
      gender: 'female',
    },
  ],
};

const observation = {
  resourceType: 'Observation',
  id: 'example',
  status: 'final',
  category: [
    {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
          display: 'Vital Signs',
        },
      ],
    },
  ],
  code: {
    coding: [
      {
        system: 'http://loinc.org',
        code: '29463-7',
        display: 'Body Weight',
      },
    ],
  },
  subject: {
    reference: 'Patient/example',
  },
  effectiveDateTime: '2016-03-28',
  valueQuantity: {
    value: 185,
    unit: 'lbs',
    system: 'http://unitsofmeasure.org',
    code: '[lb_av]',
  },
};

const bundle = {
  resourceType: 'Bundle',
  type: 'searchset',
  total: 2,
  entry: [
    {
      resource: {
        resourceType: 'Patient',
        id: 'p1',
        name: [{ given: ['Alice'], family: 'Smith' }],
        active: true,
      },
    },
    {
      resource: {
        resourceType: 'Patient',
        id: 'p2',
        name: [{ given: ['Bob'], family: 'Jones' }],
        active: false,
      },
    },
  ],
};

// =============================================================================
// Basic Navigation
// =============================================================================

describe('E2E: Basic Navigation', () => {
  test('simple property access', () => {
    expect(evalFhirPath('Patient.id', [toTypedValue(patient)])).toStrictEqual(['example']);
    expect(evalFhirPath('Patient.gender', [toTypedValue(patient)])).toStrictEqual(['male']);
    expect(evalFhirPath('Patient.birthDate', [toTypedValue(patient)])).toStrictEqual(['1974-12-25']);
  });

  test('nested property access', () => {
    expect(evalFhirPath('Patient.name.family', [toTypedValue(patient)])).toStrictEqual(['Chalmers']);
    expect(evalFhirPath('Patient.name.given', [toTypedValue(patient)])).toStrictEqual(['Peter', 'James', 'Jim']);
  });

  test('array indexing', () => {
    expect(evalFhirPath('Patient.name[0].family', [toTypedValue(patient)])).toStrictEqual(['Chalmers']);
    expect(evalFhirPath('Patient.name[1].given', [toTypedValue(patient)])).toStrictEqual(['Jim']);
    expect(evalFhirPath('Patient.telecom[0].value', [toTypedValue(patient)])).toStrictEqual(['(03) 5555 6473']);
  });

  test('deep nesting', () => {
    expect(evalFhirPath('Patient.contact.name.family', [toTypedValue(patient)])).toStrictEqual(['du Marché']);
    expect(evalFhirPath('Patient.contact.name.given', [toTypedValue(patient)])).toStrictEqual(['Bénédicte']);
  });
});

// =============================================================================
// Filtering & Projection
// =============================================================================

describe('E2E: Filtering & Projection', () => {
  test('where() with simple condition', () => {
    expect(evalFhirPath("Patient.name.where(use = 'official').family", [toTypedValue(patient)])).toStrictEqual(['Chalmers']);
    expect(evalFhirPath("Patient.name.where(use = 'usual').given", [toTypedValue(patient)])).toStrictEqual(['Jim']);
  });

  test('where() with complex condition', () => {
    expect(evalFhirPath("Patient.telecom.where(system = 'phone').value", [toTypedValue(patient)])).toStrictEqual(['(03) 5555 6473']);
    expect(evalFhirPath("Patient.telecom.where(system = 'email').value", [toTypedValue(patient)])).toStrictEqual(['jim@example.com']);
  });

  test('select() for projection', () => {
    expect(evalFhirPath('Patient.name.select(family)', [toTypedValue(patient)])).toStrictEqual(['Chalmers']);
    expect(evalFhirPath('Patient.name.select(given)', [toTypedValue(patient)])).toStrictEqual(['Peter', 'James', 'Jim']);
  });

  test('chained where() and select()', () => {
    expect(evalFhirPath("Patient.name.where(use = 'official').select(given)", [toTypedValue(patient)])).toStrictEqual(['Peter', 'James']);
  });

  test('exists() with criteria', () => {
    expect(evalFhirPath("Patient.name.exists(use = 'official')", [toTypedValue(patient)])).toStrictEqual([true]);
    expect(evalFhirPath("Patient.name.exists(use = 'nickname')", [toTypedValue(patient)])).toStrictEqual([false]);
  });

  test('all() with criteria', () => {
    expect(evalFhirPath('Patient.name.all(family.exists())', [toTypedValue(patient)])).toStrictEqual([false]); // 'usual' name has no family
    expect(evalFhirPath('Patient.telecom.all(system.exists())', [toTypedValue(patient)])).toStrictEqual([true]);
  });
});

// =============================================================================
// Functions: Existence & Subsetting
// =============================================================================

describe('E2E: Existence & Subsetting', () => {
  test('count()', () => {
    expect(evalFhirPath('Patient.name.count()', [toTypedValue(patient)])).toStrictEqual([2]);
    expect(evalFhirPath('Patient.telecom.count()', [toTypedValue(patient)])).toStrictEqual([2]);
    expect(evalFhirPath('Patient.address.count()', [toTypedValue(patient)])).toStrictEqual([1]);
  });

  test('empty() and hasValue()', () => {
    expect(evalFhirPath('Patient.deceased.empty()', [toTypedValue(patient)])).toStrictEqual([true]);
    expect(evalFhirPath('Patient.name.empty()', [toTypedValue(patient)])).toStrictEqual([false]);
    expect(evalFhirPath('Patient.name.hasValue()', [toTypedValue(patient)])).toStrictEqual([true]);
  });

  test('first() and last()', () => {
    expect(evalFhirPath('Patient.name.first().family', [toTypedValue(patient)])).toStrictEqual(['Chalmers']);
    expect(evalFhirPath('Patient.name.last().given', [toTypedValue(patient)])).toStrictEqual(['Jim']);
  });

  test('tail()', () => {
    expect(evalFhirPath('Patient.name.tail().count()', [toTypedValue(patient)])).toStrictEqual([1]);
    expect(evalFhirPath('Patient.name.tail().given', [toTypedValue(patient)])).toStrictEqual(['Jim']);
  });

  test('skip() and take()', () => {
    expect(evalFhirPath('Patient.name.skip(1).count()', [toTypedValue(patient)])).toStrictEqual([1]);
    expect(evalFhirPath('Patient.name.take(1).family', [toTypedValue(patient)])).toStrictEqual(['Chalmers']);
  });

  test('distinct()', () => {
    expect(evalFhirPath('(1 | 1 | 2 | 2 | 3).distinct().count()', [])).toStrictEqual([3]);
  });
});

// =============================================================================
// String Functions
// =============================================================================

describe('E2E: String Functions', () => {
  test('string concatenation with &', () => {
    expect(evalFhirPath("Patient.name.first().given.first() & ' ' & Patient.name.first().family", [toTypedValue(patient)])).toStrictEqual(['Peter Chalmers']);
  });

  test('upper() and lower()', () => {
    expect(evalFhirPath('Patient.name.first().family.upper()', [toTypedValue(patient)])).toStrictEqual(['CHALMERS']);
    expect(evalFhirPath('Patient.name.first().family.lower()', [toTypedValue(patient)])).toStrictEqual(['chalmers']);
  });

  test('startsWith() and endsWith()', () => {
    expect(evalFhirPath("Patient.name.first().family.startsWith('Chal')", [toTypedValue(patient)])).toStrictEqual([true]);
    expect(evalFhirPath("Patient.name.first().family.endsWith('mers')", [toTypedValue(patient)])).toStrictEqual([true]);
    expect(evalFhirPath("Patient.name.first().family.startsWith('Smith')", [toTypedValue(patient)])).toStrictEqual([false]);
  });

  test('contains()', () => {
    expect(evalFhirPath("Patient.name.first().family.contains('alm')", [toTypedValue(patient)])).toStrictEqual([true]);
    expect(evalFhirPath("Patient.name.first().family.contains('xyz')", [toTypedValue(patient)])).toStrictEqual([false]);
  });

  test('length()', () => {
    expect(evalFhirPath('Patient.name.first().family.length()', [toTypedValue(patient)])).toStrictEqual([8]); // 'Chalmers'
  });

  test('substring()', () => {
    expect(evalFhirPath('Patient.name.first().family.substring(0, 4)', [toTypedValue(patient)])).toStrictEqual(['Chal']);
  });
});

// =============================================================================
// Math & Comparison
// =============================================================================

describe('E2E: Math & Comparison', () => {
  test('arithmetic on Quantity', () => {
    expect(evalFhirPath('Observation.valueQuantity.value', [toTypedValue(observation)])).toStrictEqual([185]);
    expect(evalFhirPath('Observation.valueQuantity.value > 100', [toTypedValue(observation)])).toStrictEqual([true]);
    expect(evalFhirPath('Observation.valueQuantity.value < 200', [toTypedValue(observation)])).toStrictEqual([true]);
  });

  test('comparison operators', () => {
    expect(evalFhirPath('5 > 3', [])).toStrictEqual([true]);
    expect(evalFhirPath('5 < 3', [])).toStrictEqual([false]);
    expect(evalFhirPath('5 >= 5', [])).toStrictEqual([true]);
    expect(evalFhirPath('5 <= 5', [])).toStrictEqual([true]);
  });

  test('equality vs equivalence', () => {
    expect(evalFhirPath('1 = 1', [])).toStrictEqual([true]);
    expect(evalFhirPath('1 = 1.0', [])).toStrictEqual([true]);
    expect(evalFhirPath("'abc' = 'abc'", [])).toStrictEqual([true]);
    expect(evalFhirPath("'abc' = 'ABC'", [])).toStrictEqual([false]);
    expect(evalFhirPath("'abc' ~ 'ABC'", [])).toStrictEqual([true]); // equivalence is case-insensitive
  });
});

// =============================================================================
// Boolean Logic
// =============================================================================

describe('E2E: Boolean Logic', () => {
  test('and operator', () => {
    expect(evalFhirPath('Patient.active and Patient.gender = "male"', [toTypedValue(patient)])).toStrictEqual([true]);
    expect(evalFhirPath('Patient.active and Patient.gender = "female"', [toTypedValue(patient)])).toStrictEqual([false]);
  });

  test('or operator', () => {
    expect(evalFhirPath('Patient.gender = "male" or Patient.gender = "female"', [toTypedValue(patient)])).toStrictEqual([true]);
    expect(evalFhirPath('Patient.gender = "other" or Patient.gender = "unknown"', [toTypedValue(patient)])).toStrictEqual([false]);
  });

  test('not operator', () => {
    expect(evalFhirPath('Patient.active.not()', [toTypedValue(patient)])).toStrictEqual([false]);
    expect(evalFhirPath('Patient.deceased.exists().not()', [toTypedValue(patient)])).toStrictEqual([true]);
  });

  test('implies operator', () => {
    expect(evalFhirPath('true implies true', [])).toStrictEqual([true]);
    expect(evalFhirPath('true implies false', [])).toStrictEqual([false]);
    expect(evalFhirPath('false implies true', [])).toStrictEqual([true]);
    expect(evalFhirPath('false implies false', [])).toStrictEqual([true]);
  });
});

// =============================================================================
// Type Checking
// =============================================================================

describe('E2E: Type Checking', () => {
  test('is operator', () => {
    expect(evalFhirPath('Patient is Patient', [toTypedValue(patient)])).toStrictEqual([true]);
    expect(evalFhirPath('Patient is Observation', [toTypedValue(patient)])).toStrictEqual([false]);
  });

  test('ofType() function', () => {
    const result = evalFhirPathTyped('Bundle.entry.resource.ofType(Patient)', [toTypedValue(bundle)]);
    expect(result).toHaveLength(2);
    expect(result.every((r) => r.type === 'Patient')).toBe(true);
  });
});

// =============================================================================
// Collection Operations
// =============================================================================

describe('E2E: Collection Operations', () => {
  test('union operator |', () => {
    expect(evalFhirPath('(1 | 2 | 3).count()', [])).toStrictEqual([3]);
    expect(evalFhirPath('(1 | 2) | (2 | 3)', [])).toStrictEqual([1, 2, 3]); // removes duplicates
  });

  test('combine()', () => {
    expect(evalFhirPath('(1 | 2).combine(2 | 3).count()', [])).toStrictEqual([4]); // keeps duplicates
  });

  test('intersect()', () => {
    expect(evalFhirPath('(1 | 2 | 3).intersect(2 | 3 | 4)', [])).toStrictEqual([2, 3]);
  });

  test('exclude()', () => {
    expect(evalFhirPath('(1 | 2 | 3).exclude(2)', [])).toStrictEqual([1, 3]);
  });

  test('in operator', () => {
    expect(evalFhirPath('2 in (1 | 2 | 3)', [])).toStrictEqual([true]);
    expect(evalFhirPath('5 in (1 | 2 | 3)', [])).toStrictEqual([false]);
  });

  test('contains operator', () => {
    expect(evalFhirPath('(1 | 2 | 3) contains 2', [])).toStrictEqual([true]);
    expect(evalFhirPath('(1 | 2 | 3) contains 5', [])).toStrictEqual([false]);
  });
});

// =============================================================================
// Conversion Functions
// =============================================================================

describe('E2E: Conversion Functions', () => {
  test('toInteger()', () => {
    expect(evalFhirPath("'42'.toInteger()", [])).toStrictEqual([42]);
    expect(evalFhirPath('true.toInteger()', [])).toStrictEqual([1]);
    expect(evalFhirPath('false.toInteger()', [])).toStrictEqual([0]);
  });

  test('toString()', () => {
    expect(evalFhirPath('42.toString()', [])).toStrictEqual(['42']);
    expect(evalFhirPath('true.toString()', [])).toStrictEqual(['true']);
  });

  test('toBoolean()', () => {
    expect(evalFhirPath("'true'.toBoolean()", [])).toStrictEqual([true]);
    expect(evalFhirPath("'false'.toBoolean()", [])).toStrictEqual([false]);
    expect(evalFhirPath('1.toBoolean()', [])).toStrictEqual([true]);
    expect(evalFhirPath('0.toBoolean()', [])).toStrictEqual([false]);
  });

  test('convertsToX() functions', () => {
    expect(evalFhirPath("'42'.convertsToInteger()", [])).toStrictEqual([true]);
    expect(evalFhirPath("'abc'.convertsToInteger()", [])).toStrictEqual([false]);
    expect(evalFhirPath("'true'.convertsToBoolean()", [])).toStrictEqual([true]);
    expect(evalFhirPath("'xyz'.convertsToBoolean()", [])).toStrictEqual([false]);
  });
});

// =============================================================================
// Utility Functions
// =============================================================================

describe('E2E: Utility Functions', () => {
  test('iif() conditional', () => {
    expect(evalFhirPath("iif(Patient.active, 'Active', 'Inactive')", [toTypedValue(patient)])).toStrictEqual(['Active']);
    expect(evalFhirPath("iif(Patient.deceased.exists(), 'Deceased', 'Living')", [toTypedValue(patient)])).toStrictEqual(['Living']);
  });

  test('trace() returns input', () => {
    expect(evalFhirPath('Patient.id.trace()', [toTypedValue(patient)])).toStrictEqual(['example']);
  });
});

// =============================================================================
// Complex Real-World Scenarios
// =============================================================================

describe('E2E: Complex Real-World Scenarios', () => {
  test('find official name with full formatting', () => {
    const expr = "Patient.name.where(use = 'official').select(given.first() & ' ' & family).first()";
    expect(evalFhirPath(expr, [toTypedValue(patient)])).toStrictEqual(['Peter Chalmers']);
  });

  test('check if patient has work phone', () => {
    const expr = "Patient.telecom.where(system = 'phone' and use = 'work').exists()";
    expect(evalFhirPath(expr, [toTypedValue(patient)])).toStrictEqual([true]);
  });

  test('get all email addresses', () => {
    const expr = "Patient.telecom.where(system = 'email').value";
    expect(evalFhirPath(expr, [toTypedValue(patient)])).toStrictEqual(['jim@example.com']);
  });

  test('count active patients in bundle', () => {
    const expr = 'Bundle.entry.resource.ofType(Patient).where(active = true).count()';
    expect(evalFhirPath(expr, [toTypedValue(bundle)])).toStrictEqual([1]);
  });

  test('get all patient names from bundle', () => {
    const expr = 'Bundle.entry.resource.ofType(Patient).name.family';
    expect(evalFhirPath(expr, [toTypedValue(bundle)])).toStrictEqual(['Smith', 'Jones']);
  });

  test('complex filtering: active patients with family name', () => {
    const expr = 'Bundle.entry.resource.ofType(Patient).where(active = true and name.family.exists()).name.family';
    expect(evalFhirPath(expr, [toTypedValue(bundle)])).toStrictEqual(['Smith']);
  });

  test('observation value comparison', () => {
    const expr = 'Observation.valueQuantity.value > 150';
    expect(evalFhirPath(expr, [toTypedValue(observation)])).toStrictEqual([true]);
  });

  test('check observation category', () => {
    const expr = "Observation.category.coding.where(code = 'vital-signs').exists()";
    expect(evalFhirPath(expr, [toTypedValue(observation)])).toStrictEqual([true]);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('E2E: Edge Cases', () => {
  test('empty collection operations', () => {
    expect(evalFhirPath('Patient.deceased.count()', [toTypedValue(patient)])).toStrictEqual([0]);
    expect(evalFhirPath('Patient.deceased.first()', [toTypedValue(patient)])).toStrictEqual([]);
    expect(evalFhirPath('Patient.deceased.where(true)', [toTypedValue(patient)])).toStrictEqual([]);
  });

  test('null propagation', () => {
    expect(evalFhirPath('Patient.deceased.value', [toTypedValue(patient)])).toStrictEqual([]);
  });

  test('array flattening', () => {
    expect(evalFhirPath('Patient.name.given', [toTypedValue(patient)])).toStrictEqual(['Peter', 'James', 'Jim']);
  });

  test('chained empty checks', () => {
    expect(evalFhirPath('Patient.deceased.exists().not()', [toTypedValue(patient)])).toStrictEqual([true]);
  });
});
