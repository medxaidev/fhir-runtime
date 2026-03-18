import { describe, it, expect } from 'vitest';
import { extractElementIndexRows } from '../element-index-extractor.js';
import type { StructureDefinition } from '../../model/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeSD(id: string, elements: any[]): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    id,
    url: `http://test/${id}`,
    name: id,
    kind: 'resource',
    type: 'Patient',
    abstract: false,
    status: 'active',
    snapshot: { element: elements },
  } as unknown as StructureDefinition;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('extractElementIndexRows', () => {
  it('extracts basic element fields', () => {
    const sd = makeSD('Patient', [
      { id: 'Patient', path: 'Patient', min: 0, max: '*' },
      { id: 'Patient.id', path: 'Patient.id', min: 0, max: '1', type: [{ code: 'id' }] },
      { id: 'Patient.name', path: 'Patient.name', min: 0, max: '*', type: [{ code: 'HumanName' }] },
    ]);
    const rows = extractElementIndexRows(sd);
    expect(rows.length).toBe(3);

    const nameRow = rows.find(r => r.path === 'Patient.name')!;
    expect(nameRow.id).toBe('Patient:Patient.name');
    expect(nameRow.structureId).toBe('Patient');
    expect(nameRow.min).toBe(0);
    expect(nameRow.max).toBe('*');
    expect(nameRow.typeCodes).toEqual(['HumanName']);
    expect(nameRow.isSlice).toBe(false);
    expect(nameRow.isExtension).toBe(false);
    expect(nameRow.mustSupport).toBe(false);
  });

  it('detects slice elements', () => {
    const sd = makeSD('USCorePatient', [
      {
        id: 'Patient.identifier:MRN',
        path: 'Patient.identifier',
        sliceName: 'MRN',
        min: 0,
        max: '1',
        type: [{ code: 'Identifier' }],
        mustSupport: true,
      },
    ]);
    const rows = extractElementIndexRows(sd);
    expect(rows.length).toBe(1);
    expect(rows[0].isSlice).toBe(true);
    expect(rows[0].sliceName).toBe('MRN');
    expect(rows[0].mustSupport).toBe(true);
  });

  it('detects extension elements', () => {
    const sd = makeSD('USCorePatient', [
      {
        id: 'Patient.extension:race',
        path: 'Patient.extension',
        sliceName: 'race',
        min: 0,
        max: '1',
        type: [{ code: 'Extension', profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-race'] }],
      },
    ]);
    const rows = extractElementIndexRows(sd);
    expect(rows[0].isExtension).toBe(true);
    expect(rows[0].isSlice).toBe(true);
  });

  it('extracts binding valueSet', () => {
    const sd = makeSD('Patient', [
      {
        id: 'Patient.gender',
        path: 'Patient.gender',
        min: 0,
        max: '1',
        type: [{ code: 'code' }],
        binding: {
          strength: 'required',
          valueSet: 'http://hl7.org/fhir/ValueSet/administrative-gender',
        },
      },
    ]);
    const rows = extractElementIndexRows(sd);
    expect(rows[0].bindingValueSet).toBe('http://hl7.org/fhir/ValueSet/administrative-gender');
  });

  it('handles elements without type', () => {
    const sd = makeSD('Patient', [
      { id: 'Patient', path: 'Patient', min: 0, max: '*' },
    ]);
    const rows = extractElementIndexRows(sd);
    expect(rows[0].typeCodes).toEqual([]);
    expect(rows[0].isExtension).toBe(false);
  });

  it('returns empty for SD without snapshot', () => {
    const sd = {
      resourceType: 'StructureDefinition',
      id: 'Empty',
      url: 'http://test/Empty',
      name: 'Empty',
      kind: 'resource',
      type: 'Patient',
      abstract: false,
      status: 'active',
    } as unknown as StructureDefinition;
    expect(extractElementIndexRows(sd)).toEqual([]);
  });

  it('uses url as structureId when id is missing', () => {
    const sd = {
      resourceType: 'StructureDefinition',
      url: 'http://test/NoId',
      name: 'NoId',
      kind: 'resource',
      type: 'Patient',
      abstract: false,
      status: 'active',
      snapshot: { element: [{ id: 'Patient', path: 'Patient', min: 0, max: '*' }] },
    } as unknown as StructureDefinition;
    const rows = extractElementIndexRows(sd);
    expect(rows[0].structureId).toBe('http://test/NoId');
  });

  it('handles multiple type codes (choice type)', () => {
    const sd = makeSD('Observation', [
      {
        id: 'Observation.value[x]',
        path: 'Observation.value[x]',
        min: 0,
        max: '1',
        type: [{ code: 'Quantity' }, { code: 'string' }, { code: 'CodeableConcept' }],
      },
    ]);
    const rows = extractElementIndexRows(sd);
    expect(rows[0].typeCodes).toEqual(['Quantity', 'string', 'CodeableConcept']);
  });
});
