/**
 * FHIR Primitive Type Parser
 *
 * Handles the FHIR JSON dual-property representation of primitive types:
 * - `name`: the actual value (string | number | boolean)
 * - `_name`: the Element metadata (id, extension)
 *
 * FHIR R4 JSON Representation Rules (§2.6.2):
 * 1. Primitive values appear as JSON string, number, or boolean
 * 2. Element metadata (id, extension) appears under `_name`
 * 3. Either or both may be present
 * 4. For arrays, `null` is used for positional alignment
 *
 * Stage-1 Strategy:
 * - Values are passed through as branded types (no regex validation)
 * - `_element` id and extension are merged onto the result
 * - Regex validation is deferred to fhir-validator (Phase 5)
 *
 * @see https://hl7.org/fhir/R4/json.html#primitive
 * @module fhir-parser
 */

import type { ParseIssue } from './parse-error.js';
import { createIssue } from './parse-error.js';
import { isPlainObject, pathAppend, pathIndex } from './json-parser.js';

// =============================================================================
// Section 1: FHIR Primitive Type → JavaScript Type Mapping
// =============================================================================

/**
 * Expected JavaScript type for a FHIR primitive type name.
 *
 * FHIR R4 JSON type mapping:
 * - `boolean` → JSON boolean
 * - `integer`, `positiveInt`, `unsignedInt` → JSON number (integer)
 * - `decimal` → JSON number
 * - All others → JSON string
 */
export type PrimitiveJsType = 'boolean' | 'number' | 'string';

/**
 * Map from FHIR primitive type name to expected JavaScript type.
 *
 * This covers all 20 FHIR R4 primitive types.
 */
const PRIMITIVE_JS_TYPE_MAP: ReadonlyMap<string, PrimitiveJsType> = new Map([
  // Boolean
  ['boolean', 'boolean'],

  // Number types
  ['integer', 'number'],
  ['positiveInt', 'number'],
  ['unsignedInt', 'number'],
  ['decimal', 'number'],

  // String types (all remaining primitives)
  ['string', 'string'],
  ['uri', 'string'],
  ['url', 'string'],
  ['canonical', 'string'],
  ['base64Binary', 'string'],
  ['instant', 'string'],
  ['date', 'string'],
  ['dateTime', 'string'],
  ['time', 'string'],
  ['code', 'string'],
  ['oid', 'string'],
  ['id', 'string'],
  ['markdown', 'string'],
  ['uuid', 'string'],
  ['xhtml', 'string'],
]);

/**
 * Get the expected JavaScript type for a FHIR primitive type name.
 *
 * Returns `'string'` for unknown type names (safe default).
 */
export function getExpectedJsType(fhirType: string): PrimitiveJsType {
  return PRIMITIVE_JS_TYPE_MAP.get(fhirType) ?? 'string';
}

/**
 * Check whether a FHIR type name is an integer type (not decimal).
 *
 * Used to validate that number values are whole numbers.
 */
function isIntegerType(fhirType: string): boolean {
  return fhirType === 'integer' || fhirType === 'positiveInt' || fhirType === 'unsignedInt';
}

// =============================================================================
// Section 2: Primitive Value Validation
// =============================================================================

/**
 * Validate that a primitive value has the correct JavaScript type.
 *
 * This performs structural validation only (correct JS type). It does NOT
 * validate the value against FHIR regex patterns — that is the responsibility
 * of fhir-validator (Phase 5).
 *
 * @param value - The JSON value to validate
 * @param fhirType - The FHIR primitive type name (e.g., "string", "boolean", "integer")
 * @param path - JSON path for error reporting
 * @returns A `ParseIssue` if validation fails, or `null` if valid
 */
export function validatePrimitiveValue(
  value: unknown,
  fhirType: string,
  path: string,
): ParseIssue | null {
  const expectedType = getExpectedJsType(fhirType);

  if (typeof value !== expectedType) {
    return createIssue(
      'error',
      'INVALID_PRIMITIVE',
      `Expected ${expectedType} for FHIR type "${fhirType}", got ${typeof value}`,
      path,
    );
  }

  // For integer types, verify the value is actually a whole number
  if (isIntegerType(fhirType) && typeof value === 'number') {
    if (!Number.isInteger(value)) {
      return createIssue(
        'error',
        'INVALID_PRIMITIVE',
        `Expected integer for FHIR type "${fhirType}", got decimal ${value}`,
        path,
      );
    }
  }

  return null;
}

// =============================================================================
// Section 3: _element Parsing
// =============================================================================

