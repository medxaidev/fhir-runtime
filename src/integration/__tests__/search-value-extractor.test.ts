/**
 * Search Value Extractor Tests
 */
import { describe, it, expect } from 'vitest';
import { extractSearchValues, extractAllSearchValues } from '../search-value-extractor.js';
import type { SearchParameter } from '../types.js';
import type { Resource } from '../../model/index.js';

// =============================================================================
// Helpers
// =============================================================================

function makeSP(overrides: Partial<SearchParameter> & { code: string; type: SearchParameter['type']; base: string[] }): SearchParameter {
  return {
    resourceType: 'SearchParameter',
    url: `http://test.org/sp/${overrides.code}`,
    name: overrides.code,
    status: 'active',
    ...overrides,
  };
}

// =============================================================================
// String type extraction
// =============================================================================

describe('extractSearchValues — string', () => {
  const patient = {
    resourceType: 'Patient',
    name: [{ family: 'Smith', given: ['John', 'M'] }],
    address: [{ line: ['123 Main St'], city: 'Boston', state: 'MA', postalCode: '02101' }],
  } as unknown as Resource;

  const nameSP = makeSP({ code: 'name', type: 'string', base: ['Patient'], expression: 'Patient.name' });

  it('extracts string values from HumanName', () => {
    const entry = extractSearchValues(patient, nameSP);
    expect(entry.code).toBe('name');
    expect(entry.type).toBe('string');
    expect(entry.values.length).toBeGreaterThan(0);
    expect(entry.values[0].type).toBe('string');
  });

  it('extracts address values', () => {
    const sp = makeSP({ code: 'address', type: 'string', base: ['Patient'], expression: 'Patient.address' });
    const entry = extractSearchValues(patient, sp);
    expect(entry.values.length).toBeGreaterThan(0);
  });

  it('extracts simple string field', () => {
    const obs = { resourceType: 'Observation', id: 'obs1', status: 'final' } as unknown as Resource;
    const sp = makeSP({ code: 'status', type: 'string', base: ['Observation'], expression: 'Observation.status' });
    const entry = extractSearchValues(obs, sp);
    expect(entry.values.length).toBe(1);
    if (entry.values[0].type === 'string') {
      expect(entry.values[0].value).toBe('final');
    }
  });

  it('returns empty for non-matching resource type', () => {
    const sp = makeSP({ code: 'name', type: 'string', base: ['Practitioner'], expression: 'Practitioner.name' });
    const entry = extractSearchValues(patient, sp);
    expect(entry.values).toHaveLength(0);
  });

  it('returns empty when no expression', () => {
    const sp = makeSP({ code: 'test', type: 'string', base: ['Patient'] });
    const entry = extractSearchValues(patient, sp);
    expect(entry.values).toHaveLength(0);
  });
});

// =============================================================================
// Token type extraction
// =============================================================================

