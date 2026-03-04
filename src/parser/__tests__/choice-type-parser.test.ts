/**
 * Tests for choice-type-parser.ts — Choice type [x] extraction and registry
 *
 * Covers:
 * - extractChoiceValue(): single match, no match, multiple matches, unknown suffix, _element companion
 * - extractAllChoiceValues(): batch extraction across multiple choice fields
 * - CHOICE_TYPE_FIELDS registry: coverage of all 8 choice fields across 4 host types
 * - getChoiceFieldBases(): base name lookup
 * - getChoiceFields(): field definition lookup
 * - matchChoiceTypeProperty(): property name matching
 * - ALL_FHIR_TYPE_SUFFIXES, MIN_MAX_VALUE_TYPE_SUFFIXES, USAGE_CONTEXT_VALUE_TYPE_SUFFIXES
 */

import { describe, it, expect } from 'vitest';

import {
  extractChoiceValue,
  extractAllChoiceValues,
  getChoiceFieldBases,
  getChoiceFields,
  matchChoiceTypeProperty,
  CHOICE_TYPE_FIELDS,
  ALL_FHIR_TYPE_SUFFIXES,
  MIN_MAX_VALUE_TYPE_SUFFIXES,
  USAGE_CONTEXT_VALUE_TYPE_SUFFIXES,
  type ChoiceTypeField,
  type ChoiceValue,
} from '../choice-type-parser.js';

// =============================================================================
// Helper
// =============================================================================

/** Shorthand for a simple Extension-like choice field */
const extensionValueField: ChoiceTypeField = {
  baseName: 'value',
  allowedTypes: ['String', 'Boolean', 'Integer', 'Quantity', 'CodeableConcept'],
};

/** Shorthand for minValue[x] restricted types */
const minValueField: ChoiceTypeField = {
  baseName: 'minValue',
  allowedTypes: ['Date', 'DateTime', 'Integer', 'Decimal', 'Quantity'],
};

// =============================================================================
// extractChoiceValue — single field extraction
// =============================================================================

