import { describe, test, expect } from 'vitest';
import { functions, type FhirPathFunction } from '../functions.js';
import type { Atom, AtomContext, TypedValue } from '../types.js';
import { PropertyType } from '../types.js';
import { evalFhirPath } from '../parse.js';
import { toTypedValue } from '../utils.js';

// =============================================================================
// Test helpers
// =============================================================================

const context: AtomContext = { variables: {} };

const TYPED_TRUE: TypedValue = { type: PropertyType.boolean, value: true };
const TYPED_FALSE: TypedValue = { type: PropertyType.boolean, value: false };
const TYPED_0: TypedValue = { type: PropertyType.integer, value: 0 };
const TYPED_1: TypedValue = { type: PropertyType.integer, value: 1 };
const TYPED_2: TypedValue = { type: PropertyType.integer, value: 2 };
const TYPED_3: TypedValue = { type: PropertyType.integer, value: 3 };
const TYPED_4: TypedValue = { type: PropertyType.integer, value: 4 };
const TYPED_A: TypedValue = { type: PropertyType.string, value: 'a' };
const TYPED_B: TypedValue = { type: PropertyType.string, value: 'b' };

/** Create a simple atom that always returns a fixed value. */
function literalAtom(value: TypedValue[]): Atom {
  return { eval: () => value, toString: () => 'literal' };
}

/** Create a criteria atom that checks if value is even. */
const isEven: Atom = {
  eval: (_ctx: AtomContext, input: TypedValue[]) => {
    return [{ type: PropertyType.boolean, value: (input[0]?.value as number) % 2 === 0 }];
  },
  toString: () => 'isEven',
};

// =============================================================================
// §5.1 Existence
// =============================================================================

