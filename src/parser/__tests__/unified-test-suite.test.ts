/**
 * Task 2.7: Unified & Centralized Test Suite
 *
 * Comprehensive tests organized into 5 categories, each with ≥20 tests.
 * All JSON fixtures are stored in fixtures/unified/.
 *
 * Categories:
 * 1. Primitive Parser (≥20 tests) — type validation, _element merging, array alignment
 * 2. Choice Type Parser (≥20 tests) — extraction, registry, matching, batch operations
 * 3. StructureDefinition Parser (≥20 tests) — required/optional fields, sub-types, errors
 * 4. Serializer (≥20 tests) — property ordering, omission, sub-type serialization
 * 5. Round-Trip (≥20 tests) — parse→serialize→parse fidelity across all fixture categories
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  validatePrimitiveValue,
  getExpectedJsType,
  mergePrimitiveElement,
  mergePrimitiveArray,
  type PrimitiveWithMetadata,
} from '../primitive-parser.js';

import {
  extractChoiceValue,
  extractAllChoiceValues,
  getChoiceFieldBases,
  getChoiceFields,
  matchChoiceTypeProperty,
  CHOICE_TYPE_FIELDS,
  ALL_FHIR_TYPE_SUFFIXES,
  MIN_MAX_VALUE_TYPE_SUFFIXES,
  type ChoiceTypeField,
  type ChoiceValue,
} from '../choice-type-parser.js';

import {
  parseFhirJson,
  parseFhirObject,
} from '../json-parser.js';

import {
  parseStructureDefinition,
  parseElementDefinition,
} from '../structure-definition-parser.js';

import {
  serializeToFhirJson,
  serializeToFhirObject,
} from '../serializer.js';

import type { StructureDefinition } from '../../model/structure-definition.js';
import type { ElementDefinition } from '../../model/element-definition.js';
import type { Resource } from '../../model/primitives.js';

// =============================================================================
// Fixture Helpers
// =============================================================================

const UNIFIED_DIR = resolve(__dirname, 'fixtures', 'unified');
const SD_DIR = resolve(__dirname, 'fixtures', 'structure-definition');

function loadUnified(category: string, filename: string): string {
  return readFileSync(resolve(UNIFIED_DIR, category, filename), 'utf-8');
}

function loadUnifiedJson(category: string, filename: string): Record<string, unknown> {
  return JSON.parse(loadUnified(category, filename));
}

function loadSD(category: string, filename: string): string {
  return readFileSync(resolve(SD_DIR, category, filename), 'utf-8');
}

function parseSD(category: string, filename: string): StructureDefinition {
  const json = loadSD(category, filename);
  const result = parseFhirJson(json);
  expect(result.success).toBe(true);
  return result.data as StructureDefinition;
}

function parseUnifiedSD(category: string, filename: string): StructureDefinition {
  const json = loadUnified(category, filename);
  const result = parseFhirJson(json);
  expect(result.success).toBe(true);
  return result.data as StructureDefinition;
}

// =============================================================================
// Category 1: Primitive Parser (≥20 tests)
// =============================================================================

describe('Category 1: Primitive Parser', () => {
  // --- 1.1 getExpectedJsType mapping ---

  describe('getExpectedJsType', () => {
    it('maps boolean → "boolean"', () => {
      expect(getExpectedJsType('boolean')).toBe('boolean');
    });

    it('maps integer → "number"', () => {
      expect(getExpectedJsType('integer')).toBe('number');
    });

    it('maps positiveInt → "number"', () => {
      expect(getExpectedJsType('positiveInt')).toBe('number');
    });

    it('maps unsignedInt → "number"', () => {
      expect(getExpectedJsType('unsignedInt')).toBe('number');
    });

    it('maps decimal → "number"', () => {
      expect(getExpectedJsType('decimal')).toBe('number');
    });

    it('maps all 15 string-based types to "string"', () => {
      const stringTypes = [
        'string', 'uri', 'url', 'canonical', 'base64Binary',
        'instant', 'date', 'dateTime', 'time', 'code',
        'oid', 'id', 'markdown', 'uuid', 'xhtml',
      ];
      for (const t of stringTypes) {
        expect(getExpectedJsType(t)).toBe('string');
      }
    });

    it('defaults unknown types to "string"', () => {
      expect(getExpectedJsType('CustomType')).toBe('string');
    });
  });

  // --- 1.2 validatePrimitiveValue ---

  describe('validatePrimitiveValue', () => {
    it('accepts valid boolean true', () => {
      expect(validatePrimitiveValue(true, 'boolean', '$.active')).toBeNull();
    });

    it('accepts valid boolean false', () => {
      expect(validatePrimitiveValue(false, 'boolean', '$.active')).toBeNull();
    });

    it('rejects string "true" for boolean', () => {
      const issue = validatePrimitiveValue('true', 'boolean', '$.active');
      expect(issue).not.toBeNull();
      expect(issue!.code).toBe('INVALID_PRIMITIVE');
    });

    it('accepts integer 0', () => {
      expect(validatePrimitiveValue(0, 'integer', '$.min')).toBeNull();
    });

    it('accepts negative integer', () => {
      expect(validatePrimitiveValue(-42, 'integer', '$.offset')).toBeNull();
    });

    it('rejects decimal for integer type', () => {
      const issue = validatePrimitiveValue(3.14, 'integer', '$.count');
      expect(issue).not.toBeNull();
      expect(issue!.code).toBe('INVALID_PRIMITIVE');
    });

    it('rejects decimal for unsignedInt', () => {
      const issue = validatePrimitiveValue(1.5, 'unsignedInt', '$.min');
      expect(issue).not.toBeNull();
    });

    it('rejects decimal for positiveInt', () => {
      const issue = validatePrimitiveValue(2.7, 'positiveInt', '$.max');
      expect(issue).not.toBeNull();
    });

    it('accepts decimal value 3.14', () => {
      expect(validatePrimitiveValue(3.14, 'decimal', '$.value')).toBeNull();
    });

    it('accepts whole number for decimal type', () => {
      expect(validatePrimitiveValue(42, 'decimal', '$.value')).toBeNull();
    });

    it('accepts string for uri type', () => {
      expect(validatePrimitiveValue('http://example.org', 'uri', '$.url')).toBeNull();
    });

    it('accepts string for code type', () => {
      expect(validatePrimitiveValue('active', 'code', '$.status')).toBeNull();
    });

    it('accepts string for date type', () => {
      expect(validatePrimitiveValue('2026-02-10', 'date', '$.date')).toBeNull();
    });

    it('rejects number for string type', () => {
      const issue = validatePrimitiveValue(42, 'string', '$.name');
      expect(issue).not.toBeNull();
      expect(issue!.code).toBe('INVALID_PRIMITIVE');
    });

    it('includes correct path in error', () => {
      const issue = validatePrimitiveValue('wrong', 'boolean', 'Patient.active');
      expect(issue!.path).toBe('Patient.active');
    });
  });

  // --- 1.3 mergePrimitiveElement ---

  describe('mergePrimitiveElement', () => {
    it('returns value directly when no _element', () => {
      const { result, issues } = mergePrimitiveElement('2026-01-01', undefined, 'date', 'Patient.birthDate');
      expect(result).toBe('2026-01-01');
      expect(issues).toHaveLength(0);
    });

    it('merges value with _element.id', () => {
      const { result, issues } = mergePrimitiveElement('active', { id: 'status-id' }, 'code', 'Patient.status');
      expect(issues).toHaveLength(0);
      const merged = result as PrimitiveWithMetadata;
      expect(merged.value).toBe('active');
      expect(merged.id).toBe('status-id');
    });

    it('merges value with _element.extension', () => {
      const ext = [{ url: 'http://example.org/ext', valueString: 'test' }];
      const { result, issues } = mergePrimitiveElement('value', { extension: ext }, 'string', 'Patient.name');
      expect(issues).toHaveLength(0);
      const merged = result as PrimitiveWithMetadata;
      expect(merged.value).toBe('value');
      expect(merged.extension).toEqual(ext);
    });

    it('returns metadata-only when value is undefined', () => {
      const ext = [{ url: 'http://example.org/ext', valueString: 'inferred' }];
      const { result, issues } = mergePrimitiveElement(undefined, { extension: ext }, 'date', 'Patient.birthDate');
      expect(issues).toHaveLength(0);
      const merged = result as PrimitiveWithMetadata;
      expect(merged.value).toBeUndefined();
      expect(merged.extension).toEqual(ext);
    });

    it('returns undefined when both absent', () => {
      const { result, issues } = mergePrimitiveElement(undefined, undefined, 'string', 'Patient.name');
      expect(result).toBeUndefined();
      expect(issues).toHaveLength(0);
    });

    it('reports error for wrong JS type', () => {
      const { issues } = mergePrimitiveElement('not-a-boolean', undefined, 'boolean', 'Patient.active');
      expect(issues.some((i) => i.code === 'INVALID_PRIMITIVE')).toBe(true);
    });

    it('reports error when _element is not an object', () => {
      const { issues } = mergePrimitiveElement('value', 'not-object', 'string', 'Patient.name');
      expect(issues.some((i) => i.code === 'INVALID_STRUCTURE')).toBe(true);
    });
  });

  // --- 1.4 mergePrimitiveArray ---

  describe('mergePrimitiveArray', () => {
    it('returns values as-is when no _element array', () => {
      const { result, issues } = mergePrimitiveArray(['a', 'b', 'c'], undefined, 'code', 'Patient.code');
      expect(result).toEqual(['a', 'b', 'c']);
      expect(issues).toHaveLength(0);
    });

    it('merges arrays with null alignment', () => {
      const { result, issues } = mergePrimitiveArray(
        ['au', 'nz'],
        [null, { extension: [{ url: 'http://example.org', valueString: 'Kiwiland' }] }],
        'code', 'Patient.code',
      );
      expect(issues).toHaveLength(0);
      expect(result[0]).toBe('au');
      const second = result[1] as PrimitiveWithMetadata;
      expect(second.value).toBe('nz');
      expect(second.extension).toHaveLength(1);
    });

    it('handles null in value array with _element', () => {
      const { result, issues } = mergePrimitiveArray(
        [null, 'nz'],
        [{ extension: [{ url: 'http://example.org', valueString: 'Unknown' }] }, null],
        'code', 'Patient.code',
      );
      expect(issues).toHaveLength(0);
      const first = result[0] as PrimitiveWithMetadata;
      expect(first.value).toBeUndefined();
      expect(first.extension).toHaveLength(1);
      expect(result[1]).toBe('nz');
    });

    it('reports ARRAY_MISMATCH when lengths differ', () => {
      const { issues } = mergePrimitiveArray(
        ['au'],
        [null, { extension: [{ url: 'http://example.org' }] }],
        'code', 'Patient.code',
      );
      expect(issues.some((i) => i.code === 'ARRAY_MISMATCH')).toBe(true);
    });

    it('handles empty value array', () => {
      const { result, issues } = mergePrimitiveArray([], undefined, 'code', 'Patient.code');
      expect(result).toEqual([]);
      expect(issues).toHaveLength(0);
    });
  });

  // --- 1.5 Fixture-based primitive tests ---

  describe('fixture-based primitive parsing', () => {
    it('parses string primitives from fixture', () => {
      const sd = parseUnifiedSD('01-primitives', '01-string-values.json');
      expect(sd.id).toBe('string-values-test');
      expect(sd.title).toBe('String Values Test');
      expect(sd.description).toContain('string primitive');
      expect(sd.publisher).toBe('Example Publisher');
      expect(sd.purpose).toBe('Testing string primitives');
      expect(sd.copyright).toBe('CC0');
      expect(sd.fhirVersion).toBe('4.0.1');
    });

    it('parses boolean primitives from fixture', () => {
      const sd = parseUnifiedSD('01-primitives', '02-boolean-values.json');
      expect(sd.abstract).toBe(true);
      expect(sd.experimental).toBe(true);
    });

    it('parses integer primitives from fixture', () => {
      const sd = parseUnifiedSD('01-primitives', '03-integer-values.json');
      const el = sd.differential!.element[0];
      expect(el.min).toBe(0);
      expect(el.max).toBe('1');
    });

    it('parses _element extension on Patient resource', () => {
      const json = loadUnified('01-primitives', '04-primitive-with-element-extension.json');
      const result = parseFhirJson(json);
      expect(result.success).toBe(true);
    });

    it('parses primitive array with null alignment', () => {
      const json = loadUnified('01-primitives', '05-primitive-array-with-nulls.json');
      const result = parseFhirJson(json);
      expect(result.success).toBe(true);
    });

    it('correctly handles Chinese characters (UTF-8)', () => {
      // Test UTF-8 handling with StructureDefinition (Patient parser not yet implemented)
      const sd = parseUnifiedSD('01-primitives', '01-string-values.json');
      const obj = serializeToFhirObject(sd);
      const json = serializeToFhirJson(sd);

      // Verify Chinese characters in title/description are preserved
      expect(sd.title).toBe('String Values Test');
      expect(sd.description).toContain('string primitive');

      // Test round-trip with Chinese characters by modifying and re-parsing
      const chineseSD = {
        ...obj,
        title: '中文标题测试',
        description: '这是一个包含中文字符的描述：患者、医生、诊断',
        publisher: '北京医疗信息技术有限公司',
      };
      const chineseJson = JSON.stringify(chineseSD);
      const result = parseFhirJson(chineseJson);
      expect(result.success).toBe(true);
      const parsed = result.data as any;
      expect(parsed.title).toBe('中文标题测试');
      expect(parsed.description).toBe('这是一个包含中文字符的描述：患者、医生、诊断');
      expect(parsed.publisher).toBe('北京医疗信息技术有限公司');
    });
  });
});

// =============================================================================
// Category 2: Choice Type Parser (≥20 tests)
// =============================================================================

describe('Category 2: Choice Type Parser', () => {
  const extensionValueField: ChoiceTypeField = {
    baseName: 'value',
    allowedTypes: ['String', 'Boolean', 'Integer', 'Quantity', 'CodeableConcept'],
  };

  const minValueField: ChoiceTypeField = {
    baseName: 'minValue',
    allowedTypes: ['Date', 'DateTime', 'Integer', 'Decimal', 'Quantity'],
  };

  // --- 2.1 extractChoiceValue ---

  describe('extractChoiceValue', () => {
    it('extracts valueString', () => {
      const { result } = extractChoiceValue({ valueString: 'hello' }, extensionValueField, 'Extension');
      expect(result!.typeName).toBe('String');
      expect(result!.value).toBe('hello');
      expect(result!.propertyName).toBe('valueString');
    });

    it('extracts valueBoolean', () => {
      const { result } = extractChoiceValue({ valueBoolean: false }, extensionValueField, 'Extension');
      expect(result!.typeName).toBe('Boolean');
      expect(result!.value).toBe(false);
    });

    it('extracts valueInteger', () => {
      const { result } = extractChoiceValue({ valueInteger: 0 }, extensionValueField, 'Extension');
      expect(result!.typeName).toBe('Integer');
      expect(result!.value).toBe(0);
    });

    it('extracts valueQuantity (complex)', () => {
      const q = { value: 42, unit: 'kg' };
      const { result } = extractChoiceValue({ valueQuantity: q }, extensionValueField, 'Extension');
      expect(result!.typeName).toBe('Quantity');
      expect(result!.value).toEqual(q);
    });

    it('extracts valueCodeableConcept (complex)', () => {
      const cc = { coding: [{ system: 'http://example.org', code: 'test' }] };
      const { result } = extractChoiceValue({ valueCodeableConcept: cc }, extensionValueField, 'Extension');
      expect(result!.typeName).toBe('CodeableConcept');
      expect(result!.value).toEqual(cc);
    });

    it('returns null when no choice property present', () => {
      const { result, issues } = extractChoiceValue({ url: 'http://example.org' }, extensionValueField, 'Extension');
      expect(result).toBeNull();
      expect(issues).toHaveLength(0);
    });

    it('does not match base name alone', () => {
      const { result } = extractChoiceValue({ value: 'hello' }, extensionValueField, 'Extension');
      expect(result).toBeNull();
    });

    it('does not match lowercase suffix', () => {
      const { result } = extractChoiceValue({ valuestring: 'hello' }, extensionValueField, 'Extension');
      expect(result).toBeNull();
    });

    it('reports MULTIPLE_CHOICE_VALUES for multiple variants', () => {
      const { issues } = extractChoiceValue(
        { valueString: 'hello', valueBoolean: true },
        extensionValueField, 'Extension',
      );
      expect(issues.some((i) => i.code === 'MULTIPLE_CHOICE_VALUES')).toBe(true);
    });

    it('reports INVALID_CHOICE_TYPE for unknown suffix', () => {
      const { result, issues } = extractChoiceValue(
        { valueUnknownType: 'hello' },
        extensionValueField, 'Extension',
      );
      expect(result).toBeNull();
      expect(issues.some((i) => i.code === 'INVALID_CHOICE_TYPE')).toBe(true);
    });

    it('reports INVALID_CHOICE_TYPE for restricted field with wrong suffix', () => {
      const { issues } = extractChoiceValue(
        { minValueString: 'not-allowed' },
        minValueField, 'ElementDefinition',
      );
      expect(issues.some((i) => i.code === 'INVALID_CHOICE_TYPE')).toBe(true);
    });

    it('consumes _element companion', () => {
      const ext = { extension: [{ url: 'http://example.org/ext', valueBoolean: true }] };
      const { result, consumedKeys } = extractChoiceValue(
        { valueString: 'hello', _valueString: ext },
        extensionValueField, 'Extension',
      );
      expect(result!.elementExtension).toEqual(ext);
      expect(consumedKeys).toContain('_valueString');
    });

    it('handles null value in choice property', () => {
      const { result } = extractChoiceValue({ valueString: null }, extensionValueField, 'Extension');
      expect(result).not.toBeNull();
      expect(result!.value).toBeNull();
    });
  });

  // --- 2.2 extractAllChoiceValues ---

  describe('extractAllChoiceValues', () => {
    const edFields: readonly ChoiceTypeField[] = [
      { baseName: 'defaultValue', allowedTypes: ['String', 'Boolean', 'Integer'] },
      { baseName: 'fixed', allowedTypes: ['String', 'Boolean', 'Coding'] },
      { baseName: 'minValue', allowedTypes: ['Date', 'Integer'] },
    ];

    it('extracts multiple choice values from one object', () => {
      const { results } = extractAllChoiceValues(
        { defaultValueString: 'John', fixedCoding: { system: 'http://example.org', code: 'test' } },
        edFields, 'ElementDefinition',
      );
      expect(results.size).toBe(2);
      expect(results.get('defaultValue')!.typeName).toBe('String');
      expect(results.get('fixed')!.typeName).toBe('Coding');
    });

    it('returns empty when no choice values present', () => {
      const { results } = extractAllChoiceValues({ path: 'Patient.name' }, edFields, 'ElementDefinition');
      expect(results.size).toBe(0);
    });

    it('aggregates issues from multiple fields', () => {
      const { issues } = extractAllChoiceValues(
        { defaultValueString: 'a', defaultValueBoolean: true, minValueString: 'bad' },
        edFields, 'ElementDefinition',
      );
      expect(issues.some((i) => i.code === 'MULTIPLE_CHOICE_VALUES')).toBe(true);
      expect(issues.some((i) => i.code === 'INVALID_CHOICE_TYPE')).toBe(true);
    });
  });

  // --- 2.3 Registry and matching ---

  describe('registry and matching', () => {
    it('CHOICE_TYPE_FIELDS has 4 host types', () => {
      expect(CHOICE_TYPE_FIELDS.size).toBe(4);
    });

    it('ElementDefinition has 5 choice fields', () => {
      const fields = CHOICE_TYPE_FIELDS.get('ElementDefinition')!;
      expect(fields).toHaveLength(5);
    });

    it('Extension has 1 choice field (value)', () => {
      const fields = CHOICE_TYPE_FIELDS.get('Extension')!;
      expect(fields).toHaveLength(1);
      expect(fields[0].baseName).toBe('value');
    });

    it('matchChoiceTypeProperty matches fixedCode on ElementDefinition', () => {
      const match = matchChoiceTypeProperty('fixedCode', 'ElementDefinition');
      expect(match).not.toBeNull();
      expect(match!.field.baseName).toBe('fixed');
      expect(match!.suffix).toBe('Code');
    });

    it('matchChoiceTypeProperty returns null for non-choice property', () => {
      expect(matchChoiceTypeProperty('path', 'ElementDefinition')).toBeNull();
    });

    it('matchChoiceTypeProperty returns null for unknown host', () => {
      expect(matchChoiceTypeProperty('valueString', 'Patient')).toBeNull();
    });

    it('getChoiceFieldBases returns correct bases for ElementDefinition', () => {
      const bases = getChoiceFieldBases('ElementDefinition');
      expect(bases).toContain('defaultValue');
      expect(bases).toContain('fixed');
      expect(bases).toContain('pattern');
      expect(bases).toContain('minValue');
      expect(bases).toContain('maxValue');
    });

    it('MIN_MAX_VALUE_TYPE_SUFFIXES has 9 entries', () => {
      expect(MIN_MAX_VALUE_TYPE_SUFFIXES).toHaveLength(9);
    });
  });

  // --- 2.4 Fixture-based choice type tests ---

  describe('fixture-based choice type parsing', () => {
    it('parses all 5 choice fields on one element', () => {
      const sd = parseUnifiedSD('02-choice-types', '02-all-five-choice-fields.json');
      const el = sd.snapshot!.element[1];
      expect(el.defaultValue).toBeDefined();
      expect(el.fixed).toBeDefined();
      expect(el.pattern).toBeDefined();
      expect(el.minValue).toBeDefined();
      expect(el.maxValue).toBeDefined();
    });

    it('parses example value[x] with 5 different types', () => {
      const sd = parseUnifiedSD('02-choice-types', '03-example-value-choice.json');
      const el = sd.differential!.element[0];
      expect(el.example).toHaveLength(5);
      const types = el.example!.map((e) => (e.value as ChoiceValue).typeName);
      expect(types).toContain('Quantity');
      expect(types).toContain('String');
      expect(types).toContain('Boolean');
      expect(types).toContain('Integer');
      expect(types).toContain('CodeableConcept');
    });

    it('parses minValue/maxValue with all allowed types', () => {
      const sd = parseUnifiedSD('02-choice-types', '04-min-max-all-types.json');
      const elements = sd.differential!.element;
      // Integer
      expect((elements[0].minValue as ChoiceValue).typeName).toBe('Integer');
      expect((elements[0].maxValue as ChoiceValue).typeName).toBe('Integer');
      // Decimal
      expect((elements[1].minValue as ChoiceValue).typeName).toBe('Decimal');
      // Date
      expect((elements[2].minValue as ChoiceValue).typeName).toBe('Date');
      // DateTime
      expect((elements[3].minValue as ChoiceValue).typeName).toBe('DateTime');
      // Quantity
      expect((elements[4].minValue as ChoiceValue).typeName).toBe('Quantity');
    });
  });
});

// =============================================================================
// Category 3: StructureDefinition Parser (≥20 tests)
// =============================================================================

describe('Category 3: StructureDefinition Parser', () => {
  // --- 3.1 Required fields ---

  describe('required fields validation', () => {
    it('parses minimal valid SD', () => {
      const obj = {
        resourceType: 'StructureDefinition',
        url: 'http://example.org/test', name: 'Test',
        status: 'draft', kind: 'resource', abstract: false, type: 'Patient',
      };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(true);
    });

    it('fails when url is missing', () => {
      const cases = loadUnifiedJson('03-structure-definition', '05-error-cases.json');
      const obj = (cases as any).cases['missing-url'];
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
      expect(result.issues.some((i) => i.path.includes('url'))).toBe(true);
    });

    it('fails when name is missing', () => {
      const cases = loadUnifiedJson('03-structure-definition', '05-error-cases.json');
      const obj = (cases as any).cases['missing-name'];
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
    });

    it('fails when status is missing', () => {
      const cases = loadUnifiedJson('03-structure-definition', '05-error-cases.json');
      const obj = (cases as any).cases['missing-status'];
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
    });

    it('fails when kind is missing', () => {
      const cases = loadUnifiedJson('03-structure-definition', '05-error-cases.json');
      const obj = (cases as any).cases['missing-kind'];
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
    });

    it('fails when abstract is missing', () => {
      const cases = loadUnifiedJson('03-structure-definition', '05-error-cases.json');
      const obj = (cases as any).cases['missing-abstract'];
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
    });

    it('fails when type is missing', () => {
      const cases = loadUnifiedJson('03-structure-definition', '05-error-cases.json');
      const obj = (cases as any).cases['missing-type'];
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
    });

    it('warns about unknown properties', () => {
      const cases = loadUnifiedJson('03-structure-definition', '05-error-cases.json');
      const obj = (cases as any).cases['unknown-properties'];
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(true);
      expect(result.issues.some((i) => i.code === 'UNEXPECTED_PROPERTY')).toBe(true);
    });
  });

  // --- 3.2 All metadata fields ---

  describe('all metadata fields', () => {
    it('parses all metadata from fixture', () => {
      const sd = parseUnifiedSD('03-structure-definition', '01-all-metadata-fields.json');
      expect(sd.id).toBe('all-metadata');
      expect(sd.meta).toBeDefined();
      expect(sd.implicitRules).toBe('http://example.org/rules');
      expect(sd.language).toBe('en');
      expect(sd.version).toBe('3.1.0');
      expect(sd.title).toBe('All Metadata Fields Test');
      expect(sd.status).toBe('active');
      expect(sd.experimental).toBe(false);
      expect(sd.date).toBe('2026-02-10');
      expect(sd.publisher).toBe('MedXAI Test Suite');
      expect(sd.purpose).toContain('Comprehensive');
      expect(sd.copyright).toBe('CC-BY-4.0');
      expect(sd.fhirVersion).toBe('4.0.1');
    });

    it('parses multiple identifiers', () => {
      const sd = parseUnifiedSD('03-structure-definition', '01-all-metadata-fields.json');
      expect(sd.identifier).toHaveLength(2);
    });

    it('parses multiple contacts with multiple telecoms', () => {
      const sd = parseUnifiedSD('03-structure-definition', '01-all-metadata-fields.json');
      expect(sd.contact).toHaveLength(2);
    });

    it('parses multiple useContexts', () => {
      const sd = parseUnifiedSD('03-structure-definition', '01-all-metadata-fields.json');
      expect(sd.useContext).toHaveLength(2);
    });

    it('parses multiple jurisdictions', () => {
      const sd = parseUnifiedSD('03-structure-definition', '01-all-metadata-fields.json');
      expect(sd.jurisdiction).toHaveLength(2);
    });

    it('parses multiple keywords', () => {
      const sd = parseUnifiedSD('03-structure-definition', '01-all-metadata-fields.json');
      expect(sd.keyword).toHaveLength(2);
    });
  });

  // --- 3.3 Mapping and context ---

  describe('mapping and context', () => {
    it('parses SD-level mappings', () => {
      const sd = parseUnifiedSD('03-structure-definition', '02-mapping-and-context.json');
      expect(sd.mapping).toHaveLength(3);
      expect(sd.mapping![0].identity).toBe('rim');
      expect(sd.mapping![1].comment).toBe('Mapping to v2 segments');
    });

    it('parses context array', () => {
      const sd = parseUnifiedSD('03-structure-definition', '02-mapping-and-context.json');
      expect(sd.context).toHaveLength(3);
      expect(sd.context![0].type).toBe('element');
      expect(sd.context![0].expression).toBe('Patient');
      expect(sd.context![2].type).toBe('fhirpath');
    });

    it('parses contextInvariant', () => {
      const sd = parseUnifiedSD('03-structure-definition', '02-mapping-and-context.json');
      expect(sd.contextInvariant).toHaveLength(1);
    });
  });

  // --- 3.4 ElementDefinition all fields ---

  describe('ElementDefinition all fields', () => {
    it('parses all basic fields', () => {
      const sd = parseUnifiedSD('03-structure-definition', '03-all-element-fields.json');
      const el = sd.snapshot!.element[0];
      expect(el.id).toBe('Patient');
      expect(el.path).toBe('Patient');
      expect(el.short).toBe('Patient resource');
      expect(el.definition).toContain('Demographics');
      expect(el.comment).toBe('Root element');
      expect(el.requirements).toContain('Tracking');
      expect(el.min).toBe(0);
      expect(el.max).toBe('*');
      expect(el.mustSupport).toBe(false);
      expect(el.isModifier).toBe(false);
      expect(el.isSummary).toBe(false);
    });

    it('parses alias array', () => {
      const sd = parseUnifiedSD('03-structure-definition', '03-all-element-fields.json');
      const el = sd.snapshot!.element[0];
      expect(el.alias).toEqual(['Person', 'Individual']);
    });

    it('parses sliceName and label', () => {
      const sd = parseUnifiedSD('03-structure-definition', '03-all-element-fields.json');
      const el = sd.snapshot!.element[1];
      expect(el.sliceName).toBe('mrn');
      expect(el.label).toBe('Medical Record Number');
    });

    it('parses meaningWhenMissing and orderMeaning', () => {
      const sd = parseUnifiedSD('03-structure-definition', '03-all-element-fields.json');
      const el = sd.snapshot!.element[1];
      expect(el.meaningWhenMissing).toBe('No identifier available');
      expect(el.orderMeaning).toBe('Identifiers ordered by priority');
    });

    it('parses condition array', () => {
      const sd = parseUnifiedSD('03-structure-definition', '03-all-element-fields.json');
      const el = sd.snapshot!.element[1];
      expect(el.condition).toEqual(['pat-1']);
    });

    it('parses isModifier with reason', () => {
      const sd = parseUnifiedSD('03-structure-definition', '03-all-element-fields.json');
      const el = sd.snapshot!.element[3]; // deceased[x]
      expect(el.isModifier).toBe(true);
      expect(el.isModifierReason).toContain('modifier');
    });

    it('parses contentReference', () => {
      const sd = parseUnifiedSD('03-structure-definition', '03-all-element-fields.json');
      const el = sd.snapshot!.element[4]; // generalPractitioner
      expect(el.contentReference).toBe('#Patient.contact');
    });

    it('parses maxLength', () => {
      const sd = parseUnifiedSD('03-structure-definition', '03-all-element-fields.json');
      const el = sd.snapshot!.element[2]; // name
      expect(el.maxLength).toBe(500);
    });
  });

  // --- 3.5 Snapshot and differential ---

  describe('snapshot and differential', () => {
    it('parses both snapshot and differential', () => {
      const sd = parseUnifiedSD('03-structure-definition', '04-snapshot-and-differential.json');
      expect(sd.snapshot).toBeDefined();
      expect(sd.differential).toBeDefined();
      expect(sd.snapshot!.element).toHaveLength(4);
      expect(sd.differential!.element).toHaveLength(3);
    });

    it('snapshot elements have base info', () => {
      const sd = parseUnifiedSD('03-structure-definition', '04-snapshot-and-differential.json');
      const el = sd.snapshot!.element[1]; // status
      expect(el.base).toBeDefined();
      expect(el.base!.path).toBe('Observation.status');
    });

    it('differential elements have choice types', () => {
      const sd = parseUnifiedSD('03-structure-definition', '04-snapshot-and-differential.json');
      const el = sd.differential!.element[0]; // status with fixedCode
      expect(el.fixed).toBeDefined();
      expect((el.fixed as ChoiceValue).propertyName).toBe('fixedCode');
    });
  });
});

// =============================================================================
// Category 4: Serializer (≥20 tests)
// =============================================================================

describe('Category 4: Serializer', () => {
  // --- 4.1 Public API ---

  describe('public API', () => {
    it('serializeToFhirJson returns valid JSON', () => {
      const sd = parseUnifiedSD('04-serializer', '01-minimal-sd.json');
      const json = serializeToFhirJson(sd);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('serializeToFhirJson produces pretty-printed output', () => {
      const sd = parseUnifiedSD('04-serializer', '01-minimal-sd.json');
      const json = serializeToFhirJson(sd);
      expect(json).toContain('\n');
      expect(json).toContain('  ');
    });

    it('serializeToFhirObject returns object with resourceType first', () => {
      const sd = parseUnifiedSD('04-serializer', '01-minimal-sd.json');
      const obj = serializeToFhirObject(sd);
      expect(Object.keys(obj)[0]).toBe('resourceType');
    });

    it('serializes generic (non-SD) resource', () => {
      const resource: Resource = { resourceType: 'Patient', id: 'p1' as any };
      const obj = serializeToFhirObject(resource);
      expect(obj.resourceType).toBe('Patient');
      expect(obj.id).toBe('p1');
    });
  });

  // --- 4.2 Property ordering ---

  describe('property ordering', () => {
    it('resourceType is always first', () => {
      const sd = parseUnifiedSD('04-serializer', '02-full-sd-with-elements.json');
      const obj = serializeToFhirObject(sd);
      expect(Object.keys(obj)[0]).toBe('resourceType');
    });

    it('remaining properties are alphabetically sorted', () => {
      const sd = parseUnifiedSD('04-serializer', '02-full-sd-with-elements.json');
      const obj = serializeToFhirObject(sd);
      const keys = Object.keys(obj).slice(1);
      const sorted = [...keys].sort();
      expect(keys).toEqual(sorted);
    });
  });

  // --- 4.3 Value omission ---

  describe('value omission', () => {
    it('omits undefined values', () => {
      const sd = parseUnifiedSD('04-serializer', '01-minimal-sd.json');
      const obj = serializeToFhirObject(sd);
      expect(obj).not.toHaveProperty('id');
      expect(obj).not.toHaveProperty('meta');
      expect(obj).not.toHaveProperty('title');
      expect(obj).not.toHaveProperty('snapshot');
      expect(obj).not.toHaveProperty('differential');
    });

    it('preserves boolean false', () => {
      const sd = parseUnifiedSD('04-serializer', '01-minimal-sd.json');
      const obj = serializeToFhirObject(sd);
      expect(obj.abstract).toBe(false);
    });

    it('preserves number 0', () => {
      const sd = parseSD('05-choice-types', '05-multiple-choice-fields.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.snapshot as any).element;
      expect(elements[0].min).toBe(0);
    });

    it('omits undefined from generic resource', () => {
      const resource: Resource = { resourceType: 'Patient', id: undefined };
      const obj = serializeToFhirObject(resource);
      expect(obj).not.toHaveProperty('id');
    });
  });

  // --- 4.4 Sub-type serialization ---

  describe('sub-type serialization', () => {
    it('serializes SD-level mapping', () => {
      const sd = parseUnifiedSD('04-serializer', '02-full-sd-with-elements.json');
      const obj = serializeToFhirObject(sd);
      const mappings = obj.mapping as any[];
      expect(mappings).toHaveLength(2);
      expect(mappings[0].identity).toBe('rim');
      expect(mappings[1].comment).toBe('HL7 v2 mapping');
    });

    it('serializes slicing with discriminator', () => {
      const sd = parseSD('03-element-subtypes', '01-slicing-discriminator.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      expect(elements[0].slicing.discriminator).toEqual([{ type: 'value', path: 'system' }]);
      expect(elements[0].slicing.rules).toBe('open');
    });

    it('serializes base element info', () => {
      const sd = parseSD('03-element-subtypes', '02-base-and-type.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.snapshot as any).element;
      expect(elements[0].base).toEqual({ path: 'Resource', min: 0, max: '*' });
    });

    it('serializes type with targetProfile and aggregation', () => {
      const sd = parseSD('03-element-subtypes', '02-base-and-type.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.snapshot as any).element;
      const gpType = elements[2].type[0];
      expect(gpType.code).toBe('Reference');
      expect(gpType.targetProfile).toHaveLength(3);
      expect(gpType.aggregation).toEqual(['referenced', 'bundled']);
    });

    it('serializes constraint with all fields', () => {
      const sd = parseSD('03-element-subtypes', '03-constraints.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      const c = elements[0].constraint[0];
      expect(c.key).toBe('pat-1');
      expect(c.severity).toBe('error');
      expect(c.expression).toContain('name.exists()');
      expect(c.xpath).toContain('f:name');
      expect(c.source).toContain('Patient');
    });

    it('serializes binding', () => {
      const sd = parseSD('03-element-subtypes', '04-binding-and-example.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      expect(elements[0].binding.strength).toBe('required');
      expect(elements[0].binding.valueSet).toContain('observation-status');
    });

    it('serializes example with choice type value', () => {
      const sd = parseSD('03-element-subtypes', '04-binding-and-example.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      const examples = elements[4].example;
      expect(examples).toHaveLength(3);
      expect(examples[0].valueQuantity).toBeDefined();
      expect(examples[1].valueCodeableConcept).toBeDefined();
      expect(examples[2].valueString).toBe('Normal findings');
    });

    it('serializes ED-level mapping', () => {
      const sd = parseSD('03-element-subtypes', '05-mapping.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      expect(elements[0].mapping).toHaveLength(3);
      expect(elements[0].mapping[0].identity).toBe('v2');
      expect(elements[0].mapping[0].map).toBe('PID-3');
    });
  });

  // --- 4.5 Choice type restoration ---

  describe('choice type restoration', () => {
    it('restores fixedCode', () => {
      const sd = parseSD('05-choice-types', '01-fixed-types.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      expect(elements[0].fixedCode).toBe('final');
    });

    it('restores fixedUri', () => {
      const sd = parseSD('05-choice-types', '01-fixed-types.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      expect(elements[1].fixedUri).toContain('observation-category');
    });

    it('restores patternCodeableConcept', () => {
      const sd = parseSD('05-choice-types', '02-pattern-types.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      expect(elements[0].patternCodeableConcept).toBeDefined();
      expect(elements[0].patternCodeableConcept.coding[0].code).toBe('85354-9');
    });

    it('restores defaultValueBoolean', () => {
      const sd = parseSD('05-choice-types', '03-default-value-types.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.snapshot as any).element;
      expect(elements[1].defaultValueBoolean).toBe(false);
    });

    it('restores defaultValueInteger', () => {
      const sd = parseSD('05-choice-types', '03-default-value-types.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.snapshot as any).element;
      expect(elements[2].defaultValueInteger).toBe(256);
    });

    it('restores minValueQuantity and maxValueQuantity', () => {
      const sd = parseSD('05-choice-types', '04-min-max-value.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      expect(elements[0].minValueQuantity.value).toBe(0);
      expect(elements[0].maxValueQuantity.value).toBe(500);
    });

    it('restores minValueInteger and maxValueInteger', () => {
      const sd = parseSD('05-choice-types', '04-min-max-value.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      expect(elements[1].minValueInteger).toBe(20);
      expect(elements[1].maxValueInteger).toBe(300);
    });

    it('restores minValueDecimal and maxValueDecimal', () => {
      const sd = parseSD('05-choice-types', '04-min-max-value.json');
      const obj = serializeToFhirObject(sd);
      const elements = (obj.differential as any).element;
      expect(elements[2].minValueDecimal).toBe(30.0);
      expect(elements[2].maxValueDecimal).toBe(45.0);
    });
  });
});

// =============================================================================
// Category 5: Round-Trip (≥20 tests)
// =============================================================================

describe('Category 5: Round-Trip (parse → serialize → parse)', () => {
  /**
   * Helper: parse fixture, serialize, re-parse, compare key fields.
   */
  function roundTripSD(category: string, filename: string, fromUnified = false): {
    sd1: StructureDefinition;
    sd2: StructureDefinition;
    json: string;
  } {
    const sd1 = fromUnified ? parseUnifiedSD(category, filename) : parseSD(category, filename);
    const json = serializeToFhirJson(sd1);
    const result2 = parseFhirJson(json);
    expect(result2.success).toBe(true);
    const sd2 = result2.data as StructureDefinition;
    return { sd1, sd2, json };
  }

  // --- 5.1 Basic round-trip ---

  describe('basic round-trip', () => {
    it('round-trips minimal SD', () => {
      const { sd1, sd2 } = roundTripSD('04-serializer', '01-minimal-sd.json', true);
      expect(sd2.url).toBe(sd1.url);
      expect(sd2.name).toBe(sd1.name);
      expect(sd2.status).toBe(sd1.status);
      expect(sd2.kind).toBe(sd1.kind);
      expect(sd2.abstract).toBe(sd1.abstract);
      expect(sd2.type).toBe(sd1.type);
    });

    it('round-trips full metadata SD', () => {
      const { sd1, sd2 } = roundTripSD('03-structure-definition', '01-all-metadata-fields.json', true);
      expect(sd2.id).toBe(sd1.id);
      expect(sd2.version).toBe(sd1.version);
      expect(sd2.title).toBe(sd1.title);
      expect(sd2.experimental).toBe(sd1.experimental);
      expect(sd2.date).toBe(sd1.date);
      expect(sd2.publisher).toBe(sd1.publisher);
      expect(sd2.purpose).toBe(sd1.purpose);
      expect(sd2.copyright).toBe(sd1.copyright);
    });

    it('round-trip produces valid JSON', () => {
      const { json } = roundTripSD('04-serializer', '02-full-sd-with-elements.json', true);
      expect(() => JSON.parse(json)).not.toThrow();
    });

    it('round-trip JSON has resourceType first', () => {
      const { json } = roundTripSD('04-serializer', '01-minimal-sd.json', true);
      const parsed = JSON.parse(json);
      expect(Object.keys(parsed)[0]).toBe('resourceType');
    });
  });

  // --- 5.2 Element count preservation ---

  describe('element count preservation', () => {
    it('preserves snapshot element count', () => {
      const { sd1, sd2 } = roundTripSD('03-structure-definition', '03-all-element-fields.json', true);
      expect(sd2.snapshot!.element).toHaveLength(sd1.snapshot!.element.length);
    });

    it('preserves differential element count', () => {
      const { sd1, sd2 } = roundTripSD('03-structure-definition', '04-snapshot-and-differential.json', true);
      expect(sd2.differential!.element).toHaveLength(sd1.differential!.element.length);
    });

    it('preserves both snapshot and differential', () => {
      const { sd1, sd2 } = roundTripSD('03-structure-definition', '04-snapshot-and-differential.json', true);
      expect(sd2.snapshot).toBeDefined();
      expect(sd2.differential).toBeDefined();
    });
  });

  // --- 5.3 Choice type round-trip ---

  describe('choice type round-trip', () => {
    it('preserves fixed[x] choice type property names', () => {
      const { sd1, sd2 } = roundTripSD('05-choice-types', '01-fixed-types.json');
      const cv1 = sd1.differential!.element[0].fixed as ChoiceValue;
      const cv2 = sd2.differential!.element[0].fixed as ChoiceValue;
      expect(cv2.propertyName).toBe(cv1.propertyName);
      expect(cv2.typeName).toBe(cv1.typeName);
      expect(cv2.value).toBe(cv1.value);
    });

    it('preserves pattern[x] choice type', () => {
      const { sd1, sd2 } = roundTripSD('05-choice-types', '02-pattern-types.json');
      const cv1 = sd1.differential!.element[0].pattern as ChoiceValue;
      const cv2 = sd2.differential!.element[0].pattern as ChoiceValue;
      expect(cv2.propertyName).toBe(cv1.propertyName);
      expect(JSON.stringify(cv2.value)).toBe(JSON.stringify(cv1.value));
    });

    it('preserves defaultValue[x] choice type', () => {
      const { sd1, sd2 } = roundTripSD('05-choice-types', '03-default-value-types.json');
      const cv1 = sd1.snapshot!.element[1].defaultValue as ChoiceValue;
      const cv2 = sd2.snapshot!.element[1].defaultValue as ChoiceValue;
      expect(cv2.propertyName).toBe(cv1.propertyName);
      expect(cv2.value).toBe(cv1.value);
    });

    it('preserves minValue[x] and maxValue[x]', () => {
      const { sd1, sd2 } = roundTripSD('05-choice-types', '04-min-max-value.json');
      const min1 = sd1.differential!.element[0].minValue as ChoiceValue;
      const min2 = sd2.differential!.element[0].minValue as ChoiceValue;
      expect(min2.propertyName).toBe(min1.propertyName);
      expect(JSON.stringify(min2.value)).toBe(JSON.stringify(min1.value));
    });

    it('preserves multiple choice fields on same element', () => {
      const { sd1, sd2 } = roundTripSD('05-choice-types', '05-multiple-choice-fields.json');
      const el1 = sd1.snapshot!.element[1];
      const el2 = sd2.snapshot!.element[1];
      expect((el2.defaultValue as ChoiceValue).propertyName).toBe((el1.defaultValue as ChoiceValue).propertyName);
      expect((el2.fixed as ChoiceValue).propertyName).toBe((el1.fixed as ChoiceValue).propertyName);
      expect((el2.pattern as ChoiceValue).propertyName).toBe((el1.pattern as ChoiceValue).propertyName);
      expect((el2.minValue as ChoiceValue).propertyName).toBe((el1.minValue as ChoiceValue).propertyName);
      expect((el2.maxValue as ChoiceValue).propertyName).toBe((el1.maxValue as ChoiceValue).propertyName);
    });

    it('preserves example value[x] choice types', () => {
      const { sd1, sd2 } = roundTripSD('03-element-subtypes', '04-binding-and-example.json');
      const ex1 = sd1.differential!.element[4].example!;
      const ex2 = sd2.differential!.element[4].example!;
      expect(ex2).toHaveLength(ex1.length);
      for (let i = 0; i < ex1.length; i++) {
        expect((ex2[i].value as ChoiceValue).propertyName).toBe((ex1[i].value as ChoiceValue).propertyName);
      }
    });
  });

  // --- 5.4 Sub-type round-trip ---

  describe('sub-type round-trip', () => {
    it('preserves slicing details', () => {
      const { sd1, sd2 } = roundTripSD('03-element-subtypes', '01-slicing-discriminator.json');
      const s1 = sd1.differential!.element[0].slicing!;
      const s2 = sd2.differential!.element[0].slicing!;
      expect(s2.rules).toBe(s1.rules);
      expect(s2.discriminator).toHaveLength(s1.discriminator!.length);
      expect(s2.discriminator![0].type).toBe(s1.discriminator![0].type);
      expect(s2.discriminator![0].path).toBe(s1.discriminator![0].path);
    });

    it('preserves constraint details', () => {
      const { sd1, sd2 } = roundTripSD('03-element-subtypes', '03-constraints.json');
      const c1 = sd1.differential!.element[0].constraint!;
      const c2 = sd2.differential!.element[0].constraint!;
      expect(c2).toHaveLength(c1.length);
      expect(c2[0].key).toBe(c1[0].key);
      expect(c2[0].severity).toBe(c1[0].severity);
      expect(c2[0].human).toBe(c1[0].human);
    });

    it('preserves binding details', () => {
      const { sd1, sd2 } = roundTripSD('03-element-subtypes', '04-binding-and-example.json');
      const b1 = sd1.differential!.element[0].binding!;
      const b2 = sd2.differential!.element[0].binding!;
      expect(b2.strength).toBe(b1.strength);
      expect(b2.description).toBe(b1.description);
      expect(b2.valueSet).toBe(b1.valueSet);
    });

    it('preserves ED-level mapping details', () => {
      const { sd1, sd2 } = roundTripSD('03-element-subtypes', '05-mapping.json');
      const m1 = sd1.differential!.element[0].mapping!;
      const m2 = sd2.differential!.element[0].mapping!;
      expect(m2).toHaveLength(m1.length);
      expect(m2[0].identity).toBe(m1[0].identity);
      expect(m2[0].map).toBe(m1[0].map);
    });

    it('preserves SD-level mapping details', () => {
      const { sd1, sd2 } = roundTripSD('03-element-subtypes', '05-mapping.json');
      expect(sd2.mapping).toHaveLength(sd1.mapping!.length);
      expect(sd2.mapping![0].identity).toBe(sd1.mapping![0].identity);
      expect(sd2.mapping![0].uri).toBe(sd1.mapping![0].uri);
    });

    it('preserves type with profile', () => {
      const { sd1, sd2 } = roundTripSD('03-element-subtypes', '02-base-and-type.json');
      const t1 = sd1.snapshot!.element[4].type!;
      const t2 = sd2.snapshot!.element[4].type!;
      expect(t2[0].code).toBe(t1[0].code);
      expect(t2[0].profile).toEqual(t1[0].profile);
    });
  });

  // --- 5.5 Complex profile round-trip ---

  describe('complex profile round-trip', () => {
    it('round-trips complex profile from unified fixture', () => {
      const { sd1, sd2 } = roundTripSD('05-round-trip', '01-complex-profile.json', true);
      expect(sd2.url).toBe(sd1.url);
      expect(sd2.version).toBe(sd1.version);
      expect(sd2.title).toBe(sd1.title);
      expect(sd2.experimental).toBe(sd1.experimental);
    });

    it('preserves snapshot and differential element counts in complex profile', () => {
      const { sd1, sd2 } = roundTripSD('05-round-trip', '01-complex-profile.json', true);
      expect(sd2.snapshot!.element).toHaveLength(sd1.snapshot!.element.length);
      expect(sd2.differential!.element).toHaveLength(sd1.differential!.element.length);
    });

    it('preserves complex profile mapping', () => {
      const { sd1, sd2 } = roundTripSD('05-round-trip', '01-complex-profile.json', true);
      expect(sd2.mapping).toHaveLength(sd1.mapping!.length);
    });
  });

  // --- 5.6 Base resource round-trip ---

  describe('base resource round-trip', () => {
    const baseResources = [
      '01-patient.json', '02-observation.json', '03-condition.json',
      '04-encounter.json', '05-medication-request.json',
    ];

    for (const filename of baseResources) {
      it(`round-trips ${filename}`, () => {
        const { sd1, sd2 } = roundTripSD('06-base-resources', filename);
        expect(sd2.resourceType).toBe('StructureDefinition');
        expect(sd2.url).toBe(sd1.url);
        expect(sd2.name).toBe(sd1.name);
        expect(sd2.kind).toBe(sd1.kind);
        expect(sd2.type).toBe(sd1.type);
        if (sd1.snapshot) {
          expect(sd2.snapshot!.element).toHaveLength(sd1.snapshot.element.length);
        }
        if (sd1.differential) {
          expect(sd2.differential!.element).toHaveLength(sd1.differential.element.length);
        }
      });
    }
  });
});
