/**
 * FHIRPath Standard Functions
 *
 * Implements FHIRPath §5.1–5.9 and §6.3–6.5 functions.
 * Organized by FHIRPath spec section:
 * - §5.1 Existence (empty, exists, all, allTrue, anyTrue, allFalse, anyFalse, subsetOf, supersetOf, count, distinct, isDistinct)
 * - §5.2 Filtering and projection (where, select, repeat, ofType)
 * - §5.3 Subsetting (single, first, last, tail, skip, take, intersect, exclude)
 * - §5.4 Combining (union, combine)
 * - §5.5 Conversion (iif, toBoolean, convertsToBoolean, toInteger, convertsToInteger, toDecimal, convertsToDecimal, toQuantity, convertsToQuantity, toString, convertsToString, toDateTime, convertsToDateTime, toTime, convertsToTime)
 * - §5.6 String manipulation (indexOf, substring, startsWith, endsWith, contains, upper, lower, replace, matches, replaceMatches, length, toChars, join)
 * - §5.7 Math (abs, ceiling, exp, floor, ln, log, power, round, sqrt, truncate)
 * - §5.8 Tree navigation (children, descendants)
 * - §5.9 Utility (trace, now, timeOfDay, today)
 * - §6.3 Types (is, as, type, conformsTo)
 * - §6.5 Boolean logic (not)
 * - FHIR-specific (resolve, extension, hasValue, htmlChecks, getResourceKey, getReferenceKey)
 *
 * @module fhirpath
 */

import type { Atom, AtomContext, TypedValue } from './types.js';
import { PropertyType } from './types.js';
import { parseDateString } from './date.js';
import {
  booleanToTypedValue,
  fhirPathIs,
  isQuantity,
  removeDuplicates,
  toJsBoolean,
  toTypedValue,
} from './utils.js';

export type FhirPathFunction = (context: AtomContext, input: TypedValue[], ...args: Atom[]) => TypedValue[];

// =============================================================================
// Internal helpers
// =============================================================================

/** Walk up the context chain to find the root `$this` input. */
function getRootInput(context: AtomContext): TypedValue[] {
  const thisVal = context.variables['$this'];
  if (thisVal) {
    return [thisVal];
  }
  if (context.parent) {
    return getRootInput(context.parent);
  }
  return [];
}

/** Validate that input has at most `max` items; return the items. */
function validateInput(input: TypedValue[], max: number): TypedValue[] {
  if (input.length > max) {
    throw new Error(`Expected at most ${max} items, got ${input.length}`);
  }
  return input;
}

/**
 * Generic helper for applying a string function to the first input element.
 * Evaluates optional argument atoms and passes their values to the callback.
 */
function applyStringFunc(
  fn: (str: string, ...args: unknown[]) => unknown,
  context: AtomContext,
  input: TypedValue[],
  ...argAtoms: (Atom | undefined)[]
): TypedValue[] {
  if (input.length === 0) {
    return [];
  }
  const [{ value }] = validateInput(input, 1);
  if (typeof value !== 'string') {
    return [];
  }
  const args = argAtoms
    .filter((a): a is Atom => a !== undefined)
    .map((a) => a.eval(context, getRootInput(context))[0]?.value);
  const result = fn(value, ...args);
  if (result === undefined || result === null) {
    return [];
  }
  if (typeof result === 'boolean') {
    return booleanToTypedValue(result);
  }
  if (typeof result === 'number') {
    return [{ type: PropertyType.integer, value: result }];
  }
  if (Array.isArray(result)) {
    return result.map((v) => ({ type: PropertyType.string, value: v }));
  }
  return [{ type: PropertyType.string, value: result }];
}

/**
 * Generic helper for applying a math function to the first input element.
 * Handles Quantity values by extracting the numeric value and re-wrapping.
 */
function applyMathFunc(
  fn: (value: number, ...args: unknown[]) => number,
  context: AtomContext,
  input: TypedValue[],
  ...argAtoms: (Atom | undefined)[]
): TypedValue[] {
  if (input.length === 0) {
    return [];
  }
  const [typedValue] = validateInput(input, 1);
  const { value } = typedValue;
  const numValue = isQuantity(value) ? (value as { value: number }).value : value;
  if (typeof numValue !== 'number') {
    return [];
  }
  const args = argAtoms
    .filter((a): a is Atom => a !== undefined)
    .map((a) => a.eval(context, getRootInput(context))[0]?.value);
  const result = fn(numValue, ...args);
  if (!Number.isFinite(result)) {
    return [];
  }
  if (isQuantity(value)) {
    return [{ type: PropertyType.Quantity, value: { ...(value as object), value: result } }];
  }
  return [toTypedValue(result)];
}