describe('§5.1 Existence', () => {
  describe('empty', () => {
    test('empty collection → true', () => {
      expect(functions.empty(context, [])).toStrictEqual([TYPED_TRUE]);
    });
    test('non-empty collection → false', () => {
      expect(functions.empty(context, [TYPED_1])).toStrictEqual([TYPED_FALSE]);
    });
    test('two items → false', () => {
      expect(functions.empty(context, [TYPED_1, TYPED_2])).toStrictEqual([TYPED_FALSE]);
    });
  });

  describe('hasValue', () => {
    test('empty → false', () => {
      expect(functions.hasValue(context, [])).toStrictEqual([TYPED_FALSE]);
    });
    test('one item → true', () => {
      expect(functions.hasValue(context, [TYPED_1])).toStrictEqual([TYPED_TRUE]);
    });
    test('two items → true', () => {
      expect(functions.hasValue(context, [TYPED_1, TYPED_2])).toStrictEqual([TYPED_TRUE]);
    });
  });

  describe('exists', () => {
    test('empty → false', () => {
      expect(functions.exists(context, [])).toStrictEqual([TYPED_FALSE]);
    });
    test('one item → true', () => {
      expect(functions.exists(context, [TYPED_1])).toStrictEqual([TYPED_TRUE]);
    });
    test('with criteria: none match → false', () => {
      expect(functions.exists(context, [TYPED_1], isEven)).toStrictEqual([TYPED_FALSE]);
    });
    test('with criteria: some match → true', () => {
      expect(functions.exists(context, [TYPED_1, TYPED_2], isEven)).toStrictEqual([TYPED_TRUE]);
    });
    test('with criteria: empty input → false', () => {
      expect(functions.exists(context, [], isEven)).toStrictEqual([TYPED_FALSE]);
    });
  });

  describe('all', () => {
    test('empty → true (vacuous truth)', () => {
      expect(functions.all(context, [], isEven)).toStrictEqual([TYPED_TRUE]);
    });
    test('all match → true', () => {
      expect(functions.all(context, [TYPED_2, TYPED_4], isEven)).toStrictEqual([TYPED_TRUE]);
    });
    test('not all match → false', () => {
      expect(functions.all(context, [TYPED_1, TYPED_2], isEven)).toStrictEqual([TYPED_FALSE]);
    });
    test('none match → false', () => {
      expect(functions.all(context, [TYPED_1, TYPED_3], isEven)).toStrictEqual([TYPED_FALSE]);
    });
    test('single match → true', () => {
      expect(functions.all(context, [TYPED_2], isEven)).toStrictEqual([TYPED_TRUE]);
    });
  });

  describe('allTrue', () => {
    test('empty → true', () => {
      expect(functions.allTrue(context, [])).toStrictEqual([TYPED_TRUE]);
    });
    test('[true] → true', () => {
      expect(functions.allTrue(context, [TYPED_TRUE])).toStrictEqual([TYPED_TRUE]);
    });
    test('[false] → false', () => {
      expect(functions.allTrue(context, [TYPED_FALSE])).toStrictEqual([TYPED_FALSE]);
    });
    test('[true, false] → false', () => {
      expect(functions.allTrue(context, [TYPED_TRUE, TYPED_FALSE])).toStrictEqual([TYPED_FALSE]);
    });
    test('[true, true] → true', () => {
      expect(functions.allTrue(context, [TYPED_TRUE, TYPED_TRUE])).toStrictEqual([TYPED_TRUE]);
    });
  });

  describe('anyTrue', () => {
    test('empty → false', () => {
      expect(functions.anyTrue(context, [])).toStrictEqual([TYPED_FALSE]);
    });
    test('[true] → true', () => {
      expect(functions.anyTrue(context, [TYPED_TRUE])).toStrictEqual([TYPED_TRUE]);
    });
    test('[false] → false', () => {
      expect(functions.anyTrue(context, [TYPED_FALSE])).toStrictEqual([TYPED_FALSE]);
    });
    test('[true, false] → true', () => {
      expect(functions.anyTrue(context, [TYPED_TRUE, TYPED_FALSE])).toStrictEqual([TYPED_TRUE]);
    });
    test('[false, false] → false', () => {
      expect(functions.anyTrue(context, [TYPED_FALSE, TYPED_FALSE])).toStrictEqual([TYPED_FALSE]);
    });
  });

  describe('allFalse', () => {
    test('empty → true', () => {
      expect(functions.allFalse(context, [])).toStrictEqual([TYPED_TRUE]);
    });
    test('[false] → true', () => {
      expect(functions.allFalse(context, [TYPED_FALSE])).toStrictEqual([TYPED_TRUE]);
    });
    test('[true] → false', () => {
      expect(functions.allFalse(context, [TYPED_TRUE])).toStrictEqual([TYPED_FALSE]);
    });
    test('[false, false] → true', () => {
      expect(functions.allFalse(context, [TYPED_FALSE, TYPED_FALSE])).toStrictEqual([TYPED_TRUE]);
    });
    test('[true, false] → false', () => {
      expect(functions.allFalse(context, [TYPED_TRUE, TYPED_FALSE])).toStrictEqual([TYPED_FALSE]);
    });
  });

  describe('anyFalse', () => {
    test('empty → false', () => {
      expect(functions.anyFalse(context, [])).toStrictEqual([TYPED_FALSE]);
    });
    test('[false] → true', () => {
      expect(functions.anyFalse(context, [TYPED_FALSE])).toStrictEqual([TYPED_TRUE]);
    });
    test('[true] → false', () => {
      expect(functions.anyFalse(context, [TYPED_TRUE])).toStrictEqual([TYPED_FALSE]);
    });
    test('[true, false] → true', () => {
      expect(functions.anyFalse(context, [TYPED_TRUE, TYPED_FALSE])).toStrictEqual([TYPED_TRUE]);
    });
    test('[true, true] → false', () => {
      expect(functions.anyFalse(context, [TYPED_TRUE, TYPED_TRUE])).toStrictEqual([TYPED_FALSE]);
    });
  });

  describe('count', () => {
    test('empty → 0', () => {
      expect(functions.count(context, [])).toStrictEqual([TYPED_0]);
    });
    test('one → 1', () => {
      expect(functions.count(context, [TYPED_1])).toStrictEqual([TYPED_1]);
    });
    test('two → 2', () => {
      expect(functions.count(context, [TYPED_1, TYPED_2])).toStrictEqual([TYPED_2]);
    });
  });

  describe('distinct', () => {
    test('empty → empty', () => {
      expect(functions.distinct(context, [])).toStrictEqual([]);
    });
    test('no duplicates', () => {
      expect(functions.distinct(context, [TYPED_1, TYPED_2])).toStrictEqual([TYPED_1, TYPED_2]);
    });
    test('with duplicates', () => {
      expect(functions.distinct(context, [TYPED_1, TYPED_1])).toStrictEqual([TYPED_1]);
    });
    test('strings no duplicates', () => {
      expect(functions.distinct(context, [TYPED_A, TYPED_B])).toStrictEqual([TYPED_A, TYPED_B]);
    });
    test('strings with duplicates', () => {
      expect(functions.distinct(context, [TYPED_A, TYPED_A])).toStrictEqual([TYPED_A]);
    });
  });

  describe('isDistinct', () => {
    test('empty → true', () => {
      expect(functions.isDistinct(context, [])).toStrictEqual([TYPED_TRUE]);
    });
    test('distinct → true', () => {
      expect(functions.isDistinct(context, [TYPED_1, TYPED_2])).toStrictEqual([TYPED_TRUE]);
    });
    test('not distinct → false', () => {
      expect(functions.isDistinct(context, [TYPED_1, TYPED_1])).toStrictEqual([TYPED_FALSE]);
    });
  });
});

