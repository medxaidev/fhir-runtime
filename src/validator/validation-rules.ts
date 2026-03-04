/**
 * fhir-validator — Validation Rules: Cardinality, Type, Fixed/Pattern & Reference
 *
 * Implements the core structural validation rules:
 * - {@link validateCardinality} — min/max cardinality checks
 * - {@link validateType} — FHIR type constraint checks
 * - {@link inferFhirType} — heuristic FHIR type inference from JS values
 * - {@link validateRequired} — required element (min≥1) presence check
 * - {@link validateFixed} — fixed value exact-match checks
 * - {@link validatePattern} — pattern value partial-match checks
 * - {@link matchesPattern} — recursive partial object matching
 * - {@link deepEqual} — recursive deep equality comparison
 * - {@link validateReference} — reference target profile checks
 * - {@link extractReferenceType} — extract resource type from reference string
 *
 * These functions operate on individual {@link CanonicalElement} definitions
 * and produce {@link ValidationIssue} entries when violations are found.
 *
 * @module fhir-validator
 */

import type { CanonicalElement } from '../model/canonical-profile.js';
import type { ValidationIssue } from './types.js';
import { createValidationIssue } from './types.js';

// =============================================================================
// Section 1: validateCardinality
// =============================================================================

/**
 * Validate cardinality (min/max) for an element.
 *
 * Checks that the number of values found for an element falls within
 * the allowed range defined by `element.min` and `element.max`.
 *
 * @param element - The canonical element definition with min/max constraints.
 * @param values - The extracted values for this element.
 * @param issues - Mutable array to push validation issues into.
 *
 * @example
 * ```typescript
 * // element: min=1, max=1
 * validateCardinality(element, [], issues);
 * // → issues: [{ code: 'CARDINALITY_MIN_VIOLATION', ... }]
 * ```
 */
export function validateCardinality(
  element: CanonicalElement,
  values: unknown[],
  issues: ValidationIssue[],
): void {
  const count = values.length;

  // Check minimum cardinality
  if (element.min > 0 && count < element.min) {
    issues.push(
      createValidationIssue(
        'error',
        'CARDINALITY_MIN_VIOLATION',
        `Element '${element.path}' requires at least ${element.min} value(s), but found ${count}`,
        { path: element.path },
      ),
    );
  }

  // Check maximum cardinality
  if (element.max !== 'unbounded') {
    if (count > element.max) {
      issues.push(
        createValidationIssue(
          'error',
          'CARDINALITY_MAX_VIOLATION',
          `Element '${element.path}' allows at most ${element.max} value(s), but found ${count}`,
          { path: element.path },
        ),
      );
    }
  }
}

// =============================================================================
// Section 2: validateRequired
// =============================================================================

/**
 * Validate that a required element (min ≥ 1) is present.
 *
 * This is a convenience wrapper that checks element presence without
 * needing to extract values first. It only checks the `exists` flag.
 *
 * @param element - The canonical element definition.
 * @param exists - Whether the element exists in the resource.
 * @param issues - Mutable array to push validation issues into.
 */
export function validateRequired(
  element: CanonicalElement,
  exists: boolean,
  issues: ValidationIssue[],
): void {
  if (element.min > 0 && !exists) {
    issues.push(
      createValidationIssue(
        'error',
        'REQUIRED_ELEMENT_MISSING',
        `Required element '${element.path}' is missing (min=${element.min})`,
        { path: element.path },
      ),
    );
  }
}

// =============================================================================
// Section 3: inferFhirType
// =============================================================================

/**
 * Known FHIR primitive type names (lowercase) that map to JS `string`.
 *
 * @internal
 */
const STRING_FHIR_TYPES = new Set([
  'string',
  'uri',
  'url',
  'canonical',
  'code',
  'oid',
  'id',
  'markdown',
  'base64Binary',
  'instant',
  'date',
  'dateTime',
  'time',
  'uuid',
  'xhtml',
]);

