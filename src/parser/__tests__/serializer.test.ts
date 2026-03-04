/**
 * Comprehensive tests for the FHIR JSON Serializer (Task 2.6)
 *
 * Tests cover:
 * 1. Public API (serializeToFhirJson, serializeToFhirObject)
 * 2. StructureDefinition serialization (all fields)
 * 3. ElementDefinition serialization (all sub-types)
 * 4. Choice type restoration (defaultValue[x], fixed[x], pattern[x], minValue[x], maxValue[x])
 * 5. Example value[x] choice type restoration
 * 6. Round-trip: parse → serialize → parse equivalence
 * 7. Edge cases (empty arrays, undefined values, generic resources)
 */

import { describe, it, expect } from 'vitest';
import { parseFhirJson } from '../json-parser.js';
import { serializeToFhirJson, serializeToFhirObject } from '../serializer.js';
import type { StructureDefinition } from '../../model/structure-definition.js';
import type { Resource } from '../../model/primitives.js';
import type { ChoiceValue } from '../choice-type-parser.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

// =============================================================================
// Helpers
// =============================================================================

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures', 'structure-definition');

function loadFixture(category: string, filename: string): string {
  return fs.readFileSync(path.join(FIXTURES_DIR, category, filename), 'utf-8');
}

function parseFixture(category: string, filename: string): StructureDefinition {
  const json = loadFixture(category, filename);
  const result = parseFhirJson(json);
  expect(result.success).toBe(true);
  return result.data as StructureDefinition;
}

// =============================================================================
// Section 1: Public API
// =============================================================================

