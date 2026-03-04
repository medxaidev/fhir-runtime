/**
 * Tests for primitive-parser.ts — Primitive type validation & _element merging
 *
 * Covers:
 * - validatePrimitiveValue(): JS type checking for all 20 FHIR primitive types
 * - getExpectedJsType(): type mapping lookup
 * - mergePrimitiveElement(): single value + _element merging
 * - mergePrimitiveArray(): repeating primitive array + _element null alignment
 *
 * Test data follows FHIR R4 JSON representation rules (§2.6.2).
 */

import { describe, it, expect } from 'vitest';

import {
  validatePrimitiveValue,
  getExpectedJsType,
  mergePrimitiveElement,
  mergePrimitiveArray,
  type PrimitiveWithMetadata,
  type PrimitiveJsType,
} from '../primitive-parser.js';

// =============================================================================
// getExpectedJsType
// =============================================================================

describe('getExpectedJsType', () => {
  it('returns "boolean" for boolean', () => {
    expect(getExpectedJsType('boolean')).toBe('boolean');
  });

  it('returns "number" for integer types', () => {
    expect(getExpectedJsType('integer')).toBe('number');
    expect(getExpectedJsType('positiveInt')).toBe('number');
    expect(getExpectedJsType('unsignedInt')).toBe('number');
  });

  it('returns "number" for decimal', () => {
    expect(getExpectedJsType('decimal')).toBe('number');
  });

  const stringTypes = [
    'string', 'uri', 'url', 'canonical', 'base64Binary',
    'instant', 'date', 'dateTime', 'time', 'code',
    'oid', 'id', 'markdown', 'uuid', 'xhtml',
  ];

  it.each(stringTypes)('returns "string" for %s', (fhirType) => {
    expect(getExpectedJsType(fhirType)).toBe('string');
  });

  it('returns "string" as default for unknown types', () => {
    expect(getExpectedJsType('unknownType')).toBe('string');
    expect(getExpectedJsType('CustomType')).toBe('string');
  });
});

// =============================================================================
// validatePrimitiveValue
// =============================================================================

describe('validatePrimitiveValue', () => {
  // --- Valid values ---

  it('accepts boolean true/false', () => {
    expect(validatePrimitiveValue(true, 'boolean', '$.active')).toBeNull();
    expect(validatePrimitiveValue(false, 'boolean', '$.active')).toBeNull();
  });

  it('accepts integer values', () => {
    expect(validatePrimitiveValue(0, 'integer', '$.count')).toBeNull();
    expect(validatePrimitiveValue(42, 'integer', '$.count')).toBeNull();
    expect(validatePrimitiveValue(-100, 'integer', '$.count')).toBeNull();
  });

  it('accepts unsignedInt values', () => {
    expect(validatePrimitiveValue(0, 'unsignedInt', '$.min')).toBeNull();
    expect(validatePrimitiveValue(999, 'unsignedInt', '$.min')).toBeNull();
  });

  it('accepts positiveInt values', () => {
    expect(validatePrimitiveValue(1, 'positiveInt', '$.max')).toBeNull();
    expect(validatePrimitiveValue(100, 'positiveInt', '$.max')).toBeNull();
  });

  it('accepts decimal values (including fractional)', () => {
    expect(validatePrimitiveValue(3.14, 'decimal', '$.value')).toBeNull();
    expect(validatePrimitiveValue(0.0, 'decimal', '$.value')).toBeNull();
    expect(validatePrimitiveValue(-2.5, 'decimal', '$.value')).toBeNull();
  });

  it('accepts string values for string-based types', () => {
    expect(validatePrimitiveValue('hello', 'string', '$.name')).toBeNull();
    expect(validatePrimitiveValue('http://example.org', 'uri', '$.url')).toBeNull();
    expect(validatePrimitiveValue('2024-01-15', 'date', '$.date')).toBeNull();
    expect(validatePrimitiveValue('active', 'code', '$.status')).toBeNull();
    expect(validatePrimitiveValue('abc-123', 'id', '$.id')).toBeNull();
  });

  // --- Invalid values ---

  it('rejects string where boolean expected', () => {
    const issue = validatePrimitiveValue('true', 'boolean', '$.active');
    expect(issue).not.toBeNull();
    expect(issue!.code).toBe('INVALID_PRIMITIVE');
    expect(issue!.message).toContain('boolean');
    expect(issue!.message).toContain('string');
  });

  it('rejects number where string expected', () => {
    const issue = validatePrimitiveValue(42, 'string', '$.name');
    expect(issue).not.toBeNull();
    expect(issue!.code).toBe('INVALID_PRIMITIVE');
  });

  it('rejects string where number expected', () => {
    const issue = validatePrimitiveValue('42', 'integer', '$.count');
    expect(issue).not.toBeNull();
    expect(issue!.code).toBe('INVALID_PRIMITIVE');
    expect(issue!.message).toContain('number');
  });

  it('rejects boolean where string expected', () => {
    const issue = validatePrimitiveValue(true, 'code', '$.status');
    expect(issue).not.toBeNull();
    expect(issue!.code).toBe('INVALID_PRIMITIVE');
  });

  // --- Integer-specific validation ---

  it('rejects decimal value for integer type', () => {
    const issue = validatePrimitiveValue(3.14, 'integer', '$.count');
    expect(issue).not.toBeNull();
    expect(issue!.code).toBe('INVALID_PRIMITIVE');
    expect(issue!.message).toContain('integer');
    expect(issue!.message).toContain('decimal');
  });

  it('rejects decimal value for unsignedInt type', () => {
    const issue = validatePrimitiveValue(1.5, 'unsignedInt', '$.min');
    expect(issue).not.toBeNull();
    expect(issue!.code).toBe('INVALID_PRIMITIVE');
  });

  it('rejects decimal value for positiveInt type', () => {
    const issue = validatePrimitiveValue(2.7, 'positiveInt', '$.max');
    expect(issue).not.toBeNull();
    expect(issue!.code).toBe('INVALID_PRIMITIVE');
  });

  it('accepts whole number for decimal type (no integer check)', () => {
    // decimal type allows both integer and fractional values
    expect(validatePrimitiveValue(42, 'decimal', '$.value')).toBeNull();
  });

  // --- Path tracking ---

  it('includes correct path in error', () => {
    const issue = validatePrimitiveValue('wrong', 'boolean', 'Patient.active');
    expect(issue!.path).toBe('Patient.active');
  });
});