// =============================================================================
// §5.2 Filtering and projection
// =============================================================================

describe('§5.2 Filtering and projection', () => {
  describe('where', () => {
    test('empty → empty', () => {
      expect(functions.where(context, [], isEven)).toStrictEqual([]);
    });
    test('filters correctly', () => {
      expect(functions.where(context, [TYPED_1, TYPED_2, TYPED_3, TYPED_4], isEven)).toStrictEqual([TYPED_2, TYPED_4]);
    });
    test('none match → empty', () => {
      expect(functions.where(context, [TYPED_1], isEven)).toStrictEqual([]);
    });
    test('all match', () => {
      expect(functions.where(context, [TYPED_2, TYPED_4], isEven)).toStrictEqual([TYPED_2, TYPED_4]);
    });
    test('single match', () => {
      expect(functions.where(context, [TYPED_1, TYPED_2], isEven)).toStrictEqual([TYPED_2]);
    });
  });

  describe('select', () => {
    test('empty → empty', () => {
      const doubleAtom: Atom = {
        eval: (_ctx, input) => [{ type: PropertyType.integer, value: (input[0]?.value as number) * 2 }],
        toString: () => 'double',
      };
      expect(functions.select(context, [], doubleAtom)).toStrictEqual([]);
    });
    test('projects values', () => {
      const nameAtom: Atom = {
        eval: (_ctx, input) => {
          const val = (input[0]?.value as Record<string, unknown>)?.name;
          return val ? [{ type: PropertyType.string, value: val }] : [];
        },
        toString: () => 'name',
      };
      const input = [
        { type: 'obj', value: { name: 'Alice' } },
        { type: 'obj', value: { name: 'Bob' } },
      ];
      const result = functions.select(context, input, nameAtom);
      expect(result).toHaveLength(2);
      expect(result[0].value).toBe('Alice');
      expect(result[1].value).toBe('Bob');
    });
  });
});

// =============================================================================
// §5.3 Subsetting
// =============================================================================

describe('§5.3 Subsetting', () => {
  describe('single', () => {
    test('empty → empty', () => {
      expect(functions.single(context, [])).toStrictEqual([]);
    });
    test('one → that one', () => {
      expect(functions.single(context, [TYPED_1])).toStrictEqual([TYPED_1]);
    });
    test('multiple → throws', () => {
      expect(() => functions.single(context, [TYPED_1, TYPED_2])).toThrow('Expected input length one');
    });
  });

  describe('first / last / tail', () => {
    test('first empty → empty', () => {
      expect(functions.first(context, [])).toStrictEqual([]);
    });
    test('first of [1,2,3] → [1]', () => {
      expect(functions.first(context, [TYPED_1, TYPED_2, TYPED_3])).toStrictEqual([TYPED_1]);
    });
    test('last empty → empty', () => {
      expect(functions.last(context, [])).toStrictEqual([]);
    });
    test('last of [1,2,3] → [3]', () => {
      expect(functions.last(context, [TYPED_1, TYPED_2, TYPED_3])).toStrictEqual([TYPED_3]);
    });
    test('tail empty → empty', () => {
      expect(functions.tail(context, [])).toStrictEqual([]);
    });
    test('tail of [1] → empty', () => {
      expect(functions.tail(context, [TYPED_1])).toStrictEqual([]);
    });
    test('tail of [1,2,3] → [2,3]', () => {
      expect(functions.tail(context, [TYPED_1, TYPED_2, TYPED_3])).toStrictEqual([TYPED_2, TYPED_3]);
    });
  });

  describe('skip / take', () => {
    test('skip(0) returns all', () => {
      expect(functions.skip(context, [TYPED_1, TYPED_2], literalAtom([TYPED_0]))).toStrictEqual([TYPED_1, TYPED_2]);
    });
    test('skip(1) skips first', () => {
      expect(functions.skip(context, [TYPED_1, TYPED_2, TYPED_3], literalAtom([TYPED_1]))).toStrictEqual([TYPED_2, TYPED_3]);
    });
    test('skip beyond length → empty', () => {
      expect(functions.skip(context, [TYPED_1], literalAtom([TYPED_2]))).toStrictEqual([]);
    });
    test('skip non-number → throws', () => {
      expect(() => functions.skip(context, [TYPED_1], literalAtom([TYPED_A]))).toThrow('Expected a number');
    });
    test('take(0) → empty', () => {
      expect(functions.take(context, [TYPED_1, TYPED_2], literalAtom([TYPED_0]))).toStrictEqual([]);
    });
    test('take(1) → first', () => {
      expect(functions.take(context, [TYPED_1, TYPED_2, TYPED_3], literalAtom([TYPED_1]))).toStrictEqual([TYPED_1]);
    });
    test('take beyond length → all', () => {
      expect(functions.take(context, [TYPED_1], literalAtom([TYPED_3]))).toStrictEqual([TYPED_1]);
    });
  });

  describe('intersect / exclude', () => {
    test('intersect with overlap', () => {
      const result = functions.intersect(context, [TYPED_1, TYPED_2, TYPED_3], literalAtom([TYPED_2, TYPED_3, TYPED_4]));
      expect(result).toStrictEqual([TYPED_2, TYPED_3]);
    });
    test('intersect no overlap → empty', () => {
      const result = functions.intersect(context, [TYPED_1], literalAtom([TYPED_2]));
      expect(result).toStrictEqual([]);
    });
    test('intersect removes duplicates', () => {
      const result = functions.intersect(context, [TYPED_1, TYPED_1], literalAtom([TYPED_1]));
      expect(result).toStrictEqual([TYPED_1]);
    });
    test('exclude removes matching', () => {
      const result = functions.exclude(context, [TYPED_1, TYPED_2, TYPED_3], literalAtom([TYPED_2]));
      expect(result).toStrictEqual([TYPED_1, TYPED_3]);
    });
    test('exclude nothing → same', () => {
      const result = functions.exclude(context, [TYPED_1, TYPED_2], literalAtom([TYPED_4]));
      expect(result).toStrictEqual([TYPED_1, TYPED_2]);
    });
  });
});