describe('extractChoiceValue', () => {
  // --- Single match ---

  it('extracts a primitive choice type value', () => {
    const obj = { url: 'http://example.org', valueString: 'hello' };
    const { result, issues, consumedKeys } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).not.toBeNull();
    expect(result!.typeName).toBe('String');
    expect(result!.value).toBe('hello');
    expect(result!.propertyName).toBe('valueString');
    expect(result!.elementExtension).toBeUndefined();
    expect(issues).toHaveLength(0);
    expect(consumedKeys).toContain('valueString');
  });

  it('extracts a boolean choice type value', () => {
    const obj = { valueBoolean: true };
    const { result, issues } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).not.toBeNull();
    expect(result!.typeName).toBe('Boolean');
    expect(result!.value).toBe(true);
    expect(result!.propertyName).toBe('valueBoolean');
    expect(issues).toHaveLength(0);
  });

  it('extracts a complex choice type value', () => {
    const quantity = { value: 42, unit: 'kg' };
    const obj = { valueQuantity: quantity };
    const { result, issues } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).not.toBeNull();
    expect(result!.typeName).toBe('Quantity');
    expect(result!.value).toEqual(quantity);
    expect(result!.propertyName).toBe('valueQuantity');
    expect(issues).toHaveLength(0);
  });

  it('extracts an integer choice type value', () => {
    const obj = { valueInteger: 99 };
    const { result } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).not.toBeNull();
    expect(result!.typeName).toBe('Integer');
    expect(result!.value).toBe(99);
  });

  // --- No match ---

  it('returns null when no choice type property is present', () => {
    const obj = { url: 'http://example.org' };
    const { result, issues, consumedKeys } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).toBeNull();
    expect(issues).toHaveLength(0);
    expect(consumedKeys).toHaveLength(0);
  });

  it('does not match the base name alone', () => {
    const obj = { value: 'hello' };
    const { result } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).toBeNull();
  });

  it('does not match lowercase suffix', () => {
    const obj = { valuestring: 'hello' };
    const { result } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).toBeNull();
  });

  // --- Multiple matches ---

  it('reports MULTIPLE_CHOICE_VALUES when multiple variants present', () => {
    const obj = { valueString: 'hello', valueBoolean: true };
    const { result, issues, consumedKeys } = extractChoiceValue(obj, extensionValueField, 'Extension');

    // Should still return first match
    expect(result).not.toBeNull();

    // Should report error
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('MULTIPLE_CHOICE_VALUES');
    expect(issues[0].message).toContain('valueString');
    expect(issues[0].message).toContain('valueBoolean');

    // Both keys consumed
    expect(consumedKeys).toContain('valueString');
    expect(consumedKeys).toContain('valueBoolean');
  });

  // --- Unknown type suffix ---

  it('reports INVALID_CHOICE_TYPE for unknown suffix', () => {
    const obj = { valueUnknownType: 'hello' };
    const { result, issues, consumedKeys } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_CHOICE_TYPE');
    expect(issues[0].message).toContain('UnknownType');
    expect(issues[0].message).toContain('value[x]');

    // Key is still consumed (to prevent UNEXPECTED_PROPERTY warning)
    expect(consumedKeys).toContain('valueUnknownType');
  });

  it('reports INVALID_CHOICE_TYPE for restricted field with wrong suffix', () => {
    const obj = { minValueString: 'not-allowed' };
    const { result, issues } = extractChoiceValue(obj, minValueField, 'ElementDefinition');

    expect(result).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0].code).toBe('INVALID_CHOICE_TYPE');
    expect(issues[0].message).toContain('String');
    expect(issues[0].message).toContain('minValue[x]');
  });

  // --- _element companion ---

  it('consumes _element companion for choice type', () => {
    const ext = { extension: [{ url: 'http://example.org/ext', valueBoolean: true }] };
    const obj = { valueString: 'hello', _valueString: ext };
    const { result, issues, consumedKeys } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).not.toBeNull();
    expect(result!.elementExtension).toEqual(ext);
    expect(issues).toHaveLength(0);
    expect(consumedKeys).toContain('valueString');
    expect(consumedKeys).toContain('_valueString');
  });

  it('does not include elementExtension when _element is absent', () => {
    const obj = { valueString: 'hello' };
    const { result } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).not.toBeNull();
    expect(result!.elementExtension).toBeUndefined();
  });

  // --- Edge cases ---

  it('handles null value in choice type property', () => {
    const obj = { valueString: null };
    const { result } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).not.toBeNull();
    expect(result!.value).toBeNull();
  });

  it('handles numeric suffix that starts with uppercase (digit is not uppercase)', () => {
    // Digits are neither uppercase nor lowercase, so suffix "123" should NOT match
    const obj = { value123: 'test' };
    const { result } = extractChoiceValue(obj, extensionValueField, 'Extension');

    expect(result).toBeNull();
  });

  it('does not match properties from other fields', () => {
    // "defaultValueString" should NOT match a field with baseName "value"
    const obj = { defaultValueString: 'hello' };
    const { result } = extractChoiceValue(obj, extensionValueField, 'Extension');

    // "defaultValueString" does not start with "value" + uppercase suffix
    // It starts with "value" but the next char is not uppercase... wait, no:
    // baseName = "value", key = "defaultValueString" → does NOT start with "value"
    // Actually "defaultValueString" does NOT start with "value" — it starts with "default"
    expect(result).toBeNull();
  });
});

// =============================================================================
// extractAllChoiceValues — batch extraction
// =============================================================================

