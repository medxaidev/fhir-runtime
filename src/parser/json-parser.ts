/**
 * Core FHIR JSON Parser Engine
 *
 * Main entry point for parsing FHIR R4 JSON into TypeScript model types.
 * Handles JSON.parse, resourceType dispatch, and provides the generic
 * complex-type parsing infrastructure used by all downstream parsers.
 *
 * Architecture:
 * ```
 * parseFhirJson(string)
 *   └─ parseFhirObject(unknown)
 *        ├─ validateRootObject()
 *        ├─ extractResourceType()
 *        └─ dispatch by resourceType:
 *             ├─ "StructureDefinition" → parseStructureDefinitionObject() [Task 2.5]
 *             └─ other → parseGenericResource()
 * ```
 *
 * This module also exports lower-level utilities (`parseComplexObject`,
 * `isPlainObject`, path helpers) that Task 2.3–2.5 build upon.
 *
 * @module fhir-parser
 */

import type { Resource } from '../model/primitives.js';
import {
  type ParseResult,
  type ParseIssue,
  createIssue,
  parseSuccess,
  parseFailure,
  hasErrors,
} from './parse-error.js';
import { parseStructureDefinition } from './structure-definition-parser.js';
import { mergePrimitiveElement, mergePrimitiveArray } from './primitive-parser.js';

// =============================================================================
// Section 1: Type Guards & Utilities
// =============================================================================

/**
 * A plain JSON object — `Record<string, unknown>` that is not null and not an array.
 *
 * This is the fundamental input shape for all FHIR complex type parsers.
 */
export type JsonObject = Record<string, unknown>;

/**
 * Check whether a value is a plain JSON object (non-null, non-array, typeof "object").
 */
export function isPlainObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// =============================================================================
// Section 2: Path Helpers
// =============================================================================

/**
 * Append a property name to a JSON path.
 *
 * @example
 * pathAppend("Patient", "name") // "Patient.name"
 * pathAppend("$", "resourceType") // "$.resourceType"
 */
export function pathAppend(base: string, property: string): string {
  return `${base}.${property}`;
}

/**
 * Append an array index to a JSON path.
 *
 * @example
 * pathIndex("Patient.name", 0) // "Patient.name[0]"
 */
export function pathIndex(base: string, index: number): string {
  return `${base}[${index}]`;
}

// =============================================================================
// Section 3: Generic Complex Object Parser
// =============================================================================

/**
 * Metadata describing a single property of a FHIR complex type.
 *
 * Used by {@link parseComplexObject} to know how to interpret each JSON key.
 */
export interface PropertyDescriptor {
  /** The property name as it appears in the TypeScript interface */
  readonly name: string;

  /**
   * Whether this property holds a primitive FHIR type.
   *
   * When true, the parser will look for a companion `_name` property
   * carrying id/extension metadata (FHIR primitive element split).
   */
  readonly isPrimitive: boolean;

  /**
   * The FHIR primitive type name (e.g., `'string'`, `'boolean'`, `'id'`).
   *
   * Required when `isPrimitive` is true. Used by `mergePrimitiveElement`
   * to validate the JavaScript type of the value (string, number, or boolean).
   * Defaults to `'string'` when not specified.
   */
  readonly fhirType?: string;

  /**
   * Whether this property is an array (max cardinality > 1).
   *
   * FHIR JSON always uses arrays for repeating elements, even when
   * only one value is present.
   */
  readonly isArray: boolean;

  /**
   * Parser function for complex-type values.
   *
   * Called for each value (or array element) to recursively parse
   * nested complex types. If `undefined`, the value is passed through
   * as-is (used for primitives and `unknown` choice-type placeholders).
   */
  readonly parseElement?: (obj: JsonObject, path: string) => { result: unknown; issues: ParseIssue[] };
}

/**
 * A schema describing all known properties of a FHIR complex type.
 *
 * Maps property names to their descriptors. Properties not in this map
 * are reported as `UNEXPECTED_PROPERTY` warnings.
 *
 * Choice type `[x]` fields are NOT included here — they are handled
 * separately by the choice-type-parser (Task 2.4).
 */
export type PropertySchema = ReadonlyMap<string, PropertyDescriptor>;

/**
 * Result of parsing a complex object — the assembled result record
 * plus any issues collected during parsing.
 */
export interface ComplexParseResult {
  readonly result: JsonObject;
  readonly issues: ParseIssue[];
}

