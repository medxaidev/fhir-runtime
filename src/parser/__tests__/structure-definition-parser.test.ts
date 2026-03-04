/**
 * Tests for structure-definition-parser.ts
 *
 * Covers:
 * - parseStructureDefinition(): required fields, optional fields, sub-types, unknown properties
 * - parseElementDefinition(): all 37 fields, 8 sub-types, 5 choice type fields
 * - Integration with json-parser.ts dispatch (parseFhirJson / parseFhirObject)
 * - Real-world fixture parsing (minimal-structure-definition.json)
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  parseStructureDefinition,
  parseElementDefinition,
} from '../structure-definition-parser.js';
import { parseFhirJson, parseFhirObject } from '../json-parser.js';
import type { StructureDefinition } from '../../model/structure-definition.js';
import type { ElementDefinition } from '../../model/element-definition.js';

// =============================================================================
// Helpers
// =============================================================================

function loadFixture(name: string): string {
  return readFileSync(resolve(__dirname, 'fixtures', name), 'utf-8');
}

/** Minimal valid SD object */
function minimalSD(): Record<string, unknown> {
  return {
    resourceType: 'StructureDefinition',
    url: 'http://example.org/fhir/StructureDefinition/Test',
    name: 'Test',
    status: 'active',
    kind: 'resource',
    abstract: false,
    type: 'Patient',
  };
}

/** Minimal valid ElementDefinition object */
function minimalED(): Record<string, unknown> {
  return { id: 'Patient', path: 'Patient' };
}

// =============================================================================
// parseStructureDefinition — required fields
// =============================================================================