/**
 * Infer the FHIR type from a JavaScript value.
 *
 * Uses heuristics to determine the most likely FHIR type based on
 * the JavaScript runtime type and object shape. This is inherently
 * imperfect — for example, a JS `string` could be any of the FHIR
 * string-like primitives. The inference returns the broadest matching
 * category.
 *
 * **Type mapping:**
 *
 * | JS type | Inferred FHIR type |
 * |---------|-------------------|
 * | `string` | `'string'` |
 * | `boolean` | `'boolean'` |
 * | `number` (integer) | `'integer'` |
 * | `number` (decimal) | `'decimal'` |
 * | `object` with `system`+`code` | `'Coding'` |
 * | `object` with `coding` array | `'CodeableConcept'` |
 * | `object` with `value`+`unit` or `value`+`system` | `'Quantity'` |
 * | `object` with `reference` | `'Reference'` |
 * | `object` with `start` or `end` | `'Period'` |
 * | `object` with `numerator`+`denominator` | `'Ratio'` |
 * | `object` with `line`+`city` or `city`+`state` | `'Address'` |
 * | `object` with `family` or `given` | `'HumanName'` |
 * | `object` with `system`+`value` (no `code`) | `'Identifier'` |
 * | `object` with `contentType` or `data` | `'Attachment'` |
 * | `object` with `url`+`value[x]` shape | `'Extension'` |
 * | other `object` | `'BackboneElement'` |
 * | `null`/`undefined` | `'null'` |
 *
 * @param value - The JavaScript value to infer type from.
 * @returns The inferred FHIR type name.
 */
export function inferFhirType(value: unknown): string {
  if (value === null || value === undefined) {
    return 'null';
  }

  if (typeof value === 'string') {
    return 'string';
  }

  if (typeof value === 'boolean') {
    return 'boolean';
  }

  if (typeof value === 'number') {
    return Number.isInteger(value) ? 'integer' : 'decimal';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    return inferComplexType(obj);
  }

  return 'unknown';
}

/**
 * Infer FHIR complex type from an object's shape.
 *
 * @internal
 */
function inferComplexType(obj: Record<string, unknown>): string {
  // Coding: { system, code }
  if ('system' in obj && 'code' in obj && !('value' in obj)) {
    return 'Coding';
  }

  // CodeableConcept: { coding: [...] }
  if ('coding' in obj && Array.isArray(obj.coding)) {
    return 'CodeableConcept';
  }

  // Quantity (and sub-types Age, Count, Distance, Duration, Money):
  // { value, unit } or { value, system, code }
  if ('value' in obj && typeof obj.value === 'number') {
    if ('unit' in obj || ('system' in obj && 'code' in obj)) {
      return 'Quantity';
    }
  }

  // Reference: { reference } or { reference, display }
  if ('reference' in obj && typeof obj.reference === 'string') {
    return 'Reference';
  }

  // Period: { start } or { end } or { start, end }
  if (('start' in obj || 'end' in obj) && !('value' in obj)) {
    return 'Period';
  }

  // Ratio: { numerator, denominator }
  if ('numerator' in obj && 'denominator' in obj) {
    return 'Ratio';
  }

  // HumanName: { family } or { given }
  if ('family' in obj || ('given' in obj && Array.isArray(obj.given))) {
    return 'HumanName';
  }

  // Address: { line, city } or { city, state }
  if (('line' in obj && 'city' in obj) || ('city' in obj && 'state' in obj)) {
    return 'Address';
  }

  // Identifier: { system, value } (no code)
  if ('system' in obj && 'value' in obj && !('code' in obj)) {
    return 'Identifier';
  }

  // ContactPoint: { system, value } with system being phone/fax/email/pager/url/sms/other
  if ('system' in obj && 'value' in obj && 'code' in obj) {
    // Already matched as Coding above, but just in case
    return 'Coding';
  }

  // Attachment: { contentType } or { data }
  if ('contentType' in obj || ('data' in obj && typeof obj.data === 'string')) {
    return 'Attachment';
  }

  // Extension: { url, value[x] }
  if ('url' in obj && typeof obj.url === 'string') {
    // Check for any value[x] property
    for (const key of Object.keys(obj)) {
      if (
        key.startsWith('value') &&
        key.length > 5 &&
        key[5] >= 'A' &&
        key[5] <= 'Z'
      ) {
        return 'Extension';
      }
    }
  }

  // Meta: { versionId } or { lastUpdated } or { profile }
  if ('versionId' in obj || 'lastUpdated' in obj || ('profile' in obj && Array.isArray(obj.profile))) {
    return 'Meta';
  }

  // Narrative: { status, div }
  if ('status' in obj && 'div' in obj) {
    return 'Narrative';
  }

  // Generic backbone/complex element
  return 'BackboneElement';
}

// =============================================================================
// Section 4: validateType
// =============================================================================

/**
 * Check if an inferred type is compatible with a set of allowed type constraints.
 *
 * Handles FHIR's type hierarchy where:
 * - All string-like primitives (uri, code, id, etc.) are compatible with `string`
 * - `integer`, `positiveInt`, `unsignedInt` are compatible with each other
 * - `Quantity` sub-types (Age, Count, Distance, Duration, Money) match `Quantity`
 * - `BackboneElement` is compatible with any complex type (structural match)
 *
 * @internal
 */