/**
 * The result of parsing a `_element` companion object.
 *
 * Contains the `id` and `extension` fields from the Element base type.
 */
export interface ElementMetadata {
  /** Element id (0..1) */
  readonly id?: string;
  /** Extensions (0..*) */
  readonly extension?: unknown[];
}

/**
 * Parse a `_element` companion object into ElementMetadata.
 *
 * The `_element` object may contain:
 * - `id`: a string
 * - `extension`: an array of Extension objects
 *
 * @param elementObj - The raw `_element` JSON value
 * @param path - JSON path for error reporting
 */
function parseElementMetadata(
  elementObj: unknown,
  path: string,
): { result: ElementMetadata | null; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  if (elementObj === null || elementObj === undefined) {
    return { result: null, issues };
  }

  if (!isPlainObject(elementObj)) {
    issues.push(
      createIssue(
        'error',
        'INVALID_STRUCTURE',
        `_element must be an object, got ${Array.isArray(elementObj) ? 'array' : typeof elementObj}`,
        path,
      ),
    );
    return { result: null, issues };
  }

  const metadata: ElementMetadata = {
    ...(elementObj.id !== undefined && { id: elementObj.id as string }),
    ...(elementObj.extension !== undefined && { extension: elementObj.extension as unknown[] }),
  };

  // Validate id is a string if present
  if (elementObj.id !== undefined && typeof elementObj.id !== 'string') {
    issues.push(
      createIssue(
        'error',
        'INVALID_PRIMITIVE',
        `_element.id must be a string, got ${typeof elementObj.id}`,
        pathAppend(path, 'id'),
      ),
    );
  }

  // Validate extension is an array if present
  if (elementObj.extension !== undefined && !Array.isArray(elementObj.extension)) {
    issues.push(
      createIssue(
        'error',
        'INVALID_STRUCTURE',
        `_element.extension must be an array, got ${typeof elementObj.extension}`,
        pathAppend(path, 'extension'),
      ),
    );
  }

  // Warn about unexpected properties in _element
  for (const key of Object.keys(elementObj)) {
    if (key !== 'id' && key !== 'extension') {
      issues.push(
        createIssue('warning', 'UNEXPECTED_PROPERTY', `Unknown property "${key}" in _element`, pathAppend(path, key)),
      );
    }
  }

  return { result: metadata, issues };
}

// =============================================================================
// Section 4: Merged Primitive Result
// =============================================================================

/**
 * A merged primitive value combining the JSON value with Element metadata.
 *
 * This is the internal representation produced by the parser for primitive
 * fields that have a `_element` companion.
 *
 * When no `_element` is present, the value is stored directly (not wrapped).
 */
export interface PrimitiveWithMetadata {
  /** The primitive value (string | number | boolean), absent when only _element is present */
  readonly value?: unknown;
  /** Element id from _element (0..1) */
  readonly id?: string;
  /** Extensions from _element (0..*) */
  readonly extension?: unknown[];
}

// =============================================================================
// Section 5: Single Primitive Merging
// =============================================================================

/**
 * Merge a primitive value with its `_element` companion.
 *
 * Handles all combinations:
 * - Value only → returns value directly (no wrapping)
 * - Value + _element → returns `PrimitiveWithMetadata`
 * - _element only (no value) → returns `PrimitiveWithMetadata` with undefined value
 * - Neither → returns `undefined`
 *
 * @param value - The primitive JSON value (string | number | boolean | undefined)
 * @param elementExtension - The `_element` companion object (or undefined)
 * @param fhirType - The FHIR primitive type name (for JS type validation)
 * @param path - JSON path for error reporting
 *
 * @example
 * ```typescript
 * // Value only
 * mergePrimitiveElement("1970-03-30", undefined, "date", "Patient.birthDate")
 * // → { result: "1970-03-30", issues: [] }
 *
 * // Value + _element
 * mergePrimitiveElement("1970-03-30", { id: "314159" }, "date", "Patient.birthDate")
 * // → { result: { value: "1970-03-30", id: "314159" }, issues: [] }
 *
 * // _element only
 * mergePrimitiveElement(undefined, { extension: [...] }, "date", "Patient.birthDate")
 * // → { result: { value: undefined, extension: [...] }, issues: [] }
 * ```
 */