// =============================================================================
// mergePrimitiveElement — single value merging
// =============================================================================

describe('mergePrimitiveElement', () => {
  // --- Value only ---

  it('returns value directly when no _element', () => {
    const { result, issues } = mergePrimitiveElement('1970-03-30', undefined, 'date', 'Patient.birthDate');

    expect(result).toBe('1970-03-30');
    expect(issues).toHaveLength(0);
  });

  it('returns boolean value directly when no _element', () => {
    const { result, issues } = mergePrimitiveElement(true, undefined, 'boolean', 'Patient.active');

    expect(result).toBe(true);
    expect(issues).toHaveLength(0);
  });

  it('returns number value directly when no _element', () => {
    const { result, issues } = mergePrimitiveElement(42, undefined, 'integer', 'Observation.count');

    expect(result).toBe(42);
    expect(issues).toHaveLength(0);
  });

  // --- Value + _element ---

  it('merges value with _element containing id', () => {
    const { result, issues } = mergePrimitiveElement(
      '1970-03-30',
      { id: '314159' },
      'date',
      'Patient.birthDate',
    );

    expect(issues).toHaveLength(0);
    const merged = result as PrimitiveWithMetadata;
    expect(merged.value).toBe('1970-03-30');
    expect(merged.id).toBe('314159');
  });

  it('merges value with _element containing extension', () => {
    const ext = [{ url: 'http://example.org/ext', valueString: 'Easter 1970' }];
    const { result, issues } = mergePrimitiveElement(
      '1970-03-30',
      { extension: ext },
      'date',
      'Patient.birthDate',
    );

    expect(issues).toHaveLength(0);
    const merged = result as PrimitiveWithMetadata;
    expect(merged.value).toBe('1970-03-30');
    expect(merged.extension).toEqual(ext);
  });

  it('merges value with _element containing both id and extension', () => {
    const ext = [{ url: 'http://example.org/ext', valueBoolean: true }];
    const { result, issues } = mergePrimitiveElement(
      'active',
      { id: 'status-id', extension: ext },
      'code',
      'Patient.status',
    );

    expect(issues).toHaveLength(0);
    const merged = result as PrimitiveWithMetadata;
    expect(merged.value).toBe('active');
    expect(merged.id).toBe('status-id');
    expect(merged.extension).toEqual(ext);
  });

  // --- _element only (no value) ---

  it('returns metadata when only _element is present', () => {
    const ext = [{ url: 'http://example.org/ext', valueString: 'inferred' }];
    const { result, issues } = mergePrimitiveElement(
      undefined,
      { extension: ext },
      'date',
      'Patient.birthDate',
    );

    expect(issues).toHaveLength(0);
    const merged = result as PrimitiveWithMetadata;
    expect(merged.value).toBeUndefined();
    expect(merged.extension).toEqual(ext);
  });

  // --- Neither value nor _element ---

  it('returns undefined when both are absent', () => {
    const { result, issues } = mergePrimitiveElement(undefined, undefined, 'string', 'Patient.name');

    expect(result).toBeUndefined();
    expect(issues).toHaveLength(0);
  });

  // --- Type validation ---

  it('reports error when value has wrong JS type', () => {
    const { issues } = mergePrimitiveElement('not-a-boolean', undefined, 'boolean', 'Patient.active');

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_PRIMITIVE');
  });

  // --- _element validation ---

  it('reports error when _element is not an object', () => {
    const { issues } = mergePrimitiveElement('value', 'not-an-object', 'string', 'Patient.name');

    expect(issues.some((i) => i.code === 'INVALID_STRUCTURE')).toBe(true);
  });

  it('reports error when _element.id is not a string', () => {
    const { issues } = mergePrimitiveElement('value', { id: 42 }, 'string', 'Patient.name');

    expect(issues.some((i) => i.code === 'INVALID_PRIMITIVE')).toBe(true);
  });

  it('reports error when _element.extension is not an array', () => {
    const { issues } = mergePrimitiveElement('value', { extension: 'not-array' }, 'string', 'Patient.name');

    expect(issues.some((i) => i.code === 'INVALID_STRUCTURE')).toBe(true);
  });

  it('warns about unexpected properties in _element', () => {
    const { issues } = mergePrimitiveElement('value', { id: 'x', unknownProp: 'y' }, 'string', 'Patient.name');

    expect(issues.some((i) => i.code === 'UNEXPECTED_PROPERTY' && i.message.includes('unknownProp'))).toBe(true);
  });
});