describe('parseStructureDefinition', () => {
  describe('required fields', () => {
    it('parses a minimal valid StructureDefinition', () => {
      const result = parseStructureDefinition(minimalSD(), 'StructureDefinition');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.resourceType).toBe('StructureDefinition');
      expect(result.data.url).toBe('http://example.org/fhir/StructureDefinition/Test');
      expect(result.data.name).toBe('Test');
      expect(result.data.status).toBe('active');
      expect(result.data.kind).toBe('resource');
      expect(result.data.abstract).toBe(false);
      expect(result.data.type).toBe('Patient');
    });

    it('reports error when url is missing', () => {
      const obj = minimalSD();
      delete obj.url;
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_PRIMITIVE' && i.path.includes('url'))).toBe(true);
    });

    it('reports error when name is missing', () => {
      const obj = minimalSD();
      delete obj.name;
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
      expect(result.issues.some((i) => i.code === 'INVALID_PRIMITIVE' && i.path.includes('name'))).toBe(true);
    });

    it('reports error when status is missing', () => {
      const obj = minimalSD();
      delete obj.status;
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
      expect(result.issues.some((i) => i.path.includes('status'))).toBe(true);
    });

    it('reports error when kind is missing', () => {
      const obj = minimalSD();
      delete obj.kind;
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
      expect(result.issues.some((i) => i.path.includes('kind'))).toBe(true);
    });

    it('reports error when abstract is missing', () => {
      const obj = minimalSD();
      delete obj.abstract;
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
      expect(result.issues.some((i) => i.path.includes('abstract'))).toBe(true);
    });

    it('reports error when type is missing', () => {
      const obj = minimalSD();
      delete obj.type;
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(false);
      expect(result.issues.some((i) => i.path.includes('type'))).toBe(true);
    });
  });

  // ===========================================================================
  // Optional metadata fields
  // ===========================================================================

  describe('optional metadata fields', () => {
    it('parses all optional metadata fields', () => {
      const obj = {
        ...minimalSD(),
        id: 'test-sd',
        version: '1.0.0',
        title: 'Test SD',
        experimental: false,
        date: '2026-02-09',
        publisher: 'Example Org',
        description: 'A test SD',
        purpose: 'Testing',
        copyright: 'CC0',
        fhirVersion: '4.0.1',
        baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
        derivation: 'constraint',
      };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.id).toBe('test-sd');
      expect(result.data.version).toBe('1.0.0');
      expect(result.data.title).toBe('Test SD');
      expect(result.data.experimental).toBe(false);
      expect(result.data.date).toBe('2026-02-09');
      expect(result.data.publisher).toBe('Example Org');
      expect(result.data.description).toBe('A test SD');
      expect(result.data.purpose).toBe('Testing');
      expect(result.data.copyright).toBe('CC0');
      expect(result.data.fhirVersion).toBe('4.0.1');
      expect(result.data.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
      expect(result.data.derivation).toBe('constraint');
    });

    it('parses contextInvariant array', () => {
      const obj = {
        ...minimalSD(),
        contextInvariant: ['ext-1'],
      };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.contextInvariant).toEqual(['ext-1']);
    });
  });

  // ===========================================================================
  // Sub-types: mapping
  // ===========================================================================

  describe('mapping sub-type', () => {
    it('parses mapping array', () => {
      const obj = {
        ...minimalSD(),
        mapping: [
          { identity: 'rim', uri: 'http://hl7.org/v3', name: 'RIM Mapping' },
          { identity: 'v2', uri: 'http://hl7.org/v2' },
        ],
      };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.mapping).toHaveLength(2);
      expect(result.data.mapping![0].identity).toBe('rim');
      expect(result.data.mapping![0].uri).toBe('http://hl7.org/v3');
      expect(result.data.mapping![0].name).toBe('RIM Mapping');
      expect(result.data.mapping![1].identity).toBe('v2');
    });

    it('reports error for mapping without identity', () => {
      const obj = {
        ...minimalSD(),
        mapping: [{ uri: 'http://hl7.org/v3' }],
      };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      // Should still parse (with errors collected)
      expect(result.issues.some((i) => i.path.includes('identity'))).toBe(true);
    });
  });

  // ===========================================================================
  // Sub-types: context
  // ===========================================================================

  describe('context sub-type', () => {
    it('parses context array', () => {
      const obj = {
        ...minimalSD(),
        context: [
          { type: 'element', expression: 'Patient' },
          { type: 'fhirpath', expression: 'Observation.component' },
        ],
      };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.context).toHaveLength(2);
      expect(result.data.context![0].type).toBe('element');
      expect(result.data.context![0].expression).toBe('Patient');
      expect(result.data.context![1].type).toBe('fhirpath');
    });
  });

  // ===========================================================================
  // Sub-types: snapshot & differential
  // ===========================================================================

  describe('snapshot and differential', () => {
    it('parses snapshot with element array', () => {
      const obj = {
        ...minimalSD(),
        snapshot: {
          element: [
            { id: 'Patient', path: 'Patient', min: 0, max: '*' },
            { id: 'Patient.id', path: 'Patient.id', min: 0, max: '1' },
          ],
        },
      };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.snapshot).toBeDefined();
      expect(result.data.snapshot!.element).toHaveLength(2);
      expect(result.data.snapshot!.element[0].path).toBe('Patient');
      expect(result.data.snapshot!.element[1].path).toBe('Patient.id');
    });

    it('parses differential with element array', () => {
      const obj = {
        ...minimalSD(),
        differential: {
          element: [
            { id: 'Patient.name', path: 'Patient.name', min: 1 },
          ],
        },
      };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.differential).toBeDefined();
      expect(result.data.differential!.element).toHaveLength(1);
      expect(result.data.differential!.element[0].min).toBe(1);
    });

    it('reports error when snapshot is not an object', () => {
      const obj = { ...minimalSD(), snapshot: 'invalid' };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.issues.some((i) => i.code === 'INVALID_STRUCTURE' && i.path.includes('snapshot'))).toBe(true);
    });

    it('reports error when snapshot.element is not an array', () => {
      const obj = { ...minimalSD(), snapshot: { element: 'not-array' } };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.issues.some((i) => i.code === 'INVALID_STRUCTURE' && i.path.includes('element'))).toBe(true);
    });
  });

  // ===========================================================================
  // Unknown properties
  // ===========================================================================

  describe('unknown properties', () => {
    it('warns about unknown properties', () => {
      const obj = { ...minimalSD(), unknownField: 'test' };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.success).toBe(true); // warnings don't block success
      expect(result.issues.some((i) => i.code === 'UNEXPECTED_PROPERTY' && i.message.includes('unknownField'))).toBe(true);
    });

    it('does not warn about _element companion properties', () => {
      const obj = { ...minimalSD(), _url: { id: 'url-id' } };
      const result = parseStructureDefinition(obj, 'StructureDefinition');
      expect(result.issues.filter((i) => i.code === 'UNEXPECTED_PROPERTY')).toHaveLength(0);
    });
  });
});

