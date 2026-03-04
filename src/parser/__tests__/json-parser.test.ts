/**
 * Tests for json-parser.ts — Core FHIR JSON parsing engine
 *
 * Covers:
 * - parseFhirJson(): JSON string → ParseResult<Resource>
 * - parseFhirObject(): unknown → ParseResult<Resource>
 * - parseComplexObject(): generic complex type parsing with PropertySchema
 * - isPlainObject(), pathAppend(), pathIndex(): utilities
 *
 * Test data uses JSON fixtures from __tests__/fixtures/.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  parseFhirJson,
  parseFhirObject,
  parseComplexObject,
  isPlainObject,
  pathAppend,
  pathIndex,
  type PropertyDescriptor,
  type PropertySchema,
  type JsonObject,
} from '../json-parser.js';
import { createIssue } from '../parse-error.js';

// =============================================================================
// Fixture helpers
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

function loadFixture(relativePath: string): string {
  return readFileSync(resolve(__dirname, 'fixtures', relativePath), 'utf-8');
}

function loadFixtureJson(relativePath: string): unknown {
  return JSON.parse(loadFixture(relativePath));
}

// =============================================================================
// isPlainObject
// =============================================================================

describe('isPlainObject', () => {
  it('returns true for plain objects', () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject({ resourceType: 'Patient' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isPlainObject(null)).toBe(false);
  });

  it('returns false for arrays', () => {
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject([1, 2, 3])).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isPlainObject('string')).toBe(false);
    expect(isPlainObject(42)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
    expect(isPlainObject(undefined)).toBe(false);
  });
});

// =============================================================================
// pathAppend / pathIndex
// =============================================================================

describe('pathAppend', () => {
  it('appends property to path', () => {
    expect(pathAppend('Patient', 'name')).toBe('Patient.name');
  });

  it('works with root path $', () => {
    expect(pathAppend('$', 'resourceType')).toBe('$.resourceType');
  });

  it('chains multiple levels', () => {
    expect(pathAppend(pathAppend('Patient', 'name'), 'family')).toBe('Patient.name.family');
  });
});

describe('pathIndex', () => {
  it('appends array index to path', () => {
    expect(pathIndex('Patient.name', 0)).toBe('Patient.name[0]');
  });

  it('works with nested paths', () => {
    expect(pathIndex('StructureDefinition.snapshot.element', 5)).toBe(
      'StructureDefinition.snapshot.element[5]',
    );
  });
});

// =============================================================================
// parseFhirJson — JSON string entry point
// =============================================================================

describe('parseFhirJson', () => {
  // --- Valid inputs ---

  it('parses a minimal Patient resource', () => {
    const json = loadFixture('minimal-patient.json');
    const result = parseFhirJson(json);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceType).toBe('Patient');
      expect(result.data.id).toBe('minimal-1');
    }
  });

  it('parses a resource with meta, implicitRules, language', () => {
    const json = loadFixture('resource-with-meta.json');
    const result = parseFhirJson(json);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceType).toBe('Patient');
      expect(result.data.id).toBe('with-meta-1');
      expect(result.data.meta).toBeDefined();
      expect(result.data.implicitRules).toBe('http://example.org/rules');
      expect(result.data.language).toBe('en');
    }
  });

  it('parses a minimal StructureDefinition', () => {
    const json = loadFixture('minimal-structure-definition.json');
    const result = parseFhirJson(json);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceType).toBe('StructureDefinition');
      expect(result.data.id).toBe('test-sd-1');
    }
  });

  // --- Invalid JSON ---

  it('returns INVALID_JSON for malformed JSON', () => {
    const json = loadFixture('invalid/malformed.json');
    const result = parseFhirJson(json);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].code).toBe('INVALID_JSON');
      expect(result.issues[0].severity).toBe('error');
      expect(result.issues[0].path).toBe('$');
    }
  });

  it('returns INVALID_JSON for empty string', () => {
    const result = parseFhirJson('');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('INVALID_JSON');
    }
  });

  it('returns INVALID_JSON for non-JSON text', () => {
    const result = parseFhirJson('this is not json');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('INVALID_JSON');
    }
  });
});

// =============================================================================
// parseFhirObject — pre-parsed object entry point
// =============================================================================

describe('parseFhirObject', () => {
  // --- Structure validation ---

  it('returns INVALID_STRUCTURE for null', () => {
    const result = parseFhirObject(null);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('INVALID_STRUCTURE');
      expect(result.issues[0].message).toContain('null');
    }
  });

  it('returns INVALID_STRUCTURE for array', () => {
    const result = parseFhirObject([{ resourceType: 'Patient' }]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('INVALID_STRUCTURE');
      expect(result.issues[0].message).toContain('array');
    }
  });

  it('returns INVALID_STRUCTURE for string', () => {
    const result = parseFhirObject('Patient');

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('INVALID_STRUCTURE');
      expect(result.issues[0].message).toContain('string');
    }
  });

  it('returns INVALID_STRUCTURE for number', () => {
    const result = parseFhirObject(42);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('INVALID_STRUCTURE');
    }
  });

  it('returns INVALID_STRUCTURE for boolean', () => {
    const result = parseFhirObject(true);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('INVALID_STRUCTURE');
    }
  });

  it('returns INVALID_STRUCTURE for undefined', () => {
    const result = parseFhirObject(undefined);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('INVALID_STRUCTURE');
    }
  });

  // --- resourceType validation ---

  it('returns MISSING_RESOURCE_TYPE when missing', () => {
    const json = loadFixtureJson('invalid/missing-resource-type.json');
    const result = parseFhirObject(json);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('MISSING_RESOURCE_TYPE');
      expect(result.issues[0].path).toBe('$');
    }
  });

  it('returns MISSING_RESOURCE_TYPE for null resourceType', () => {
    const json = loadFixtureJson('invalid/null-resource-type.json');
    const result = parseFhirObject(json);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('MISSING_RESOURCE_TYPE');
    }
  });

  it('returns INVALID_PRIMITIVE for numeric resourceType', () => {
    const json = loadFixtureJson('invalid/numeric-resource-type.json');
    const result = parseFhirObject(json);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('INVALID_PRIMITIVE');
      expect(result.issues[0].path).toBe('$.resourceType');
    }
  });

  it('returns INVALID_PRIMITIVE for empty resourceType', () => {
    const json = loadFixtureJson('invalid/empty-resource-type.json');
    const result = parseFhirObject(json);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues[0].code).toBe('INVALID_PRIMITIVE');
    }
  });

  // --- Successful generic parsing ---

  it('parses a minimal object with resourceType', () => {
    const result = parseFhirObject({ resourceType: 'Observation' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceType).toBe('Observation');
    }
  });

  it('preserves id field', () => {
    const result = parseFhirObject({ resourceType: 'Patient', id: 'abc-123' });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBe('abc-123');
    }
  });

  it('handles resourceType not being the first property', () => {
    // FHIR spec: parsers cannot assume resourceType comes first
    const result = parseFhirObject({
      id: 'late-type-1',
      meta: { versionId: '1' },
      resourceType: 'Patient',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceType).toBe('Patient');
      expect(result.data.id).toBe('late-type-1');
    }
  });

  // --- Generic resource uses parseComplexObject ---

  it('reports UNEXPECTED_PROPERTY warnings for unknown fields on generic resources', () => {
    const result = parseFhirObject({
      resourceType: 'Patient',
      id: '123',
      unknownField: 'test',
    });

    expect(result.success).toBe(true);
    expect(result.issues.some((i) => i.code === 'UNEXPECTED_PROPERTY' && i.message.includes('unknownField'))).toBe(true);
    expect(result.issues.some((i) => i.severity === 'warning')).toBe(true);
  });

  it('reports UNEXPECTED_NULL for null fields on generic resources', () => {
    const result = parseFhirObject({
      resourceType: 'Patient',
      id: null,
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.issues.some((i) => i.code === 'UNEXPECTED_NULL' && i.path.includes('id'))).toBe(true);
    }
  });

  it('preserves _element companions for primitive fields on generic resources', () => {
    const result = parseFhirObject({
      resourceType: 'Patient',
      id: '123',
      _id: { extension: [{ url: 'http://example.org', valueString: 'test' }] },
    });

    expect(result.success).toBe(true);
    // _id should not trigger UNEXPECTED_PROPERTY
    expect(result.issues.filter((i) => i.code === 'UNEXPECTED_PROPERTY')).toHaveLength(0);
  });
});

// =============================================================================
// parseComplexObject — generic complex type parser
// =============================================================================

describe('parseComplexObject', () => {
  // Helper: create a simple schema for testing
  function makeSchema(descriptors: [string, Partial<PropertyDescriptor>][]): PropertySchema {
    return new Map(
      descriptors.map(([name, partial]) => [
        name,
        {
          name,
          isPrimitive: partial.isPrimitive ?? false,
          isArray: partial.isArray ?? false,
          parseElement: partial.parseElement,
        },
      ]),
    );
  }

  it('extracts known properties from object', () => {
    const schema = makeSchema([
      ['url', { isPrimitive: true }],
      ['name', { isPrimitive: true }],
      ['status', { isPrimitive: true }],
    ]);

    const obj: JsonObject = { url: 'http://example.org', name: 'Test', status: 'draft' };
    const { result, issues } = parseComplexObject(obj, 'TestType', schema);

    expect(result.url).toBe('http://example.org');
    expect(result.name).toBe('Test');
    expect(result.status).toBe('draft');
    expect(issues).toHaveLength(0);
  });

  it('skips undefined (missing) properties', () => {
    const schema = makeSchema([
      ['url', { isPrimitive: true }],
      ['name', { isPrimitive: true }],
      ['title', { isPrimitive: true }],
    ]);

    const obj: JsonObject = { url: 'http://example.org', name: 'Test' };
    const { result, issues } = parseComplexObject(obj, 'TestType', schema);

    expect(result.url).toBe('http://example.org');
    expect(result.name).toBe('Test');
    expect(result.title).toBeUndefined();
    expect(issues).toHaveLength(0);
  });

  it('reports UNEXPECTED_NULL for null property values', () => {
    const schema = makeSchema([
      ['url', { isPrimitive: true }],
    ]);

    const obj: JsonObject = { url: null };
    const { result, issues } = parseComplexObject(obj, 'TestType', schema);

    expect(result.url).toBeUndefined();
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('UNEXPECTED_NULL');
    expect(issues[0].path).toBe('TestType.url');
  });

  it('reports UNEXPECTED_PROPERTY for unknown keys', () => {
    const schema = makeSchema([
      ['url', { isPrimitive: true }],
    ]);

    const obj: JsonObject = { url: 'http://example.org', unknownProp: 'value' };
    const { result, issues } = parseComplexObject(obj, 'TestType', schema);

    expect(result.url).toBe('http://example.org');
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('UNEXPECTED_PROPERTY');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].path).toBe('TestType.unknownProp');
  });

  // --- Array handling ---

  it('parses array properties', () => {
    const schema = makeSchema([
      ['coding', { isArray: true }],
    ]);

    const obj: JsonObject = {
      coding: [
        { system: 'http://snomed.info/sct', code: '12345' },
        { system: 'http://loinc.org', code: '67890' },
      ],
    };
    const { result, issues } = parseComplexObject(obj, 'CodeableConcept', schema);

    expect(Array.isArray(result.coding)).toBe(true);
    expect((result.coding as unknown[]).length).toBe(2);
    expect(issues).toHaveLength(0);
  });

  it('reports INVALID_STRUCTURE when array property is not an array', () => {
    const schema = makeSchema([
      ['coding', { isArray: true }],
    ]);

    const obj: JsonObject = { coding: { system: 'http://snomed.info/sct' } };
    const { result, issues } = parseComplexObject(obj, 'CodeableConcept', schema);

    // Should wrap in array as recovery
    expect(Array.isArray(result.coding)).toBe(true);
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_STRUCTURE');
  });

  it('reports warning for empty arrays', () => {
    const schema = makeSchema([
      ['coding', { isArray: true }],
    ]);

    const obj: JsonObject = { coding: [] };
    const { result, issues } = parseComplexObject(obj, 'CodeableConcept', schema);

    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_STRUCTURE');
    expect(issues[0].severity).toBe('warning');
    expect(issues[0].message).toContain('empty array');
  });

  // --- Nested complex types ---

  it('recursively parses nested complex types', () => {
    const innerSchema = makeSchema([
      ['system', { isPrimitive: true }],
      ['code', { isPrimitive: true }],
    ]);

    const schema: PropertySchema = new Map([
      ['coding', {
        name: 'coding',
        isPrimitive: false,
        isArray: true,
        parseElement: (obj: JsonObject, path: string) => parseComplexObject(obj, path, innerSchema),
      }],
    ]);

    const obj: JsonObject = {
      coding: [
        { system: 'http://snomed.info/sct', code: '12345' },
      ],
    };
    const { result, issues } = parseComplexObject(obj, 'CodeableConcept', schema);

    const coding = result.coding as JsonObject[];
    expect(coding[0].system).toBe('http://snomed.info/sct');
    expect(coding[0].code).toBe('12345');
    expect(issues).toHaveLength(0);
  });

  it('collects issues from nested parsing', () => {
    const innerSchema = makeSchema([
      ['system', { isPrimitive: true }],
    ]);

    const schema: PropertySchema = new Map([
      ['coding', {
        name: 'coding',
        isPrimitive: false,
        isArray: true,
        parseElement: (obj: JsonObject, path: string) => parseComplexObject(obj, path, innerSchema),
      }],
    ]);

    const obj: JsonObject = {
      coding: [
        { system: 'http://snomed.info/sct', unknownField: 'oops' },
      ],
    };
    const { issues } = parseComplexObject(obj, 'CodeableConcept', schema);

    // The nested parser should report UNEXPECTED_PROPERTY for unknownField
    expect(issues.some((i) => i.code === 'UNEXPECTED_PROPERTY')).toBe(true);
    expect(issues.some((i) => i.path.includes('unknownField'))).toBe(true);
  });

  // --- _element companion properties ---

  it('merges primitive value with _element companion via mergePrimitiveElement', () => {
    const schema = makeSchema([
      ['birthDate', { isPrimitive: true }],
    ]);

    const obj: JsonObject = {
      birthDate: '1970-03-30',
      _birthDate: { id: '314159', extension: [{ url: 'http://example.org', valueString: 'Easter' }] },
    };
    const { result, issues } = parseComplexObject(obj, 'Patient', schema);

    // Value + _element merged into PrimitiveWithMetadata
    const merged = result.birthDate as { value: string; id: string; extension: unknown[] };
    expect(merged.value).toBe('1970-03-30');
    expect(merged.id).toBe('314159');
    expect(merged.extension).toHaveLength(1);
    // _birthDate should NOT appear as a separate key
    expect(result._birthDate).toBeUndefined();
    // _element should not trigger UNEXPECTED_PROPERTY
    expect(issues.filter((i) => i.code === 'UNEXPECTED_PROPERTY')).toHaveLength(0);
  });

  it('returns value directly when no _element companion is present', () => {
    const schema = makeSchema([
      ['birthDate', { isPrimitive: true }],
    ]);

    const obj: JsonObject = { birthDate: '1970-03-30' };
    const { result } = parseComplexObject(obj, 'Patient', schema);

    // No _element → value returned unwrapped
    expect(result.birthDate).toBe('1970-03-30');
  });

  it('returns PrimitiveWithMetadata when only _element is present (no value)', () => {
    const schema = makeSchema([
      ['birthDate', { isPrimitive: true }],
    ]);

    const obj: JsonObject = {
      _birthDate: { id: 'ext-only', extension: [{ url: 'http://example.org' }] },
    };
    const { result, issues } = parseComplexObject(obj, 'Patient', schema);

    // _element only → PrimitiveWithMetadata with no value
    const merged = result.birthDate as { id: string; extension: unknown[] };
    expect(merged.id).toBe('ext-only');
    expect(merged.extension).toHaveLength(1);
    expect(issues.filter((i) => i.code === 'UNEXPECTED_PROPERTY')).toHaveLength(0);
  });

  it('does not consume _element for non-primitive properties', () => {
    const schema = makeSchema([
      ['name', { isPrimitive: false, isArray: true }],
    ]);

    const obj: JsonObject = {
      name: [{ family: 'Smith' }],
      _name: [null],
    };
    const { issues } = parseComplexObject(obj, 'Patient', schema);

    // _name for a non-primitive should be reported as unexpected
    expect(issues.some((i) => i.code === 'UNEXPECTED_PROPERTY' && i.path.includes('_name'))).toBe(true);
  });

  // --- Choice type base names ---

  it('does not flag choice type properties as unexpected', () => {
    const schema = makeSchema([
      ['url', { isPrimitive: true }],
    ]);

    const obj: JsonObject = {
      url: 'http://example.org',
      valueString: 'hello',
    };
    const { result, issues } = parseComplexObject(obj, 'Extension', schema, ['value']);

    // valueString should be stored, not flagged
    expect(result.valueString).toBe('hello');
    expect(issues.filter((i) => i.code === 'UNEXPECTED_PROPERTY')).toHaveLength(0);
  });

  it('stores choice type value as-is for later extraction', () => {
    const schema = makeSchema([
      ['url', { isPrimitive: true }],
    ]);

    const obj: JsonObject = {
      url: 'http://example.org',
      valueQuantity: { value: 42, unit: 'kg' },
    };
    const { result } = parseComplexObject(obj, 'Extension', schema, ['value']);

    expect(result.valueQuantity).toEqual({ value: 42, unit: 'kg' });
  });

  it('consumes _element companion for choice type properties', () => {
    const schema = makeSchema([
      ['url', { isPrimitive: true }],
    ]);

    const obj: JsonObject = {
      url: 'http://example.org',
      valueString: 'hello',
      _valueString: { extension: [{ url: 'http://example.org/ext', valueBoolean: true }] },
    };
    const { result, issues } = parseComplexObject(obj, 'Extension', schema, ['value']);

    expect(result.valueString).toBe('hello');
    expect(result._valueString).toBeDefined();
    expect(issues.filter((i) => i.code === 'UNEXPECTED_PROPERTY')).toHaveLength(0);
  });

  it('requires uppercase after choice type base name', () => {
    const schema = makeSchema([
      ['url', { isPrimitive: true }],
    ]);

    const obj: JsonObject = {
      url: 'http://example.org',
      valueset: 'not-a-choice-type', // lowercase 's' — not a valid choice type suffix
    };
    const { issues } = parseComplexObject(obj, 'Extension', schema, ['value']);

    // 'valueset' should be flagged as unexpected (lowercase 's' after 'value')
    expect(issues.some((i) => i.code === 'UNEXPECTED_PROPERTY' && i.path.includes('valueset'))).toBe(true);
  });
});