function isTypeCompatible(inferredType: string, allowedType: string): boolean {
  // Exact match
  if (inferredType === allowedType) {
    return true;
  }

  // String-like primitives are all compatible with 'string'
  if (inferredType === 'string' && STRING_FHIR_TYPES.has(allowedType)) {
    return true;
  }

  // Integer variants
  if (
    inferredType === 'integer' &&
    (allowedType === 'positiveInt' || allowedType === 'unsignedInt' || allowedType === 'integer')
  ) {
    return true;
  }

  // Decimal is compatible with integer (integer is a subset of decimal)
  if (inferredType === 'integer' && allowedType === 'decimal') {
    return true;
  }

  // Quantity sub-types
  if (
    inferredType === 'Quantity' &&
    (allowedType === 'Age' ||
      allowedType === 'Count' ||
      allowedType === 'Distance' ||
      allowedType === 'Duration' ||
      allowedType === 'Money' ||
      allowedType === 'SimpleQuantity')
  ) {
    return true;
  }

  // BackboneElement is a generic complex type — compatible with any complex type
  // This handles cases where we can't precisely infer the type from shape alone
  if (inferredType === 'BackboneElement') {
    // BackboneElement is compatible with any non-primitive type
    const primitives = new Set(['string', 'boolean', 'integer', 'decimal', 'null', 'array', 'unknown']);
    return !primitives.has(allowedType);
  }

  // Element type (base of all) — very permissive
  if (allowedType === 'Element' || allowedType === 'BackboneElement') {
    return true;
  }

  // Resource type — any object with resourceType
  if (allowedType === 'Resource') {
    return inferredType !== 'string' && inferredType !== 'boolean' &&
      inferredType !== 'integer' && inferredType !== 'decimal' &&
      inferredType !== 'null' && inferredType !== 'unknown';
  }

  return false;
}

/**
 * Validate type constraints for an element value.
 *
 * Checks that the inferred FHIR type of a value matches at least one
 * of the allowed types defined in the element's type constraints.
 *
 * If the element has no type constraints (backbone element), validation
 * is skipped. If the element allows multiple types (choice type), the
 * value must match at least one.
 *
 * @param element - The canonical element definition with type constraints.
 * @param value - The actual value to validate.
 * @param issues - Mutable array to push validation issues into.
 *
 * @example
 * ```typescript
 * // element.types = [{ code: 'string' }]
 * validateType(element, 42, issues);
 * // → issues: [{ code: 'TYPE_MISMATCH', ... }]
 * ```
 */
export function validateType(
  element: CanonicalElement,
  value: unknown,
  issues: ValidationIssue[],
): void {
  // No type constraints → backbone element, skip
  if (element.types.length === 0) {
    return;
  }

  // Null/undefined values are handled by cardinality, not type
  if (value === null || value === undefined) {
    return;
  }

  const inferredType = inferFhirType(value);

  // Check if inferred type matches any allowed type
  const isMatch = element.types.some((tc) => isTypeCompatible(inferredType, tc.code));

  if (!isMatch) {
    const allowedCodes = element.types.map((t) => t.code).join(', ');
    issues.push(
      createValidationIssue(
        'error',
        'TYPE_MISMATCH',
        `Element '${element.path}' expects type(s) [${allowedCodes}], but found '${inferredType}'`,
        {
          path: element.path,
          diagnostics: `Inferred type: ${inferredType}, allowed: [${allowedCodes}]`,
        },
      ),
    );
  }
}

// =============================================================================
// Section 5: validateChoiceType
// =============================================================================

/**
 * Validate that a choice type element uses an allowed type suffix.
 *
 * For elements like `Observation.value[x]`, checks that the concrete
 * property name (e.g., `valueQuantity`) uses a type suffix that matches
 * one of the allowed types in the element definition.
 *
 * @param element - The canonical element definition (must be a choice type).
 * @param concreteFieldSuffix - The type suffix from the concrete property
 *   (e.g., `'Quantity'` from `valueQuantity`).
 * @param issues - Mutable array to push validation issues into.
 */
export function validateChoiceType(
  element: CanonicalElement,
  concreteFieldSuffix: string,
  issues: ValidationIssue[],
): void {
  if (element.types.length === 0) {
    return;
  }

  const allowedCodes = element.types.map((t) => t.code);
  const isAllowed = allowedCodes.some(
    (code) => code === concreteFieldSuffix || code.toLowerCase() === concreteFieldSuffix.toLowerCase(),
  );

  if (!isAllowed) {
    issues.push(
      createValidationIssue(
        'error',
        'INVALID_CHOICE_TYPE',
        `Element '${element.path}' does not allow type '${concreteFieldSuffix}'; allowed: [${allowedCodes.join(', ')}]`,
        { path: element.path },
      ),
    );
  }
}