export function mergePrimitiveElement(
  value: unknown,
  elementExtension: unknown,
  fhirType: string,
  path: string,
): { result: unknown; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  // Validate value type if present
  if (value !== undefined && value !== null) {
    const typeIssue = validatePrimitiveValue(value, fhirType, path);
    if (typeIssue) {
      issues.push(typeIssue);
    }
  }

  // Parse _element metadata
  const elementPath = pathAppend(path.substring(0, path.lastIndexOf('.')), `_${path.substring(path.lastIndexOf('.') + 1)}`);
  const { result: metadata, issues: elementIssues } = parseElementMetadata(
    elementExtension,
    elementExtension !== undefined ? elementPath : path,
  );
  issues.push(...elementIssues);

  // Merge based on what's present
  if (value === undefined && metadata === null) {
    return { result: undefined, issues };
  }

  if (metadata === null) {
    // Value only — return unwrapped
    return { result: value, issues };
  }

  // Value + metadata or metadata only — return wrapped
  const merged: PrimitiveWithMetadata = {
    ...(value !== undefined && value !== null && { value }),
    ...(metadata.id !== undefined && { id: metadata.id }),
    ...(metadata.extension !== undefined && { extension: metadata.extension }),
  };

  return { result: merged, issues };
}

// =============================================================================
// Section 6: Array Primitive Merging
// =============================================================================

/**
 * Merge a repeating primitive array with its `_element` companion array.
 *
 * FHIR JSON uses null-alignment for repeating primitives:
 * ```json
 * "code": ["au", "nz"],
 * "_code": [null, { "extension": [...] }]
 * ```
 *
 * Rules:
 * - Both arrays must have the same length (or `_element` may be absent)
 * - `null` in the value array means "no value at this position" (only _element)
 * - `null` in the `_element` array means "no metadata at this position"
 * - If lengths differ, report `ARRAY_MISMATCH` error
 *
 * @param values - The primitive value array
 * @param elementExtensions - The `_element` companion array (or undefined)
 * @param fhirType - The FHIR primitive type name (for JS type validation)
 * @param path - JSON path for error reporting
 */
export function mergePrimitiveArray(
  values: unknown[],
  elementExtensions: unknown[] | undefined,
  fhirType: string,
  path: string,
): { result: unknown[]; issues: ParseIssue[] } {
  const issues: ParseIssue[] = [];

  // If no _element array, just validate and return values
  if (elementExtensions === undefined) {
    const result: unknown[] = [];
    for (let i = 0; i < values.length; i++) {
      const v = values[i];
      if (v === null) {
        // null in value array without _element is unexpected
        issues.push(
          createIssue('warning', 'UNEXPECTED_NULL', `Null value at index ${i} without corresponding _element`, pathIndex(path, i)),
        );
        result.push(null);
        continue;
      }
      if (v !== undefined) {
        const typeIssue = validatePrimitiveValue(v, fhirType, pathIndex(path, i));
        if (typeIssue) issues.push(typeIssue);
      }
      result.push(v);
    }
    return { result, issues };
  }

  // Validate array lengths match
  if (!Array.isArray(elementExtensions)) {
    issues.push(
      createIssue('error', 'INVALID_STRUCTURE', `_element must be an array, got ${typeof elementExtensions}`, path),
    );
    // Fall back to values only, preserving the INVALID_STRUCTURE issue
    const fallback = mergePrimitiveArray(values, undefined, fhirType, path);
    return { result: fallback.result, issues: [...issues, ...fallback.issues] };
  }

  if (values.length !== elementExtensions.length) {
    issues.push(
      createIssue(
        'error',
        'ARRAY_MISMATCH',
        `Value array length (${values.length}) does not match _element array length (${elementExtensions.length})`,
        path,
      ),
    );
  }

  // Merge element by element, using the longer array's length
  const maxLen = Math.max(values.length, elementExtensions.length);
  const result: unknown[] = [];

  for (let i = 0; i < maxLen; i++) {
    const value = i < values.length ? values[i] : undefined;
    const ext = i < elementExtensions.length ? elementExtensions[i] : undefined;
    const elementPath = pathIndex(path, i);

    // null in value array = no value at this position
    const actualValue = value === null ? undefined : value;

    // null in _element array = no metadata at this position
    const actualExt = ext === null ? undefined : ext;

    if (actualValue === undefined && actualExt === undefined) {
      // Both null — preserve position
      result.push(null);
      continue;
    }

    const { result: merged, issues: mergeIssues } = mergePrimitiveElement(
      actualValue,
      actualExt,
      fhirType,
      elementPath,
    );
    issues.push(...mergeIssues);
    result.push(merged);
  }

  return { result, issues };
}