/**
 * Parse a FHIR complex type JSON object using a property schema.
 *
 * This is the workhorse function that all type-specific parsers delegate to.
 * It uses a 4-pass strategy to process the JSON object's keys:
 *
 * 1. **Pass 1: Known properties** — maps non-primitive properties into the result,
 *    recursing for complex types. Primitive properties are marked as consumed but
 *    their values are deferred to Pass 2 for `_element` merging.
 * 2. **Pass 2: Primitive `_element` merging** — for each primitive property in the
 *    schema, calls `mergePrimitiveElement` (or `mergePrimitiveArray`) from
 *    primitive-parser to merge the JSON value with its `_name` companion carrying
 *    id/extension metadata.
 * 3. **Pass 3: Choice type `[x]`** — identifies choice type properties by matching
 *    `choiceFieldBases` prefixes with uppercase type suffixes, stores values as-is
 *    (full extraction delegated to choice-type-parser in Task 2.4)
 * 4. **Pass 4: Unexpected properties** — emits `UNEXPECTED_PROPERTY` warnings for
 *    any remaining unconsumed keys
 *
 * @param obj - The raw JSON object to parse
 * @param path - Current JSON path (for error reporting)
 * @param schema - Property descriptors for this type
 * @param choiceFieldBases - Base names of choice type `[x]` fields (e.g., `["value", "defaultValue"]`).
 *   Any key starting with one of these bases is treated as a potential choice type
 *   property and NOT flagged as unexpected. Actual choice type extraction is
 *   deferred to Task 2.4.
 */
export function parseComplexObject(
  obj: JsonObject,
  path: string,
  schema: PropertySchema,
  choiceFieldBases: readonly string[] = [],
): ComplexParseResult {
  const result: Record<string, unknown> = {};
  const issues: ParseIssue[] = [];

  // Collect all keys that are accounted for (known, _, or choice-type)
  const consumedKeys = new Set<string>();

  // --- Pass 1: Process known NON-primitive properties ---
  // Primitive properties are deferred to Pass 2 for _element merging.
  for (const [key, descriptor] of schema) {
    const value = obj[key];

    // Mark key as consumed even if we defer processing
    if (value !== undefined) {
      consumedKeys.add(key);
    }

    // Skip primitives — handled in Pass 2 with _element merging
    if (descriptor.isPrimitive) continue;

    if (value === undefined) continue;

    if (value === null) {
      // FHIR JSON: null is only valid inside arrays for primitive alignment
      issues.push(createIssue('error', 'UNEXPECTED_NULL', `Property "${key}" must not be null`, pathAppend(path, key)));
      continue;
    }

    if (descriptor.isArray) {
      result[key] = parseArrayProperty(value, key, path, descriptor, issues);
    } else if (descriptor.parseElement && isPlainObject(value)) {
      const nested = descriptor.parseElement(value, pathAppend(path, key));
      result[key] = nested.result;
      issues.push(...nested.issues);
    } else {
      // Pass-through value (complex type without dedicated parser)
      result[key] = value;
    }
  }

  // --- Pass 2: Merge primitive properties with _element companions ---
  for (const [key, descriptor] of schema) {
    if (!descriptor.isPrimitive) continue;

    const value = obj[key];
    const underscoreKey = `_${key}`;
    const elementExt = obj[underscoreKey];

    // Consume the _element companion key
    if (elementExt !== undefined) {
      consumedKeys.add(underscoreKey);
    }

    // Skip if neither value nor _element is present
    if (value === undefined && elementExt === undefined) continue;

    // null top-level primitive value is an error (not inside an array)
    if (value === null && elementExt === undefined) {
      issues.push(createIssue('error', 'UNEXPECTED_NULL', `Property "${key}" must not be null`, pathAppend(path, key)));
      continue;
    }

    const fhirType = descriptor.fhirType ?? 'string';
    const propPath = pathAppend(path, key);

    if (descriptor.isArray) {
      // Array primitive — use mergePrimitiveArray
      if (value !== undefined && !Array.isArray(value)) {
        issues.push(createIssue('error', 'INVALID_STRUCTURE', `Property "${key}" must be an array`, propPath));
        continue;
      }
      const valArr = (value as unknown[] | undefined) ?? [];
      const extArr = elementExt as unknown[] | undefined;
      const { result: merged, issues: mergeIssues } = mergePrimitiveArray(valArr, extArr, fhirType, propPath);
      result[key] = merged;
      issues.push(...mergeIssues);
    } else {
      // Single primitive — use mergePrimitiveElement
      const actualValue = value === null ? undefined : value;
      const { result: merged, issues: mergeIssues } = mergePrimitiveElement(actualValue, elementExt, fhirType, propPath);
      if (merged !== undefined) {
        result[key] = merged;
      }
      issues.push(...mergeIssues);
    }
  }

  // --- Pass 3: Identify choice type properties ---
  for (const key of Object.keys(obj)) {
    if (consumedKeys.has(key)) continue;

    // Check if this key matches a choice type base name
    const isChoiceKey = choiceFieldBases.some((base) => {
      if (!key.startsWith(base)) return false;
      // The character after the base must be uppercase (type suffix)
      const suffix = key.slice(base.length);
      return suffix.length > 0 && suffix[0] === suffix[0].toUpperCase() && suffix[0] !== suffix[0].toLowerCase();
    });

    if (isChoiceKey) {
      consumedKeys.add(key);
      // Store choice type value as-is; full extraction in Task 2.4
      result[key] = obj[key];

      // Also consume the companion _element if present
      const underscoreKey = `_${key}`;
      if (obj[underscoreKey] !== undefined) {
        consumedKeys.add(underscoreKey);
        result[underscoreKey] = obj[underscoreKey];
      }
    }
  }

  // --- Pass 4: Report unexpected properties ---
  for (const key of Object.keys(obj)) {
    if (consumedKeys.has(key)) continue;

    // Skip _-prefixed keys that were already consumed in Pass 2 (primitive _element)
    // or Pass 3 (choice type _element). Do NOT skip based solely on the base name
    // being consumed — _element is only valid for primitive and choice type properties.
    if (key.startsWith('_') && consumedKeys.has(key)) continue;

    issues.push(
      createIssue('warning', 'UNEXPECTED_PROPERTY', `Unknown property "${key}"`, pathAppend(path, key)),
    );
  }

  return { result, issues };
}

