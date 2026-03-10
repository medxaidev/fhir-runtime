/**
 * CapabilityStatement Builder Tests
 */
import { describe, it, expect } from 'vitest';
import { buildCapabilityFragment } from '../capability-builder.js';
import type { CanonicalProfile } from '../../model/index.js';
import type { SearchParameter } from '../types.js';

function makeProfile(overrides: Partial<CanonicalProfile> & { url: string; type: string }): CanonicalProfile {
  return {
    name: overrides.type,
    kind: 'resource',
    abstract: false,
    elements: new Map(),
    ...overrides,
  };
}

function makeSP(code: string, base: string[], type: SearchParameter['type'] = 'token'): SearchParameter {
  return {
    resourceType: 'SearchParameter',
    url: `http://hl7.org/fhir/SearchParameter/${base[0]}-${code}`,
    name: code,
    status: 'active',
    code,
    base,
    type,
  };
}

describe('buildCapabilityFragment', () => {
  it('builds REST fragment from profiles', () => {
    const profiles: CanonicalProfile[] = [
      makeProfile({ url: 'http://hl7.org/fhir/StructureDefinition/Patient', type: 'Patient' }),
      makeProfile({ url: 'http://hl7.org/fhir/StructureDefinition/Observation', type: 'Observation' }),
    ];

    const result = buildCapabilityFragment(profiles);
    expect(result.mode).toBe('server');
    expect(result.resource).toHaveLength(2);
    expect(result.resource[0].type).toBe('Observation');
    expect(result.resource[1].type).toBe('Patient');
  });

  it('supports client mode', () => {
    const profiles = [makeProfile({ url: 'http://test/Patient', type: 'Patient' })];
    const result = buildCapabilityFragment(profiles, undefined, 'client');
    expect(result.mode).toBe('client');
  });

  it('skips abstract resource types', () => {
    const profiles = [
      makeProfile({ url: 'http://hl7.org/fhir/StructureDefinition/DomainResource', type: 'DomainResource', abstract: true }),
      makeProfile({ url: 'http://hl7.org/fhir/StructureDefinition/Patient', type: 'Patient' }),
    ];

    const result = buildCapabilityFragment(profiles);
    expect(result.resource).toHaveLength(1);
    expect(result.resource[0].type).toBe('Patient');
  });

  it('skips non-resource kinds', () => {
    const profiles = [
      makeProfile({ url: 'http://test/string', type: 'string', kind: 'primitive-type' }),
      makeProfile({ url: 'http://test/Patient', type: 'Patient' }),
    ];

    const result = buildCapabilityFragment(profiles);
    expect(result.resource).toHaveLength(1);
  });

  it('groups constraint profiles as supportedProfile', () => {
    const profiles = [
      makeProfile({ url: 'http://hl7.org/fhir/StructureDefinition/Patient', type: 'Patient', derivation: 'specialization' }),
      makeProfile({ url: 'http://example.org/USCorePatient', type: 'Patient', derivation: 'constraint' }),
      makeProfile({ url: 'http://example.org/MyPatient', type: 'Patient', derivation: 'constraint' }),
    ];

    const result = buildCapabilityFragment(profiles);
    expect(result.resource).toHaveLength(1);
    const patientEntry = result.resource[0];
    expect(patientEntry.profile).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(patientEntry.supportedProfile).toHaveLength(2);
    expect(patientEntry.supportedProfile).toContain('http://example.org/USCorePatient');
    expect(patientEntry.supportedProfile).toContain('http://example.org/MyPatient');
  });

  it('attaches search parameters to matching resource types', () => {
    const profiles = [makeProfile({ url: 'http://test/Patient', type: 'Patient' })];
    const searchParams = [
      makeSP('gender', ['Patient'], 'token'),
      makeSP('birthdate', ['Patient'], 'date'),
      makeSP('name', ['Patient'], 'string'),
    ];

    const result = buildCapabilityFragment(profiles, searchParams);
    expect(result.resource[0].searchParam).toHaveLength(3);
    const names = result.resource[0].searchParam!.map(p => p.name);
    expect(names).toContain('birthdate');
    expect(names).toContain('gender');
    expect(names).toContain('name');
  });

  it('includes Resource-level search params for all types', () => {
    const profiles = [
      makeProfile({ url: 'http://test/Patient', type: 'Patient' }),
      makeProfile({ url: 'http://test/Observation', type: 'Observation' }),
    ];
    const searchParams = [
      makeSP('_id', ['Resource'], 'token'),
    ];

    const result = buildCapabilityFragment(profiles, searchParams);
    for (const res of result.resource) {
      expect(res.searchParam).toHaveLength(1);
      expect(res.searchParam![0].name).toBe('_id');
    }
  });

  it('deduplicates search parameters by code', () => {
    const profiles = [makeProfile({ url: 'http://test/Patient', type: 'Patient' })];
    const searchParams = [
      makeSP('_id', ['Patient'], 'token'),
      makeSP('_id', ['Resource'], 'token'),
    ];

    const result = buildCapabilityFragment(profiles, searchParams);
    expect(result.resource[0].searchParam).toHaveLength(1);
  });

  it('skips retired search parameters', () => {
    const profiles = [makeProfile({ url: 'http://test/Patient', type: 'Patient' })];
    const searchParams: SearchParameter[] = [
      { ...makeSP('old', ['Patient']), status: 'retired' },
      makeSP('active-param', ['Patient']),
    ];

    const result = buildCapabilityFragment(profiles, searchParams);
    expect(result.resource[0].searchParam).toHaveLength(1);
    expect(result.resource[0].searchParam![0].name).toBe('active-param');
  });

  it('includes search param definition and documentation', () => {
    const profiles = [makeProfile({ url: 'http://test/Patient', type: 'Patient' })];
    const searchParams: SearchParameter[] = [{
      ...makeSP('gender', ['Patient']),
      description: 'Gender of the patient',
    }];

    const result = buildCapabilityFragment(profiles, searchParams);
    const sp = result.resource[0].searchParam![0];
    expect(sp.definition).toBe('http://hl7.org/fhir/SearchParameter/Patient-gender');
    expect(sp.documentation).toBe('Gender of the patient');
  });

  it('returns empty resources for empty profiles', () => {
    const result = buildCapabilityFragment([]);
    expect(result.resource).toHaveLength(0);
  });

  it('sorts resources alphabetically by type', () => {
    const profiles = [
      makeProfile({ url: 'http://test/Observation', type: 'Observation' }),
      makeProfile({ url: 'http://test/Condition', type: 'Condition' }),
      makeProfile({ url: 'http://test/Patient', type: 'Patient' }),
    ];

    const result = buildCapabilityFragment(profiles);
    expect(result.resource.map(r => r.type)).toEqual(['Condition', 'Observation', 'Patient']);
  });
});