// =============================================================================
// parseElementDefinition
// =============================================================================

describe('parseElementDefinition', () => {
  // ===========================================================================
  // Core fields
  // ===========================================================================

  describe('core fields', () => {
    it('parses minimal ElementDefinition (path only)', () => {
      const { result, issues } = parseElementDefinition({ path: 'Patient' }, 'ED');
      expect(result.path).toBe('Patient');
      expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    });

    it('reports error when path is missing', () => {
      const { issues } = parseElementDefinition({}, 'ED');
      expect(issues.some((i) => i.code === 'INVALID_PRIMITIVE' && i.path.includes('path'))).toBe(true);
    });

    it('parses identity fields: id, sliceName, sliceIsConstraining, label', () => {
      const obj = {
        path: 'Patient.identifier',
        id: 'Patient.identifier:mrn',
        sliceName: 'mrn',
        sliceIsConstraining: false,
        label: 'MRN',
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.id).toBe('Patient.identifier:mrn');
      expect(result.sliceName).toBe('mrn');
      expect(result.sliceIsConstraining).toBe(false);
      expect(result.label).toBe('MRN');
    });
  });

  // ===========================================================================
  // Cardinality
  // ===========================================================================

  describe('cardinality', () => {
    it('parses min and max', () => {
      const { result } = parseElementDefinition({ path: 'Patient.name', min: 1, max: '*' }, 'ED');
      expect(result.min).toBe(1);
      expect(result.max).toBe('*');
    });

    it('parses max as numeric string', () => {
      const { result } = parseElementDefinition({ path: 'Patient.name', max: '3' }, 'ED');
      expect(result.max).toBe('3');
    });
  });

  // ===========================================================================
  // Documentation fields
  // ===========================================================================

  describe('documentation fields', () => {
    it('parses short, definition, comment, requirements', () => {
      const obj = {
        path: 'Patient.name',
        short: 'Patient name',
        definition: 'The name of the patient',
        comment: 'At least one name required',
        requirements: 'Need to track patient by name',
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.short).toBe('Patient name');
      expect(result.definition).toBe('The name of the patient');
      expect(result.comment).toBe('At least one name required');
      expect(result.requirements).toBe('Need to track patient by name');
    });

    it('parses alias array', () => {
      const { result } = parseElementDefinition({ path: 'Patient.name', alias: ['full name', 'legal name'] }, 'ED');
      expect(result.alias).toEqual(['full name', 'legal name']);
    });

    it('parses meaningWhenMissing and orderMeaning', () => {
      const obj = {
        path: 'Patient.active',
        meaningWhenMissing: 'Assumed active',
        orderMeaning: 'N/A',
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.meaningWhenMissing).toBe('Assumed active');
      expect(result.orderMeaning).toBe('N/A');
    });
  });

  // ===========================================================================
  // Flags
  // ===========================================================================

  describe('flags', () => {
    it('parses mustSupport, isModifier, isModifierReason, isSummary', () => {
      const obj = {
        path: 'Patient.active',
        mustSupport: true,
        isModifier: true,
        isModifierReason: 'Changes meaning',
        isSummary: true,
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.mustSupport).toBe(true);
      expect(result.isModifier).toBe(true);
      expect(result.isModifierReason).toBe('Changes meaning');
      expect(result.isSummary).toBe(true);
    });
  });

  // ===========================================================================
  // Sub-type: slicing
  // ===========================================================================

  describe('slicing sub-type', () => {
    it('parses slicing with discriminator', () => {
      const obj = {
        path: 'Patient.identifier',
        slicing: {
          discriminator: [{ type: 'value', path: 'system' }],
          rules: 'open',
          ordered: false,
          description: 'Slice by system',
        },
      };
      const { result, issues } = parseElementDefinition(obj, 'ED');
      expect(result.slicing).toBeDefined();
      expect(result.slicing!.rules).toBe('open');
      expect(result.slicing!.ordered).toBe(false);
      expect(result.slicing!.description).toBe('Slice by system');
      expect(result.slicing!.discriminator).toHaveLength(1);
      expect(result.slicing!.discriminator![0].type).toBe('value');
      expect(result.slicing!.discriminator![0].path).toBe('system');
      expect(issues.filter((i) => i.severity === 'error')).toHaveLength(0);
    });

    it('parses slicing with multiple discriminators', () => {
      const obj = {
        path: 'Patient.telecom',
        slicing: {
          discriminator: [
            { type: 'value', path: 'system' },
            { type: 'value', path: 'use' },
          ],
          rules: 'closed',
        },
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.slicing!.discriminator).toHaveLength(2);
      expect(result.slicing!.rules).toBe('closed');
    });

    it('reports error when slicing is not an object', () => {
      const { issues } = parseElementDefinition({ path: 'P', slicing: 'bad' }, 'ED');
      expect(issues.some((i) => i.code === 'INVALID_STRUCTURE' && i.path.includes('slicing'))).toBe(true);
    });

    it('reports error when slicing.rules is missing', () => {
      const { issues } = parseElementDefinition({ path: 'P', slicing: { discriminator: [] } }, 'ED');
      expect(issues.some((i) => i.path.includes('rules'))).toBe(true);
    });
  });

  // ===========================================================================
  // Sub-type: base
  // ===========================================================================

  describe('base sub-type', () => {
    it('parses base element', () => {
      const obj = {
        path: 'Patient.name',
        base: { path: 'Patient.name', min: 0, max: '*' },
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.base).toBeDefined();
      expect(result.base!.path).toBe('Patient.name');
      expect(result.base!.min).toBe(0);
      expect(result.base!.max).toBe('*');
    });

    it('reports error when base is not an object', () => {
      const { issues } = parseElementDefinition({ path: 'P', base: 'bad' }, 'ED');
      expect(issues.some((i) => i.code === 'INVALID_STRUCTURE' && i.path.includes('base'))).toBe(true);
    });
  });

  // ===========================================================================
  // Sub-type: type[]
  // ===========================================================================

  describe('type sub-type', () => {
    it('parses single type', () => {
      const obj = {
        path: 'Patient.active',
        type: [{ code: 'boolean' }],
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.type).toHaveLength(1);
      expect(result.type![0].code).toBe('boolean');
    });

    it('parses multiple types (choice type)', () => {
      const obj = {
        path: 'Patient.deceased[x]',
        type: [{ code: 'boolean' }, { code: 'dateTime' }],
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.type).toHaveLength(2);
      expect(result.type![0].code).toBe('boolean');
      expect(result.type![1].code).toBe('dateTime');
    });

    it('parses type with profile and targetProfile', () => {
      const obj = {
        path: 'Patient.generalPractitioner',
        type: [{
          code: 'Reference',
          targetProfile: ['http://hl7.org/fhir/StructureDefinition/Practitioner'],
          profile: ['http://hl7.org/fhir/StructureDefinition/Reference'],
        }],
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.type![0].code).toBe('Reference');
      expect(result.type![0].targetProfile).toEqual(['http://hl7.org/fhir/StructureDefinition/Practitioner']);
      expect(result.type![0].profile).toEqual(['http://hl7.org/fhir/StructureDefinition/Reference']);
    });

    it('parses type with aggregation and versioning', () => {
      const obj = {
        path: 'Patient.managingOrganization',
        type: [{
          code: 'Reference',
          aggregation: ['referenced'],
          versioning: 'independent',
        }],
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.type![0].aggregation).toEqual(['referenced']);
      expect(result.type![0].versioning).toBe('independent');
    });

    it('reports error when type.code is missing', () => {
      const { issues } = parseElementDefinition({ path: 'P', type: [{}] }, 'ED');
      expect(issues.some((i) => i.path.includes('code'))).toBe(true);
    });
  });

  // ===========================================================================
  // Sub-type: constraint[]
  // ===========================================================================

  describe('constraint sub-type', () => {
    it('parses constraint with all fields', () => {
      const obj = {
        path: 'Patient',
        constraint: [{
          key: 'pat-1',
          severity: 'error',
          human: 'Must have name or identifier',
          expression: 'name.exists() or identifier.exists()',
          xpath: 'f:name or f:identifier',
          source: 'http://example.org/fhir/StructureDefinition/Test',
          requirements: 'Patient matching',
        }],
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.constraint).toHaveLength(1);
      const c = result.constraint![0];
      expect(c.key).toBe('pat-1');
      expect(c.severity).toBe('error');
      expect(c.human).toBe('Must have name or identifier');
      expect(c.expression).toBe('name.exists() or identifier.exists()');
      expect(c.xpath).toBe('f:name or f:identifier');
      expect(c.source).toBe('http://example.org/fhir/StructureDefinition/Test');
    });

    it('parses multiple constraints', () => {
      const obj = {
        path: 'Patient.contact',
        constraint: [
          { key: 'c-1', severity: 'error', human: 'Constraint 1' },
          { key: 'c-2', severity: 'warning', human: 'Constraint 2' },
        ],
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.constraint).toHaveLength(2);
    });
  });

  // ===========================================================================
  // Sub-type: binding
  // ===========================================================================

  describe('binding sub-type', () => {
    it('parses binding with all fields', () => {
      const obj = {
        path: 'Patient.gender',
        binding: {
          strength: 'required',
          description: 'Administrative gender',
          valueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1',
        },
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.binding).toBeDefined();
      expect(result.binding!.strength).toBe('required');
      expect(result.binding!.description).toBe('Administrative gender');
      expect(result.binding!.valueSet).toBe('http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1');
    });

    it('reports error when binding is not an object', () => {
      const { issues } = parseElementDefinition({ path: 'P', binding: 'bad' }, 'ED');
      expect(issues.some((i) => i.code === 'INVALID_STRUCTURE' && i.path.includes('binding'))).toBe(true);
    });

    it('reports error when binding.strength is missing', () => {
      const { issues } = parseElementDefinition({ path: 'P', binding: { valueSet: 'http://x' } }, 'ED');
      expect(issues.some((i) => i.path.includes('strength'))).toBe(true);
    });
  });

  // ===========================================================================
  // Sub-type: example[]
  // ===========================================================================

  describe('example sub-type', () => {
    it('parses example with choice type value', () => {
      const obj = {
        path: 'Observation.value[x]',
        example: [{
          label: 'Normal heart rate',
          valueQuantity: { value: 72, unit: '/min' },
        }],
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.example).toHaveLength(1);
      expect(result.example![0].label).toBe('Normal heart rate');
      expect(result.example![0].value).toBeDefined();
    });

    it('reports error when example.label is missing', () => {
      const { issues } = parseElementDefinition({
        path: 'P',
        example: [{ valueString: 'test' }],
      }, 'ED');
      expect(issues.some((i) => i.path.includes('label'))).toBe(true);
    });
  });

  // ===========================================================================
  // Sub-type: mapping[]
  // ===========================================================================

  describe('mapping sub-type', () => {
    it('parses mapping array', () => {
      const obj = {
        path: 'Patient.identifier',
        mapping: [
          { identity: 'v2', map: 'PID-3' },
          { identity: 'rim', map: '.id', language: 'application/xml', comment: 'RIM mapping' },
        ],
      };
      const { result } = parseElementDefinition(obj, 'ED');
      expect(result.mapping).toHaveLength(2);
      expect(result.mapping![0].identity).toBe('v2');
      expect(result.mapping![0].map).toBe('PID-3');
      expect(result.mapping![1].language).toBe('application/xml');
      expect(result.mapping![1].comment).toBe('RIM mapping');
    });
  });

  // ===========================================================================
  // Additional fields: code, representation, condition, contentReference, maxLength
  // ===========================================================================

  describe('additional fields', () => {
    it('parses code array', () => {
      const { result } = parseElementDefinition({
        path: 'Patient.name',
        code: [{ system: 'http://loinc.org', code: '54125-0' }],
      }, 'ED');
      expect(result.code).toHaveLength(1);
      expect(result.code![0].code).toBe('54125-0');
    });

    it('parses representation array', () => {
      const { result } = parseElementDefinition({
        path: 'Patient.name',
        representation: ['xmlAttr'],
      }, 'ED');
      expect(result.representation).toEqual(['xmlAttr']);
    });

    it('parses condition array', () => {
      const { result } = parseElementDefinition({
        path: 'Patient.contact',
        condition: ['pat-1'],
      }, 'ED');
      expect(result.condition).toEqual(['pat-1']);
    });

    it('parses contentReference', () => {
      const { result } = parseElementDefinition({
        path: 'Questionnaire.item.item',
        contentReference: '#Questionnaire.item',
      }, 'ED');
      expect(result.contentReference).toBe('#Questionnaire.item');
    });

    it('parses maxLength', () => {
      const { result } = parseElementDefinition({
        path: 'Patient.name.family',
        maxLength: 100,
      }, 'ED');
      expect(result.maxLength).toBe(100);
    });
  });

  // ===========================================================================
  // Choice type fields on ElementDefinition
  // ===========================================================================

  describe('choice type fields', () => {
    it('parses fixedCode', () => {
      const { result } = parseElementDefinition({
        path: 'Observation.status',
        fixedCode: 'final',
      }, 'ED');
      expect(result.fixed).toBeDefined();
    });

    it('parses patternCodeableConcept', () => {
      const { result } = parseElementDefinition({
        path: 'Observation.code',
        patternCodeableConcept: { coding: [{ system: 'http://loinc.org', code: '8867-4' }] },
      }, 'ED');
      expect(result.pattern).toBeDefined();
    });

    it('parses defaultValueBoolean', () => {
      const { result } = parseElementDefinition({
        path: 'Patient.active',
        defaultValueBoolean: true,
      }, 'ED');
      expect(result.defaultValue).toBeDefined();
    });

    it('parses minValueInteger and maxValueInteger', () => {
      const { result } = parseElementDefinition({
        path: 'SomeElement',
        minValueInteger: 0,
        maxValueInteger: 100,
      }, 'ED');
      expect(result.minValue).toBeDefined();
      expect(result.maxValue).toBeDefined();
    });
  });

  // ===========================================================================
  // Unknown properties in ElementDefinition
  // ===========================================================================

  describe('unknown properties', () => {
    it('warns about unknown properties in ElementDefinition', () => {
      const { issues } = parseElementDefinition({
        path: 'Patient',
        unknownField: 'test',
      }, 'ED');
      expect(issues.some((i) => i.code === 'UNEXPECTED_PROPERTY' && i.message.includes('unknownField'))).toBe(true);
    });

    it('does not warn about _element companions', () => {
      const { issues } = parseElementDefinition({
        path: 'Patient',
        _path: { id: 'path-id' },
      }, 'ED');
      expect(issues.filter((i) => i.code === 'UNEXPECTED_PROPERTY')).toHaveLength(0);
    });

    it('does not warn about choice type properties', () => {
      const { issues } = parseElementDefinition({
        path: 'Observation.status',
        fixedCode: 'final',
      }, 'ED');
      expect(issues.filter((i) => i.code === 'UNEXPECTED_PROPERTY')).toHaveLength(0);
    });
  });
});