// =============================================================================
// §5.4 Combining
// =============================================================================

describe('§5.4 Combining', () => {
  test('union removes duplicates', () => {
    const result = functions.union(context, [TYPED_1, TYPED_2], literalAtom([TYPED_2, TYPED_3]));
    expect(result.map((r) => r.value)).toStrictEqual([1, 2, 3]);
  });

  test('combine keeps duplicates', () => {
    const result = functions.combine(context, [TYPED_1, TYPED_2], literalAtom([TYPED_2, TYPED_3]));
    expect(result.map((r) => r.value)).toStrictEqual([1, 2, 2, 3]);
  });

  test('union with empty', () => {
    const result = functions.union(context, [TYPED_1], literalAtom([]));
    expect(result).toStrictEqual([TYPED_1]);
  });

  test('combine with empty', () => {
    const result = functions.combine(context, [TYPED_1], literalAtom([]));
    expect(result).toStrictEqual([TYPED_1]);
  });
});

// =============================================================================
// §5.5 Conversion
// =============================================================================

describe('§5.5 Conversion', () => {
  describe('toBoolean', () => {
    test('true → true', () => {
      expect(functions.toBoolean(context, [TYPED_TRUE])).toStrictEqual([TYPED_TRUE]);
    });
    test('false → false', () => {
      expect(functions.toBoolean(context, [TYPED_FALSE])).toStrictEqual([TYPED_FALSE]);
    });
    test('1 → true', () => {
      expect(functions.toBoolean(context, [TYPED_1])).toStrictEqual([TYPED_TRUE]);
    });
    test('0 → false', () => {
      expect(functions.toBoolean(context, [TYPED_0])).toStrictEqual([TYPED_FALSE]);
    });
    test('"true" → true', () => {
      expect(functions.toBoolean(context, [{ type: 'string', value: 'true' }])).toStrictEqual([TYPED_TRUE]);
    });
    test('"yes" → true', () => {
      expect(functions.toBoolean(context, [{ type: 'string', value: 'yes' }])).toStrictEqual([TYPED_TRUE]);
    });
    test('"false" → false', () => {
      expect(functions.toBoolean(context, [{ type: 'string', value: 'false' }])).toStrictEqual([TYPED_FALSE]);
    });
    test('empty → empty', () => {
      expect(functions.toBoolean(context, [])).toStrictEqual([]);
    });
    test('non-convertible → empty', () => {
      expect(functions.toBoolean(context, [{ type: 'string', value: 'xyz' }])).toStrictEqual([]);
    });
  });

  describe('convertsToBoolean', () => {
    test('"true" → true', () => {
      expect(functions.convertsToBoolean(context, [{ type: 'string', value: 'true' }])).toStrictEqual([TYPED_TRUE]);
    });
    test('"xyz" → false', () => {
      expect(functions.convertsToBoolean(context, [{ type: 'string', value: 'xyz' }])).toStrictEqual([TYPED_FALSE]);
    });
    test('empty → empty', () => {
      expect(functions.convertsToBoolean(context, [])).toStrictEqual([]);
    });
  });

  describe('toInteger', () => {
    test('number → integer', () => {
      expect(functions.toInteger(context, [TYPED_1])).toStrictEqual([TYPED_1]);
    });
    test('"42" → 42', () => {
      expect(functions.toInteger(context, [{ type: 'string', value: '42' }])).toStrictEqual([{ type: 'integer', value: 42 }]);
    });
    test('true → 1', () => {
      expect(functions.toInteger(context, [TYPED_TRUE])).toStrictEqual([TYPED_1]);
    });
    test('false → 0', () => {
      expect(functions.toInteger(context, [TYPED_FALSE])).toStrictEqual([TYPED_0]);
    });
    test('"abc" → empty', () => {
      expect(functions.toInteger(context, [{ type: 'string', value: 'abc' }])).toStrictEqual([]);
    });
    test('empty → empty', () => {
      expect(functions.toInteger(context, [])).toStrictEqual([]);
    });
  });

  describe('toDecimal', () => {
    test('number → decimal', () => {
      expect(functions.toDecimal(context, [{ type: 'decimal', value: 3.14 }])).toStrictEqual([{ type: 'decimal', value: 3.14 }]);
    });
    test('"3.14" → 3.14', () => {
      expect(functions.toDecimal(context, [{ type: 'string', value: '3.14' }])).toStrictEqual([{ type: 'decimal', value: 3.14 }]);
    });
    test('true → 1.0', () => {
      expect(functions.toDecimal(context, [TYPED_TRUE])).toStrictEqual([{ type: 'decimal', value: 1.0 }]);
    });
    test('"abc" → empty', () => {
      expect(functions.toDecimal(context, [{ type: 'string', value: 'abc' }])).toStrictEqual([]);
    });
    test('empty → empty', () => {
      expect(functions.toDecimal(context, [])).toStrictEqual([]);
    });
  });

  describe('toQuantity', () => {
    test('number → quantity with unit 1', () => {
      const result = functions.toQuantity(context, [TYPED_1]);
      expect(result).toStrictEqual([{ type: 'Quantity', value: { value: 1, unit: '1' } }]);
    });
    test('quantity → same', () => {
      const q = { type: 'Quantity', value: { value: 5, unit: 'mg' } };
      expect(functions.toQuantity(context, [q])).toStrictEqual([q]);
    });
    test('boolean true → 1', () => {
      const result = functions.toQuantity(context, [TYPED_TRUE]);
      expect(result).toStrictEqual([{ type: 'Quantity', value: { value: 1, unit: '1' } }]);
    });
    test('empty → empty', () => {
      expect(functions.toQuantity(context, [])).toStrictEqual([]);
    });
    test('"5" → quantity', () => {
      const result = functions.toQuantity(context, [{ type: 'string', value: '5' }]);
      expect(result).toStrictEqual([{ type: 'Quantity', value: { value: 5, unit: '1' } }]);
    });
  });

  describe('toString', () => {
    const toStr = functions['toString'] as FhirPathFunction;
    test('string → same', () => {
      expect(toStr(context, [TYPED_A])).toStrictEqual([{ type: 'string', value: 'a' }]);
    });
    test('number → string', () => {
      expect(toStr(context, [TYPED_1])).toStrictEqual([{ type: 'string', value: '1' }]);
    });
    test('boolean → string', () => {
      expect(toStr(context, [TYPED_TRUE])).toStrictEqual([{ type: 'string', value: 'true' }]);
    });
    test('empty → empty', () => {
      expect(toStr(context, [])).toStrictEqual([]);
    });
    test('quantity → formatted', () => {
      const q = { type: 'Quantity', value: { value: 5, unit: 'mg' } };
      expect(toStr(context, [q])).toStrictEqual([{ type: 'string', value: "5 'mg'" }]);
    });
  });

  describe('toDateTime', () => {
    test('"2024-01-15" → dateTime', () => {
      const result = functions.toDateTime(context, [{ type: 'string', value: '2024-01-15' }]);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('dateTime');
    });
    test('empty → empty', () => {
      expect(functions.toDateTime(context, [])).toStrictEqual([]);
    });
    test('non-date string → empty', () => {
      expect(functions.toDateTime(context, [{ type: 'string', value: 'not-a-date' }])).toStrictEqual([]);
    });
  });

  describe('toTime', () => {
    test('"10:30:00" → time', () => {
      const result = functions.toTime(context, [{ type: 'string', value: '10:30:00' }]);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('time');
    });
    test('empty → empty', () => {
      expect(functions.toTime(context, [])).toStrictEqual([]);
    });
    test('non-time string → empty', () => {
      expect(functions.toTime(context, [{ type: 'string', value: 'not-a-time' }])).toStrictEqual([]);
    });
  });
});

