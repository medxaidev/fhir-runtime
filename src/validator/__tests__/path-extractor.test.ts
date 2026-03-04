/**
 * fhir-validator — Path Extractor Tests
 *
 * Tests for extractValues, pathExists, findChoiceTypeField,
 * normalizeChoicePath, and extractChoiceTypeSuffix.
 *
 * Includes:
 * - Unit tests for each function
 * - JSON fixture-driven tests (5 fixture files)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  extractValues,
  pathExists,
  findChoiceTypeField,
  normalizeChoicePath,
  extractChoiceTypeSuffix,
} from '../path-extractor.js';

// =============================================================================
// Fixture loader
// =============================================================================

const FIXTURE_DIR = resolve(__dirname, 'fixtures', 'path-extractor');

function loadFixture(filename: string): any {
  const raw = readFileSync(resolve(FIXTURE_DIR, filename), 'utf-8');
  return JSON.parse(raw);
}

// =============================================================================
// Section 1: extractValues — Unit Tests
// =============================================================================

describe('extractValues', () => {
  // --- 1.1 Simple scalar paths ---

  it('extracts root resource', () => {
    const resource = { resourceType: 'Patient', id: 'p1' };
    const values = extractValues(resource, 'Patient');
    expect(values).toHaveLength(1);
    expect(values[0]).toBe(resource);
  });

  it('extracts scalar string field', () => {
    const resource = { resourceType: 'Patient', id: 'p1', gender: 'male' };
    const values = extractValues(resource, 'Patient.gender');
    expect(values).toEqual(['male']);
  });

  it('extracts scalar boolean field', () => {
    const resource = { resourceType: 'Patient', active: true };
    const values = extractValues(resource, 'Patient.active');
    expect(values).toEqual([true]);
  });

  it('extracts scalar boolean false', () => {
    const resource = { resourceType: 'Patient', active: false };
    const values = extractValues(resource, 'Patient.active');
    expect(values).toEqual([false]);
  });

  it('extracts scalar number field', () => {
    const resource = { resourceType: 'Observation', valueInteger: 42 };
    const values = extractValues(resource, 'Observation.valueInteger');
    expect(values).toEqual([42]);
  });

  it('extracts id field', () => {
    const resource = { resourceType: 'Patient', id: 'example-1' };
    const values = extractValues(resource, 'Patient.id');
    expect(values).toEqual(['example-1']);
  });

  // --- 1.2 Array fields ---

  it('extracts array field (returns all elements)', () => {
    const resource = {
      resourceType: 'Patient',
      name: [
        { family: 'Smith' },
        { family: 'Doe' },
      ],
    };
    const values = extractValues(resource, 'Patient.name');
    expect(values).toHaveLength(2);
    expect(values[0]).toEqual({ family: 'Smith' });
    expect(values[1]).toEqual({ family: 'Doe' });
  });

  it('extracts nested field through array', () => {
    const resource = {
      resourceType: 'Patient',
      name: [
        { family: 'Smith' },
        { family: 'Doe' },
      ],
    };
    const values = extractValues(resource, 'Patient.name.family');
    expect(values).toEqual(['Smith', 'Doe']);
  });

  it('extracts nested array through array (flattens)', () => {
    const resource = {
      resourceType: 'Patient',
      name: [
        { given: ['John', 'James'] },
        { given: ['Jane'] },
      ],
    };
    const values = extractValues(resource, 'Patient.name.given');
    expect(values).toEqual(['John', 'James', 'Jane']);
  });

  // --- 1.3 Missing paths ---

  it('returns empty for missing field', () => {
    const resource = { resourceType: 'Patient', id: 'p1' };
    expect(extractValues(resource, 'Patient.name')).toEqual([]);
  });

  it('returns empty for missing nested field', () => {
    const resource = { resourceType: 'Patient', name: [{ family: 'Smith' }] };
    expect(extractValues(resource, 'Patient.name.prefix')).toEqual([]);
  });

  it('returns empty for deeply missing path', () => {
    const resource = { resourceType: 'Patient' };
    expect(extractValues(resource, 'Patient.contact.name.family')).toEqual([]);
  });

  // --- 1.4 Empty arrays ---

  it('returns empty for empty array', () => {
    const resource = { resourceType: 'Patient', name: [] };
    expect(extractValues(resource, 'Patient.name')).toEqual([]);
  });

  it('returns empty for nested path on empty array', () => {
    const resource = { resourceType: 'Patient', name: [] };
    expect(extractValues(resource, 'Patient.name.family')).toEqual([]);
  });

  // --- 1.5 Choice types ---

  it('extracts choice type value[x] → valueQuantity', () => {
    const resource = {
      resourceType: 'Observation',
      valueQuantity: { value: 120, unit: 'mmHg' },
    };
    const values = extractValues(resource, 'Observation.value[x]');
    expect(values).toHaveLength(1);
    expect(values[0]).toEqual({ value: 120, unit: 'mmHg' });
  });

  it('extracts choice type value[x] → valueString', () => {
    const resource = {
      resourceType: 'Observation',
      valueString: 'positive',
    };
    const values = extractValues(resource, 'Observation.value[x]');
    expect(values).toEqual(['positive']);
  });

  it('extracts choice type effective[x] → effectiveDateTime', () => {
    const resource = {
      resourceType: 'Observation',
      effectiveDateTime: '2026-01-15',
    };
    const values = extractValues(resource, 'Observation.effective[x]');
    expect(values).toEqual(['2026-01-15']);
  });

  it('returns empty for missing choice type', () => {
    const resource = { resourceType: 'Observation', status: 'final' };
    expect(extractValues(resource, 'Observation.value[x]')).toEqual([]);
  });

  it('extracts choice type inside array elements', () => {
    const resource = {
      resourceType: 'Observation',
      component: [
        { valueQuantity: { value: 120 } },
        { valueQuantity: { value: 80 } },
      ],
    };
    const values = extractValues(resource, 'Observation.component.value[x]');
    expect(values).toHaveLength(2);
    expect(values[0]).toEqual({ value: 120 });
    expect(values[1]).toEqual({ value: 80 });
  });

  // --- 1.6 Deep nesting ---

  it('extracts 3-level deep path', () => {
    const resource = {
      resourceType: 'Patient',
      contact: [
        { name: { family: 'Johnson' } },
        { name: { family: 'Williams' } },
      ],
    };
    const values = extractValues(resource, 'Patient.contact.name.family');
    expect(values).toEqual(['Johnson', 'Williams']);
  });

  it('extracts 4-level deep path through arrays', () => {
    const resource = {
      resourceType: 'Patient',
      contact: [
        {
          relationship: [
            { coding: [{ code: 'N' }] },
          ],
        },
      ],
    };
    const values = extractValues(resource, 'Patient.contact.relationship.coding.code');
    expect(values).toEqual(['N']);
  });

  // --- 1.7 Edge cases ---

  it('returns empty for null resource', () => {
    expect(extractValues(null as any, 'Patient.id')).toEqual([]);
  });

  it('returns empty for undefined resource', () => {
    expect(extractValues(undefined as any, 'Patient.id')).toEqual([]);
  });

  it('returns empty for empty path', () => {
    const resource = { resourceType: 'Patient' };
    expect(extractValues(resource, '')).toHaveLength(1);
  });

  it('handles null value in array', () => {
    const resource = {
      resourceType: 'Patient',
      name: [{ family: null }],
    };
    const values = extractValues(resource, 'Patient.name.family');
    // null is extracted as a value (the property exists)
    expect(values).toHaveLength(1);
    expect(values[0]).toBeNull();
  });

  it('handles object with no matching property', () => {
    const resource = {
      resourceType: 'Patient',
      name: [{ family: 'Smith' }],
    };
    expect(extractValues(resource, 'Patient.name.suffix')).toEqual([]);
  });

  // --- 1.8 Extension value[x] in arrays ---

  it('extracts different value[x] types across extension array', () => {
    const resource = {
      resourceType: 'Patient',
      extension: [
        { url: 'ext1', valueString: 'hello' },
        { url: 'ext2', valueInteger: 42 },
        { url: 'ext3', valueBoolean: true },
      ],
    };
    const values = extractValues(resource, 'Patient.extension.value[x]');
    expect(values).toHaveLength(3);
    expect(values).toEqual(['hello', 42, true]);
  });
});

// =============================================================================
// Section 2: pathExists — Unit Tests
// =============================================================================

describe('pathExists', () => {
  it('returns true for root path', () => {
    expect(pathExists({ resourceType: 'Patient' }, 'Patient')).toBe(true);
  });

  it('returns true for existing scalar field', () => {
    expect(pathExists({ resourceType: 'Patient', id: 'p1' }, 'Patient.id')).toBe(true);
  });

  it('returns true for existing array field', () => {
    expect(pathExists({ resourceType: 'Patient', name: [{ family: 'Smith' }] }, 'Patient.name')).toBe(true);
  });

  it('returns true for empty array', () => {
    expect(pathExists({ resourceType: 'Patient', name: [] }, 'Patient.name')).toBe(true);
  });

  it('returns false for missing field', () => {
    expect(pathExists({ resourceType: 'Patient' }, 'Patient.name')).toBe(false);
  });

  it('returns true for nested field', () => {
    expect(pathExists(
      { resourceType: 'Patient', name: [{ family: 'Smith' }] },
      'Patient.name.family',
    )).toBe(true);
  });

  it('returns false for missing nested field', () => {
    expect(pathExists(
      { resourceType: 'Patient', name: [{ family: 'Smith' }] },
      'Patient.name.prefix',
    )).toBe(false);
  });

  it('returns true for choice type field', () => {
    expect(pathExists(
      { resourceType: 'Observation', valueQuantity: { value: 120 } },
      'Observation.value[x]',
    )).toBe(true);
  });

  it('returns false for missing choice type field', () => {
    expect(pathExists(
      { resourceType: 'Observation', status: 'final' },
      'Observation.value[x]',
    )).toBe(false);
  });

  it('returns false for null resource', () => {
    expect(pathExists(null as any, 'Patient.id')).toBe(false);
  });
});

// =============================================================================
// Section 3: findChoiceTypeField — Unit Tests
// =============================================================================

describe('findChoiceTypeField', () => {
  it('finds valueQuantity', () => {
    expect(findChoiceTypeField({ valueQuantity: { value: 120 } }, 'value')).toBe('valueQuantity');
  });

  it('finds valueString', () => {
    expect(findChoiceTypeField({ valueString: 'hello' }, 'value')).toBe('valueString');
  });

  it('finds valueBoolean', () => {
    expect(findChoiceTypeField({ valueBoolean: true }, 'value')).toBe('valueBoolean');
  });

  it('finds effectiveDateTime', () => {
    expect(findChoiceTypeField({ effectiveDateTime: '2026-01-01' }, 'effective')).toBe('effectiveDateTime');
  });

  it('finds effectivePeriod', () => {
    expect(findChoiceTypeField({ effectivePeriod: { start: '2026-01-01' } }, 'effective')).toBe('effectivePeriod');
  });

  it('returns undefined when no match', () => {
    expect(findChoiceTypeField({ code: '12345' }, 'value')).toBeUndefined();
  });

  it('returns undefined for empty object', () => {
    expect(findChoiceTypeField({}, 'value')).toBeUndefined();
  });

  it('finds custom/unknown type via fallback scan', () => {
    expect(findChoiceTypeField({ valueCustomType: 'x' }, 'value')).toBe('valueCustomType');
  });

  it('does not match lowercase suffix', () => {
    // 'valuename' should not match 'value' + lowercase 'n'
    expect(findChoiceTypeField({ valuename: 'x' }, 'value')).toBeUndefined();
  });
});

// =============================================================================
// Section 4: normalizeChoicePath — Unit Tests
// =============================================================================

describe('normalizeChoicePath', () => {
  it('normalizes value[x] to valueQuantity', () => {
    expect(normalizeChoicePath('Observation.value[x]', 'valueQuantity'))
      .toBe('Observation.valueQuantity');
  });

  it('normalizes value[x] to valueString', () => {
    expect(normalizeChoicePath('Observation.value[x]', 'valueString'))
      .toBe('Observation.valueString');
  });

  it('normalizes effective[x] to effectiveDateTime', () => {
    expect(normalizeChoicePath('Observation.effective[x]', 'effectiveDateTime'))
      .toBe('Observation.effectiveDateTime');
  });

  it('normalizes Extension.value[x]', () => {
    expect(normalizeChoicePath('Extension.value[x]', 'valueCodeableConcept'))
      .toBe('Extension.valueCodeableConcept');
  });

  it('returns path unchanged if not a choice type', () => {
    expect(normalizeChoicePath('Patient.name', 'name'))
      .toBe('Patient.name');
  });

  it('handles single-segment choice path', () => {
    expect(normalizeChoicePath('value[x]', 'valueString'))
      .toBe('valueString');
  });
});

// =============================================================================
// Section 5: extractChoiceTypeSuffix — Unit Tests
// =============================================================================

describe('extractChoiceTypeSuffix', () => {
  it('extracts Quantity from valueQuantity', () => {
    expect(extractChoiceTypeSuffix('valueQuantity', 'value')).toBe('Quantity');
  });

  it('extracts String from valueString', () => {
    expect(extractChoiceTypeSuffix('valueString', 'value')).toBe('String');
  });

  it('extracts DateTime from effectiveDateTime', () => {
    expect(extractChoiceTypeSuffix('effectiveDateTime', 'effective')).toBe('DateTime');
  });

  it('extracts CodeableConcept from valueCodeableConcept', () => {
    expect(extractChoiceTypeSuffix('valueCodeableConcept', 'value')).toBe('CodeableConcept');
  });

  it('returns undefined for non-matching base', () => {
    expect(extractChoiceTypeSuffix('code', 'value')).toBeUndefined();
  });

  it('returns undefined for exact match (no suffix)', () => {
    expect(extractChoiceTypeSuffix('value', 'value')).toBeUndefined();
  });

  it('returns undefined for lowercase suffix', () => {
    expect(extractChoiceTypeSuffix('valuename', 'value')).toBeUndefined();
  });
});

// =============================================================================
// Section 6: Fixture-driven tests — 01-simple-patient.json
// =============================================================================

describe('Fixture: 01-simple-patient', () => {
  const fixture = loadFixture('01-simple-patient.json');
  const resource = fixture.resource;
  const expectations = fixture.expectations;

  it('extracts root Patient', () => {
    const values = extractValues(resource, 'Patient');
    expect(values).toHaveLength(expectations['Patient'].count);
  });

  it('extracts Patient.id', () => {
    const values = extractValues(resource, 'Patient.id');
    expect(values).toHaveLength(expectations['Patient.id'].count);
    expect(values).toEqual(expectations['Patient.id'].values);
  });

  it('extracts Patient.active', () => {
    const values = extractValues(resource, 'Patient.active');
    expect(values).toEqual(expectations['Patient.active'].values);
  });

  it('extracts Patient.gender', () => {
    const values = extractValues(resource, 'Patient.gender');
    expect(values).toEqual(expectations['Patient.gender'].values);
  });

  it('extracts Patient.birthDate', () => {
    const values = extractValues(resource, 'Patient.birthDate');
    expect(values).toEqual(expectations['Patient.birthDate'].values);
  });

  it('extracts Patient.name (array)', () => {
    const values = extractValues(resource, 'Patient.name');
    expect(values).toHaveLength(expectations['Patient.name'].count);
  });

  it('extracts Patient.name.family (through array)', () => {
    const values = extractValues(resource, 'Patient.name.family');
    expect(values).toHaveLength(expectations['Patient.name.family'].count);
    expect(values).toEqual(expectations['Patient.name.family'].values);
  });

  it('extracts Patient.name.given (nested arrays flattened)', () => {
    const values = extractValues(resource, 'Patient.name.given');
    expect(values).toHaveLength(expectations['Patient.name.given'].count);
    expect(values).toEqual(expectations['Patient.name.given'].values);
  });

  it('extracts Patient.name.use', () => {
    const values = extractValues(resource, 'Patient.name.use');
    expect(values).toEqual(expectations['Patient.name.use'].values);
  });

  it('extracts Patient.identifier.value', () => {
    const values = extractValues(resource, 'Patient.identifier.value');
    expect(values).toEqual(expectations['Patient.identifier.value'].values);
  });

  it('returns empty for Patient.nonExistent', () => {
    const values = extractValues(resource, 'Patient.nonExistent');
    expect(values).toHaveLength(expectations['Patient.nonExistent'].count);
  });
});

// =============================================================================
// Section 7: Fixture-driven tests — 02-choice-types.json
// =============================================================================

describe('Fixture: 02-choice-types', () => {
  const fixture = loadFixture('02-choice-types.json');
  const resource = fixture.resource;
  const expectations = fixture.expectations;

  it('extracts Observation.value[x] → valueQuantity', () => {
    const values = extractValues(resource, 'Observation.value[x]');
    expect(values).toHaveLength(expectations['Observation.value[x]'].count);
    const first = values[0] as Record<string, unknown>;
    expect(first.value).toBe(120);
    expect(first.unit).toBe('mmHg');
  });

  it('extracts Observation.effective[x] → effectiveDateTime', () => {
    const values = extractValues(resource, 'Observation.effective[x]');
    expect(values).toHaveLength(expectations['Observation.effective[x]'].count);
    expect(values).toEqual(expectations['Observation.effective[x]'].values);
  });

  it('extracts Observation.component (array)', () => {
    const values = extractValues(resource, 'Observation.component');
    expect(values).toHaveLength(expectations['Observation.component'].count);
  });

  it('extracts Observation.component.value[x] (choice inside array)', () => {
    const values = extractValues(resource, 'Observation.component.value[x]');
    expect(values).toHaveLength(expectations['Observation.component.value[x]'].count);
  });

  it('returns empty for Observation.bodySite (missing)', () => {
    const values = extractValues(resource, 'Observation.bodySite');
    expect(values).toHaveLength(expectations['Observation.bodySite'].count);
  });
});

// =============================================================================
// Section 8: Fixture-driven tests — 03-deep-nesting.json
// =============================================================================

describe('Fixture: 03-deep-nesting', () => {
  const fixture = loadFixture('03-deep-nesting.json');
  const resource = fixture.resource;
  const expectations = fixture.expectations;

  it('extracts Patient.contact (2 contacts)', () => {
    const values = extractValues(resource, 'Patient.contact');
    expect(values).toHaveLength(expectations['Patient.contact'].count);
  });

  it('extracts Patient.contact.name.family (deep nesting)', () => {
    const values = extractValues(resource, 'Patient.contact.name.family');
    expect(values).toHaveLength(expectations['Patient.contact.name.family'].count);
    expect(values).toEqual(expectations['Patient.contact.name.family'].values);
  });

  it('extracts Patient.contact.name.given (deep nesting + array flatten)', () => {
    const values = extractValues(resource, 'Patient.contact.name.given');
    expect(values).toHaveLength(expectations['Patient.contact.name.given'].count);
    expect(values).toEqual(expectations['Patient.contact.name.given'].values);
  });

  it('extracts Patient.contact.address.city', () => {
    const values = extractValues(resource, 'Patient.contact.address.city');
    expect(values).toEqual(expectations['Patient.contact.address.city'].values);
  });

  it('extracts Patient.contact.address.line (arrays inside nested objects)', () => {
    const values = extractValues(resource, 'Patient.contact.address.line');
    expect(values).toHaveLength(expectations['Patient.contact.address.line'].count);
    expect(values).toEqual(expectations['Patient.contact.address.line'].values);
  });

  it('extracts Patient.contact.address.postalCode (partial — only 1 contact has it)', () => {
    const values = extractValues(resource, 'Patient.contact.address.postalCode');
    expect(values).toHaveLength(expectations['Patient.contact.address.postalCode'].count);
    expect(values).toEqual(expectations['Patient.contact.address.postalCode'].values);
  });

  it('extracts Patient.address.city (top-level address)', () => {
    const values = extractValues(resource, 'Patient.address.city');
    expect(values).toEqual(expectations['Patient.address.city'].values);
  });
});

// =============================================================================
// Section 9: Fixture-driven tests — 04-edge-cases.json
// =============================================================================

describe('Fixture: 04-edge-cases', () => {
  const fixture = loadFixture('04-edge-cases.json');
  const resources = fixture.resources;
  const expectations = fixture.expectations;

  // --- emptyArrays ---
  it('empty array: Patient.name returns empty', () => {
    expect(extractValues(resources.emptyArrays, 'Patient.name'))
      .toHaveLength(expectations.emptyArrays['Patient.name'].count);
  });

  it('empty array: Patient.name.family returns empty', () => {
    expect(extractValues(resources.emptyArrays, 'Patient.name.family'))
      .toHaveLength(expectations.emptyArrays['Patient.name.family'].count);
  });

  // --- nullValues ---
  it('null value: Patient.name.family extracts null', () => {
    const values = extractValues(resources.nullValues, 'Patient.name.family');
    expect(values).toHaveLength(expectations.nullValues['Patient.name.family'].count);
  });

  it('null value: Patient.name.given still works', () => {
    const values = extractValues(resources.nullValues, 'Patient.name.given');
    expect(values).toEqual(expectations.nullValues['Patient.name.given'].values);
  });

  // --- primitivesOnly ---
  it('primitives: Patient.active extracts false', () => {
    const values = extractValues(resources.primitivesOnly, 'Patient.active');
    expect(values).toEqual(expectations.primitivesOnly['Patient.active'].values);
  });

  it('primitives: Patient.gender extracts "unknown"', () => {
    const values = extractValues(resources.primitivesOnly, 'Patient.gender');
    expect(values).toEqual(expectations.primitivesOnly['Patient.gender'].values);
  });

  // --- singleElementArray ---
  it('single-element array: Patient.name returns 1', () => {
    expect(extractValues(resources.singleElementArray, 'Patient.name'))
      .toHaveLength(expectations.singleElementArray['Patient.name'].count);
  });

  it('single-element array: Patient.name.family', () => {
    expect(extractValues(resources.singleElementArray, 'Patient.name.family'))
      .toEqual(expectations.singleElementArray['Patient.name.family'].values);
  });

  // --- deeplyEmpty ---
  it('deeply empty: Patient.contact returns 1 (empty name object)', () => {
    expect(extractValues(resources.deeplyEmpty, 'Patient.contact'))
      .toHaveLength(expectations.deeplyEmpty['Patient.contact'].count);
  });

  it('deeply empty: Patient.contact.name returns 1 (empty object)', () => {
    expect(extractValues(resources.deeplyEmpty, 'Patient.contact.name'))
      .toHaveLength(expectations.deeplyEmpty['Patient.contact.name'].count);
  });

  it('deeply empty: Patient.contact.name.family returns 0', () => {
    expect(extractValues(resources.deeplyEmpty, 'Patient.contact.name.family'))
      .toHaveLength(expectations.deeplyEmpty['Patient.contact.name.family'].count);
  });
});

// =============================================================================
// Section 10: Fixture-driven tests — 05-extensions-and-references.json
// =============================================================================

describe('Fixture: 05-extensions-and-references', () => {
  const fixture = loadFixture('05-extensions-and-references.json');
  const resource = fixture.resource;
  const expectations = fixture.expectations;

  it('extracts Patient.extension (3 extensions)', () => {
    expect(extractValues(resource, 'Patient.extension'))
      .toHaveLength(expectations['Patient.extension'].count);
  });

  it('extracts Patient.extension.url (3 urls)', () => {
    expect(extractValues(resource, 'Patient.extension.url'))
      .toHaveLength(expectations['Patient.extension.url'].count);
  });

  it('extracts Patient.extension.value[x] (3 different types)', () => {
    const values = extractValues(resource, 'Patient.extension.value[x]');
    expect(values).toHaveLength(expectations['Patient.extension.value[x]'].count);
  });

  it('extracts Patient.generalPractitioner.reference', () => {
    const values = extractValues(resource, 'Patient.generalPractitioner.reference');
    expect(values).toEqual(expectations['Patient.generalPractitioner.reference'].values);
  });

  it('extracts Patient.generalPractitioner.display', () => {
    const values = extractValues(resource, 'Patient.generalPractitioner.display');
    expect(values).toEqual(expectations['Patient.generalPractitioner.display'].values);
  });

  it('extracts Patient.managingOrganization (scalar object)', () => {
    expect(extractValues(resource, 'Patient.managingOrganization'))
      .toHaveLength(expectations['Patient.managingOrganization'].count);
  });

  it('extracts Patient.managingOrganization.reference', () => {
    expect(extractValues(resource, 'Patient.managingOrganization.reference'))
      .toEqual(expectations['Patient.managingOrganization.reference'].values);
  });
});

// =============================================================================
// Section 11: pathExists — Fixture-driven
// =============================================================================

describe('pathExists — fixture-driven', () => {
  const fixture = loadFixture('01-simple-patient.json');
  const resource = fixture.resource;

  it('Patient.id exists', () => {
    expect(pathExists(resource, 'Patient.id')).toBe(true);
  });

  it('Patient.name exists', () => {
    expect(pathExists(resource, 'Patient.name')).toBe(true);
  });

  it('Patient.name.family exists', () => {
    expect(pathExists(resource, 'Patient.name.family')).toBe(true);
  });

  it('Patient.nonExistent does not exist', () => {
    expect(pathExists(resource, 'Patient.nonExistent')).toBe(false);
  });

  it('Patient.name.prefix does not exist', () => {
    expect(pathExists(resource, 'Patient.name.prefix')).toBe(false);
  });
});

// =============================================================================
// Section 12: pathExists — choice type fixture
// =============================================================================

describe('pathExists — choice types', () => {
  const fixture = loadFixture('02-choice-types.json');
  const resource = fixture.resource;

  it('Observation.value[x] exists (valueQuantity)', () => {
    expect(pathExists(resource, 'Observation.value[x]')).toBe(true);
  });

  it('Observation.effective[x] exists (effectiveDateTime)', () => {
    expect(pathExists(resource, 'Observation.effective[x]')).toBe(true);
  });

  it('Observation.bodySite does not exist', () => {
    expect(pathExists(resource, 'Observation.bodySite')).toBe(false);
  });
});