/**
 * Resolve a type name from an Atom without importing concrete atom classes.
 * Uses duck-typing to detect SymbolAtom (has `.name`) and DotAtom (has `.left`/`.right`).
 */
function resolveTypeName(atom: Atom): string {
  const asSymbol = atom as Atom & { name?: string };
  if (typeof asSymbol.name === 'string') {
    return asSymbol.name;
  }
  const asDot = atom as Atom & { left?: Atom & { name?: string }; right?: Atom & { name?: string }; operator?: string };
  if (asDot.operator === '.' && asDot.left?.name && asDot.right?.name) {
    return asDot.left.name + '.' + asDot.right.name;
  }
  return atom.toString();
}

// =============================================================================
// Function registry
// =============================================================================

/**
 * Global function registry.
 * Keys are function names as they appear in FHIRPath expressions.
 */
export const functions: Record<string, FhirPathFunction> = {

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 5.1 Existence
   * See: https://hl7.org/fhirpath/#existence
   * ═══════════════════════════════════════════════════════════════════════════
   */

  empty: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return booleanToTypedValue(input.length === 0);
  },

  hasValue: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return booleanToTypedValue(input.length !== 0);
  },

  exists: (context: AtomContext, input: TypedValue[], criteria?: Atom): TypedValue[] => {
    if (criteria) {
      return booleanToTypedValue(input.some((e) => toJsBoolean(criteria.eval(context, [e]))));
    }
    return booleanToTypedValue(input.length > 0);
  },

  all: (context: AtomContext, input: TypedValue[], criteria: Atom): TypedValue[] => {
    return booleanToTypedValue(input.every((e) => toJsBoolean(criteria.eval(context, [e]))));
  },

  allTrue: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    for (const value of input) {
      if (!value.value) {
        return booleanToTypedValue(false);
      }
    }
    return booleanToTypedValue(true);
  },

  anyTrue: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    for (const value of input) {
      if (value.value) {
        return booleanToTypedValue(true);
      }
    }
    return booleanToTypedValue(false);
  },

  allFalse: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    for (const value of input) {
      if (value.value) {
        return booleanToTypedValue(false);
      }
    }
    return booleanToTypedValue(true);
  },

  anyFalse: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    for (const value of input) {
      if (!value.value) {
        return booleanToTypedValue(true);
      }
    }
    return booleanToTypedValue(false);
  },

  subsetOf: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    if (input.length === 0) {
      return booleanToTypedValue(true);
    }
    const otherArray = other.eval(context, getRootInput(context));
    if (otherArray.length === 0) {
      return booleanToTypedValue(false);
    }
    return booleanToTypedValue(input.every((e) => otherArray.some((o) => o.value === e.value)));
  },

  supersetOf: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    const otherArray = other.eval(context, getRootInput(context));
    if (otherArray.length === 0) {
      return booleanToTypedValue(true);
    }
    if (input.length === 0) {
      return booleanToTypedValue(false);
    }
    return booleanToTypedValue(otherArray.every((e) => input.some((o) => o.value === e.value)));
  },

  count: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return [{ type: PropertyType.integer, value: input.length }];
  },

  distinct: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    const result: TypedValue[] = [];
    for (const value of input) {
      if (!result.some((e) => e.value === value.value)) {
        result.push(value);
      }
    }
    return result;
  },

  isDistinct: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return booleanToTypedValue(input.length === functions.distinct(context, input).length);
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 5.2 Filtering and projection
   * See: https://hl7.org/fhirpath/#filtering-and-projection
   * ═══════════════════════════════════════════════════════════════════════════
   */

  where: (context: AtomContext, input: TypedValue[], criteria: Atom): TypedValue[] => {
    return input.filter((e) => toJsBoolean(criteria.eval(context, [e])));
  },

  select: (context: AtomContext, input: TypedValue[], criteria: Atom): TypedValue[] => {
    return input.flatMap((e) => criteria.eval({ parent: context, variables: { $this: e } }, [e]));
  },

  repeat: (context: AtomContext, input: TypedValue[], projection: Atom): TypedValue[] => {
    const result: TypedValue[] = [];
    let current = input;
    while (current.length > 0) {
      const next: TypedValue[] = [];
      for (const item of current) {
        const projected = projection.eval({ parent: context, variables: { $this: item } }, [item]);
        for (const p of projected) {
          if (!result.some((r) => r.value === p.value)) {
            result.push(p);
            next.push(p);
          }
        }
      }
      current = next;
    }
    return result;
  },

  ofType: (_context: AtomContext, input: TypedValue[], criteria: Atom): TypedValue[] => {
    const typeName = (criteria as Atom & { name?: string }).name ?? criteria.toString();
    return input.filter((e) => fhirPathIs(e, typeName));
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 5.3 Subsetting
   * See: https://hl7.org/fhirpath/#subsetting
   * ═══════════════════════════════════════════════════════════════════════════
   */

  single: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length > 1) {
      throw new Error('Expected input length one for single()');
    }
    return input.length === 0 ? [] : input.slice(0, 1);
  },

  first: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input.length === 0 ? [] : input.slice(0, 1);
  },

  last: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input.length === 0 ? [] : input.slice(-1);
  },

  tail: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input.length === 0 ? [] : input.slice(1);
  },

  skip: (context: AtomContext, input: TypedValue[], num: Atom): TypedValue[] => {
    const numValue = num.eval(context, input)[0]?.value;
    if (typeof numValue !== 'number') {
      throw new TypeError('Expected a number for skip(num)');
    }
    if (numValue >= input.length) {
      return [];
    }
    if (numValue <= 0) {
      return input;
    }
    return input.slice(numValue);
  },

  take: (context: AtomContext, input: TypedValue[], num: Atom): TypedValue[] => {
    const numValue = num.eval(context, input)[0]?.value;
    if (typeof numValue !== 'number') {
      throw new TypeError('Expected a number for take(num)');
    }
    if (numValue >= input.length) {
      return input;
    }
    if (numValue <= 0) {
      return [];
    }
    return input.slice(0, numValue);
  },

  intersect: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    if (!other) {
      return input;
    }
    const otherArray = other.eval(context, getRootInput(context));
    const result: TypedValue[] = [];
    for (const value of input) {
      if (!result.some((e) => e.value === value.value) && otherArray.some((e) => e.value === value.value)) {
        result.push(value);
      }
    }
    return result;
  },

  exclude: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    if (!other) {
      return input;
    }
    const otherArray = other.eval(context, getRootInput(context));
    return input.filter((value) => !otherArray.some((e) => e.value === value.value));
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 5.4 Combining
   * See: https://hl7.org/fhirpath/#combining
   * ═══════════════════════════════════════════════════════════════════════════
   */

  union: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    if (!other) {
      return input;
    }
    const otherArray = other.eval(context, getRootInput(context));
    return removeDuplicates([...input, ...otherArray]);
  },

  combine: (context: AtomContext, input: TypedValue[], other: Atom): TypedValue[] => {
    if (!other) {
      return input;
    }
    const otherArray = other.eval(context, getRootInput(context));
    return [...input, ...otherArray];
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 5.5 Conversion
   * See: https://hl7.org/fhirpath/#conversion
   * ═══════════════════════════════════════════════════════════════════════════
   */

  iif: (
    context: AtomContext,
    input: TypedValue[],
    criterion: Atom,
    trueResult: Atom,
    otherwiseResult?: Atom,
  ): TypedValue[] => {
    if (toJsBoolean(criterion.eval(context, input))) {
      return trueResult.eval(context, input);
    }
    if (otherwiseResult) {
      return otherwiseResult.eval(context, input);
    }
    return [];
  },

  toBoolean: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'boolean') {
      return booleanToTypedValue(value);
    }
    if (typeof value === 'number') {
      if (value === 0 || value === 1) {
        return booleanToTypedValue(!!value);
      }
    }
    if (typeof value === 'string') {
      const lower = (value as string).toLowerCase();
      if (['true', 't', 'yes', 'y', '1', '1.0'].includes(lower)) {
        return booleanToTypedValue(true);
      }
      if (['false', 'f', 'no', 'n', '0', '0.0'].includes(lower)) {
        return booleanToTypedValue(false);
      }
    }
    return [];
  },

  convertsToBoolean: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toBoolean(context, input).length === 1);
  },

  toInteger: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'number') {
      return [{ type: PropertyType.integer, value }];
    }
    if (typeof value === 'string' && /^[+-]?\d+$/.exec(value)) {
      return [{ type: PropertyType.integer, value: Number.parseInt(value, 10) }];
    }
    if (typeof value === 'boolean') {
      return [{ type: PropertyType.integer, value: value ? 1 : 0 }];
    }
    return [];
  },

  convertsToInteger: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toInteger(context, input).length === 1);
  },

  toDecimal: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'number') {
      return [{ type: PropertyType.decimal, value }];
    }
    if (typeof value === 'string' && /^[+-]?\d+(\.\d+)?$/.exec(value)) {
      return [{ type: PropertyType.decimal, value: Number.parseFloat(value) }];
    }
    if (typeof value === 'boolean') {
      return [{ type: PropertyType.decimal, value: value ? 1.0 : 0.0 }];
    }
    return [];
  },

  convertsToDecimal: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toDecimal(context, input).length === 1);
  },

  toQuantity: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (isQuantity(value)) {
      return [{ type: PropertyType.Quantity, value }];
    }
    if (typeof value === 'number') {
      return [{ type: PropertyType.Quantity, value: { value, unit: '1' } }];
    }
    if (typeof value === 'string' && /^-?\d+(\.\d+)?/.exec(value)) {
      return [{ type: PropertyType.Quantity, value: { value: Number.parseFloat(value), unit: '1' } }];
    }
    if (typeof value === 'boolean') {
      return [{ type: PropertyType.Quantity, value: { value: value ? 1 : 0, unit: '1' } }];
    }
    return [];
  },

  convertsToQuantity: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toQuantity(context, input).length === 1);
  },

  toString: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (value === null || value === undefined) {
      return [];
    }
    if (isQuantity(value)) {
      return [{ type: PropertyType.string, value: `${(value as { value: number }).value} '${(value as { unit?: string }).unit}'` }];
    }
    return [{ type: PropertyType.string, value: String(value) }];
  },

  convertsToString: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue((functions.toString as unknown as FhirPathFunction)(context, input).length === 1);
  },

  toDateTime: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'string') {
      const match = /^\d{4}(-\d{2}(-\d{2}(T\d{2}(:\d{2}(:\d{2}(\.\d+)?)?)?(Z|[+-]\d{2}(:\d{2})?)?)?)?)?$/.exec(value);
      if (match) {
        return [{ type: PropertyType.dateTime, value: parseDateString(value) }];
      }
    }
    return [];
  },

  convertsToDateTime: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toDateTime(context, input).length === 1);
  },

  toTime: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    const [{ value }] = validateInput(input, 1);
    if (typeof value === 'string') {
      const match = /^T?(\d{2}(:\d{2}(:\d{2})?)?)/.exec(value);
      if (match) {
        return [{ type: PropertyType.time, value: parseDateString('T' + match[1]) }];
      }
    }
    return [];
  },

  convertsToTime: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    if (input.length === 0) {
      return [];
    }
    return booleanToTypedValue(functions.toTime(context, input).length === 1);
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 5.6 String Manipulation
   * See: https://hl7.org/fhirpath/#string-manipulation
   * ═══════════════════════════════════════════════════════════════════════════
   */

  indexOf: (context: AtomContext, input: TypedValue[], substringAtom: Atom): TypedValue[] => {
    return applyStringFunc((str, substring) => str.indexOf(substring as string), context, input, substringAtom);
  },

  substring: (context: AtomContext, input: TypedValue[], startAtom: Atom, lengthAtom?: Atom): TypedValue[] => {
    return applyStringFunc(
      (str, start, length) => {
        const startIndex = start as number;
        const endIndex = length !== undefined ? startIndex + (length as number) : str.length;
        return startIndex < 0 || startIndex >= str.length ? undefined : str.substring(startIndex, endIndex);
      },
      context,
      input,
      startAtom,
      lengthAtom,
    );
  },

  startsWith: (context: AtomContext, input: TypedValue[], prefixAtom: Atom): TypedValue[] => {
    return applyStringFunc((str, prefix) => str.startsWith(prefix as string), context, input, prefixAtom);
  },

  endsWith: (context: AtomContext, input: TypedValue[], suffixAtom: Atom): TypedValue[] => {
    return applyStringFunc((str, suffix) => str.endsWith(suffix as string), context, input, suffixAtom);
  },

  contains: (context: AtomContext, input: TypedValue[], substringAtom: Atom): TypedValue[] => {
    return applyStringFunc((str, substring) => str.includes(substring as string), context, input, substringAtom);
  },

  upper: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyStringFunc((str) => str.toUpperCase(), context, input);
  },

  lower: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyStringFunc((str) => str.toLowerCase(), context, input);
  },

  replace: (context: AtomContext, input: TypedValue[], patternAtom: Atom, substitutionAtom: Atom): TypedValue[] => {
    return applyStringFunc(
      (str, pattern, substitution) => str.replaceAll(pattern as string, substitution as string),
      context,
      input,
      patternAtom,
      substitutionAtom,
    );
  },

  matches: (context: AtomContext, input: TypedValue[], regexAtom: Atom): TypedValue[] => {
    return applyStringFunc((str, regex) => !!new RegExp(regex as string).exec(str), context, input, regexAtom);
  },

  replaceMatches: (context: AtomContext, input: TypedValue[], regexAtom: Atom, substitutionAtom: Atom): TypedValue[] => {
    return applyStringFunc(
      (str, pattern, substitution) => str.replaceAll(new RegExp(pattern as string, 'g'), substitution as string),
      context,
      input,
      regexAtom,
      substitutionAtom,
    );
  },

  length: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyStringFunc((str) => str.length, context, input);
  },

  toChars: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyStringFunc((str) => (str ? str.split('') : undefined), context, input);
  },

  join: (context: AtomContext, input: TypedValue[], separatorAtom?: Atom): TypedValue[] => {
    const separator = separatorAtom?.eval(context, getRootInput(context))[0]?.value ?? '';
    if (typeof separator !== 'string') {
      throw new TypeError('Separator must be a string.');
    }
    return [{ type: PropertyType.string, value: input.map((i) => String(i.value ?? '')).join(separator) }];
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 5.7 Math
   * See: https://hl7.org/fhirpath/#math
   * ═══════════════════════════════════════════════════════════════════════════
   */

  abs: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.abs, context, input);
  },

  ceiling: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.ceil, context, input);
  },

  exp: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.exp, context, input);
  },

  floor: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.floor, context, input);
  },

  ln: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.log, context, input);
  },

  log: (context: AtomContext, input: TypedValue[], baseAtom: Atom): TypedValue[] => {
    return applyMathFunc((value, base) => Math.log(value) / Math.log(base as number), context, input, baseAtom);
  },

  power: (context: AtomContext, input: TypedValue[], expAtom: Atom): TypedValue[] => {
    return applyMathFunc(Math.pow as (x: number, ...args: unknown[]) => number, context, input, expAtom);
  },

  round: (context: AtomContext, input: TypedValue[], ...argsAtoms: Atom[]): TypedValue[] => {
    return applyMathFunc(
      (n, precision: unknown = 0) => {
        if (typeof precision !== 'number' || precision < 0) {
          throw new Error('Invalid precision provided to round()');
        }
        const exp = Math.pow(10, precision);
        return Math.round(n * exp) / exp;
      },
      context,
      input,
      ...argsAtoms,
    );
  },

  sqrt: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc(Math.sqrt, context, input);
  },

  truncate: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return applyMathFunc((x) => Math.trunc(x), context, input);
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 5.8 Tree navigation
   * See: https://hl7.org/fhirpath/#tree-navigation
   * ═══════════════════════════════════════════════════════════════════════════
   */

  children: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    const result: TypedValue[] = [];
    for (const item of input) {
      const value = item.value;
      if (value && typeof value === 'object') {
        for (const key of Object.keys(value as Record<string, unknown>)) {
          const child = (value as Record<string, unknown>)[key];
          if (Array.isArray(child)) {
            for (const c of child) {
              result.push(toTypedValue(c));
            }
          } else if (child !== undefined && child !== null) {
            result.push(toTypedValue(child));
          }
        }
      }
    }
    return result;
  },

  descendants: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    const result: TypedValue[] = [];
    let current = functions.children(context, input);
    while (current.length > 0) {
      result.push(...current);
      current = functions.children(context, current);
    }
    return result;
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 5.9 Utility functions
   * See: https://hl7.org/fhirpath/#utility-functions
   * ═══════════════════════════════════════════════════════════════════════════
   */

  trace: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input;
  },

  now: (): TypedValue[] => {
    return [{ type: PropertyType.dateTime, value: new Date().toISOString() }];
  },

  timeOfDay: (): TypedValue[] => {
    return [{ type: PropertyType.time, value: new Date().toISOString().substring(11) }];
  },

  today: (): TypedValue[] => {
    return [{ type: PropertyType.date, value: new Date().toISOString().substring(0, 10) }];
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 6.3 Types
   * See: https://hl7.org/fhirpath/#types-2
   * ═══════════════════════════════════════════════════════════════════════════
   */

  is: (_context: AtomContext, input: TypedValue[], typeAtom: Atom): TypedValue[] => {
    const typeName = resolveTypeName(typeAtom);
    if (!typeName) {
      return [];
    }
    return input.map((value) => ({ type: PropertyType.boolean, value: fhirPathIs(value, typeName) }));
  },

  as: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input;
  },

  type: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input.map(({ value }) => {
      if (typeof value === 'boolean') {
        return { type: PropertyType.BackboneElement, value: { namespace: 'System', name: 'Boolean' } };
      }
      if (typeof value === 'number') {
        return { type: PropertyType.BackboneElement, value: { namespace: 'System', name: 'Integer' } };
      }
      if (typeof value === 'string') {
        return { type: PropertyType.BackboneElement, value: { namespace: 'System', name: 'String' } };
      }
      if (value && typeof value === 'object' && 'resourceType' in value) {
        return { type: PropertyType.BackboneElement, value: { namespace: 'FHIR', name: (value as Record<string, unknown>).resourceType } };
      }
      return { type: PropertyType.BackboneElement, value: null };
    });
  },

  conformsTo: (context: AtomContext, input: TypedValue[], systemAtom: Atom): TypedValue[] => {
    const system = systemAtom.eval(context, input)[0].value as string;
    if (!system.startsWith('http://hl7.org/fhir/StructureDefinition/')) {
      throw new Error('Expected a StructureDefinition URL');
    }
    const expectedResourceType = system.replace('http://hl7.org/fhir/StructureDefinition/', '');
    return input.map((value) => ({
      type: PropertyType.boolean,
      value: (value.value as Record<string, unknown>)?.resourceType === expectedResourceType,
    }));
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * 6.5 Boolean logic
   * See: https://hl7.org/fhirpath/#boolean-logic
   * ═══════════════════════════════════════════════════════════════════════════
   */

  not: (context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return functions.toBoolean(context, input).map((value) => ({ type: PropertyType.boolean, value: !value.value }));
  },

  /*
   * ═══════════════════════════════════════════════════════════════════════════
   * FHIR-specific functions
   * See: https://hl7.org/fhir/fhirpath.html#functions
   * ═══════════════════════════════════════════════════════════════════════════
   */

  resolve: (_context: AtomContext, input: TypedValue[]): TypedValue[] => {
    return input
      .map((e) => {
        const value = e.value;
        let refStr: string | undefined;
        if (typeof value === 'string') {
          refStr = value;
        } else if (typeof value === 'object' && value !== null) {
          const ref = value as Record<string, unknown>;
          if (ref.reference && typeof ref.reference === 'string') {
            refStr = ref.reference;
          }
        }
        if (refStr?.includes('/')) {
          const [resourceType, id] = refStr.split('/');
          return { type: resourceType, value: { resourceType, id } };
        }
        return { type: PropertyType.BackboneElement, value: undefined };
      })
      .filter((e) => !!e.value);
  },

  extension: (context: AtomContext, input: TypedValue[], urlAtom: Atom): TypedValue[] => {
    const url = urlAtom.eval(context, input)[0]?.value as string;
    const result: TypedValue[] = [];
    for (const item of input) {
      const value = item.value;
      if (value && typeof value === 'object') {
        const extensions = (value as Record<string, unknown>).extension;
        if (Array.isArray(extensions)) {
          for (const ext of extensions) {
            if (ext && typeof ext === 'object' && (ext as Record<string, unknown>).url === url) {
              result.push({ type: PropertyType.Extension, value: ext });
            }
          }
        }
      }
    }
    return result;
  },

  htmlChecks: (): TypedValue[] => {
    return booleanToTypedValue(true);
  },
};