// =============================================================================
// §5.6 String Manipulation
// =============================================================================

describe('§5.6 String Manipulation', () => {
  describe('indexOf', () => {
    test('found', () => {
      expect(evalFhirPath("'abcdef'.indexOf('cd')", [])).toStrictEqual([2]);
    });
    test('not found', () => {
      expect(evalFhirPath("'abcdef'.indexOf('gh')", [])).toStrictEqual([-1]);
    });
    test('empty substring', () => {
      expect(evalFhirPath("'abc'.indexOf('')", [])).toStrictEqual([0]);
    });
  });

  describe('substring', () => {
    test('from start', () => {
      expect(evalFhirPath("'abcdef'.substring(2)", [])).toStrictEqual(['cdef']);
    });
    test('with length', () => {
      expect(evalFhirPath("'abcdef'.substring(2, 3)", [])).toStrictEqual(['cde']);
    });
    test('out of bounds → empty', () => {
      expect(evalFhirPath("'abc'.substring(10)", [])).toStrictEqual([]);
    });
  });

  describe('startsWith / endsWith / contains', () => {
    test('startsWith true', () => {
      expect(evalFhirPath("'abcdef'.startsWith('abc')", [])).toStrictEqual([true]);
    });
    test('startsWith false', () => {
      expect(evalFhirPath("'abcdef'.startsWith('xyz')", [])).toStrictEqual([false]);
    });
    test('endsWith true', () => {
      expect(evalFhirPath("'abcdef'.endsWith('def')", [])).toStrictEqual([true]);
    });
    test('endsWith false', () => {
      expect(evalFhirPath("'abcdef'.endsWith('xyz')", [])).toStrictEqual([false]);
    });
    test('contains true', () => {
      expect(evalFhirPath("'abcdef'.contains('bcd')", [])).toStrictEqual([true]);
    });
    test('contains false', () => {
      expect(evalFhirPath("'abcdef'.contains('xyz')", [])).toStrictEqual([false]);
    });
  });

  describe('upper / lower', () => {
    test('upper', () => {
      expect(evalFhirPath("'hello'.upper()", [])).toStrictEqual(['HELLO']);
    });
    test('lower', () => {
      expect(evalFhirPath("'HELLO'.lower()", [])).toStrictEqual(['hello']);
    });
  });

  describe('replace', () => {
    test('simple replace', () => {
      expect(evalFhirPath("'abcabc'.replace('b', 'x')", [])).toStrictEqual(['axcaxc']);
    });
    test('replace with empty', () => {
      expect(evalFhirPath("'abc'.replace('b', '')", [])).toStrictEqual(['ac']);
    });
  });

  describe('matches', () => {
    test('matches true', () => {
      expect(evalFhirPath("'abc123'.matches('[a-z]+[0-9]+')", [])).toStrictEqual([true]);
    });
    test('matches false', () => {
      expect(evalFhirPath("'abc'.matches('^[0-9]+$')", [])).toStrictEqual([false]);
    });
  });

  describe('length', () => {
    test('string length', () => {
      expect(evalFhirPath("'hello'.length()", [])).toStrictEqual([5]);
    });
    test('empty string', () => {
      expect(evalFhirPath("''.length()", [])).toStrictEqual([0]);
    });
  });
});