describe('serializeToFhirJson', () => {
  it('returns a valid JSON string', () => {
    const sd = parseFixture('01-complete-sd', '01-minimal-valid.json');
    const json = serializeToFhirJson(sd);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('produces pretty-printed output with 2-space indent', () => {
    const sd = parseFixture('01-complete-sd', '01-minimal-valid.json');
    const json = serializeToFhirJson(sd);
    // Should contain newlines and indentation
    expect(json).toContain('\n');
    expect(json).toContain('  "resourceType"');
  });
});

describe('serializeToFhirObject', () => {
  it('returns a plain object with resourceType first', () => {
    const sd = parseFixture('01-complete-sd', '01-minimal-valid.json');
    const obj = serializeToFhirObject(sd);
    const keys = Object.keys(obj);
    expect(keys[0]).toBe('resourceType');
    expect(obj.resourceType).toBe('StructureDefinition');
  });

  it('serializes generic resources', () => {
    const resource: Resource = {
      resourceType: 'Patient',
      id: 'test-123' as Resource['id'],
    };
    const obj = serializeToFhirObject(resource);
    expect(obj.resourceType).toBe('Patient');
    expect(obj.id).toBe('test-123');
    expect(Object.keys(obj)[0]).toBe('resourceType');
  });

  it('omits undefined values from generic resources', () => {
    const resource: Resource = {
      resourceType: 'Patient',
      id: undefined,
    };
    const obj = serializeToFhirObject(resource);
    expect(obj).not.toHaveProperty('id');
  });
});

// =============================================================================
// Section 2: Minimal StructureDefinition
// =============================================================================

describe('minimal StructureDefinition serialization', () => {
  it('serializes all required fields', () => {
    const sd = parseFixture('01-complete-sd', '01-minimal-valid.json');
    const obj = serializeToFhirObject(sd);

    expect(obj.resourceType).toBe('StructureDefinition');
    expect(obj.url).toBe('http://example.org/fhir/StructureDefinition/MinimalValid');
    expect(obj.name).toBe('MinimalValid');
    expect(obj.status).toBe('draft');
    expect(obj.kind).toBe('resource');
    expect(obj.abstract).toBe(false);
    expect(obj.type).toBe('Patient');
  });

  it('omits optional fields that are not present', () => {
    const sd = parseFixture('01-complete-sd', '01-minimal-valid.json');
    const obj = serializeToFhirObject(sd);

    expect(obj).not.toHaveProperty('id');
    expect(obj).not.toHaveProperty('meta');
    expect(obj).not.toHaveProperty('title');
    expect(obj).not.toHaveProperty('version');
    expect(obj).not.toHaveProperty('experimental');
    expect(obj).not.toHaveProperty('date');
    expect(obj).not.toHaveProperty('publisher');
    expect(obj).not.toHaveProperty('contact');
    expect(obj).not.toHaveProperty('description');
    expect(obj).not.toHaveProperty('snapshot');
    expect(obj).not.toHaveProperty('differential');
  });
});

// =============================================================================
// Section 3: Full Metadata StructureDefinition
// =============================================================================

describe('full metadata StructureDefinition serialization', () => {
  it('serializes all metadata fields', () => {
    const sd = parseFixture('01-complete-sd', '02-full-metadata.json');
    const obj = serializeToFhirObject(sd);

    expect(obj.id).toBe('full-metadata-sd');
    expect(obj.meta).toEqual({
      versionId: '1',
      lastUpdated: '2026-01-15T10:00:00Z',
    });
    expect(obj.url).toBe('http://example.org/fhir/StructureDefinition/FullMetadata');
    expect(obj.version).toBe('2.0.0');
    expect(obj.name).toBe('FullMetadata');
    expect(obj.title).toBe('Full Metadata StructureDefinition');
    expect(obj.status).toBe('active');
    expect(obj.experimental).toBe(true);
    expect(obj.date).toBe('2026-01-15');
    expect(obj.publisher).toBe('Example Organization');
    expect(obj.purpose).toBe('Testing all metadata fields in StructureDefinition parsing.');
    expect(obj.copyright).toBe('CC0-1.0');
    expect(obj.fhirVersion).toBe('4.0.1');
    expect(obj.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(obj.derivation).toBe('constraint');
  });

  it('serializes identifier array', () => {
    const sd = parseFixture('01-complete-sd', '02-full-metadata.json');
    const obj = serializeToFhirObject(sd);
    expect(obj.identifier).toEqual([
      { system: 'urn:ietf:rfc:3986', value: 'urn:oid:2.16.840.1.113883.4.642.4.1234' },
    ]);
  });

  it('serializes contact array', () => {
    const sd = parseFixture('01-complete-sd', '02-full-metadata.json');
    const obj = serializeToFhirObject(sd);
    expect(obj.contact).toEqual([
      {
        name: 'Test Contact',
        telecom: [{ system: 'email', value: 'test@example.org' }],
      },
    ]);
  });

  it('serializes jurisdiction array', () => {
    const sd = parseFixture('01-complete-sd', '02-full-metadata.json');
    const obj = serializeToFhirObject(sd);
    expect(obj.jurisdiction).toEqual([
      { coding: [{ system: 'urn:iso:std:iso:3166', code: 'US' }] },
    ]);
  });

  it('serializes keyword array', () => {
    const sd = parseFixture('01-complete-sd', '02-full-metadata.json');
    const obj = serializeToFhirObject(sd);
    expect(obj.keyword).toEqual([
      { system: 'http://example.org/tags', code: 'test' },
    ]);
  });
});

// =============================================================================
// Section 4: ElementDefinition Sub-Types
// =============================================================================

describe('slicing and discriminator serialization', () => {
  it('serializes slicing with discriminators', () => {
    const sd = parseFixture('03-element-subtypes', '01-slicing-discriminator.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];

    // First element has slicing
    const identifierEl = elements[0];
    expect(identifierEl.slicing).toEqual({
      discriminator: [{ type: 'value', path: 'system' }],
      description: 'Slice identifiers by system',
      ordered: false,
      rules: 'open',
    });
  });

  it('serializes sliceName on slice elements', () => {
    const sd = parseFixture('03-element-subtypes', '01-slicing-discriminator.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];

    const mrnSlice = elements[1];
    expect(mrnSlice.sliceName).toBe('mrn');
    expect(mrnSlice.min).toBe(1);
    expect(mrnSlice.max).toBe('1');
  });

  it('serializes multiple discriminators', () => {
    const sd = parseFixture('03-element-subtypes', '01-slicing-discriminator.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];

    const telecomEl = elements[3];
    const slicing = telecomEl.slicing as Record<string, unknown>;
    expect(slicing.discriminator).toEqual([
      { type: 'value', path: 'system' },
      { type: 'value', path: 'use' },
    ]);
    expect(slicing.ordered).toBe(true);
    expect(slicing.rules).toBe('closed');
  });
});

describe('base and type serialization', () => {
  it('serializes base element info', () => {
    const sd = parseFixture('03-element-subtypes', '02-base-and-type.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.snapshot as Record<string, unknown>).element as Record<string, unknown>[];

    const patientEl = elements[0];
    expect(patientEl.base).toEqual({ path: 'Resource', min: 0, max: '*' });
  });

  it('serializes type with targetProfile and aggregation', () => {
    const sd = parseFixture('03-element-subtypes', '02-base-and-type.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.snapshot as Record<string, unknown>).element as Record<string, unknown>[];

    const gpEl = elements[2];
    const types = gpEl.type as Record<string, unknown>[];
    expect(types[0].code).toBe('Reference');
    expect(types[0].targetProfile).toEqual([
      'http://hl7.org/fhir/StructureDefinition/Organization',
      'http://hl7.org/fhir/StructureDefinition/Practitioner',
      'http://hl7.org/fhir/StructureDefinition/PractitionerRole',
    ]);
    expect(types[0].aggregation).toEqual(['referenced', 'bundled']);
    expect(types[0].versioning).toBe('either');
  });

  it('serializes type with profile', () => {
    const sd = parseFixture('03-element-subtypes', '02-base-and-type.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.snapshot as Record<string, unknown>).element as Record<string, unknown>[];

    const nameEl = elements[4];
    const types = nameEl.type as Record<string, unknown>[];
    expect(types[0].profile).toEqual(['http://hl7.org/fhir/StructureDefinition/HumanName']);
  });
});

describe('constraint serialization', () => {
  it('serializes constraints with all fields', () => {
    const sd = parseFixture('03-element-subtypes', '03-constraints.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];

    const patientEl = elements[0];
    const constraints = patientEl.constraint as Record<string, unknown>[];
    expect(constraints[0]).toEqual({
      key: 'pat-1',
      severity: 'error',
      human: 'Patient.name or Patient.identifier SHALL be present',
      expression: 'name.exists() or identifier.exists()',
      xpath: 'f:name or f:identifier',
      source: 'http://hl7.org/fhir/StructureDefinition/Patient',
    });
  });

  it('serializes constraints with optional fields omitted', () => {
    const sd = parseFixture('03-element-subtypes', '03-constraints.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];

    const patientEl = elements[0];
    const constraints = patientEl.constraint as Record<string, unknown>[];
    // Second constraint has requirements but no xpath/source
    expect(constraints[1].key).toBe('pat-custom-1');
    expect(constraints[1].requirements).toBe('Ensures data quality');
    expect(constraints[1]).not.toHaveProperty('xpath');
    expect(constraints[1]).not.toHaveProperty('source');
  });
});

describe('binding and example serialization', () => {
  it('serializes binding with all fields', () => {
    const sd = parseFixture('03-element-subtypes', '04-binding-and-example.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];

    const statusEl = elements[0];
    expect(statusEl.binding).toEqual({
      strength: 'required',
      description: 'Codes providing the status of an observation.',
      valueSet: 'http://hl7.org/fhir/ValueSet/observation-status|4.0.1',
    });
  });

  it('serializes binding without description', () => {
    const sd = parseFixture('03-element-subtypes', '04-binding-and-example.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];

    const categoryEl = elements[2];
    const binding = categoryEl.binding as Record<string, unknown>;
    expect(binding.strength).toBe('preferred');
    expect(binding).not.toHaveProperty('description');
    expect(binding.valueSet).toBe('http://hl7.org/fhir/ValueSet/observation-category');
  });

  it('serializes examples with choice type values', () => {
    const sd = parseFixture('03-element-subtypes', '04-binding-and-example.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];

    const valueEl = elements[4];
    const examples = valueEl.example as Record<string, unknown>[];
    expect(examples).toHaveLength(3);

    // First example: valueQuantity
    expect(examples[0].label).toBe('Normal heart rate');
    expect(examples[0].valueQuantity).toEqual({
      value: 72,
      unit: '/min',
      system: 'http://unitsofmeasure.org',
      code: '/min',
    });

    // Second example: valueCodeableConcept
    expect(examples[1].label).toBe('Blood type');
    expect(examples[1].valueCodeableConcept).toEqual({
      coding: [{ system: 'http://loinc.org', code: '882-1', display: 'ABO group' }],
    });

    // Third example: valueString
    expect(examples[2].label).toBe('Simple text result');
    expect(examples[2].valueString).toBe('Normal findings');
  });
});

// =============================================================================
// Section 5: Choice Type Restoration
// =============================================================================

describe('choice type serialization', () => {
  it('serializes fixed[x] choice types', () => {
    const sd = parseFixture('05-choice-types', '01-fixed-types.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];

    expect(elements[0].fixedCode).toBe('final');
    expect(elements[1].fixedUri).toBe('http://terminology.hl7.org/CodeSystem/observation-category');
    expect(elements[2].fixedCode).toBe('vital-signs');
    expect(elements[4].fixedDateTime).toBe('2026-01-01T00:00:00Z');
  });

  it('serializes multiple choice type fields on same element', () => {
    const sd = parseFixture('05-choice-types', '05-multiple-choice-fields.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.snapshot as Record<string, unknown>).element as Record<string, unknown>[];

    const valueEl = elements[1];
    expect(valueEl.defaultValueQuantity).toEqual({ value: 0, unit: 'mmHg' });
    expect(valueEl.fixedQuantity).toEqual({ system: 'http://unitsofmeasure.org', code: 'mm[Hg]' });
    expect(valueEl.patternQuantity).toEqual({ unit: 'mmHg' });
    expect(valueEl.minValueInteger).toBe(0);
    expect(valueEl.maxValueInteger).toBe(400);
  });

  it('serializes example value[x] within multiple-choice element', () => {
    const sd = parseFixture('05-choice-types', '05-multiple-choice-fields.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.snapshot as Record<string, unknown>).element as Record<string, unknown>[];

    const valueEl = elements[1];
    const examples = valueEl.example as Record<string, unknown>[];
    expect(examples[0].label).toBe('Systolic BP');
    expect(examples[0].valueQuantity).toEqual({
      value: 120,
      unit: 'mmHg',
      system: 'http://unitsofmeasure.org',
      code: 'mm[Hg]',
    });
  });
});

// =============================================================================
// Section 6: Property Ordering
// =============================================================================

describe('property ordering', () => {
  it('resourceType is always the first property', () => {
    const sd = parseFixture('01-complete-sd', '02-full-metadata.json');
    const obj = serializeToFhirObject(sd);
    const keys = Object.keys(obj);
    expect(keys[0]).toBe('resourceType');
  });

  it('remaining properties are sorted alphabetically', () => {
    const sd = parseFixture('01-complete-sd', '02-full-metadata.json');
    const obj = serializeToFhirObject(sd);
    const keys = Object.keys(obj);
    // Skip resourceType (first), rest should be sorted
    const restKeys = keys.slice(1);
    const sorted = [...restKeys].sort();
    expect(restKeys).toEqual(sorted);
  });
});

// =============================================================================
// Section 7: Round-Trip Tests
// =============================================================================

describe('round-trip: parse → serialize → parse', () => {
  const roundTripFixtures: Array<{ category: string; filename: string; label: string }> = [
    { category: '01-complete-sd', filename: '01-minimal-valid.json', label: 'minimal SD' },
    { category: '01-complete-sd', filename: '02-full-metadata.json', label: 'full metadata SD' },
    { category: '03-element-subtypes', filename: '01-slicing-discriminator.json', label: 'slicing/discriminator' },
    { category: '03-element-subtypes', filename: '02-base-and-type.json', label: 'base and type' },
    { category: '03-element-subtypes', filename: '03-constraints.json', label: 'constraints' },
    { category: '03-element-subtypes', filename: '04-binding-and-example.json', label: 'binding and example' },
    { category: '03-element-subtypes', filename: '05-mapping.json', label: 'mapping' },
    { category: '05-choice-types', filename: '01-fixed-types.json', label: 'fixed[x] choice types' },
    { category: '05-choice-types', filename: '05-multiple-choice-fields.json', label: 'multiple choice fields' },
  ];

  for (const { category, filename, label } of roundTripFixtures) {
    it(`round-trips ${label}`, () => {
      // Parse original
      const sd1 = parseFixture(category, filename);

      // Serialize
      const json = serializeToFhirJson(sd1);

      // Re-parse
      const result2 = parseFhirJson(json);
      expect(result2.success).toBe(true);
      const sd2 = result2.data as StructureDefinition;

      // Compare key fields
      expect(sd2.resourceType).toBe(sd1.resourceType);
      expect(sd2.url).toBe(sd1.url);
      expect(sd2.name).toBe(sd1.name);
      expect(sd2.status).toBe(sd1.status);
      expect(sd2.kind).toBe(sd1.kind);
      expect(sd2.abstract).toBe(sd1.abstract);
      expect(sd2.type).toBe(sd1.type);

      // Compare optional fields
      expect(sd2.id).toBe(sd1.id);
      expect(sd2.version).toBe(sd1.version);
      expect(sd2.title).toBe(sd1.title);
      expect(sd2.baseDefinition).toBe(sd1.baseDefinition);
      expect(sd2.derivation).toBe(sd1.derivation);
    });
  }

  it('round-trip preserves snapshot element count', () => {
    const sd1 = parseFixture('05-choice-types', '05-multiple-choice-fields.json');
    const json = serializeToFhirJson(sd1);
    const result2 = parseFhirJson(json);
    expect(result2.success).toBe(true);
    const sd2 = result2.data as StructureDefinition;

    expect(sd2.snapshot!.element).toHaveLength(sd1.snapshot!.element.length);
  });

  it('round-trip preserves differential element count', () => {
    const sd1 = parseFixture('03-element-subtypes', '01-slicing-discriminator.json');
    const json = serializeToFhirJson(sd1);
    const result2 = parseFhirJson(json);
    expect(result2.success).toBe(true);
    const sd2 = result2.data as StructureDefinition;

    expect(sd2.differential!.element).toHaveLength(sd1.differential!.element.length);
  });

  it('round-trip preserves choice type property names', () => {
    const sd1 = parseFixture('05-choice-types', '01-fixed-types.json');
    const json = serializeToFhirJson(sd1);
    const result2 = parseFhirJson(json);
    expect(result2.success).toBe(true);
    const sd2 = result2.data as StructureDefinition;

    // Check that choice values survived the round-trip
    const el1 = sd1.differential!.element[0];
    const el2 = sd2.differential!.element[0];

    const cv1 = el1.fixed as ChoiceValue;
    const cv2 = el2.fixed as ChoiceValue;
    expect(cv2.propertyName).toBe(cv1.propertyName);
    expect(cv2.value).toBe(cv1.value);
    expect(cv2.typeName).toBe(cv1.typeName);
  });

  it('round-trip preserves example choice type values', () => {
    const sd1 = parseFixture('03-element-subtypes', '04-binding-and-example.json');
    const json = serializeToFhirJson(sd1);
    const result2 = parseFhirJson(json);
    expect(result2.success).toBe(true);
    const sd2 = result2.data as StructureDefinition;

    const examples1 = sd1.differential!.element[4].example!;
    const examples2 = sd2.differential!.element[4].example!;
    expect(examples2).toHaveLength(examples1.length);

    for (let i = 0; i < examples1.length; i++) {
      const cv1 = examples1[i].value as ChoiceValue;
      const cv2 = examples2[i].value as ChoiceValue;
      expect(cv2.propertyName).toBe(cv1.propertyName);
      expect(cv2.typeName).toBe(cv1.typeName);
      expect(JSON.stringify(cv2.value)).toBe(JSON.stringify(cv1.value));
    }
  });

  it('round-trip preserves constraint details', () => {
    const sd1 = parseFixture('03-element-subtypes', '03-constraints.json');
    const json = serializeToFhirJson(sd1);
    const result2 = parseFhirJson(json);
    expect(result2.success).toBe(true);
    const sd2 = result2.data as StructureDefinition;

    const c1 = sd1.differential!.element[0].constraint!;
    const c2 = sd2.differential!.element[0].constraint!;
    expect(c2).toHaveLength(c1.length);
    expect(c2[0].key).toBe(c1[0].key);
    expect(c2[0].severity).toBe(c1[0].severity);
    expect(c2[0].human).toBe(c1[0].human);
    expect(c2[0].expression).toBe(c1[0].expression);
  });

  it('round-trip preserves binding details', () => {
    const sd1 = parseFixture('03-element-subtypes', '04-binding-and-example.json');
    const json = serializeToFhirJson(sd1);
    const result2 = parseFhirJson(json);
    expect(result2.success).toBe(true);
    const sd2 = result2.data as StructureDefinition;

    const b1 = sd1.differential!.element[0].binding!;
    const b2 = sd2.differential!.element[0].binding!;
    expect(b2.strength).toBe(b1.strength);
    expect(b2.description).toBe(b1.description);
    expect(b2.valueSet).toBe(b1.valueSet);
  });
});

// =============================================================================
// Section 8: Edge Cases
// =============================================================================

describe('edge cases', () => {
  it('handles StructureDefinition with no snapshot or differential', () => {
    const sd = parseFixture('01-complete-sd', '01-minimal-valid.json');
    const obj = serializeToFhirObject(sd);
    expect(obj).not.toHaveProperty('snapshot');
    expect(obj).not.toHaveProperty('differential');
  });

  it('handles generic resource serialization', () => {
    const resource: Resource = {
      resourceType: 'Observation',
      id: 'obs-1' as Resource['id'],
      meta: { versionId: '1' as any, lastUpdated: '2026-01-01T00:00:00Z' as any } as Resource['meta'],
    };
    const obj = serializeToFhirObject(resource);
    expect(obj.resourceType).toBe('Observation');
    expect(obj.id).toBe('obs-1');
    expect(obj.meta).toBeDefined();
  });

  it('serializeToFhirJson produces parseable output for generic resource', () => {
    const resource: Resource = {
      resourceType: 'Patient',
      id: 'p1' as Resource['id'],
    };
    const json = serializeToFhirJson(resource);
    const parsed = JSON.parse(json);
    expect(parsed.resourceType).toBe('Patient');
    expect(parsed.id).toBe('p1');
  });

  it('handles ElementDefinition with no optional fields', () => {
    // Create a minimal SD with a single element that has only path
    const minimalJson = JSON.stringify({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/test',
      name: 'Test',
      status: 'draft',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      differential: {
        element: [{ path: 'Patient' }],
      },
    });
    const result = parseFhirJson(minimalJson);
    expect(result.success).toBe(true);
    const sd = result.data as StructureDefinition;
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];
    expect(elements[0].path).toBe('Patient');
    // Should not have any optional fields
    expect(elements[0]).not.toHaveProperty('sliceName');
    expect(elements[0]).not.toHaveProperty('slicing');
    expect(elements[0]).not.toHaveProperty('min');
    expect(elements[0]).not.toHaveProperty('max');
    expect(elements[0]).not.toHaveProperty('type');
    expect(elements[0]).not.toHaveProperty('binding');
    expect(elements[0]).not.toHaveProperty('constraint');
  });

  it('serializes boolean false correctly (not omitted)', () => {
    const sd = parseFixture('01-complete-sd', '01-minimal-valid.json');
    const obj = serializeToFhirObject(sd);
    // abstract: false should be present, not omitted
    expect(obj.abstract).toBe(false);
  });

  it('serializes number 0 correctly (not omitted)', () => {
    const sd = parseFixture('05-choice-types', '05-multiple-choice-fields.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.snapshot as Record<string, unknown>).element as Record<string, unknown>[];

    // min: 0 should be present
    expect(elements[0].min).toBe(0);
    // minValueInteger: 0 should be present
    expect(elements[1].minValueInteger).toBe(0);
  });
});

// =============================================================================
// Section 9: Mapping Serialization
// =============================================================================

describe('mapping serialization', () => {
  it('serializes ElementDefinition mappings', () => {
    const sd = parseFixture('03-element-subtypes', '05-mapping.json');
    const obj = serializeToFhirObject(sd);
    const elements = (obj.differential as Record<string, unknown>).element as Record<string, unknown>[];

    // Find element with mapping
    const elWithMapping = elements.find((e) => e.mapping !== undefined);
    expect(elWithMapping).toBeDefined();
    const mappings = elWithMapping!.mapping as Record<string, unknown>[];
    expect(mappings.length).toBeGreaterThan(0);
    expect(mappings[0]).toHaveProperty('identity');
    expect(mappings[0]).toHaveProperty('map');
  });
});

// =============================================================================
// Section 10: Base Resource Round-Trip
// =============================================================================

describe('base resource round-trip', () => {
  const baseResources = [
    '01-patient.json',
    '02-observation.json',
    '03-condition.json',
  ];

  for (const filename of baseResources) {
    it(`round-trips ${filename}`, () => {
      const sd1 = parseFixture('06-base-resources', filename);
      const json = serializeToFhirJson(sd1);
      const result2 = parseFhirJson(json);
      expect(result2.success).toBe(true);
      const sd2 = result2.data as StructureDefinition;

      expect(sd2.resourceType).toBe('StructureDefinition');
      expect(sd2.url).toBe(sd1.url);
      expect(sd2.name).toBe(sd1.name);
      expect(sd2.kind).toBe(sd1.kind);
      expect(sd2.type).toBe(sd1.type);

      // Element counts should match
      if (sd1.snapshot) {
        expect(sd2.snapshot!.element).toHaveLength(sd1.snapshot.element.length);
      }
      if (sd1.differential) {
        expect(sd2.differential!.element).toHaveLength(sd1.differential.element.length);
      }
    });
  }
});