describe('extractAllChoiceValues', () => {
  const elementDefFields: readonly ChoiceTypeField[] = [
    { baseName: 'defaultValue', allowedTypes: ['String', 'Boolean', 'Integer'] },
    { baseName: 'fixed', allowedTypes: ['String', 'Boolean', 'Coding'] },
    { baseName: 'minValue', allowedTypes: ['Date', 'Integer'] },
  ];

  it('extracts multiple choice values from one object', () => {
    const obj = {
      path: 'Patient.name',
      defaultValueString: 'John',
      fixedCoding: { system: 'http://example.org', code: 'test' },
    };

    const { results, issues, consumedKeys } = extractAllChoiceValues(obj, elementDefFields, 'ElementDefinition');

    expect(results.size).toBe(2);
    expect(results.get('defaultValue')!.typeName).toBe('String');
    expect(results.get('defaultValue')!.value).toBe('John');
    expect(results.get('fixed')!.typeName).toBe('Coding');
    expect(results.has('minValue')).toBe(false);
    expect(issues).toHaveLength(0);
    expect(consumedKeys).toContain('defaultValueString');
    expect(consumedKeys).toContain('fixedCoding');
  });

  it('returns empty results when no choice values present', () => {
    const obj = { path: 'Patient.name' };
    const { results, issues, consumedKeys } = extractAllChoiceValues(obj, elementDefFields, 'ElementDefinition');

    expect(results.size).toBe(0);
    expect(issues).toHaveLength(0);
    expect(consumedKeys).toHaveLength(0);
  });

  it('aggregates issues from multiple fields', () => {
    const obj = {
      defaultValueString: 'a',
      defaultValueBoolean: true,
      minValueString: 'not-allowed',
    };

    const { issues } = extractAllChoiceValues(obj, elementDefFields, 'ElementDefinition');

    // MULTIPLE_CHOICE_VALUES for defaultValue + INVALID_CHOICE_TYPE for minValueString
    expect(issues.some((i) => i.code === 'MULTIPLE_CHOICE_VALUES')).toBe(true);
    expect(issues.some((i) => i.code === 'INVALID_CHOICE_TYPE')).toBe(true);
  });
});

// =============================================================================
// CHOICE_TYPE_FIELDS registry
// =============================================================================

describe('CHOICE_TYPE_FIELDS registry', () => {
  it('has entries for Extension', () => {
    const fields = CHOICE_TYPE_FIELDS.get('Extension');
    expect(fields).toBeDefined();
    expect(fields!.length).toBe(1);
    expect(fields![0].baseName).toBe('value');
  });

  it('has entries for UsageContext', () => {
    const fields = CHOICE_TYPE_FIELDS.get('UsageContext');
    expect(fields).toBeDefined();
    expect(fields!.length).toBe(1);
    expect(fields![0].baseName).toBe('value');
    expect(fields![0].allowedTypes).toEqual(USAGE_CONTEXT_VALUE_TYPE_SUFFIXES);
  });

  it('has 5 entries for ElementDefinition', () => {
    const fields = CHOICE_TYPE_FIELDS.get('ElementDefinition');
    expect(fields).toBeDefined();
    expect(fields!.length).toBe(5);

    const baseNames = fields!.map((f) => f.baseName);
    expect(baseNames).toContain('defaultValue');
    expect(baseNames).toContain('fixed');
    expect(baseNames).toContain('pattern');
    expect(baseNames).toContain('minValue');
    expect(baseNames).toContain('maxValue');
  });

  it('has entries for ElementDefinitionExample', () => {
    const fields = CHOICE_TYPE_FIELDS.get('ElementDefinitionExample');
    expect(fields).toBeDefined();
    expect(fields!.length).toBe(1);
    expect(fields![0].baseName).toBe('value');
  });

  it('covers exactly 4 host types', () => {
    expect(CHOICE_TYPE_FIELDS.size).toBe(4);
  });

  it('covers exactly 8 choice fields total', () => {
    let total = 0;
    Array.from(CHOICE_TYPE_FIELDS.entries()).forEach(([, fields]) => {
      total += fields.length;
    });
    expect(total).toBe(8);
  });

  it('uses restricted types for minValue and maxValue', () => {
    const fields = CHOICE_TYPE_FIELDS.get('ElementDefinition')!;
    const minValue = fields.find((f) => f.baseName === 'minValue')!;
    const maxValue = fields.find((f) => f.baseName === 'maxValue')!;

    expect(minValue.allowedTypes).toEqual(MIN_MAX_VALUE_TYPE_SUFFIXES);
    expect(maxValue.allowedTypes).toEqual(MIN_MAX_VALUE_TYPE_SUFFIXES);
  });

  it('uses ALL_FHIR_TYPE_SUFFIXES for Extension.value', () => {
    const fields = CHOICE_TYPE_FIELDS.get('Extension')!;
    expect(fields[0].allowedTypes).toBe(ALL_FHIR_TYPE_SUFFIXES);
  });
});

// =============================================================================
// Type suffix constants
// =============================================================================