// =============================================================================
// Integration: parseFhirJson / parseFhirObject dispatch
// =============================================================================

describe('json-parser dispatch for StructureDefinition', () => {
  it('parseFhirObject dispatches to SD parser', () => {
    const result = parseFhirObject(minimalSD());
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.resourceType).toBe('StructureDefinition');
    expect((result.data as StructureDefinition).url).toBe('http://example.org/fhir/StructureDefinition/Test');
    expect((result.data as StructureDefinition).kind).toBe('resource');
  });

  it('parseFhirJson parses SD from JSON string', () => {
    const json = JSON.stringify(minimalSD());
    const result = parseFhirJson(json);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.resourceType).toBe('StructureDefinition');
    expect((result.data as StructureDefinition).name).toBe('Test');
  });

  it('parseFhirObject still handles non-SD resources generically', () => {
    const result = parseFhirObject({ resourceType: 'Patient', id: '123' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.resourceType).toBe('Patient');
  });
});

// =============================================================================
// Integration: fixture file parsing
// =============================================================================

describe('fixture file parsing', () => {
  it('parses minimal-structure-definition.json without errors', () => {
    const json = loadFixture('minimal-structure-definition.json');
    const result = parseFhirJson(json);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const sd = result.data as StructureDefinition;
    expect(sd.resourceType).toBe('StructureDefinition');
    expect(sd.url).toBe('http://example.org/fhir/StructureDefinition/test');
    expect(sd.name).toBe('TestStructureDefinition');
    expect(sd.status).toBe('draft');
    expect(sd.kind).toBe('resource');
    expect(sd.abstract).toBe(false);
    expect(sd.type).toBe('Patient');
    expect(sd.snapshot).toBeDefined();
    expect(sd.snapshot!.element).toHaveLength(2);
    expect(sd.snapshot!.element[0].path).toBe('Patient');
    expect(sd.snapshot!.element[0].base).toBeDefined();
    expect(sd.snapshot!.element[0].base!.path).toBe('Patient');
    expect(sd.snapshot!.element[1].path).toBe('Patient.id');
    expect(sd.snapshot!.element[1].type).toHaveLength(1);
    expect(sd.snapshot!.element[1].type![0].code).toBe('http://hl7.org/fhirpath/System.String');
  });
});

