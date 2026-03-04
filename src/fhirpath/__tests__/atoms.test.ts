import { describe, test, expect } from 'vitest';
import { evalFhirPath } from '../parse.js';
import { toTypedValue } from '../utils.js';

describe('FHIRPath Atoms — Operators (Task 6.3)', () => {
  // ── Boolean operators ───────────────────────────────────────────────────
  describe('and', () => {
    test('true and true = true', () => {
      expect(evalFhirPath('true and true', [])).toStrictEqual([true]);
    });

    test('true and false = false', () => {
      expect(evalFhirPath('true and false', [])).toStrictEqual([false]);
    });

    test('false and true = false', () => {
      expect(evalFhirPath('false and true', [])).toStrictEqual([false]);
    });

    test('false and false = false', () => {
      expect(evalFhirPath('false and false', [])).toStrictEqual([false]);
    });

    test('true and {} = {} (empty)', () => {
      expect(evalFhirPath('true and {}', [])).toStrictEqual([]);
    });

    test('false and {} = false', () => {
      expect(evalFhirPath('false and {}', [])).toStrictEqual([false]);
    });
  });

  describe('or', () => {
    test('true or true = true', () => {
      expect(evalFhirPath('true or true', [])).toStrictEqual([true]);
    });

    test('true or false = true', () => {
      expect(evalFhirPath('true or false', [])).toStrictEqual([true]);
    });

    test('false or false = false', () => {
      expect(evalFhirPath('false or false', [])).toStrictEqual([false]);
    });

    test('false or {} = {} (empty)', () => {
      expect(evalFhirPath('false or {}', [])).toStrictEqual([]);
    });

    test('true or {} = true', () => {
      expect(evalFhirPath('true or {}', [])).toStrictEqual([true]);
    });
  });

  describe('xor', () => {
    test('true xor false = true', () => {
      expect(evalFhirPath('true xor false', [])).toStrictEqual([true]);
    });

    test('true xor true = false', () => {
      expect(evalFhirPath('true xor true', [])).toStrictEqual([false]);
    });

    test('false xor false = false', () => {
      expect(evalFhirPath('false xor false', [])).toStrictEqual([false]);
    });

    test('true xor {} = {} (empty)', () => {
      expect(evalFhirPath('true xor {}', [])).toStrictEqual([]);
    });
  });

  describe('implies', () => {
    test('true implies true = true', () => {
      expect(evalFhirPath('true implies true', [])).toStrictEqual([true]);
    });

    test('true implies false = false', () => {
      expect(evalFhirPath('true implies false', [])).toStrictEqual([false]);
    });

    test('false implies true = true', () => {
      expect(evalFhirPath('false implies true', [])).toStrictEqual([true]);
    });

    test('false implies false = true', () => {
      expect(evalFhirPath('false implies false', [])).toStrictEqual([true]);
    });

    test('false implies {} = true', () => {
      expect(evalFhirPath('false implies {}', [])).toStrictEqual([true]);
    });

    test('true implies {} = {} (empty)', () => {
      expect(evalFhirPath('true implies {}', [])).toStrictEqual([]);
    });
  });

  // ── Equality / Equivalence ──────────────────────────────────────────────
  describe('equality (=, !=)', () => {
    test('1 = 1 is true', () => {
      expect(evalFhirPath('1 = 1', [])).toStrictEqual([true]);
    });

    test('1 = 2 is false', () => {
      expect(evalFhirPath('1 = 2', [])).toStrictEqual([false]);
    });

    test("'abc' = 'abc' is true", () => {
      expect(evalFhirPath("'abc' = 'abc'", [])).toStrictEqual([true]);
    });

    test('1 != 2 is true', () => {
      expect(evalFhirPath('1 != 2', [])).toStrictEqual([true]);
    });

    test('1 != 1 is false', () => {
      expect(evalFhirPath('1 != 1', [])).toStrictEqual([false]);
    });

    test('{} = 1 returns empty (propagation)', () => {
      expect(evalFhirPath('{} = 1', [])).toStrictEqual([]);
    });
  });

  describe('equivalence (~, !~)', () => {
    test('1 ~ 1 is true', () => {
      expect(evalFhirPath('1 ~ 1', [])).toStrictEqual([true]);
    });

    test("'ABC' ~ 'abc' is true (case-insensitive)", () => {
      expect(evalFhirPath("'ABC' ~ 'abc'", [])).toStrictEqual([true]);
    });

    test('1 !~ 2 is true', () => {
      expect(evalFhirPath('1 !~ 2', [])).toStrictEqual([true]);
    });

    test('{} ~ {} is true (both empty)', () => {
      expect(evalFhirPath('{} ~ {}', [])).toStrictEqual([true]);
    });

    test('{} !~ {} is false', () => {
      expect(evalFhirPath('{} !~ {}', [])).toStrictEqual([false]);
    });
  });

  // ── Type operators ──────────────────────────────────────────────────────
  describe('is', () => {
    test('1 is Integer', () => {
      expect(evalFhirPath('1 is Integer', [])).toStrictEqual([true]);
    });

    test("'hello' is String", () => {
      expect(evalFhirPath("'hello' is String", [])).toStrictEqual([true]);
    });

    test('true is Boolean', () => {
      expect(evalFhirPath('true is Boolean', [])).toStrictEqual([true]);
    });

    test('1 is String is false', () => {
      expect(evalFhirPath('1 is String', [])).toStrictEqual([false]);
    });

    test('{} is Integer returns empty', () => {
      expect(evalFhirPath('{} is Integer', [])).toStrictEqual([]);
    });
  });

  describe('as', () => {
    test('1 as Integer returns 1', () => {
      expect(evalFhirPath('1 as Integer', [])).toStrictEqual([1]);
    });

    test('1 as String returns empty (type mismatch)', () => {
      expect(evalFhirPath('1 as String', [])).toStrictEqual([]);
    });
  });

  // ── Membership operators ────────────────────────────────────────────────
  describe('contains / in', () => {
    test('collection contains value', () => {
      const patient = {
        resourceType: 'Patient',
        name: [{ given: ['Alice', 'Bob'] }],
      };
      expect(evalFhirPath("Patient.name.given contains 'Alice'", [toTypedValue(patient)])).toStrictEqual([true]);
    });

    test('collection does not contain value', () => {
      const patient = {
        resourceType: 'Patient',
        name: [{ given: ['Alice'] }],
      };
      expect(evalFhirPath("Patient.name.given contains 'Charlie'", [toTypedValue(patient)])).toStrictEqual([false]);
    });

    test("'Alice' in Patient.name.given", () => {
      const patient = {
        resourceType: 'Patient',
        name: [{ given: ['Alice', 'Bob'] }],
      };
      expect(evalFhirPath("'Alice' in Patient.name.given", [toTypedValue(patient)])).toStrictEqual([true]);
    });

    test("'Charlie' in Patient.name.given is false", () => {
      const patient = {
        resourceType: 'Patient',
        name: [{ given: ['Alice'] }],
      };
      expect(evalFhirPath("'Charlie' in Patient.name.given", [toTypedValue(patient)])).toStrictEqual([false]);
    });
  });

  // ── Union operator ──────────────────────────────────────────────────────
  describe('union (|)', () => {
    test('1 | 2 returns both', () => {
      expect(evalFhirPath('1 | 2', [])).toStrictEqual([1, 2]);
    });

    test('1 | 1 removes duplicates', () => {
      expect(evalFhirPath('1 | 1', [])).toStrictEqual([1]);
    });

    test('{} | 1 returns 1', () => {
      expect(evalFhirPath('{} | 1', [])).toStrictEqual([1]);
    });
  });

  // ── Concat operator ─────────────────────────────────────────────────────
  describe('concat (&)', () => {
    test("'a' & 'b' = 'ab'", () => {
      expect(evalFhirPath("'a' & 'b'", [])).toStrictEqual(['ab']);
    });

    test("'hello' & ' ' & 'world'", () => {
      expect(evalFhirPath("'hello' & ' ' & 'world'", [])).toStrictEqual(['hello world']);
    });
  });

  // ── Complex expressions ─────────────────────────────────────────────────
  describe('complex expressions', () => {
    test('Combined arithmetic and comparison', () => {
      expect(evalFhirPath('2 + 3 > 4', [])).toStrictEqual([true]);
    });

    test('Combined comparison and boolean', () => {
      expect(evalFhirPath('1 < 2 and 3 > 2', [])).toStrictEqual([true]);
    });

    test('Nested function with operator', () => {
      const patient = {
        resourceType: 'Patient',
        name: [{ given: ['Alice'] }, { given: ['Bob'] }],
      };
      expect(evalFhirPath('Patient.name.count() > 1', [toTypedValue(patient)])).toStrictEqual([true]);
    });

    test('where() with equality', () => {
      const patient = {
        resourceType: 'Patient',
        telecom: [
          { system: 'phone', value: '555-1234' },
          { system: 'email', value: 'alice@example.com' },
        ],
      };
      expect(
        evalFhirPath("Patient.telecom.where(system = 'email').value", [toTypedValue(patient)]),
      ).toStrictEqual(['alice@example.com']);
    });

    test('exists() with criteria', () => {
      const patient = {
        resourceType: 'Patient',
        name: [{ given: ['Alice'], family: 'Smith' }],
      };
      expect(
        evalFhirPath("Patient.name.exists(family = 'Smith')", [toTypedValue(patient)]),
      ).toStrictEqual([true]);
    });
  });
});