/**
 * Parse an array property value.
 *
 * Validates that the value is actually an array, then parses each element.
 */
function parseArrayProperty(
  value: unknown,
  key: string,
  parentPath: string,
  descriptor: PropertyDescriptor,
  issues: ParseIssue[],
): unknown[] {
  const arrayPath = pathAppend(parentPath, key);

  if (!Array.isArray(value)) {
    issues.push(
      createIssue('error', 'INVALID_STRUCTURE', `Property "${key}" must be an array`, arrayPath),
    );
    // Wrap single value in array as recovery
    return [value];
  }

  // FHIR: empty arrays are not valid — omit the property instead
  if (value.length === 0) {
    issues.push(
      createIssue('warning', 'INVALID_STRUCTURE', `Property "${key}" is an empty array (should be omitted)`, arrayPath),
    );
    return [];
  }

  const results: unknown[] = [];

  for (let i = 0; i < value.length; i++) {
    const element = value[i];
    const elementPath = pathIndex(arrayPath, i);

    if (element === null) {
      // null in arrays is valid for primitive alignment; pass through
      results.push(null);
      continue;
    }

    if (descriptor.parseElement && isPlainObject(element)) {
      const nested = descriptor.parseElement(element, elementPath);
      results.push(nested.result);
      issues.push(...nested.issues);
    } else {
      results.push(element);
    }
  }

  return results;
}

// =============================================================================
// Section 4: Resource-Level Parsing
// =============================================================================

/**
 * Property schema for the base FHIR Resource type.
 *
 * Covers the 5 fields defined on Resource:
 * - resourceType (string, required)
 * - id (primitive, optional)
 * - meta (complex, optional)
 * - implicitRules (primitive, optional)
 * - language (primitive, optional)
 *
 * Used by {@link parseGenericResource} to validate and extract base fields
 * via {@link parseComplexObject}.
 */
const RESOURCE_SCHEMA: PropertySchema = new Map<string, PropertyDescriptor>([
  ['resourceType', { name: 'resourceType', isPrimitive: true, isArray: false, fhirType: 'code' }],
  ['id', { name: 'id', isPrimitive: true, isArray: false, fhirType: 'id' }],
  ['meta', { name: 'meta', isPrimitive: false, isArray: false }],
  ['implicitRules', { name: 'implicitRules', isPrimitive: true, isArray: false, fhirType: 'uri' }],
  ['language', { name: 'language', isPrimitive: true, isArray: false, fhirType: 'code' }],
]);

