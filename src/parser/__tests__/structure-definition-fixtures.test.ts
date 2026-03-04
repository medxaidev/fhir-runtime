/**
 * Fixture-based tests for structure-definition-parser.ts
 *
 * Loads JSON fixture files from fixtures/structure-definition/ and validates
 * that the parser correctly handles each category of StructureDefinition content.
 *
 * Categories:
 * - 01-complete-sd: Complete StructureDefinition parsing (5 fixtures)
 * - 02-element-fields: ElementDefinition all 37 fields (5 fixtures)
 * - 03-element-subtypes: ElementDefinition 8 sub-types (5 fixtures)
 * - 04-snapshot-differential: snapshot.element[] & differential.element[] (5 fixtures)
 * - 05-choice-types: ElementDefinition 5 choice type fields (5 fixtures)
 * - 06-base-resources: FHIR R4 base resource StructureDefinitions (20 fixtures)
 *
 * Total: 45 fixture files, ~90+ test assertions
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, basename } from 'node:path';

import { parseStructureDefinition } from '../structure-definition-parser.js';
import { parseFhirJson } from '../json-parser.js';
import type { StructureDefinition } from '../../model/structure-definition.js';

// =============================================================================
// Helpers
// =============================================================================

const FIXTURES_DIR = resolve(__dirname, 'fixtures', 'structure-definition');

function loadFixture(category: string, filename: string): Record<string, unknown> {
  const content = readFileSync(resolve(FIXTURES_DIR, category, filename), 'utf-8');
  return JSON.parse(content);
}

function loadFixtureAsString(category: string, filename: string): string {
  return readFileSync(resolve(FIXTURES_DIR, category, filename), 'utf-8');
}

function listFixtures(category: string): string[] {
  return readdirSync(resolve(FIXTURES_DIR, category))
    .filter((f) => f.endsWith('.json'))
    .sort();
}

// =============================================================================
// 01-complete-sd: Complete StructureDefinition parsing
// =============================================================================

describe('01-complete-sd: Complete StructureDefinition parsing', () => {
  it('01-minimal-valid: parses with only required fields', () => {
    const obj = loadFixture('01-complete-sd', '01-minimal-valid.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.resourceType).toBe('StructureDefinition');
    expect(result.data.url).toBe('http://example.org/fhir/StructureDefinition/MinimalValid');
    expect(result.data.name).toBe('MinimalValid');
    expect(result.data.status).toBe('draft');
    expect(result.data.kind).toBe('resource');
    expect(result.data.abstract).toBe(false);
    expect(result.data.type).toBe('Patient');
    // No snapshot, no differential
    expect(result.data.snapshot).toBeUndefined();
    expect(result.data.differential).toBeUndefined();
    expect(result.issues.filter((i) => i.severity === 'error')).toHaveLength(0);
  });

  it('02-full-metadata: parses all optional metadata fields', () => {
    const obj = loadFixture('01-complete-sd', '02-full-metadata.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const sd = result.data;
    expect(sd.id).toBe('full-metadata-sd');
    expect(sd.meta).toBeDefined();
    expect(sd.version).toBe('2.0.0');
    expect(sd.title).toBe('Full Metadata StructureDefinition');
    expect(sd.experimental).toBe(true);
    expect(sd.date).toBe('2026-01-15');
    expect(sd.publisher).toBe('Example Organization');
    expect(sd.contact).toHaveLength(1);
    expect(sd.description).toContain('all metadata fields');
    expect(sd.useContext).toHaveLength(1);
    expect(sd.jurisdiction).toHaveLength(1);
    expect(sd.purpose).toContain('Testing');
    expect(sd.copyright).toBe('CC0-1.0');
    expect(sd.keyword).toHaveLength(1);
    expect(sd.fhirVersion).toBe('4.0.1');
    expect(sd.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(sd.derivation).toBe('constraint');
  });

  it('03-extension-definition: parses extension with context and contextInvariant', () => {
    const obj = loadFixture('01-complete-sd', '03-extension-definition.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const sd = result.data;
    expect(sd.kind).toBe('complex-type');
    expect(sd.type).toBe('Extension');
    expect(sd.context).toHaveLength(1);
    expect(sd.context![0].type).toBe('element');
    expect(sd.context![0].expression).toBe('Patient');
    expect(sd.contextInvariant).toEqual(['Patient.birthDate.exists()']);
    expect(sd.differential).toBeDefined();
    expect(sd.differential!.element).toHaveLength(3);
  });

  it('04-logical-model: parses logical model with mapping', () => {
    const obj = loadFixture('01-complete-sd', '04-logical-model.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const sd = result.data;
    expect(sd.kind).toBe('logical');
    expect(sd.mapping).toHaveLength(2);
    expect(sd.mapping![0].identity).toBe('fhir');
    expect(sd.mapping![0].uri).toBe('http://hl7.org/fhir');
    expect(sd.mapping![1].identity).toBe('cda');
    expect(sd.snapshot).toBeDefined();
    expect(sd.snapshot!.element).toHaveLength(5);
    // Verify binding on element
    const codeElement = sd.snapshot!.element.find((e) => e.path === 'ClinicalEvent.code');
    expect(codeElement?.binding?.strength).toBe('extensible');
  });

  it('05-datatype-definition: parses complex-type constraint profile', () => {
    const obj = loadFixture('01-complete-sd', '05-datatype-definition.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const sd = result.data;
    expect(sd.kind).toBe('complex-type');
    expect(sd.type).toBe('Quantity');
    expect(sd.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Quantity');
    expect(sd.derivation).toBe('constraint');
    expect(sd.differential!.element).toHaveLength(2);
    expect(sd.differential!.element[1].max).toBe('0');
  });
});

// =============================================================================
// 02-element-fields: ElementDefinition all 37 fields
// =============================================================================

describe('02-element-fields: ElementDefinition all 37 fields', () => {
  it('01-identity-fields: parses sliceName, sliceIsConstraining, label, code, representation', () => {
    const obj = loadFixture('02-element-fields', '01-identity-fields.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.differential!.element;
    expect(elements[0].sliceName).toBe('mrn');
    expect(elements[0].sliceIsConstraining).toBe(false);
    expect(elements[0].label).toBe('Medical Record Number');
    expect(elements[0].code).toHaveLength(1);
    expect(elements[0].code![0].code).toBe('76435-7');
    expect(elements[0].representation).toEqual(['xmlAttr']);
    expect(elements[1].sliceName).toBe('ssn');
    expect(elements[1].sliceIsConstraining).toBe(true);
  });

  it('02-cardinality-and-docs: parses min, max, short, definition, comment, requirements, alias, meaningWhenMissing, orderMeaning', () => {
    const obj = loadFixture('02-element-fields', '02-cardinality-and-docs.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const el = result.data.differential!.element[0]; // Patient.name
    expect(el.min).toBe(1);
    expect(el.max).toBe('3');
    expect(el.short).toBe('Patient official name(s)');
    expect(el.definition).toContain('officially known');
    expect(el.comment).toContain('At least one name');
    expect(el.requirements).toContain('clinical and administrative');
    expect(el.alias).toEqual(['full name', 'legal name', 'preferred name']);
    expect(el.meaningWhenMissing).toContain('cannot be identified');
    expect(el.orderMeaning).toContain('preference');
  });

  it('03-flags-and-conditions: parses mustSupport, isModifier, isModifierReason, isSummary, condition', () => {
    const obj = loadFixture('02-element-fields', '03-flags-and-conditions.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const el = result.data.differential!.element[0]; // Patient.active
    expect(el.mustSupport).toBe(true);
    expect(el.isModifier).toBe(true);
    expect(el.isModifierReason).toContain('status element');
    expect(el.isSummary).toBe(true);
    expect(el.condition).toEqual(['pat-1']);
    // Patient.gender: isModifier explicitly false
    const gender = result.data.differential!.element[3];
    expect(gender.isModifier).toBe(false);
  });

  it('04-content-reference-maxlength: parses contentReference and maxLength', () => {
    const obj = loadFixture('02-element-fields', '04-content-reference-maxlength.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.snapshot!.element;
    const textEl = elements.find((e) => e.path === 'Questionnaire.item.text');
    expect(textEl?.maxLength).toBe(500);
    const itemItemEl = elements.find((e) => e.path === 'Questionnaire.item.item');
    expect(itemItemEl?.contentReference).toBe('#Questionnaire.item');
  });

  it('05-all-37-fields: parses an element with all 37 fields populated', () => {
    const obj = loadFixture('02-element-fields', '05-all-37-fields.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const el = result.data.snapshot!.element[0];
    // Core identity
    expect(el.id).toBe('Observation.value[x]');
    expect(el.extension).toHaveLength(1);
    expect(el.modifierExtension).toHaveLength(1);
    expect(el.path).toBe('Observation.value[x]');
    expect(el.representation).toEqual(['xmlAttr']);
    expect(el.sliceName).toBe('valueQuantity');
    expect(el.sliceIsConstraining).toBe(false);
    expect(el.label).toBe('Observation Value');
    expect(el.code).toHaveLength(1);
    // Slicing
    expect(el.slicing).toBeDefined();
    expect(el.slicing!.rules).toBe('closed');
    // Documentation
    expect(el.short).toBe('Actual result');
    expect(el.definition).toBeDefined();
    expect(el.comment).toBeDefined();
    expect(el.requirements).toBeDefined();
    expect(el.alias).toEqual(['result', 'answer']);
    // Cardinality
    expect(el.min).toBe(0);
    expect(el.max).toBe('1');
    // Base
    expect(el.base).toBeDefined();
    expect(el.base!.path).toBe('Observation.value[x]');
    // Content reference
    expect(el.contentReference).toBe('#Observation.component.value[x]');
    // Type
    expect(el.type).toHaveLength(1);
    expect(el.type![0].code).toBe('Quantity');
    expect(el.type![0].profile).toHaveLength(1);
    expect(el.type![0].aggregation).toEqual(['contained']);
    expect(el.type![0].versioning).toBe('specific');
    // Choice types
    expect(el.defaultValue).toBeDefined();
    expect(el.fixed).toBeDefined();
    expect(el.pattern).toBeDefined();
    expect(el.minValue).toBeDefined();
    expect(el.maxValue).toBeDefined();
    // Documentation continued
    expect(el.meaningWhenMissing).toContain('No observation value');
    expect(el.orderMeaning).toBeDefined();
    // Example
    expect(el.example).toHaveLength(1);
    expect(el.example![0].label).toBe('Normal weight');
    // maxLength
    expect(el.maxLength).toBe(256);
    // Condition & constraint
    expect(el.condition).toEqual(['obs-7']);
    expect(el.constraint).toHaveLength(1);
    expect(el.constraint![0].key).toBe('obs-7');
    // Flags
    expect(el.mustSupport).toBe(true);
    expect(el.isModifier).toBe(false);
    expect(el.isModifierReason).toBe('N/A');
    expect(el.isSummary).toBe(true);
    // Binding
    expect(el.binding).toBeDefined();
    expect(el.binding!.strength).toBe('extensible');
    // Mapping
    expect(el.mapping).toHaveLength(2);
    expect(el.mapping![0].identity).toBe('v2');
    expect(el.mapping![0].language).toBe('application/fhir');
  });
});

// =============================================================================
// 03-element-subtypes: ElementDefinition 8 sub-types
// =============================================================================

describe('03-element-subtypes: ElementDefinition 8 sub-types', () => {
  it('01-slicing-discriminator: parses slicing with single and multiple discriminators', () => {
    const obj = loadFixture('03-element-subtypes', '01-slicing-discriminator.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.differential!.element;
    // Single discriminator
    const identifierEl = elements[0];
    expect(identifierEl.slicing).toBeDefined();
    expect(identifierEl.slicing!.discriminator).toHaveLength(1);
    expect(identifierEl.slicing!.discriminator![0].type).toBe('value');
    expect(identifierEl.slicing!.discriminator![0].path).toBe('system');
    expect(identifierEl.slicing!.ordered).toBe(false);
    expect(identifierEl.slicing!.rules).toBe('open');
    // Multiple discriminators
    const telecomEl = elements[3];
    expect(telecomEl.slicing!.discriminator).toHaveLength(2);
    expect(telecomEl.slicing!.ordered).toBe(true);
    expect(telecomEl.slicing!.rules).toBe('closed');
  });

  it('02-base-and-type: parses base, type with profile/targetProfile/aggregation/versioning', () => {
    const obj = loadFixture('03-element-subtypes', '02-base-and-type.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.snapshot!.element;
    // Base
    expect(elements[0].base!.path).toBe('Resource');
    expect(elements[0].base!.min).toBe(0);
    expect(elements[0].base!.max).toBe('*');
    // Choice type
    const deceasedEl = elements[1];
    expect(deceasedEl.type).toHaveLength(2);
    expect(deceasedEl.type![0].code).toBe('boolean');
    expect(deceasedEl.type![1].code).toBe('dateTime');
    // Reference with targetProfile, aggregation, versioning
    const gpEl = elements[2];
    expect(gpEl.type![0].code).toBe('Reference');
    expect(gpEl.type![0].targetProfile).toHaveLength(3);
    expect(gpEl.type![0].aggregation).toEqual(['referenced', 'bundled']);
    expect(gpEl.type![0].versioning).toBe('either');
    // Type with profile
    const nameEl = elements[4];
    expect(nameEl.type![0].profile).toEqual(['http://hl7.org/fhir/StructureDefinition/HumanName']);
  });

  it('03-constraints: parses constraint with all fields and multiple constraints', () => {
    const obj = loadFixture('03-element-subtypes', '03-constraints.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.differential!.element;
    // Root element: 2 constraints
    expect(elements[0].constraint).toHaveLength(2);
    const c1 = elements[0].constraint![0];
    expect(c1.key).toBe('pat-1');
    expect(c1.severity).toBe('error');
    expect(c1.human).toContain('name or Patient.identifier');
    expect(c1.expression).toContain('name.exists()');
    expect(c1.xpath).toContain('f:name');
    expect(c1.source).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    const c2 = elements[0].constraint![1];
    expect(c2.severity).toBe('warning');
    expect(c2.requirements).toBe('Ensures data quality');
    // Link element: 3 constraints
    expect(elements[2].constraint).toHaveLength(3);
  });

  it('04-binding-and-example: parses binding strengths and example with choice type values', () => {
    const obj = loadFixture('03-element-subtypes', '04-binding-and-example.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.differential!.element;
    // Required binding
    expect(elements[0].binding!.strength).toBe('required');
    expect(elements[0].binding!.valueSet).toContain('observation-status');
    // Extensible binding
    expect(elements[1].binding!.strength).toBe('extensible');
    // Preferred binding
    expect(elements[2].binding!.strength).toBe('preferred');
    // Example binding
    expect(elements[3].binding!.strength).toBe('example');
    expect(elements[3].binding!.description).toContain('interpretations');
    // Examples with choice type values
    const valueEl = elements[4];
    expect(valueEl.example).toHaveLength(3);
    expect(valueEl.example![0].label).toBe('Normal heart rate');
    expect(valueEl.example![0].value).toBeDefined();
    expect(valueEl.example![1].label).toBe('Blood type');
    expect(valueEl.example![2].label).toBe('Simple text result');
  });

  it('05-mapping: parses SD-level and element-level mappings', () => {
    const obj = loadFixture('03-element-subtypes', '05-mapping.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    // SD-level mappings
    expect(result.data.mapping).toHaveLength(3);
    expect(result.data.mapping![0].identity).toBe('rim');
    expect(result.data.mapping![1].comment).toContain('HL7 v2');
    // Element-level mappings
    const identifierEl = result.data.differential!.element[0];
    expect(identifierEl.mapping).toHaveLength(3);
    expect(identifierEl.mapping![0].identity).toBe('v2');
    expect(identifierEl.mapping![0].map).toBe('PID-3');
    expect(identifierEl.mapping![0].comment).toContain('PID segment');
    expect(identifierEl.mapping![1].language).toBe('application/xml');
  });
});

// =============================================================================
// 04-snapshot-differential: snapshot.element[] & differential.element[]
// =============================================================================

describe('04-snapshot-differential: snapshot.element[] & differential.element[]', () => {
  it('01-snapshot-only: parses SD with only snapshot', () => {
    const obj = loadFixture('04-snapshot-differential', '01-snapshot-only.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.snapshot).toBeDefined();
    expect(result.data.differential).toBeUndefined();
    expect(result.data.snapshot!.element).toHaveLength(7);
    // Verify element details
    const genderEl = result.data.snapshot!.element.find((e) => e.path === 'Patient.gender');
    expect(genderEl?.binding?.strength).toBe('required');
    expect(genderEl?.isSummary).toBe(true);
  });

  it('02-differential-only: parses SD with only differential', () => {
    const obj = loadFixture('04-snapshot-differential', '02-differential-only.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.snapshot).toBeUndefined();
    expect(result.data.differential).toBeDefined();
    expect(result.data.differential!.element).toHaveLength(4);
    // All elements have mustSupport=true and min=1
    for (const el of result.data.differential!.element) {
      expect(el.mustSupport).toBe(true);
      expect(el.min).toBe(1);
    }
  });

  it('03-both-snapshot-and-differential: parses SD with both', () => {
    const obj = loadFixture('04-snapshot-differential', '03-both-snapshot-and-differential.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.snapshot).toBeDefined();
    expect(result.data.differential).toBeDefined();
    expect(result.data.snapshot!.element).toHaveLength(3);
    expect(result.data.differential!.element).toHaveLength(2);
    // Snapshot has full info
    const snapName = result.data.snapshot!.element[1];
    expect(snapName.type).toHaveLength(1);
    expect(snapName.base).toBeDefined();
    // Differential has delta only
    const diffName = result.data.differential!.element[0];
    expect(diffName.type).toBeUndefined();
    expect(diffName.min).toBe(1);
  });

  it('04-deep-nesting: parses deeply nested element paths', () => {
    const obj = loadFixture('04-snapshot-differential', '04-deep-nesting.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.snapshot!.element;
    expect(elements).toHaveLength(9);
    // Verify deep paths
    const paths = elements.map((e) => e.path);
    expect(paths).toContain('Patient.contact.name.family');
    expect(paths).toContain('Patient.contact.name.given');
    expect(paths).toContain('Patient.contact.telecom.system');
    expect(paths).toContain('Patient.contact.telecom.value');
    // Verify binding on deep element
    const systemEl = elements.find((e) => e.path === 'Patient.contact.telecom.system');
    expect(systemEl?.binding?.strength).toBe('required');
  });

  it('05-large-element-array: parses SD with 19 differential elements', () => {
    const obj = loadFixture('04-snapshot-differential', '05-large-element-array.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.differential!.element).toHaveLength(19);
    // Verify slicing on component
    const componentEl = result.data.differential!.element.find(
      (e) => e.id === 'Observation.component' && e.slicing !== undefined,
    );
    expect(componentEl).toBeDefined();
    expect(componentEl!.slicing!.discriminator![0].type).toBe('pattern');
    // Verify slices
    const systolic = result.data.differential!.element.find((e) => e.sliceName === 'systolic');
    expect(systolic).toBeDefined();
    expect(systolic!.min).toBe(1);
    const diastolic = result.data.differential!.element.find((e) => e.sliceName === 'diastolic');
    expect(diastolic).toBeDefined();
  });
});

// =============================================================================
// 05-choice-types: ElementDefinition 5 choice type fields
// =============================================================================

describe('05-choice-types: ElementDefinition 5 choice type fields', () => {
  it('01-fixed-types: parses fixedCode, fixedUri, fixedDateTime', () => {
    const obj = loadFixture('05-choice-types', '01-fixed-types.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.differential!.element;
    // fixedCode
    expect(elements[0].fixed).toBeDefined();
    // fixedUri
    expect(elements[1].fixed).toBeDefined();
    // fixedDateTime
    expect(elements[4].fixed).toBeDefined();
    // No errors for choice type properties
    expect(result.issues.filter((i) => i.code === 'UNEXPECTED_PROPERTY')).toHaveLength(0);
  });

  it('02-pattern-types: parses patternCodeableConcept and patternCoding', () => {
    const obj = loadFixture('05-choice-types', '02-pattern-types.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.differential!.element;
    // All 5 elements have pattern
    for (const el of elements) {
      expect(el.pattern).toBeDefined();
    }
    expect(result.issues.filter((i) => i.code === 'UNEXPECTED_PROPERTY')).toHaveLength(0);
  });

  it('03-default-value-types: parses defaultValueBoolean, defaultValueInteger, defaultValueString', () => {
    const obj = loadFixture('05-choice-types', '03-default-value-types.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.snapshot!.element;
    // defaultValueBoolean
    const requiredEl = elements.find((e) => e.path === 'Questionnaire.item.required');
    expect(requiredEl?.defaultValue).toBeDefined();
    // defaultValueInteger
    const maxLenEl = elements.find((e) => e.path === 'Questionnaire.item.maxLength');
    expect(maxLenEl?.defaultValue).toBeDefined();
    // defaultValueString
    const initialEl = elements.find((e) => e.path === 'Questionnaire.item.initial.value[x]');
    expect(initialEl?.defaultValue).toBeDefined();
  });

  it('04-min-max-value: parses minValue and maxValue with various types', () => {
    const obj = loadFixture('05-choice-types', '04-min-max-value.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const elements = result.data.differential!.element;
    // minValueQuantity / maxValueQuantity
    expect(elements[0].minValue).toBeDefined();
    expect(elements[0].maxValue).toBeDefined();
    // minValueInteger / maxValueInteger
    expect(elements[1].minValue).toBeDefined();
    expect(elements[1].maxValue).toBeDefined();
    // minValueDecimal / maxValueDecimal
    expect(elements[2].minValue).toBeDefined();
    expect(elements[2].maxValue).toBeDefined();
    // minValueDate / maxValueDate
    expect(elements[3].minValue).toBeDefined();
    expect(elements[3].maxValue).toBeDefined();
    // minValueInstant / maxValueInstant
    expect(elements[4].minValue).toBeDefined();
    expect(elements[4].maxValue).toBeDefined();
  });

  it('05-multiple-choice-fields: parses element with defaultValue, fixed, pattern, minValue, maxValue simultaneously', () => {
    const obj = loadFixture('05-choice-types', '05-multiple-choice-fields.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const valueEl = result.data.snapshot!.element[1]; // Observation.value[x]
    expect(valueEl.defaultValue).toBeDefined();
    expect(valueEl.fixed).toBeDefined();
    expect(valueEl.pattern).toBeDefined();
    expect(valueEl.minValue).toBeDefined();
    expect(valueEl.maxValue).toBeDefined();
    expect(valueEl.example).toHaveLength(1);
    // Component element with pattern and examples
    const compEl = result.data.snapshot!.element[2];
    expect(compEl.pattern).toBeDefined();
    expect(compEl.example).toHaveLength(2);
  });
});

// =============================================================================
// 06-base-resources: FHIR R4 base resource StructureDefinitions (20 resources)
// =============================================================================

describe('06-base-resources: FHIR R4 base resource StructureDefinitions', () => {
  const fixtures = [
    { file: '01-patient.json', type: 'Patient', minElements: 10 },
    { file: '02-observation.json', type: 'Observation', minElements: 8 },
    { file: '03-condition.json', type: 'Condition', minElements: 5 },
    { file: '04-encounter.json', type: 'Encounter', minElements: 5 },
    { file: '05-medication-request.json', type: 'MedicationRequest', minElements: 5 },
    { file: '06-procedure.json', type: 'Procedure', minElements: 5 },
    { file: '07-diagnostic-report.json', type: 'DiagnosticReport', minElements: 5 },
    { file: '08-allergy-intolerance.json', type: 'AllergyIntolerance', minElements: 4 },
    { file: '09-immunization.json', type: 'Immunization', minElements: 4 },
    { file: '10-practitioner.json', type: 'Practitioner', minElements: 5 },
    { file: '11-organization.json', type: 'Organization', minElements: 5 },
    { file: '12-care-plan.json', type: 'CarePlan', minElements: 4 },
    { file: '13-medication.json', type: 'Medication', minElements: 4 },
    { file: '14-location.json', type: 'Location', minElements: 5 },
    { file: '15-claim.json', type: 'Claim', minElements: 5 },
    { file: '16-bundle.json', type: 'Bundle', minElements: 4 },
    { file: '17-questionnaire.json', type: 'Questionnaire', minElements: 4 },
    { file: '18-service-request.json', type: 'ServiceRequest', minElements: 4 },
    { file: '19-document-reference.json', type: 'DocumentReference', minElements: 5 },
    { file: '20-value-set.json', type: 'ValueSet', minElements: 5 },
  ];

  // Individual test per resource
  for (const { file, type, minElements } of fixtures) {
    it(`${type}: parses without errors`, () => {
      const json = loadFixtureAsString('06-base-resources', file);
      const result = parseFhirJson(json);
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error(`Failed to parse ${type}:`, result.issues);
        return;
      }
      const sd = result.data as StructureDefinition;
      expect(sd.resourceType).toBe('StructureDefinition');
      expect(sd.type).toBe(type);
      expect(sd.kind).toBe('resource');
      expect(sd.abstract).toBe(false);
      expect(sd.url).toContain(`StructureDefinition/${type}`);
      expect(sd.snapshot).toBeDefined();
      expect(sd.snapshot!.element.length).toBeGreaterThanOrEqual(minElements);
      // No errors (warnings are OK)
      const errors = result.issues.filter((i) => i.severity === 'error');
      expect(errors).toHaveLength(0);
    });
  }

  // Aggregate test
  it('all 20 base resources parse successfully via parseFhirJson', () => {
    const files = listFixtures('06-base-resources');
    expect(files).toHaveLength(20);
    let totalElements = 0;
    for (const file of files) {
      const json = loadFixtureAsString('06-base-resources', file);
      const result = parseFhirJson(json);
      expect(result.success).toBe(true);
      if (result.success) {
        const sd = result.data as StructureDefinition;
        totalElements += sd.snapshot?.element.length ?? 0;
      }
    }
    // Sanity check: should have parsed a significant number of elements
    expect(totalElements).toBeGreaterThan(100);
  });

  // Specific deep checks on Patient and Observation
  it('Patient: verifies choice types, modifiers, bindings, constraints, mappings', () => {
    const obj = loadFixture('06-base-resources', '01-patient.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const sd = result.data;
    // Mappings
    expect(sd.mapping).toHaveLength(3);
    // Choice type: deceased[x]
    const deceasedEl = sd.snapshot!.element.find((e) => e.path === 'Patient.deceased[x]');
    expect(deceasedEl).toBeDefined();
    expect(deceasedEl!.type).toHaveLength(2);
    expect(deceasedEl!.isModifier).toBe(true);
    // Binding: gender
    const genderEl = sd.snapshot!.element.find((e) => e.path === 'Patient.gender');
    expect(genderEl!.binding!.strength).toBe('required');
    // Constraint: contact
    const contactEl = sd.snapshot!.element.find((e) => e.path === 'Patient.contact');
    expect(contactEl!.constraint).toHaveLength(1);
    expect(contactEl!.constraint![0].key).toBe('pat-1');
    // Reference with targetProfile
    const gpEl = sd.snapshot!.element.find((e) => e.path === 'Patient.generalPractitioner');
    expect(gpEl!.type![0].targetProfile).toHaveLength(3);
    // Mapping on element
    const nameEl = sd.snapshot!.element.find((e) => e.path === 'Patient.name');
    expect(nameEl!.mapping).toHaveLength(1);
    expect(nameEl!.mapping![0].map).toBe('PID-5, PID-9');
  });

  it('Observation: verifies constraints, components, value[x] types, bindings', () => {
    const obj = loadFixture('06-base-resources', '02-observation.json');
    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;
    const sd = result.data;
    // Root constraints
    const rootEl = sd.snapshot!.element[0];
    expect(rootEl.constraint).toHaveLength(2);
    expect(rootEl.constraint![0].key).toBe('obs-6');
    expect(rootEl.constraint![1].key).toBe('obs-7');
    // value[x] with 11 types
    const valueEl = sd.snapshot!.element.find((e) => e.path === 'Observation.value[x]');
    expect(valueEl!.type).toHaveLength(11);
    expect(valueEl!.condition).toEqual(['obs-7']);
    // effective[x] with 4 types
    const effectiveEl = sd.snapshot!.element.find((e) => e.path === 'Observation.effective[x]');
    expect(effectiveEl!.type).toHaveLength(4);
    // Component value[x]
    const compValueEl = sd.snapshot!.element.find((e) => e.path === 'Observation.component.value[x]');
    expect(compValueEl!.type).toHaveLength(11);
    // Binding strengths
    const statusEl = sd.snapshot!.element.find((e) => e.path === 'Observation.status');
    expect(statusEl!.binding!.strength).toBe('required');
    const categoryEl = sd.snapshot!.element.find((e) => e.path === 'Observation.category');
    expect(categoryEl!.binding!.strength).toBe('preferred');
    // referenceRange constraint
    const refRangeEl = sd.snapshot!.element.find((e) => e.path === 'Observation.referenceRange');
    expect(refRangeEl!.constraint).toHaveLength(1);
    expect(refRangeEl!.constraint![0].key).toBe('obs-3');
  });
});

// =============================================================================
// Cross-cutting: all fixtures parse without errors
// =============================================================================

describe('cross-cutting: all 45 fixtures parse without errors', () => {
  const categories = [
    '01-complete-sd',
    '02-element-fields',
    '03-element-subtypes',
    '04-snapshot-differential',
    '05-choice-types',
    '06-base-resources',
  ];

  for (const category of categories) {
    const files = listFixtures(category);
    for (const file of files) {
      it(`${category}/${file}: parses without errors`, () => {
        const json = loadFixtureAsString(category, file);
        const result = parseFhirJson(json);
        expect(result.success).toBe(true);
        if (!result.success) {
          console.error(`Parse errors in ${category}/${file}:`, result.issues);
        }
        const errors = result.issues.filter((i) => i.severity === 'error');
        expect(errors).toHaveLength(0);
      });
    }
  }
});
