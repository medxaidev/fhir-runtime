/**
 * FHIRPath utility functions.
 *
 * Provides type conversion, equality/equivalence comparison,
 * and helper functions used by atoms and the function library.
 *
 * @module fhirpath
 */

import type { Quantity } from '../model/primitives.js';
import type { TypedValue } from './types.js';
import { PropertyType } from './types.js';

// =============================================================================
// TypedValue constructors
// =============================================================================

/**
 * Returns a single-element array with a typed boolean value.
 */
export function booleanToTypedValue(value: boolean): [TypedValue] {
  return [{ type: PropertyType.boolean, value }];
}

/**
 * Returns a "best guess" TypedValue for a given unknown value.
 */
export function toTypedValue(value: unknown): TypedValue {
  if (value === null || value === undefined) {
    return { type: 'undefined', value: undefined };
  } else if (Number.isSafeInteger(value)) {
    return { type: PropertyType.integer, value };
  } else if (typeof value === 'number') {
    return { type: PropertyType.decimal, value };
  } else if (typeof value === 'boolean') {
    return { type: PropertyType.boolean, value };
  } else if (typeof value === 'string') {
    return { type: PropertyType.string, value };
  } else if (isQuantity(value)) {
    return { type: PropertyType.Quantity, value };
  } else if (isResource(value)) {
    return { type: (value as Record<string, unknown>).resourceType as string, value };
  } else {
    return { type: PropertyType.BackboneElement, value };
  }
}

// =============================================================================
// Boolean conversion
// =============================================================================

/**
 * Converts a TypedValue collection to a JavaScript boolean.
 * Empty collection → false; otherwise truthy check on first element.
 */
export function toJsBoolean(obj: TypedValue[]): boolean {
  return obj.length === 0 ? false : !!obj[0].value;
}

// =============================================================================
// Singleton
// =============================================================================

/**
 * Returns the single element from a collection, or undefined if empty.
 * Throws if the collection has more than one element.
 */
export function singleton(collection: TypedValue[], type?: string): TypedValue | undefined {
  if (collection.length === 0) {
    return undefined;
  } else if (collection.length === 1 && (!type || collection[0].type === type)) {
    return collection[0];
  } else {
    throw new Error(`Expected singleton of type ${type}, but found ${JSON.stringify(collection)}`);
  }
}

// =============================================================================
// Property value extraction (schema-free)
// =============================================================================

/**
 * Extract a typed property value from a TypedValue without schema.
 * Handles simple paths and choice-type paths (value[x]).
 */
export function getTypedPropertyValue(input: TypedValue, path: string): TypedValue[] | TypedValue | undefined {
  const obj = input.value;
  if (!obj || typeof obj !== 'object') {
    return undefined;
  }

  const record = obj as Record<string, unknown>;

  // Direct property access
  if (path in record) {
    const propertyValue = record[path];
    if (Array.isArray(propertyValue)) {
      return propertyValue.map(toTypedValue);
    }
    return toTypedValue(propertyValue);
  }

  // Choice-type resolution: try path + capitalized type name
  const trimmedPath = path.endsWith('[x]') ? path.substring(0, path.length - 3) : path;
  for (const propertyType of Object.values(PropertyType)) {
    const propertyName = trimmedPath + capitalize(propertyType);
    if (propertyName in record) {
      const propertyValue = record[propertyName];
      if (Array.isArray(propertyValue)) {
        return propertyValue.map((v) => ({ type: propertyType, value: v }));
      }
      return { type: propertyType, value: propertyValue };
    }
  }

  return undefined;
}

// =============================================================================
// FHIRPath equality
// =============================================================================

/**
 * FHIRPath equality comparison for two TypedValue elements.
 * Returns `[{type:'boolean', value:true/false}]` or `[]` for incomparable.
 */
export function fhirPathEquals(x: TypedValue, y: TypedValue): TypedValue[] {
  const xValue = x.value?.valueOf();
  const yValue = y.value?.valueOf();
  if (typeof xValue === 'number' && typeof yValue === 'number') {
    return booleanToTypedValue(Math.abs(xValue - yValue) < 1e-8);
  }
  if (isQuantity(xValue) && isQuantity(yValue)) {
    return booleanToTypedValue(isQuantityEquivalent(xValue as Quantity, yValue as Quantity));
  }
  if (typeof xValue === 'object' && typeof yValue === 'object') {
    return booleanToTypedValue(deepEquals(xValue as object, yValue as object));
  }
  return booleanToTypedValue(xValue === yValue);
}

/**
 * FHIRPath array equality: both arrays must have same length and pairwise equal elements.
 * Returns `[]` if either side is empty.
 */
export function fhirPathArrayEquals(x: TypedValue[], y: TypedValue[]): TypedValue[] {
  if (x.length === 0 || y.length === 0) {
    return [];
  }
  if (x.length !== y.length) {
    return booleanToTypedValue(false);
  }
  return booleanToTypedValue(x.every((val, index) => toJsBoolean(fhirPathEquals(val, y[index]))));
}

/**
 * FHIRPath array not-equals.
 */
export function fhirPathArrayNotEquals(x: TypedValue[], y: TypedValue[]): TypedValue[] {
  if (x.length === 0 || y.length === 0) {
    return [];
  }
  if (x.length !== y.length) {
    return booleanToTypedValue(true);
  }
  return booleanToTypedValue(x.some((val, index) => !toJsBoolean(fhirPathEquals(val, y[index]))));
}

// =============================================================================
// FHIRPath equivalence
// =============================================================================

/**
 * FHIRPath equivalence comparison for two TypedValue elements.
 * More lenient than equality (case-insensitive strings, rounded decimals, etc.).
 */