// =============================================================================
// §5.7 Math
// =============================================================================

describe('§5.7 Math', () => {
  test('abs(-5) = 5', () => {
    expect(evalFhirPath('(-5).abs()', [])).toStrictEqual([5]);
  });

  test('ceiling(1.1) = 2', () => {
    expect(evalFhirPath('(1.1).ceiling()', [])).toStrictEqual([2]);
  });

  test('floor(1.9) = 1', () => {
    expect(evalFhirPath('(1.9).floor()', [])).toStrictEqual([1]);
  });

  test('round(3.5) = 4', () => {
    const result = functions.round(context, [{ type: 'decimal', value: 3.5 }]);
    expect(result[0].value).toBe(4);
  });

  test('sqrt(9) = 3', () => {
    const result = functions.sqrt(context, [{ type: 'integer', value: 9 }]);
    expect(result[0].value).toBe(3);
  });

  test('truncate(1.9) = 1', () => {
    const result = functions.truncate(context, [{ type: 'decimal', value: 1.9 }]);
    expect(result[0].value).toBe(1);
  });

  test('power(2, 3) = 8', () => {
    const result = functions.power(context, [{ type: 'integer', value: 2 }], literalAtom([TYPED_3]));
    expect(result[0].value).toBe(8);
  });

  test('ln(1) = 0', () => {
    const result = functions.ln(context, [TYPED_1]);
    expect(result[0].value).toBeCloseTo(0);
  });

  test('exp(0) = 1', () => {
    const result = functions.exp(context, [TYPED_0]);
    expect(result[0].value).toBeCloseTo(1);
  });

  test('log(100, 10) = 2', () => {
    const result = functions.log(context, [{ type: 'integer', value: 100 }], literalAtom([{ type: 'integer', value: 10 }]));
    expect(result[0].value).toBeCloseTo(2);
  });

  test('math on empty → empty', () => {
    expect(functions.abs(context, [])).toStrictEqual([]);
    expect(functions.floor(context, [])).toStrictEqual([]);
    expect(functions.ceiling(context, [])).toStrictEqual([]);
  });
});