// =============================================================================
// mergePrimitiveArray — repeating primitive merging
// =============================================================================

describe('mergePrimitiveArray', () => {
  // --- Values only (no _element array) ---

  it('returns values as-is when no _element array', () => {
    const { result, issues } = mergePrimitiveArray(
      ['au', 'nz'],
      undefined,
      'code',
      'Patient.code',
    );

    expect(result).toEqual(['au', 'nz']);
    expect(issues).toHaveLength(0);
  });

  it('validates each value in the array', () => {
    const { issues } = mergePrimitiveArray(
      [42, 'not-a-number'],
      undefined,
      'integer',
      'Observation.count',
    );

    expect(issues.some((i) => i.code === 'INVALID_PRIMITIVE')).toBe(true);
  });

  // --- Values + _element array (null alignment) ---

  it('merges arrays with null alignment', () => {
    const { result, issues } = mergePrimitiveArray(
      ['au', 'nz'],
      [null, { extension: [{ url: 'http://example.org', valueString: 'Kiwiland' }] }],
      'code',
      'Patient.code',
    );

    expect(issues).toHaveLength(0);
    expect(result).toHaveLength(2);

    // First element: value only (null _element)
    expect(result[0]).toBe('au');

    // Second element: merged with extension
    const second = result[1] as PrimitiveWithMetadata;
    expect(second.value).toBe('nz');
    expect(second.extension).toHaveLength(1);
  });

  it('handles _element with id at specific position', () => {
    const { result, issues } = mergePrimitiveArray(
      ['given1', 'given2'],
      [{ id: 'g1-id' }, null],
      'string',
      'Patient.name.given',
    );

    expect(issues).toHaveLength(0);
    const first = result[0] as PrimitiveWithMetadata;
    expect(first.value).toBe('given1');
    expect(first.id).toBe('g1-id');
    expect(result[1]).toBe('given2');
  });

  // --- Null in value array ---

  it('handles null in value array with corresponding _element', () => {
    const { result, issues } = mergePrimitiveArray(
      [null, 'nz'],
      [{ extension: [{ url: 'http://example.org', valueString: 'Unknown' }] }, null],
      'code',
      'Patient.code',
    );

    expect(issues).toHaveLength(0);
    expect(result).toHaveLength(2);

    // First: null value + extension → metadata only
    const first = result[0] as PrimitiveWithMetadata;
    expect(first.value).toBeUndefined();
    expect(first.extension).toHaveLength(1);

    // Second: value only
    expect(result[1]).toBe('nz');
  });

  it('warns about null in value array without _element', () => {
    const { result, issues } = mergePrimitiveArray(
      ['au', null, 'nz'],
      undefined,
      'code',
      'Patient.code',
    );

    expect(result).toHaveLength(3);
    expect(issues.some((i) => i.code === 'UNEXPECTED_NULL')).toBe(true);
  });

  // --- Array length mismatch ---

  it('reports ARRAY_MISMATCH when lengths differ', () => {
    const { issues } = mergePrimitiveArray(
      ['au'],
      [null, { extension: [{ url: 'http://example.org' }] }],
      'code',
      'Patient.code',
    );

    expect(issues.some((i) => i.code === 'ARRAY_MISMATCH')).toBe(true);
  });

  it('still produces results despite length mismatch', () => {
    const { result } = mergePrimitiveArray(
      ['au'],
      [null, { extension: [{ url: 'http://example.org' }] }],
      'code',
      'Patient.code',
    );

    // Should use the longer array's length
    expect(result.length).toBe(2);
  });

  // --- _element not an array ---

  it('reports error when _element is not an array', () => {
    const { issues } = mergePrimitiveArray(
      ['au', 'nz'],
      { id: 'wrong' } as unknown as unknown[],
      'code',
      'Patient.code',
    );

    expect(issues.some((i) => i.code === 'INVALID_STRUCTURE')).toBe(true);
  });

  // --- Empty arrays ---

  it('handles empty value array', () => {
    const { result, issues } = mergePrimitiveArray([], undefined, 'code', 'Patient.code');

    expect(result).toEqual([]);
    expect(issues).toHaveLength(0);
  });

  // --- Both null at same position ---

  it('preserves null when both value and _element are null', () => {
    const { result } = mergePrimitiveArray(
      [null, 'nz'],
      [null, null],
      'code',
      'Patient.code',
    );

    expect(result[0]).toBeNull();
    expect(result[1]).toBe('nz');
  });
});
