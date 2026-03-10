/**
 * Integration End-to-End Tests
 *
 * Tests the full integration workflow: parse SearchParameters,
 * extract values, extract references, build CapabilityStatement fragments.
 */
import { describe, it, expect } from 'vitest';
import {
  parseSearchParameter,
  parseSearchParametersFromBundle,
  extractSearchValues,
  extractAllSearchValues,
  extractReferences,
  extractReferencesFromBundle,
  buildCapabilityFragment,
  ResourceTypeRegistry,
  FHIR_R4_RESOURCE_TYPES,
} from '../index.js';
import type { SearchParameter } from '../types.js';
import type { Resource } from '../../model/index.js';
import type { CanonicalProfile } from '../../model/index.js';

// =============================================================================
// Full pipeline: parse SP → extract values
// =============================================================================

describe('Integration: parse + extract pipeline', () => {
  const patientResource = {
    resourceType: 'Patient',
    id: 'pat-1',
    gender: 'female',
    birthDate: '1985-06-20',
    name: [{ family: 'Johnson', given: ['Alice', 'M'] }],
    identifier: [
      { system: 'http://hospital.org/mrn', value: 'MRN-001' },
    ],
    address: [{ city: 'Boston', state: 'MA' }],
    managingOrganization: { reference: 'Organization/org-1' },
    generalPractitioner: [{ reference: 'Practitioner/doc-1' }],
    active: true,
  } as unknown as Resource;

  it('parses SearchParameter and extracts string values', () => {
    const spJson = {
      resourceType: 'SearchParameter',
      url: 'http://hl7.org/fhir/SearchParameter/Patient-name',
      name: 'name', status: 'active', code: 'name',
      base: ['Patient'], type: 'string',
      expression: 'Patient.name',
    };

    const parseResult = parseSearchParameter(spJson);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const entry = extractSearchValues(patientResource, parseResult.data);
    expect(entry.code).toBe('name');
    expect(entry.values.length).toBeGreaterThan(0);
  });

  it('parses SearchParameter and extracts token values', () => {
    const spJson = {
      resourceType: 'SearchParameter',
      url: 'http://hl7.org/fhir/SearchParameter/Patient-gender',
      name: 'gender', status: 'active', code: 'gender',
      base: ['Patient'], type: 'token',
      expression: 'Patient.gender',
    };

    const parseResult = parseSearchParameter(spJson);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const entry = extractSearchValues(patientResource, parseResult.data);
    expect(entry.values).toHaveLength(1);
    expect(entry.values[0]).toEqual({ type: 'token', code: 'female' });
  });

  it('parses SearchParameter and extracts date values', () => {
    const spJson = {
      resourceType: 'SearchParameter',
      url: 'http://hl7.org/fhir/SearchParameter/Patient-birthdate',
      name: 'birthdate', status: 'active', code: 'birthdate',
      base: ['Patient'], type: 'date',
      expression: 'Patient.birthDate',
    };

    const parseResult = parseSearchParameter(spJson);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const entry = extractSearchValues(patientResource, parseResult.data);
    expect(entry.values).toHaveLength(1);
    expect(entry.values[0]).toEqual({ type: 'date', value: '1985-06-20' });
  });

  it('extracts references and search values from same resource', () => {
    const refs = extractReferences(patientResource);
    expect(refs.length).toBeGreaterThanOrEqual(2);

    const orgRef = refs.find(r => r.targetType === 'Organization');
    expect(orgRef).toBeDefined();
    expect(orgRef!.targetId).toBe('org-1');

    const pracRef = refs.find(r => r.targetType === 'Practitioner');
    expect(pracRef).toBeDefined();
  });
});

// =============================================================================
// Bundle workflow: parse bundle → extract all
// =============================================================================

