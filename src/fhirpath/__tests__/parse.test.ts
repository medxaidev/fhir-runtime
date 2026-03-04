import { describe, test, expect } from 'vitest';
import { parseFhirPath, evalFhirPath } from '../parse.js';
import { toTypedValue } from '../utils.js';

describe('FHIRPath Parser', () => {
  // ── Arithmetic ──────────────────────────────────────────────────────────
  test('Order of operations: 3 / 3 + 4 * 9 - 1 = 36', () => {
    expect(evalFhirPath('3 / 3 + 4 * 9 - 1', [])).toStrictEqual([36]);
  });

  test('Parentheses: (3 / 3 + 4 * 3) = 13', () => {
    expect(evalFhirPath('(3 / 3 + 4 * 3)', [])).toStrictEqual([13]);
  });

  test('Left associativity: 5 - 4 - 3 - 2 - 1 + 512 = 507', () => {
    expect(evalFhirPath('5 - 4 - 3 - 2 - 1 + 512', [])).toStrictEqual([507]);
  });

  test('Prefix operators: -4 + -(4 + 5 - -4) = -17', () => {
    expect(evalFhirPath('-4 + -(4 + 5 - -4)', [])).toStrictEqual([-17]);
  });

  test('Integer division: 10 div 3 = 3', () => {
    expect(evalFhirPath('10 div 3', [])).toStrictEqual([3]);
  });

  test('Modulo: 10 mod 3 = 1', () => {
    expect(evalFhirPath('10 mod 3', [])).toStrictEqual([1]);
  });

  // ── Parse errors ────────────────────────────────────────────────────────
  test('Throws on missing closing parenthesis', () => {
    expect(() => parseFhirPath('(2 + 1')).toThrow('Parse error: expected `)`');
  });

  test('Throws on unexpected symbol', () => {
    expect(() => parseFhirPath('*')).toThrow('No matching prefix parselet');
  });

  test('Throws on missing tokens', () => {
    expect(() => parseFhirPath('1 * ')).toThrow('Cant consume unknown more tokens.');
  });

  // ── Literals ────────────────────────────────────────────────────────────
  test('Boolean literal true', () => {
    expect(evalFhirPath('true', [])).toStrictEqual([true]);
  });

  test('Boolean literal false', () => {
    expect(evalFhirPath('false', [])).toStrictEqual([false]);
  });

  test('String literal', () => {
    expect(evalFhirPath("'hello'", [])).toStrictEqual(['hello']);
  });

  test('Integer literal', () => {
    expect(evalFhirPath('42', [])).toStrictEqual([42]);
  });

  test('Decimal literal', () => {
    expect(evalFhirPath('3.14', [])).toStrictEqual([3.14]);
  });

  test('Empty set literal', () => {
    expect(evalFhirPath('{}', [])).toStrictEqual([]);
  });

  // ── Property navigation ─────────────────────────────────────────────────
  test('Patient.name.given on empty resource', () => {
    expect(evalFhirPath('Patient.name.given', [toTypedValue({})])).toStrictEqual([]);
  });

  test('Patient.name.given extracts given name', () => {
    const patient = {
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    };
    expect(evalFhirPath('Patient.name.given', [toTypedValue(patient)])).toStrictEqual(['Alice']);
  });

  test('Patient.name.family extracts family name', () => {
    const patient = {
      resourceType: 'Patient',
      name: [{ given: ['Bob'], family: 'Jones' }],
    };
    expect(evalFhirPath('Patient.name.family', [toTypedValue(patient)])).toStrictEqual(['Jones']);
  });

  test('Nested property: Patient.identifier.system', () => {
    const patient = {
      resourceType: 'Patient',
      identifier: [{ system: 'http://example.org', value: '12345' }],
    };
    expect(evalFhirPath('Patient.identifier.system', [toTypedValue(patient)])).toStrictEqual(['http://example.org']);
  });

  test('Multiple values from array', () => {
    const patient = {
      resourceType: 'Patient',
      name: [
        { given: ['Alice'] },
        { given: ['Bob'] },
      ],
    };
    expect(evalFhirPath('Patient.name.given', [toTypedValue(patient)])).toStrictEqual(['Alice', 'Bob']);
  });

  // ── String concatenation ────────────────────────────────────────────────
  test('String concatenation with +', () => {
    const patient = {
      resourceType: 'Patient',
      name: [{ given: ['Alice'], family: 'Smith' }],
    };
    const result = evalFhirPath("Patient.name.given + ' ' + Patient.name.family", [toTypedValue(patient)]);
    expect(result).toStrictEqual(['Alice Smith']);
  });

  test('String concatenation with &', () => {
    expect(evalFhirPath("'hello' & ' ' & 'world'", [])).toStrictEqual(['hello world']);
  });

  // ── Indexer ─────────────────────────────────────────────────────────────
  test('Indexer: Patient.name[0].given', () => {
    const patient = {
      resourceType: 'Patient',
      name: [
        { given: ['Alice'] },
        { given: ['Bob'] },
      ],
    };
    expect(evalFhirPath('Patient.name[0].given', [toTypedValue(patient)])).toStrictEqual(['Alice']);
  });

  test('Indexer out of bounds returns empty', () => {
    const patient = {
      resourceType: 'Patient',
      name: [{ given: ['Alice'] }],
    };
    expect(evalFhirPath('Patient.name[5].given', [toTypedValue(patient)])).toStrictEqual([]);
  });

  // ── Function calls ─────────────────────────────────────────────────────
  test('Function: length()', () => {
    expect(evalFhirPath("'Peter'.length()", [])).toStrictEqual([5]);
  });

  test('Function minus number', () => {
    expect(evalFhirPath("'Peter'.length()-3", [])).toStrictEqual([2]);
  });

  test('Function: exists()', () => {
    const patient = {
      resourceType: 'Patient',
      name: [{ given: ['Alice'] }],
    };
    expect(evalFhirPath('Patient.name.exists()', [toTypedValue(patient)])).toStrictEqual([true]);
  });

  test('Function: count()', () => {
    const patient = {
      resourceType: 'Patient',
      name: [{ given: ['Alice'] }, { given: ['Bob'] }],
    };
    expect(evalFhirPath('Patient.name.count()', [toTypedValue(patient)])).toStrictEqual([2]);
  });

  // ── Comparison operators ────────────────────────────────────────────────
  test('Less than: 1 < 2', () => {
    expect(evalFhirPath('1 < 2', [])).toStrictEqual([true]);
  });

  test('Greater than: 5 > 3', () => {
    expect(evalFhirPath('5 > 3', [])).toStrictEqual([true]);
  });

  test('Less than or equal: 3 <= 3', () => {
    expect(evalFhirPath('3 <= 3', [])).toStrictEqual([true]);
  });

  test('Greater than or equal: 3 >= 4', () => {
    expect(evalFhirPath('3 >= 4', [])).toStrictEqual([false]);
  });

  // ── Equality ────────────────────────────────────────────────────────────
  test('Equality: 1 = 1', () => {
    expect(evalFhirPath('1 = 1', [])).toStrictEqual([true]);
  });

  test('Inequality: 1 != 2', () => {
    expect(evalFhirPath('1 != 2', [])).toStrictEqual([true]);
  });

  test('String equality', () => {
    expect(evalFhirPath("'abc' = 'abc'", [])).toStrictEqual([true]);
  });

  test('String inequality', () => {
    expect(evalFhirPath("'abc' != 'def'", [])).toStrictEqual([true]);
  });

  // ── parseFhirPath returns reusable AST ─────────────────────────────────
  test('parseFhirPath returns FhirPathAtom', () => {
    const ast = parseFhirPath('1 + 2');
    expect(ast).toBeDefined();
    expect(ast.original).toBe('1 + 2');
    expect(evalFhirPath(ast, [])).toStrictEqual([3]);
  });

  test('Reuse parsed AST for multiple evaluations', () => {
    const ast = parseFhirPath('Patient.name.given');
    const p1 = { resourceType: 'Patient', name: [{ given: ['Alice'] }] };
    const p2 = { resourceType: 'Patient', name: [{ given: ['Bob'] }] };
    expect(evalFhirPath(ast, p1)).toStrictEqual(['Alice']);
    expect(evalFhirPath(ast, p2)).toStrictEqual(['Bob']);
  });
});