// =============================================================================
// Section 6: deepEqual
// =============================================================================

/**
 * Perform a recursive deep equality comparison between two values.
 *
 * Handles primitives, `null`, `undefined`, arrays (order-sensitive),
 * and plain objects. Does NOT handle `Date`, `RegExp`, `Map`, `Set`,
 * or other special JS types — those are not relevant for FHIR JSON.
 *
 * @param a - First value.
 * @param b - Second value.
 * @returns `true` if the values are deeply equal.
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  // Identical references or both primitives with same value
  if (a === b) {
    return true;
  }

  // If either is null/undefined (and they're not ===), they differ
  if (a === null || a === undefined || b === null || b === undefined) {
    return false;
  }

  // Different JS types
  if (typeof a !== typeof b) {
    return false;
  }

  // Arrays
  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  // Objects
  if (typeof a === 'object' && typeof b === 'object') {
    const objA = a as Record<string, unknown>;
    const objB = b as Record<string, unknown>;
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
      if (!(key in objB)) return false;
      if (!deepEqual(objA[key], objB[key])) return false;
    }
    return true;
  }

  // Primitives that aren't === (e.g., NaN !== NaN)
  return false;
}

// =============================================================================
// Section 7: validateFixed
// =============================================================================

/**
 * Validate a fixed value constraint on an element.
 *
 * When `element.fixed` is defined, the actual value MUST be deeply equal
 * to the fixed value. This is an exact-match constraint — no additional
 * or missing fields are allowed.
 *
 * @param element - The canonical element definition (may have `fixed`).
 * @param value - The actual value to validate.
 * @param issues - Mutable array to push validation issues into.
 */
export function validateFixed(
  element: CanonicalElement,
  value: unknown,
  issues: ValidationIssue[],
): void {
  if (element.fixed === undefined) {
    return;
  }

  // Null/undefined values are handled by cardinality
  if (value === null || value === undefined) {
    return;
  }

  if (!deepEqual(value, element.fixed)) {
    issues.push(
      createValidationIssue(
        'error',
        'FIXED_VALUE_MISMATCH',
        `Element '${element.path}' must have fixed value ${JSON.stringify(element.fixed)}, but found ${JSON.stringify(value)}`,
        {
          path: element.path,
          diagnostics: `Expected: ${JSON.stringify(element.fixed)}, Actual: ${JSON.stringify(value)}`,
        },
      ),
    );
  }
}

// =============================================================================
// Section 8: matchesPattern & validatePattern
// =============================================================================

/**
 * Check if a value matches a pattern (partial/subset match).
 *
 * A pattern match means: every field present in the `pattern` must also
 * be present in `value` with the same value. However, `value` may contain
 * additional fields not in the pattern.
 *
 * For primitives and arrays, this falls back to deep equality.
 * For objects, it performs recursive subset matching.
 *
 * @param value - The actual value to check.
 * @param pattern - The pattern to match against.
 * @returns `true` if the value matches the pattern.
 */
export function matchesPattern(value: unknown, pattern: unknown): boolean {
  // Primitives and null: exact match
  if (pattern === null || pattern === undefined) {
    return value === pattern;
  }

  if (typeof pattern !== 'object') {
    return value === pattern;
  }

  // Pattern is an array → value must be an array with matching elements
  if (Array.isArray(pattern)) {
    if (!Array.isArray(value)) return false;
    // Each element in the pattern array must have a matching element in value
    for (const patternItem of pattern) {
      const found = value.some((v) => matchesPattern(v, patternItem));
      if (!found) return false;
    }
    return true;
  }

  // Pattern is an object → value must be an object with all pattern keys
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const objValue = value as Record<string, unknown>;
  const objPattern = pattern as Record<string, unknown>;

  for (const key of Object.keys(objPattern)) {
    if (!(key in objValue)) return false;
    if (!matchesPattern(objValue[key], objPattern[key])) return false;
  }

  return true;
}

/**
 * Validate a pattern value constraint on an element.
 *
 * When `element.pattern` is defined, the actual value must be a superset
 * of the pattern — all fields in the pattern must exist in the value with
 * matching values, but the value may contain additional fields.
 *
 * @param element - The canonical element definition (may have `pattern`).
 * @param value - The actual value to validate.
 * @param issues - Mutable array to push validation issues into.
 */
