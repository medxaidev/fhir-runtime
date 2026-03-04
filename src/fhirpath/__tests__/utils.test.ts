import { describe, test, expect } from 'vitest';
import {
  booleanToTypedValue,
  toTypedValue,
  toJsBoolean,
  singleton,
  fhirPathEquals,
  fhirPathArrayEquals,
  fhirPathEquivalent,
  fhirPathNot,
  fhirPathIs,
  removeDuplicates,
  isQuantity,
  isResource,
  getTypedPropertyValue,
} from '../utils.js';

describe('FHIRPath Utils', () => {
  // ── booleanToTypedValue ─────────────────────────────────────────────────
  describe('booleanToTypedValue', () => {
    test('true', () => {
      expect(booleanToTypedValue(true)).toStrictEqual([{ type: 'boolean', value: true }]);
    });

    test('false', () => {
      expect(booleanToTypedValue(false)).toStrictEqual([{ type: 'boolean', value: false }]);
    });
  });

  // ── toTypedValue ────────────────────────────────────────────────────────
  describe('toTypedValue', () => {
    test('null → undefined type', () => {
      expect(toTypedValue(null)).toStrictEqual({ type: 'undefined', value: undefined });
    });

    test('undefined → undefined type', () => {
      expect(toTypedValue(undefined)).toStrictEqual({ type: 'undefined', value: undefined });
    });

    test('integer', () => {
      expect(toTypedValue(42)).toStrictEqual({ type: 'integer', value: 42 });
    });

    test('decimal', () => {
      expect(toTypedValue(3.14)).toStrictEqual({ type: 'decimal', value: 3.14 });
    });

    test('boolean', () => {
      expect(toTypedValue(true)).toStrictEqual({ type: 'boolean', value: true });
    });

    test('string', () => {
      expect(toTypedValue('hello')).toStrictEqual({ type: 'string', value: 'hello' });
    });

    test('Quantity', () => {
      const q = { value: 5, unit: 'mg' };
      expect(toTypedValue(q)).toStrictEqual({ type: 'Quantity', value: q });
    });

    test('Resource', () => {
      const r = { resourceType: 'Patient', id: '123' };
      expect(toTypedValue(r)).toStrictEqual({ type: 'Patient', value: r });
    });

    test('Object (BackboneElement)', () => {
      const obj = { system: 'http://example.org', value: '123' };
      expect(toTypedValue(obj)).toStrictEqual({ type: 'BackboneElement', value: obj });
    });
  });

  // ── toJsBoolean ─────────────────────────────────────────────────────────
  describe('toJsBoolean', () => {
    test('empty array → false', () => {
      expect(toJsBoolean([])).toBe(false);
    });

    test('true value → true', () => {
      expect(toJsBoolean([{ type: 'boolean', value: true }])).toBe(true);
    });

    test('false value → false', () => {
      expect(toJsBoolean([{ type: 'boolean', value: false }])).toBe(false);
    });

    test('truthy non-boolean → true', () => {
      expect(toJsBoolean([{ type: 'string', value: 'hello' }])).toBe(true);
    });

    test('zero → false', () => {
      expect(toJsBoolean([{ type: 'integer', value: 0 }])).toBe(false);
    });
  });

  // ── singleton ───────────────────────────────────────────────────────────
  describe('singleton', () => {
    test('empty → undefined', () => {
      expect(singleton([])).toBeUndefined();
    });

    test('single element → that element', () => {
      const tv = { type: 'integer', value: 42 };
      expect(singleton([tv])).toBe(tv);
    });

    test('single element with type match', () => {
      const tv = { type: 'boolean', value: true };
      expect(singleton([tv], 'boolean')).toBe(tv);
    });

    test('single element with type mismatch → throws', () => {
      const tv = { type: 'integer', value: 42 };
      expect(() => singleton([tv], 'boolean')).toThrow('Expected singleton');
    });

    test('multiple elements → throws', () => {
      expect(() => singleton([
        { type: 'integer', value: 1 },
        { type: 'integer', value: 2 },
      ])).toThrow('Expected singleton');
    });
  });

  // ── fhirPathEquals ──────────────────────────────────────────────────────
  describe('fhirPathEquals', () => {
    test('equal integers', () => {
      expect(fhirPathEquals({ type: 'integer', value: 1 }, { type: 'integer', value: 1 }))
        .toStrictEqual([{ type: 'boolean', value: true }]);
    });

    test('unequal integers', () => {
      expect(fhirPathEquals({ type: 'integer', value: 1 }, { type: 'integer', value: 2 }))
        .toStrictEqual([{ type: 'boolean', value: false }]);
    });

    test('equal strings', () => {
      expect(fhirPathEquals({ type: 'string', value: 'abc' }, { type: 'string', value: 'abc' }))
        .toStrictEqual([{ type: 'boolean', value: true }]);
    });

    test('unequal strings', () => {
      expect(fhirPathEquals({ type: 'string', value: 'abc' }, { type: 'string', value: 'def' }))
        .toStrictEqual([{ type: 'boolean', value: false }]);
    });

    test('number precision (close enough)', () => {
      expect(fhirPathEquals({ type: 'decimal', value: 1.0000000001 }, { type: 'decimal', value: 1.0 }))
        .toStrictEqual([{ type: 'boolean', value: true }]);
    });
  });

  // ── fhirPathArrayEquals ─────────────────────────────────────────────────
  describe('fhirPathArrayEquals', () => {
    test('empty vs non-empty → empty', () => {
      expect(fhirPathArrayEquals([], [{ type: 'integer', value: 1 }])).toStrictEqual([]);
    });

    test('same arrays → true', () => {
      const a = [{ type: 'integer', value: 1 }];
      expect(fhirPathArrayEquals(a, a)).toStrictEqual([{ type: 'boolean', value: true }]);
    });

    test('different lengths → false', () => {
      expect(fhirPathArrayEquals(
        [{ type: 'integer', value: 1 }],
        [{ type: 'integer', value: 1 }, { type: 'integer', value: 2 }],
      )).toStrictEqual([{ type: 'boolean', value: false }]);
    });
  });

  // ── fhirPathEquivalent ──────────────────────────────────────────────────
  describe('fhirPathEquivalent', () => {
    test('case-insensitive string equivalence', () => {
      expect(fhirPathEquivalent({ type: 'string', value: 'ABC' }, { type: 'string', value: 'abc' }))
        .toStrictEqual([{ type: 'boolean', value: true }]);
    });

    test('number equivalence with tolerance', () => {
      expect(fhirPathEquivalent({ type: 'decimal', value: 1.005 }, { type: 'decimal', value: 1.0 }))
        .toStrictEqual([{ type: 'boolean', value: true }]);
    });
  });

  // ── fhirPathNot ─────────────────────────────────────────────────────────
  describe('fhirPathNot', () => {
    test('not true → false', () => {
      expect(fhirPathNot([{ type: 'boolean', value: true }]))
        .toStrictEqual([{ type: 'boolean', value: false }]);
    });

    test('not false → true', () => {
      expect(fhirPathNot([{ type: 'boolean', value: false }]))
        .toStrictEqual([{ type: 'boolean', value: true }]);
    });

    test('not empty → true', () => {
      expect(fhirPathNot([])).toStrictEqual([{ type: 'boolean', value: true }]);
    });
  });

  // ── fhirPathIs ──────────────────────────────────────────────────────────
  describe('fhirPathIs', () => {
    test('integer is Integer', () => {
      expect(fhirPathIs({ type: 'integer', value: 42 }, 'Integer')).toBe(true);
    });

    test('string is String', () => {
      expect(fhirPathIs({ type: 'string', value: 'hello' }, 'String')).toBe(true);
    });

    test('boolean is Boolean', () => {
      expect(fhirPathIs({ type: 'boolean', value: true }, 'Boolean')).toBe(true);
    });

    test('integer is not String', () => {
      expect(fhirPathIs({ type: 'integer', value: 42 }, 'String')).toBe(false);
    });

    test('System.Boolean prefix', () => {
      expect(fhirPathIs({ type: 'boolean', value: true }, 'System.Boolean')).toBe(true);
    });

    test('FHIR.Patient prefix', () => {
      const patient = { resourceType: 'Patient', id: '1' };
      expect(fhirPathIs({ type: 'Patient', value: patient }, 'FHIR.Patient')).toBe(true);
    });
  });

  // ── removeDuplicates ────────────────────────────────────────────────────
  describe('removeDuplicates', () => {
    test('no duplicates', () => {
      const arr = [
        { type: 'integer', value: 1 },
        { type: 'integer', value: 2 },
      ];
      expect(removeDuplicates(arr)).toHaveLength(2);
    });

    test('with duplicates', () => {
      const arr = [
        { type: 'integer', value: 1 },
        { type: 'integer', value: 1 },
        { type: 'integer', value: 2 },
      ];
      expect(removeDuplicates(arr)).toHaveLength(2);
    });
  });

  // ── isQuantity / isResource ─────────────────────────────────────────────
  describe('type guards', () => {
    test('isQuantity positive', () => {
      expect(isQuantity({ value: 5, unit: 'mg' })).toBe(true);
    });

    test('isQuantity negative', () => {
      expect(isQuantity({ name: 'test' })).toBe(false);
    });

    test('isResource positive', () => {
      expect(isResource({ resourceType: 'Patient' })).toBe(true);
    });

    test('isResource negative', () => {
      expect(isResource({ name: 'test' })).toBe(false);
    });
  });

  // ── getTypedPropertyValue ───────────────────────────────────────────────
  describe('getTypedPropertyValue', () => {
    test('simple property', () => {
      const result = getTypedPropertyValue(
        { type: 'Patient', value: { resourceType: 'Patient', id: '123' } },
        'id',
      );
      expect(result).toStrictEqual({ type: 'string', value: '123' });
    });

    test('array property', () => {
      const result = getTypedPropertyValue(
        { type: 'Patient', value: { resourceType: 'Patient', name: [{ family: 'Smith' }] } },
        'name',
      );
      expect(Array.isArray(result)).toBe(true);
      expect((result as any[])[0].type).toBe('BackboneElement');
    });

    test('missing property → undefined', () => {
      const result = getTypedPropertyValue(
        { type: 'Patient', value: { resourceType: 'Patient' } },
        'nonexistent',
      );
      expect(result).toBeUndefined();
    });

    test('non-object value → undefined', () => {
      const result = getTypedPropertyValue({ type: 'string', value: 'hello' }, 'length');
      expect(result).toBeUndefined();
    });

    test('null value → undefined', () => {
      const result = getTypedPropertyValue({ type: 'string', value: null }, 'anything');
      expect(result).toBeUndefined();
    });
  });
});