/**
 * Parse a generic FHIR resource from a JSON object.
 *
 * Uses {@link parseComplexObject} with {@link RESOURCE_SCHEMA} to extract
 * the base `Resource` fields (resourceType, id, meta, implicitRules, language)
 * and report unknown properties as warnings.
 *
 * This is the fallback for resource types that don't have a dedicated parser.
 *
 * @param obj - The raw JSON object (already validated as a plain object with resourceType)
 * @param resourceType - The extracted resourceType value
 * @param path - JSON path for error reporting
 */
function parseGenericResource(
  obj: JsonObject,
  resourceType: string,
  path: string,
): { result: Resource; issues: ParseIssue[] } {
  const { result: parsed, issues } = parseComplexObject(obj, path, RESOURCE_SCHEMA);

  const result: Resource = {
    resourceType,
    ...(parsed.id !== undefined && { id: parsed.id as Resource['id'] }),
    ...(parsed.meta !== undefined && { meta: parsed.meta as Resource['meta'] }),
    ...(parsed.implicitRules !== undefined && { implicitRules: parsed.implicitRules as Resource['implicitRules'] }),
    ...(parsed.language !== undefined && { language: parsed.language as Resource['language'] }),
  };

  return { result, issues };
}

// =============================================================================
// Section 5: Public API
// =============================================================================

/**
 * Parse a FHIR JSON string into a Resource object.
 *
 * This is the main entry point for the parser. It:
 * 1. Calls `JSON.parse()` with error capture
 * 2. Delegates to {@link parseFhirObject} for structural parsing
 *
 * Stage-1 supports dedicated parsing for `StructureDefinition` (Task 2.5).
 * All other resource types are parsed generically.
 *
 * @param json - A FHIR JSON string
 * @returns A `ParseResult` containing the parsed `Resource` or error details
 *
 * @example
 * ```typescript
 * const result = parseFhirJson('{"resourceType":"Patient","id":"123"}');
 * if (result.success) {
 *   console.log(result.data.resourceType); // "Patient"
 * }
 * ```
 */
export function parseFhirJson(json: string): ParseResult<Resource> {
  // Step 1: JSON.parse with error capture
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    const message = e instanceof SyntaxError ? e.message : 'Invalid JSON';
    return parseFailure<Resource>([
      createIssue('error', 'INVALID_JSON', message, '$'),
    ]);
  }

  // Step 2: Delegate to object parser
  return parseFhirObject(parsed);
}

/**
 * Parse an already-parsed JSON value into a Resource object.
 *
 * Use this when you already have a JavaScript object (e.g., from a database
 * or from `JSON.parse()` called externally).
 *
 * @param obj - An unknown value (expected to be a plain JSON object with `resourceType`)
 * @returns A `ParseResult` containing the parsed `Resource` or error details
 */
export function parseFhirObject(obj: unknown): ParseResult<Resource> {
  const issues: ParseIssue[] = [];

  // Step 1: Validate root is a plain object
  if (!isPlainObject(obj)) {
    return parseFailure<Resource>([
      createIssue(
        'error',
        'INVALID_STRUCTURE',
        `Expected a JSON object, got ${obj === null ? 'null' : Array.isArray(obj) ? 'array' : typeof obj}`,
        '$',
      ),
    ]);
  }

  // Step 2: Extract and validate resourceType
  const resourceType = obj.resourceType;

  if (resourceType === undefined || resourceType === null) {
    return parseFailure<Resource>([
      createIssue('error', 'MISSING_RESOURCE_TYPE', 'Missing required property "resourceType"', '$'),
    ]);
  }

  if (typeof resourceType !== 'string') {
    return parseFailure<Resource>([
      createIssue(
        'error',
        'INVALID_PRIMITIVE',
        `"resourceType" must be a string, got ${typeof resourceType}`,
        '$.resourceType',
      ),
    ]);
  }

  if (resourceType.length === 0) {
    return parseFailure<Resource>([
      createIssue('error', 'INVALID_PRIMITIVE', '"resourceType" must not be empty', '$.resourceType'),
    ]);
  }

  const path = resourceType;

  // Step 3: Dispatch by resourceType
  let result: Resource;
  if (resourceType === 'StructureDefinition') {
    const sdResult = parseStructureDefinition(obj, path);
    issues.push(...sdResult.issues);
    if (!sdResult.success) {
      return parseFailure<Resource>(issues);
    }
    result = sdResult.data;
  } else {
    const generic = parseGenericResource(obj, resourceType, path);
    issues.push(...generic.issues);
    result = generic.result;
  }

  if (hasErrors(issues)) {
    return parseFailure<Resource>(issues);
  }

  return parseSuccess(result, issues);
}