export function validatePattern(
  element: CanonicalElement,
  value: unknown,
  issues: ValidationIssue[],
): void {
  if (element.pattern === undefined) {
    return;
  }

  // Null/undefined values are handled by cardinality
  if (value === null || value === undefined) {
    return;
  }

  if (!matchesPattern(value, element.pattern)) {
    issues.push(
      createValidationIssue(
        'error',
        'PATTERN_VALUE_MISMATCH',
        `Element '${element.path}' must match pattern ${JSON.stringify(element.pattern)}, but found ${JSON.stringify(value)}`,
        {
          path: element.path,
          diagnostics: `Pattern: ${JSON.stringify(element.pattern)}, Actual: ${JSON.stringify(value)}`,
        },
      ),
    );
  }
}

// =============================================================================
// Section 9: extractReferenceType & validateReference
// =============================================================================

/**
 * Extract the resource type from a FHIR reference string.
 *
 * Handles the following reference formats:
 * - Relative: `"Patient/123"` → `"Patient"`
 * - Absolute: `"http://example.org/fhir/Patient/123"` → `"Patient"`
 * - URN: `"urn:uuid:abc-123"` → `undefined` (cannot determine type)
 * - Fragment: `"#contained-1"` → `undefined`
 *
 * @param reference - The reference string to parse.
 * @returns The resource type, or `undefined` if it cannot be determined.
 */
export function extractReferenceType(reference: string | undefined): string | undefined {
  if (!reference) {
    return undefined;
  }

  // Fragment references
  if (reference.startsWith('#')) {
    return undefined;
  }

  // URN references
  if (reference.startsWith('urn:')) {
    return undefined;
  }

  // Absolute or relative: extract the segment before the last "/"
  // e.g., "Patient/123" → "Patient"
  // e.g., "http://example.org/fhir/Patient/123" → "Patient"
  const parts = reference.split('/');

  // Need at least 2 parts: [ResourceType, id]
  if (parts.length < 2) {
    return undefined;
  }

  // Walk backwards to find the resource type (first segment that starts with uppercase)
  for (let i = parts.length - 2; i >= 0; i--) {
    const segment = parts[i];
    if (segment.length > 0 && segment[0] >= 'A' && segment[0] <= 'Z') {
      return segment;
    }
  }

  return undefined;
}

/**
 * Validate reference target profile constraints.
 *
 * Checks that a Reference value's target resource type matches at least
 * one of the allowed target profiles defined in the element's type
 * constraints.
 *
 * @param element - The canonical element definition with Reference type constraints.
 * @param value - The actual value (expected to be a Reference object).
 * @param issues - Mutable array to push validation issues into.
 */
export function validateReference(
  element: CanonicalElement,
  value: unknown,
  issues: ValidationIssue[],
): void {
  // Only validate objects that look like References
  if (
    value === null ||
    value === undefined ||
    typeof value !== 'object' ||
    !('reference' in (value as Record<string, unknown>))
  ) {
    return;
  }

  const ref = value as { reference?: string; type?: string };

  // Collect all targetProfiles from Reference type constraints
  const targetProfiles = element.types
    .filter((t) => t.code === 'Reference')
    .flatMap((t) => t.targetProfiles ?? []);

  // No target profile constraints → any reference is valid
  if (targetProfiles.length === 0) {
    return;
  }

  // Extract resource type from the reference string
  const refType = extractReferenceType(ref.reference);

  if (!refType) {
    // Cannot determine type (URN, fragment, or invalid format)
    issues.push(
      createValidationIssue(
        'warning',
        'REFERENCE_TARGET_MISMATCH',
        `Element '${element.path}': reference format '${ref.reference ?? ''}' cannot be validated against target profiles`,
        { path: element.path },
      ),
    );
    return;
  }

  // Check if the reference type matches any target profile
  // Target profiles are canonical URLs like "http://hl7.org/fhir/StructureDefinition/Patient"
  const matchesProfile = targetProfiles.some((profile) => {
    // Extract the type name from the profile URL
    const profileType = profile.split('/').pop();
    return profileType === refType;
  });

  if (!matchesProfile) {
    const allowedTypes = targetProfiles
      .map((p) => p.split('/').pop() ?? p)
      .join(', ');
    issues.push(
      createValidationIssue(
        'error',
        'REFERENCE_TARGET_MISMATCH',
        `Element '${element.path}' reference must target [${allowedTypes}], but found '${refType}'`,
        {
          path: element.path,
          diagnostics: `Reference: ${ref.reference}, allowed target profiles: [${targetProfiles.join(', ')}]`,
        },
      ),
    );
  }
}