describe('Integration: Bundle workflow', () => {
  it('parses SP bundle and extracts all values from a resource', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        {
          resource: {
            resourceType: 'SearchParameter',
            url: 'http://hl7.org/fhir/SearchParameter/Patient-gender',
            name: 'gender', status: 'active', code: 'gender',
            base: ['Patient'], type: 'token',
            expression: 'Patient.gender',
          },
        },
        {
          resource: {
            resourceType: 'SearchParameter',
            url: 'http://hl7.org/fhir/SearchParameter/Patient-birthdate',
            name: 'birthdate', status: 'active', code: 'birthdate',
            base: ['Patient'], type: 'date',
            expression: 'Patient.birthDate',
          },
        },
      ],
    };

    const parseResult = parseSearchParametersFromBundle(bundle);
    expect(parseResult.success).toBe(true);
    if (!parseResult.success) return;

    const patient = {
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '2000-01-01',
    } as unknown as Resource;

    const entries = extractAllSearchValues(patient, parseResult.data);
    expect(entries).toHaveLength(2);
  });

  it('extracts references from bundle entries', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'transaction',
      entry: [
        {
          resource: {
            resourceType: 'Observation',
            subject: { reference: 'Patient/1' },
            performer: [{ reference: 'Practitioner/2' }],
          },
        },
        {
          resource: {
            resourceType: 'Condition',
            subject: { reference: 'Patient/1' },
            encounter: { reference: 'Encounter/3' },
          },
        },
      ],
    };

    const refs = extractReferencesFromBundle(bundle);
    expect(refs.length).toBeGreaterThanOrEqual(4);
  });
});

// =============================================================================
// CapabilityStatement generation workflow
// =============================================================================

describe('Integration: CapabilityStatement generation', () => {
  it('generates capability fragment from profiles and search params', () => {
    const profiles: CanonicalProfile[] = [
      {
        url: 'http://hl7.org/fhir/StructureDefinition/Patient',
        name: 'Patient',
        kind: 'resource',
        type: 'Patient',
        abstract: false,
        derivation: 'specialization',
        elements: new Map(),
      },
      {
        url: 'http://hl7.org/fhir/StructureDefinition/Observation',
        name: 'Observation',
        kind: 'resource',
        type: 'Observation',
        abstract: false,
        derivation: 'specialization',
        elements: new Map(),
      },
    ];

    const searchParams: SearchParameter[] = [
      {
        resourceType: 'SearchParameter',
        url: 'http://hl7.org/fhir/SearchParameter/Patient-gender',
        name: 'gender', status: 'active', code: 'gender',
        base: ['Patient'], type: 'token',
      },
      {
        resourceType: 'SearchParameter',
        url: 'http://hl7.org/fhir/SearchParameter/clinical-date',
        name: 'date', status: 'active', code: 'date',
        base: ['Observation', 'Condition'], type: 'date',
      },
    ];

    const fragment = buildCapabilityFragment(profiles, searchParams);
    expect(fragment.mode).toBe('server');
    expect(fragment.resource).toHaveLength(2);

    const patientRes = fragment.resource.find(r => r.type === 'Patient');
    expect(patientRes).toBeDefined();
    expect(patientRes!.searchParam).toHaveLength(1);
    expect(patientRes!.searchParam![0].name).toBe('gender');

    const obsRes = fragment.resource.find(r => r.type === 'Observation');
    expect(obsRes).toBeDefined();
    expect(obsRes!.searchParam).toHaveLength(1);
    expect(obsRes!.searchParam![0].name).toBe('date');
  });
});

// =============================================================================
// ResourceTypeRegistry integration
// =============================================================================

describe('Integration: ResourceTypeRegistry', () => {
  it('builds registry from list and checks known types', () => {
    const types = FHIR_R4_RESOURCE_TYPES.slice(0, 10).map(type => ({
      type,
      url: `http://hl7.org/fhir/StructureDefinition/${type}`,
      kind: 'resource',
      abstract: false,
    }));

    const registry = ResourceTypeRegistry.fromList(types);
    expect(registry.size).toBe(10);

    for (const t of types) {
      expect(registry.isKnown(t.type)).toBe(true);
    }
  });

  it('concrete types excludes abstract types', () => {
    const registry = ResourceTypeRegistry.fromList([
      { type: 'Patient', url: 'http://hl7.org/fhir/StructureDefinition/Patient', kind: 'resource', abstract: false },
      { type: 'Resource', url: 'http://hl7.org/fhir/StructureDefinition/Resource', kind: 'resource', abstract: true },
      { type: 'DomainResource', url: 'http://hl7.org/fhir/StructureDefinition/DomainResource', kind: 'resource', abstract: true },
    ]);

    expect(registry.getConcreteTypes()).toHaveLength(1);
    expect(registry.getConcreteTypes()[0].type).toBe('Patient');
  });
});

