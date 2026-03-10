/**
 * Reference Extractor Tests
 */
import { describe, it, expect } from 'vitest';
import { extractReferences, extractReferencesFromBundle, validateReferenceTargets } from '../reference-extractor.js';
import type { Resource } from '../../model/index.js';

// =============================================================================
// extractReferences — single resource
// =============================================================================

describe('extractReferences', () => {
  it('extracts literal reference', () => {
    const obs = {
      resourceType: 'Observation',
      subject: { reference: 'Patient/123' },
    } as unknown as Resource;

    const refs = extractReferences(obs);
    expect(refs).toHaveLength(1);
    expect(refs[0].reference).toBe('Patient/123');
    expect(refs[0].referenceType).toBe('literal');
    expect(refs[0].targetType).toBe('Patient');
    expect(refs[0].targetId).toBe('123');
  });

  it('extracts contained reference', () => {
    const obs = {
      resourceType: 'Observation',
      subject: { reference: '#contained-1' },
    } as unknown as Resource;

    const refs = extractReferences(obs);
    expect(refs).toHaveLength(1);
    expect(refs[0].referenceType).toBe('contained');
    expect(refs[0].targetId).toBe('contained-1');
  });

  it('extracts absolute reference', () => {
    const obs = {
      resourceType: 'Observation',
      subject: { reference: 'https://example.org/fhir/Patient/456' },
    } as unknown as Resource;

    const refs = extractReferences(obs);
    expect(refs).toHaveLength(1);
    expect(refs[0].referenceType).toBe('absolute');
    expect(refs[0].targetType).toBe('Patient');
    expect(refs[0].targetId).toBe('456');
  });

  it('extracts logical reference (identifier only)', () => {
    const obs = {
      resourceType: 'Observation',
      subject: {
        type: 'Patient',
        identifier: { system: 'http://hospital.org/mrn', value: 'MRN-999' },
      },
    } as unknown as Resource;

    const refs = extractReferences(obs);
    expect(refs).toHaveLength(1);
    expect(refs[0].referenceType).toBe('logical');
    expect(refs[0].targetType).toBe('Patient');
    expect(refs[0].reference).toContain('MRN-999');
  });

  it('extracts display from reference', () => {
    const obs = {
      resourceType: 'Observation',
      subject: { reference: 'Patient/123', display: 'John Smith' },
    } as unknown as Resource;

    const refs = extractReferences(obs);
    expect(refs).toHaveLength(1);
    expect(refs[0].display).toBe('John Smith');
  });

  it('extracts multiple references from different paths', () => {
    const obs = {
      resourceType: 'Observation',
      subject: { reference: 'Patient/123' },
      performer: [{ reference: 'Practitioner/456' }],
      encounter: { reference: 'Encounter/789' },
    } as unknown as Resource;

    const refs = extractReferences(obs);
    expect(refs.length).toBeGreaterThanOrEqual(3);
  });

  it('extracts references from nested structures', () => {
    const condition = {
      resourceType: 'Condition',
      subject: { reference: 'Patient/1' },
      stage: [{ assessment: [{ reference: 'Observation/2' }] }],
    } as unknown as Resource;

    const refs = extractReferences(condition);
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it('handles resource with no references', () => {
    const patient = {
      resourceType: 'Patient',
      gender: 'male',
      birthDate: '1990-01-01',
      name: [{ family: 'Smith', given: ['John'] }],
    } as unknown as Resource;

    const refs = extractReferences(patient);
    expect(refs).toHaveLength(0);
  });

  it('handles resource with urn reference', () => {
    const obs = {
      resourceType: 'Observation',
      subject: { reference: 'urn:uuid:abc-123' },
    } as unknown as Resource;

    const refs = extractReferences(obs);
    expect(refs).toHaveLength(1);
    expect(refs[0].referenceType).toBe('absolute');
  });

  it('extracts references from array elements', () => {
    const patient = {
      resourceType: 'Patient',
      generalPractitioner: [
        { reference: 'Practitioner/1' },
        { reference: 'Practitioner/2' },
        { reference: 'Organization/3' },
      ],
    } as unknown as Resource;

    const refs = extractReferences(patient);
    expect(refs).toHaveLength(3);
  });

  it('extracts reference from managingOrganization', () => {
    const patient = {
      resourceType: 'Patient',
      managingOrganization: { reference: 'Organization/org1' },
    } as unknown as Resource;

    const refs = extractReferences(patient);
    expect(refs).toHaveLength(1);
    expect(refs[0].targetType).toBe('Organization');
  });

  it('ignores primitive and meta fields', () => {
    const resource = {
      resourceType: 'Patient',
      id: 'p1',
      meta: { versionId: '1', lastUpdated: '2024-01-01T00:00:00Z' },
      active: true,
    } as unknown as Resource;

    const refs = extractReferences(resource);
    expect(refs).toHaveLength(0);
  });
});

// =============================================================================
// extractReferencesFromBundle
// =============================================================================

describe('extractReferencesFromBundle', () => {
  it('extracts references from all bundle entries', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: { resourceType: 'Observation', subject: { reference: 'Patient/1' } } },
        { resource: { resourceType: 'Condition', subject: { reference: 'Patient/2' } } },
      ],
    };

    const refs = extractReferencesFromBundle(bundle);
    expect(refs.length).toBeGreaterThanOrEqual(2);
  });

  it('handles empty bundle', () => {
    const bundle = { resourceType: 'Bundle', type: 'collection', entry: [] };
    const refs = extractReferencesFromBundle(bundle);
    expect(refs).toHaveLength(0);
  });

  it('handles null input', () => {
    const refs = extractReferencesFromBundle(null);
    expect(refs).toHaveLength(0);
  });

  it('handles bundle with missing entry', () => {
    const bundle = { resourceType: 'Bundle', type: 'collection' };
    const refs = extractReferencesFromBundle(bundle);
    expect(refs).toHaveLength(0);
  });

  it('skips entries without resource', () => {
    const bundle = {
      resourceType: 'Bundle',
      entry: [
        { request: { method: 'GET', url: 'Patient/1' } },
        { resource: { resourceType: 'Observation', subject: { reference: 'Patient/1' } } },
      ],
    };

    const refs = extractReferencesFromBundle(bundle);
    expect(refs.length).toBeGreaterThanOrEqual(1);
  });
});