describe('type suffix constants', () => {
  it('ALL_FHIR_TYPE_SUFFIXES contains all 20 primitive types', () => {
    const primitives = [
      'Boolean', 'Integer', 'Decimal', 'String', 'Uri', 'Url',
      'Canonical', 'Base64Binary', 'Instant', 'Date', 'DateTime',
      'Time', 'Code', 'Oid', 'Id', 'Markdown', 'UnsignedInt',
      'PositiveInt', 'Uuid',
    ];
    for (const p of primitives) {
      expect(ALL_FHIR_TYPE_SUFFIXES).toContain(p);
    }
  });

  it('ALL_FHIR_TYPE_SUFFIXES contains common complex types', () => {
    const complexTypes = [
      'Quantity', 'CodeableConcept', 'Coding', 'Reference',
      'Period', 'Identifier', 'HumanName', 'Address',
    ];
    for (const t of complexTypes) {
      expect(ALL_FHIR_TYPE_SUFFIXES).toContain(t);
    }
  });

  it('MIN_MAX_VALUE_TYPE_SUFFIXES has 9 entries', () => {
    expect(MIN_MAX_VALUE_TYPE_SUFFIXES).toHaveLength(9);
  });

  it('USAGE_CONTEXT_VALUE_TYPE_SUFFIXES has 4 entries', () => {
    expect(USAGE_CONTEXT_VALUE_TYPE_SUFFIXES).toHaveLength(4);
  });

  it('all suffixes start with uppercase', () => {
    for (const suffix of ALL_FHIR_TYPE_SUFFIXES) {
      expect(suffix[0]).toBe(suffix[0].toUpperCase());
      expect(suffix[0]).not.toBe(suffix[0].toLowerCase());
    }
  });
});

// =============================================================================
// getChoiceFieldBases
// =============================================================================

describe('getChoiceFieldBases', () => {
  it('returns base names for Extension', () => {
    expect(getChoiceFieldBases('Extension')).toEqual(['value']);
  });

  it('returns base names for ElementDefinition', () => {
    const bases = getChoiceFieldBases('ElementDefinition');
    expect(bases).toEqual(['defaultValue', 'fixed', 'pattern', 'minValue', 'maxValue']);
  });

  it('returns empty array for unknown type', () => {
    expect(getChoiceFieldBases('Patient')).toEqual([]);
  });
});

// =============================================================================
// getChoiceFields
// =============================================================================

describe('getChoiceFields', () => {
  it('returns field definitions for Extension', () => {
    const fields = getChoiceFields('Extension');
    expect(fields).toHaveLength(1);
    expect(fields[0].baseName).toBe('value');
  });

  it('returns empty array for unknown type', () => {
    expect(getChoiceFields('UnknownType')).toEqual([]);
  });
});

// =============================================================================
// matchChoiceTypeProperty
// =============================================================================

describe('matchChoiceTypeProperty', () => {
  it('matches valueString on Extension', () => {
    const match = matchChoiceTypeProperty('valueString', 'Extension');
    expect(match).not.toBeNull();
    expect(match!.field.baseName).toBe('value');
    expect(match!.suffix).toBe('String');
  });

  it('matches fixedCoding on ElementDefinition', () => {
    const match = matchChoiceTypeProperty('fixedCoding', 'ElementDefinition');
    expect(match).not.toBeNull();
    expect(match!.field.baseName).toBe('fixed');
    expect(match!.suffix).toBe('Coding');
  });

  it('matches minValueDate on ElementDefinition', () => {
    const match = matchChoiceTypeProperty('minValueDate', 'ElementDefinition');
    expect(match).not.toBeNull();
    expect(match!.field.baseName).toBe('minValue');
    expect(match!.suffix).toBe('Date');
  });

  it('returns null for non-choice property', () => {
    expect(matchChoiceTypeProperty('path', 'ElementDefinition')).toBeNull();
  });

  it('returns null for unknown host type', () => {
    expect(matchChoiceTypeProperty('valueString', 'Patient')).toBeNull();
  });

  it('returns null for base name without suffix', () => {
    expect(matchChoiceTypeProperty('value', 'Extension')).toBeNull();
  });

  it('returns null for lowercase suffix', () => {
    expect(matchChoiceTypeProperty('valuestring', 'Extension')).toBeNull();
  });
});