// =============================================================================
// Cross-component: Observation with multiple search types
// =============================================================================

describe('Integration: Observation multi-type extraction', () => {
  const observation = {
    resourceType: 'Observation',
    id: 'obs-bp',
    status: 'final',
    code: {
      coding: [{ system: 'http://loinc.org', code: '85354-9', display: 'Blood pressure panel' }],
    },
    subject: { reference: 'Patient/pat-1' },
    effectiveDateTime: '2024-03-15T10:30:00Z',
    valueQuantity: { value: 120, unit: 'mmHg', system: 'http://unitsofmeasure.org', code: 'mm[Hg]' },
  } as unknown as Resource;

  const searchParams: SearchParameter[] = [
    {
      resourceType: 'SearchParameter', url: 'http://test/sp/code',
      name: 'code', status: 'active', code: 'code',
      base: ['Observation'], type: 'token', expression: 'Observation.code',
    },
    {
      resourceType: 'SearchParameter', url: 'http://test/sp/subject',
      name: 'subject', status: 'active', code: 'subject',
      base: ['Observation'], type: 'reference', expression: 'Observation.subject',
    },
    {
      resourceType: 'SearchParameter', url: 'http://test/sp/date',
      name: 'date', status: 'active', code: 'date',
      base: ['Observation'], type: 'date', expression: 'Observation.effectiveDateTime',
    },
    {
      resourceType: 'SearchParameter', url: 'http://test/sp/value-quantity',
      name: 'value-quantity', status: 'active', code: 'value-quantity',
      base: ['Observation'], type: 'quantity', expression: 'Observation.valueQuantity',
    },
    {
      resourceType: 'SearchParameter', url: 'http://test/sp/status',
      name: 'status', status: 'active', code: 'status',
      base: ['Observation'], type: 'token', expression: 'Observation.status',
    },
  ];

  it('extracts all search values from complex Observation', () => {
    const entries = extractAllSearchValues(observation, searchParams);
    expect(entries.length).toBeGreaterThanOrEqual(4);

    const codes = entries.map(e => e.code);
    expect(codes).toContain('code');
    expect(codes).toContain('subject');
    expect(codes).toContain('date');
    expect(codes).toContain('value-quantity');
    expect(codes).toContain('status');
  });

  it('extracts correct token value for code', () => {
    const codeEntry = extractSearchValues(observation, searchParams[0]);
    expect(codeEntry.values).toHaveLength(1);
    if (codeEntry.values[0].type === 'token') {
      expect(codeEntry.values[0].system).toBe('http://loinc.org');
      expect(codeEntry.values[0].code).toBe('85354-9');
    }
  });

  it('extracts correct reference for subject', () => {
    const subjectEntry = extractSearchValues(observation, searchParams[1]);
    expect(subjectEntry.values).toHaveLength(1);
    if (subjectEntry.values[0].type === 'reference') {
      expect(subjectEntry.values[0].reference).toBe('Patient/pat-1');
      expect(subjectEntry.values[0].resourceType).toBe('Patient');
    }
  });

  it('extracts correct date for effectiveDateTime', () => {
    const dateEntry = extractSearchValues(observation, searchParams[2]);
    expect(dateEntry.values).toHaveLength(1);
    if (dateEntry.values[0].type === 'date') {
      expect(dateEntry.values[0].value).toBe('2024-03-15T10:30:00Z');
    }
  });

  it('extracts correct quantity for valueQuantity', () => {
    const qtyEntry = extractSearchValues(observation, searchParams[3]);
    expect(qtyEntry.values).toHaveLength(1);
    if (qtyEntry.values[0].type === 'quantity') {
      expect(qtyEntry.values[0].value).toBe(120);
      expect(qtyEntry.values[0].unit).toBe('mmHg');
    }
  });

  it('extracts references alongside search values', () => {
    const refs = extractReferences(observation);
    expect(refs).toHaveLength(1);
    expect(refs[0].targetType).toBe('Patient');
  });
});