// =============================================================================
// §5.8 Tree navigation
// =============================================================================

describe('§5.8 Tree navigation', () => {
  test('children of object', () => {
    const obj = { type: 'obj', value: { a: 1, b: 'hello', c: [2, 3] } };
    const result = functions.children(context, [obj]);
    expect(result.length).toBe(4); // a=1, b='hello', c[0]=2, c[1]=3
  });

  test('children of empty → empty', () => {
    expect(functions.children(context, [])).toStrictEqual([]);
  });

  test('children of primitive → empty', () => {
    expect(functions.children(context, [TYPED_1])).toStrictEqual([]);
  });

  test('descendants traverses deeply', () => {
    const obj = { type: 'obj', value: { a: { b: { c: 1 } } } };
    const result = functions.descendants(context, [obj]);
    expect(result.length).toBeGreaterThan(1);
  });

  test('descendants of empty → empty', () => {
    expect(functions.descendants(context, [])).toStrictEqual([]);
  });
});

// =============================================================================
// §5.9 Utility
// =============================================================================

describe('§5.9 Utility', () => {
  test('now() returns dateTime', () => {
    const result = (functions.now as (...args: unknown[]) => TypedValue[])(context, []);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('dateTime');
    expect(typeof result[0].value).toBe('string');
  });

  test('today() returns date', () => {
    const result = (functions.today as (...args: unknown[]) => TypedValue[])(context, []);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('date');
    expect((result[0].value as string).length).toBe(10);
  });

  test('timeOfDay() returns time', () => {
    const result = (functions.timeOfDay as (...args: unknown[]) => TypedValue[])(context, []);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('time');
  });

  test('trace() returns input unchanged', () => {
    expect(functions.trace(context, [TYPED_1, TYPED_2])).toStrictEqual([TYPED_1, TYPED_2]);
  });

  test('iif true branch', () => {
    expect(evalFhirPath("iif(true, 'yes', 'no')", [])).toStrictEqual(['yes']);
  });

  test('iif false branch', () => {
    expect(evalFhirPath("iif(false, 'yes', 'no')", [])).toStrictEqual(['no']);
  });

  test('iif false without else → empty', () => {
    expect(evalFhirPath("iif(false, 'yes')", [])).toStrictEqual([]);
  });
});

// =============================================================================
// §6.3 Types
// =============================================================================