describe('extractSearchValues — token', () => {
  const patient = {
    resourceType: 'Patient',
    gender: 'male',
    active: true,
    identifier: [
      { system: 'http://hospital.org/mrn', value: 'MRN-123' },
    ],
    maritalStatus: {
      coding: [{ system: 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus', code: 'M', display: 'Married' }],
      text: 'Married',
    },
  } as unknown as Resource;

  it('extracts code (gender)', () => {
    const sp = makeSP({ code: 'gender', type: 'token', base: ['Patient'], expression: 'Patient.gender' });
    const entry = extractSearchValues(patient, sp);
    expect(entry.values).toHaveLength(1);
    expect(entry.values[0]).toEqual({ type: 'token', code: 'male' });
  });

  it('extracts boolean (active)', () => {
    const sp = makeSP({ code: 'active', type: 'token', base: ['Patient'], expression: 'Patient.active' });
    const entry = extractSearchValues(patient, sp);
    expect(entry.values).toHaveLength(1);
    expect(entry.values[0]).toEqual({ type: 'token', code: 'true' });
  });

  it('extracts Identifier', () => {
    const sp = makeSP({ code: 'identifier', type: 'token', base: ['Patient'], expression: 'Patient.identifier' });
    const entry = extractSearchValues(patient, sp);
    expect(entry.values).toHaveLength(1);
    if (entry.values[0].type === 'token') {
      expect(entry.values[0].system).toBe('http://hospital.org/mrn');
      expect(entry.values[0].code).toBe('MRN-123');
    }
  });

  it('extracts CodeableConcept', () => {
    const sp = makeSP({ code: 'marital-status', type: 'token', base: ['Patient'], expression: 'Patient.maritalStatus' });
    const entry = extractSearchValues(patient, sp);
    expect(entry.values).toHaveLength(1);
    if (entry.values[0].type === 'token') {
      expect(entry.values[0].system).toBe('http://terminology.hl7.org/CodeSystem/v3-MaritalStatus');
      expect(entry.values[0].code).toBe('M');
    }
  });
});

// =============================================================================
// Reference type extraction
// =============================================================================

describe('extractSearchValues — reference', () => {
  const obs = {
    resourceType: 'Observation',
    subject: { reference: 'Patient/123' },
    performer: [{ reference: 'Practitioner/456' }],
  } as unknown as Resource;

  it('extracts literal reference', () => {
    const sp = makeSP({ code: 'subject', type: 'reference', base: ['Observation'], expression: 'Observation.subject' });
    const entry = extractSearchValues(obs, sp);
    expect(entry.values).toHaveLength(1);
    if (entry.values[0].type === 'reference') {
      expect(entry.values[0].reference).toBe('Patient/123');
      expect(entry.values[0].resourceType).toBe('Patient');
      expect(entry.values[0].id).toBe('123');
    }
  });

  it('extracts array references', () => {
    const sp = makeSP({ code: 'performer', type: 'reference', base: ['Observation'], expression: 'Observation.performer' });
    const entry = extractSearchValues(obs, sp);
    expect(entry.values).toHaveLength(1);
  });
});

// =============================================================================
// Date type extraction
// =============================================================================

describe('extractSearchValues — date', () => {
  const patient = {
    resourceType: 'Patient',
    birthDate: '1990-01-15',
  } as unknown as Resource;

  it('extracts date value', () => {
    const sp = makeSP({ code: 'birthdate', type: 'date', base: ['Patient'], expression: 'Patient.birthDate' });
    const entry = extractSearchValues(patient, sp);
    expect(entry.values).toHaveLength(1);
    expect(entry.values[0]).toEqual({ type: 'date', value: '1990-01-15' });
  });

  it('extracts dateTime value', () => {
    const obs = {
      resourceType: 'Observation',
      effectiveDateTime: '2024-03-15T10:30:00Z',
    } as unknown as Resource;
    const sp = makeSP({ code: 'date', type: 'date', base: ['Observation'], expression: 'Observation.effectiveDateTime' });
    const entry = extractSearchValues(obs, sp);
    expect(entry.values).toHaveLength(1);
    if (entry.values[0].type === 'date') {
      expect(entry.values[0].value).toBe('2024-03-15T10:30:00Z');
    }
  });
});

// =============================================================================
// Number type extraction
// =============================================================================

describe('extractSearchValues — number', () => {
  it('extracts numeric value', () => {
    const resource = {
      resourceType: 'RiskAssessment',
      prediction: [{ probabilityDecimal: 0.75 }],
    } as unknown as Resource;
    const sp = makeSP({
      code: 'probability',
      type: 'number',
      base: ['RiskAssessment'],
      expression: 'RiskAssessment.prediction.probabilityDecimal',
    });
    const entry = extractSearchValues(resource, sp);
    expect(entry.values).toHaveLength(1);
    expect(entry.values[0]).toEqual({ type: 'number', value: 0.75 });
  });
});

// =============================================================================
// Quantity type extraction
// =============================================================================

describe('extractSearchValues — quantity', () => {
  it('extracts Quantity value', () => {
    const obs = {
      resourceType: 'Observation',
      valueQuantity: { value: 120, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
    } as unknown as Resource;
    const sp = makeSP({
      code: 'value-quantity',
      type: 'quantity',
      base: ['Observation'],
      expression: 'Observation.valueQuantity',
    });
    const entry = extractSearchValues(obs, sp);
    expect(entry.values).toHaveLength(1);
    if (entry.values[0].type === 'quantity') {
      expect(entry.values[0].value).toBe(120);
      expect(entry.values[0].unit).toBe('mmHg');
      expect(entry.values[0].system).toBe('http://unitsofmeasure.org');
      expect(entry.values[0].code).toBe('mm[Hg]');
    }
  });
});

// =============================================================================
// URI type extraction
// =============================================================================

describe('extractSearchValues — uri', () => {
  it('extracts uri value', () => {
    const sd = {
      resourceType: 'StructureDefinition',
      url: 'http://example.org/fhir/StructureDefinition/MyProfile',
    } as unknown as Resource;
    const sp = makeSP({
      code: 'url',
      type: 'uri',
      base: ['StructureDefinition'],
      expression: 'StructureDefinition.url',
    });
    const entry = extractSearchValues(sd, sp);
    expect(entry.values).toHaveLength(1);
    expect(entry.values[0]).toEqual({ type: 'uri', value: 'http://example.org/fhir/StructureDefinition/MyProfile' });
  });
});

// =============================================================================
// extractAllSearchValues
// =============================================================================

describe('extractAllSearchValues', () => {
  const patient = {
    resourceType: 'Patient',
    gender: 'female',
    birthDate: '1985-06-20',
    name: [{ family: 'Doe', given: ['Jane'] }],
  } as unknown as Resource;

  const searchParams: SearchParameter[] = [
    makeSP({ code: 'gender', type: 'token', base: ['Patient'], expression: 'Patient.gender' }),
    makeSP({ code: 'birthdate', type: 'date', base: ['Patient'], expression: 'Patient.birthDate' }),
    makeSP({ code: 'name', type: 'string', base: ['Patient'], expression: 'Patient.name' }),
    makeSP({ code: 'code', type: 'token', base: ['Observation'], expression: 'Observation.code' }),
  ];

  it('extracts values for all matching search params', () => {
    const entries = extractAllSearchValues(patient, searchParams);
    expect(entries).toHaveLength(3);
    const codes = entries.map(e => e.code);
    expect(codes).toContain('gender');
    expect(codes).toContain('birthdate');
    expect(codes).toContain('name');
  });

  it('skips non-applicable search params', () => {
    const entries = extractAllSearchValues(patient, searchParams);
    const codes = entries.map(e => e.code);
    expect(codes).not.toContain('code');
  });

  it('handles Resource base type', () => {
    const sp = makeSP({ code: '_id', type: 'token', base: ['Resource'], expression: 'id' });
    const patientWithId = { ...patient, id: 'p1' } as unknown as Resource;
    const entries = extractAllSearchValues(patientWithId, [sp]);
    expect(entries).toHaveLength(1);
    expect(entries[0].code).toBe('_id');
  });

  it('returns empty for resource with no matching params', () => {
    const obs = { resourceType: 'Observation', status: 'final' } as unknown as Resource;
    const onlyPatientParams = [
      makeSP({ code: 'gender', type: 'token', base: ['Patient'], expression: 'Patient.gender' }),
    ];
    const entries = extractAllSearchValues(obs, onlyPatientParams);
    expect(entries).toHaveLength(0);
  });

  it('handles invalid FHIRPath gracefully', () => {
    const sp = makeSP({ code: 'bad', type: 'string', base: ['Patient'], expression: '!!!invalid!!!' });
    const entry = extractSearchValues(patient, sp);
    expect(entry.values).toHaveLength(0);
  });
});