// =============================================================================
// validateReferenceTargets
// =============================================================================

describe('validateReferenceTargets', () => {
  const profileElements = new Map([
    ['Observation.subject', {
      types: [{
        code: 'Reference',
        targetProfiles: [
          'http://hl7.org/fhir/StructureDefinition/Patient',
          'http://hl7.org/fhir/StructureDefinition/Group',
        ],
      }],
    }],
    ['Observation.performer', {
      types: [{
        code: 'Reference',
        targetProfiles: [
          'http://hl7.org/fhir/StructureDefinition/Practitioner',
          'http://hl7.org/fhir/StructureDefinition/Organization',
        ],
      }],
    }],
  ]);

  const profile = { elements: profileElements };

  it('returns no issues for valid reference targets', () => {
    const obs = {
      resourceType: 'Observation',
      subject: { reference: 'Patient/1' },
      performer: [{ reference: 'Practitioner/2' }],
    } as unknown as Resource;

    const issues = validateReferenceTargets(obs, profile);
    expect(issues).toHaveLength(0);
  });

  it('detects invalid reference target type', () => {
    const obs = {
      resourceType: 'Observation',
      subject: { reference: 'Organization/1' },
    } as unknown as Resource;

    const issues = validateReferenceTargets(obs, profile);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0].message).toContain('Organization');
  });

  it('allows Group as subject target', () => {
    const obs = {
      resourceType: 'Observation',
      subject: { reference: 'Group/g1' },
    } as unknown as Resource;

    const issues = validateReferenceTargets(obs, profile);
    expect(issues).toHaveLength(0);
  });

  it('ignores references without target types', () => {
    const obs = {
      resourceType: 'Observation',
      subject: { reference: '#contained-1' },
    } as unknown as Resource;

    const issues = validateReferenceTargets(obs, profile);
    expect(issues).toHaveLength(0);
  });

  it('ignores elements not in profile', () => {
    const obs = {
      resourceType: 'Observation',
      basedOn: [{ reference: 'ServiceRequest/sr1' }],
    } as unknown as Resource;

    const issues = validateReferenceTargets(obs, profile);
    expect(issues).toHaveLength(0);
  });
});