describe('§6.3 Types', () => {
  test('type() on boolean', () => {
    const result = functions.type(context, [TYPED_TRUE]);
    expect(result[0].value).toStrictEqual({ namespace: 'System', name: 'Boolean' });
  });

  test('type() on integer', () => {
    const result = functions.type(context, [TYPED_1]);
    expect(result[0].value).toStrictEqual({ namespace: 'System', name: 'Integer' });
  });

  test('type() on string', () => {
    const result = functions.type(context, [TYPED_A]);
    expect(result[0].value).toStrictEqual({ namespace: 'System', name: 'String' });
  });

  test('type() on resource', () => {
    const patient = toTypedValue({ resourceType: 'Patient', id: '1' });
    const result = functions.type(context, [patient]);
    expect(result[0].value).toStrictEqual({ namespace: 'FHIR', name: 'Patient' });
  });

  test('conformsTo() with matching type', () => {
    const patient = toTypedValue({ resourceType: 'Patient', id: '1' });
    const urlAtom = literalAtom([{ type: 'string', value: 'http://hl7.org/fhir/StructureDefinition/Patient' }]);
    const result = functions.conformsTo(context, [patient], urlAtom);
    expect(result[0].value).toBe(true);
  });

  test('conformsTo() with non-matching type', () => {
    const patient = toTypedValue({ resourceType: 'Patient', id: '1' });
    const urlAtom = literalAtom([{ type: 'string', value: 'http://hl7.org/fhir/StructureDefinition/Observation' }]);
    const result = functions.conformsTo(context, [patient], urlAtom);
    expect(result[0].value).toBe(false);
  });
});

// =============================================================================
// FHIR-specific
// =============================================================================

describe('FHIR-specific functions', () => {
  test('resolve() on reference string', () => {
    const ref = { type: 'string', value: 'Patient/123' };
    const result = functions.resolve(context, [ref]);
    expect(result).toHaveLength(1);
    expect(result[0].value).toStrictEqual({ resourceType: 'Patient', id: '123' });
  });

  test('resolve() on Reference object', () => {
    const ref = { type: 'Reference', value: { reference: 'Observation/456' } };
    const result = functions.resolve(context, [ref]);
    expect(result).toHaveLength(1);
    expect(result[0].value).toStrictEqual({ resourceType: 'Observation', id: '456' });
  });

  test('resolve() on non-reference → empty', () => {
    const result = functions.resolve(context, [TYPED_1]);
    expect(result).toStrictEqual([]);
  });

  test('extension() finds matching extension', () => {
    const resource = {
      type: 'Patient',
      value: {
        resourceType: 'Patient',
        extension: [
          { url: 'http://example.org/ext1', valueString: 'hello' },
          { url: 'http://example.org/ext2', valueBoolean: true },
        ],
      },
    };
    const urlAtom = literalAtom([{ type: 'string', value: 'http://example.org/ext1' }]);
    const result = functions.extension(context, [resource], urlAtom);
    expect(result).toHaveLength(1);
    expect((result[0].value as Record<string, unknown>).valueString).toBe('hello');
  });

  test('extension() no match → empty', () => {
    const resource = {
      type: 'Patient',
      value: { resourceType: 'Patient', extension: [] },
    };
    const urlAtom = literalAtom([{ type: 'string', value: 'http://example.org/none' }]);
    expect(functions.extension(context, [resource], urlAtom)).toStrictEqual([]);
  });

  test('htmlChecks() always returns true', () => {
    expect(functions.htmlChecks(context, [])).toStrictEqual([TYPED_TRUE]);
  });
});

// =============================================================================
// Integration: evalFhirPath with new functions
// =============================================================================

describe('Integration: evalFhirPath with functions', () => {
  const patient = {
    resourceType: 'Patient',
    name: [
      { given: ['Alice', 'Marie'], family: 'Smith' },
      { given: ['Bob'], family: 'Jones' },
    ],
    telecom: [
      { system: 'phone', value: '555-1234' },
      { system: 'email', value: 'alice@example.com' },
    ],
    active: true,
  };

  test('distinct()', () => {
    expect(evalFhirPath("(1 | 1 | 2).distinct().count()", [])).toStrictEqual([2]);
  });

  test('all() with criteria', () => {
    expect(evalFhirPath("Patient.name.all(family.exists())", [toTypedValue(patient)])).toStrictEqual([true]);
  });

  test('select()', () => {
    expect(evalFhirPath("Patient.name.select(family)", [toTypedValue(patient)])).toStrictEqual(['Smith', 'Jones']);
  });

  test('upper() on path', () => {
    expect(evalFhirPath("Patient.name[0].family.upper()", [toTypedValue(patient)])).toStrictEqual(['SMITH']);
  });

  test('lower() on path', () => {
    expect(evalFhirPath("Patient.name[0].family.lower()", [toTypedValue(patient)])).toStrictEqual(['smith']);
  });

  test('abs() via expression', () => {
    expect(evalFhirPath('(-5).abs()', [])).toStrictEqual([5]);
  });

  test('floor() via expression', () => {
    expect(evalFhirPath('(1.9).floor()', [])).toStrictEqual([1]);
  });

  test('ceiling() via expression', () => {
    expect(evalFhirPath('(1.1).ceiling()', [])).toStrictEqual([2]);
  });
});