export function fhirPathEquivalent(x: TypedValue, y: TypedValue): TypedValue[] {
  const xValue = x.value?.valueOf();
  const yValue = y.value?.valueOf();

  if (typeof xValue === 'number' && typeof yValue === 'number') {
    return booleanToTypedValue(Math.abs(xValue - yValue) < 0.01);
  }
  if (isQuantity(xValue) && isQuantity(yValue)) {
    return booleanToTypedValue(isQuantityEquivalent(xValue as Quantity, yValue as Quantity));
  }
  if (typeof xValue === 'object' && typeof yValue === 'object') {
    return booleanToTypedValue(deepEquals(xValue as object, yValue as object));
  }
  if (typeof xValue === 'string' && typeof yValue === 'string') {
    return booleanToTypedValue(xValue.toLowerCase() === yValue.toLowerCase());
  }
  return booleanToTypedValue(xValue === yValue);
}

/**
 * FHIRPath array equivalence: sorted pairwise equivalence.
 */
export function fhirPathArrayEquivalent(x: TypedValue[], y: TypedValue[]): TypedValue[] {
  if (x.length === 0 && y.length === 0) {
    return booleanToTypedValue(true);
  }
  if (x.length !== y.length) {
    return booleanToTypedValue(false);
  }
  const xs = [...x].sort(fhirPathEquivalentCompare);
  const ys = [...y].sort(fhirPathEquivalentCompare);
  return booleanToTypedValue(xs.every((val, index) => toJsBoolean(fhirPathEquivalent(val, ys[index]))));
}

// =============================================================================
// FHIRPath negation & deduplication
// =============================================================================

/**
 * Negate a FHIRPath boolean result.
 */
export function fhirPathNot(input: TypedValue[]): TypedValue[] {
  return booleanToTypedValue(!toJsBoolean(input));
}

/**
 * Remove duplicates using FHIRPath equality rules.
 */
export function removeDuplicates(arr: TypedValue[]): TypedValue[] {
  const result: TypedValue[] = [];
  for (const i of arr) {
    let found = false;
    for (const j of result) {
      if (toJsBoolean(fhirPathEquals(i, j))) {
        found = true;
        break;
      }
    }
    if (!found) {
      result.push(i);
    }
  }
  return result;
}

// =============================================================================
// FHIRPath `is` type checking
// =============================================================================

/**
 * Determines if a typed value matches the desired FHIRPath type name.
 */
export function fhirPathIs(typedValue: TypedValue, desiredType: string): boolean {
  const { value } = typedValue;
  if (value === undefined || value === null) {
    return false;
  }

  let cleanType = desiredType;
  if (cleanType.startsWith('System.')) {
    cleanType = cleanType.substring('System.'.length);
  }
  if (cleanType.startsWith('FHIR.')) {
    cleanType = cleanType.substring('FHIR.'.length);
  }

  switch (cleanType) {
    case 'Boolean':
      return typeof value === 'boolean';
    case 'Decimal':
    case 'Integer':
      return typeof value === 'number';
    case 'Date':
      return typeof value === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(value);
    case 'DateTime':
      return typeof value === 'string' && /^\d{4}/.test(value) && value.length > 10;
    case 'Time':
      return typeof value === 'string' && /^T\d/.test(value);
    case 'Quantity':
      return isQuantity(value);
    case 'String':
      return typeof value === 'string';
    default:
      return typedValue.type === cleanType ||
        (typeof value === 'object' && value !== null && (value as Record<string, unknown>).resourceType === cleanType);
  }
}

// =============================================================================
// Type guards
// =============================================================================

/**
 * Heuristic check for Quantity objects.
 */
export function isQuantity(input: unknown): input is Quantity {
  return !!(input && typeof input === 'object' && 'value' in input && typeof (input as Quantity).value === 'number');
}

/**
 * Heuristic check for FHIR Resource objects.
 */
export function isResource(input: unknown): boolean {
  return !!(input && typeof input === 'object' && 'resourceType' in input && typeof (input as Record<string, unknown>).resourceType === 'string');
}

/**
 * Check if a value is a FHIR Resource with a specific resourceType.
 */
export function isResourceType(input: unknown, resourceType: string): boolean {
  return isResource(input) && (input as Record<string, unknown>).resourceType === resourceType;
}

// =============================================================================
// Internal helpers
// =============================================================================

function isQuantityEquivalent(x: Quantity, y: Quantity): boolean {
  return (
    Math.abs((x.value as number) - (y.value as number)) < 0.01 &&
    (x.unit === y.unit || x.code === y.code || x.unit === y.code || x.code === y.unit)
  );
}

function fhirPathEquivalentCompare(x: TypedValue, y: TypedValue): number {
  const xValue = x.value?.valueOf();
  const yValue = y.value?.valueOf();
  if (typeof xValue === 'number' && typeof yValue === 'number') {
    return xValue - yValue;
  }
  if (typeof xValue === 'string' && typeof yValue === 'string') {
    return xValue.localeCompare(yValue);
  }
  return 0;
}

function deepEquals(object1: object, object2: object): boolean {
  const keys1 = Object.keys(object1);
  const keys2 = Object.keys(object2);
  if (keys1.length !== keys2.length) {
    return false;
  }
  for (const key of keys1) {
    const val1 = (object1 as Record<string, unknown>)[key];
    const val2 = (object2 as Record<string, unknown>)[key];
    if (isObject(val1) && isObject(val2)) {
      if (!deepEquals(val1, val2)) {
        return false;
      }
    } else if (val1 !== val2) {
      return false;
    }
  }
  return true;
}

function isObject(obj: unknown): obj is object {
  return obj !== null && typeof obj === 'object';
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