// =============================================================================
// Complex real-world-like SD
// =============================================================================

describe('complex StructureDefinition parsing', () => {
  it('parses a full profile with slicing, binding, constraints, and extensions', () => {
    const obj = {
      resourceType: 'StructureDefinition',
      id: 'us-core-patient',
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
      version: '5.0.0',
      name: 'USCorePatientProfile',
      title: 'US Core Patient Profile',
      status: 'active',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      differential: {
        element: [
          {
            id: 'Patient',
            path: 'Patient',
            constraint: [{
              key: 'us-core-6',
              severity: 'error',
              human: 'Must have name or identifier',
              expression: 'name.exists() or identifier.exists()',
            }],
          },
          {
            id: 'Patient.extension',
            path: 'Patient.extension',
            slicing: {
              discriminator: [{ type: 'value', path: 'url' }],
              rules: 'open',
            },
          },
          {
            id: 'Patient.extension:race',
            path: 'Patient.extension',
            sliceName: 'race',
            min: 0,
            max: '1',
            type: [{
              code: 'Extension',
              profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-race'],
            }],
            mustSupport: true,
          },
          {
            id: 'Patient.identifier',
            path: 'Patient.identifier',
            min: 1,
            mustSupport: true,
            slicing: {
              discriminator: [{ type: 'value', path: 'system' }],
              rules: 'open',
            },
          },
          {
            id: 'Patient.identifier:mrn',
            path: 'Patient.identifier',
            sliceName: 'mrn',
            min: 1,
            max: '1',
          },
          {
            id: 'Patient.identifier:mrn.system',
            path: 'Patient.identifier.system',
            fixedUri: 'http://hospital.example.org/mrn',
          },
          {
            id: 'Patient.name',
            path: 'Patient.name',
            min: 1,
            mustSupport: true,
          },
          {
            id: 'Patient.gender',
            path: 'Patient.gender',
            min: 1,
            mustSupport: true,
            binding: {
              strength: 'required',
              valueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1',
            },
          },
        ],
      },
    };

    const result = parseStructureDefinition(obj, 'StructureDefinition');
    expect(result.success).toBe(true);
    if (!result.success) return;

    const sd = result.data;
    expect(sd.url).toBe('http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient');
    expect(sd.derivation).toBe('constraint');
    expect(sd.differential).toBeDefined();

    const elements = sd.differential!.element;
    expect(elements).toHaveLength(8);

    // Root constraint
    expect(elements[0].constraint).toHaveLength(1);
    expect(elements[0].constraint![0].key).toBe('us-core-6');

    // Extension slicing
    expect(elements[1].slicing).toBeDefined();
    expect(elements[1].slicing!.discriminator![0].type).toBe('value');

    // Extension slice
    expect(elements[2].sliceName).toBe('race');
    expect(elements[2].type![0].profile).toEqual(['http://hl7.org/fhir/us/core/StructureDefinition/us-core-race']);
    expect(elements[2].mustSupport).toBe(true);

    // Identifier slicing
    expect(elements[3].slicing).toBeDefined();
    expect(elements[3].min).toBe(1);

    // Identifier slice child
    expect(elements[5].fixed).toBeDefined(); // fixedUri

    // Gender binding
    expect(elements[7].binding).toBeDefined();
    expect(elements[7].binding!.strength).toBe('required');
    expect(elements[7].binding!.valueSet).toBe('http://hl7.org/fhir/ValueSet/administrative-gender|4.0.1');
  });
});
