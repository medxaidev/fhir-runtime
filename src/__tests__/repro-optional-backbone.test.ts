/**
 * Regression tests for validator bugs:
 *
 * Bug 1: Validator reports CARDINALITY_MIN_VIOLATION on children of absent
 *         optional backbone elements (Patient.link, Patient.communication).
 *         When a backbone element has min=0 and is absent, its required
 *         children (min=1) must NOT be checked.
 *
 * Bug 2: Validator reports TYPE_MISMATCH for Patient.id because the core
 *         StructureDefinition uses FHIRPath URL "http://hl7.org/fhirpath/System.String"
 *         instead of plain "string" as the type code.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';

import {
  parseFhirJson,
  loadBundleFromFile,
  StructureValidator,
} from '../index.js';
import type { CanonicalProfile, Resource } from '../index.js';

const SPEC_DIR = resolve(__dirname, '..', '..', 'spec', 'fhir', 'r4');
const PROFILES_RESOURCES = resolve(SPEC_DIR, 'profiles-resources.json');

let profilesByType: Map<string, CanonicalProfile>;

beforeAll(() => {
  const result = loadBundleFromFile(PROFILES_RESOURCES, {
    filterKind: 'resource',
    excludeAbstract: true,
  });
  profilesByType = new Map(result.profiles.map(p => [p.type, p]));
}, 60_000);

// =============================================================================
// Bug 1: Absent optional backbone children
// =============================================================================

describe('Regression: absent optional backbone children', () => {
  it('valid Patient without link/communication has zero errors', () => {
    const json = JSON.stringify({
      resourceType: 'Patient',
      id: 'example-patient',
      meta: { versionId: '1', lastUpdated: '2024-01-15T10:30:00Z' },
      text: {
        status: 'generated',
        div: '<div xmlns="http://www.w3.org/1999/xhtml">John Doe</div>',
      },
      identifier: [
        { system: 'http://hospital.example.org/patients', value: '12345' },
      ],
      active: true,
      name: [
        { use: 'official', family: 'Doe', given: ['John', 'Michael'] },
      ],
      gender: 'male',
      birthDate: '1990-06-15',
      address: [
        {
          use: 'home',
          line: ['123 Main St'],
          city: 'Springfield',
          state: 'IL',
          postalCode: '62704',
          country: 'US',
        },
      ],
      telecom: [
        { system: 'phone', value: '+1-555-0123', use: 'home' },
        { system: 'email', value: 'john.doe@example.com' },
      ],
    });

    const parseResult = parseFhirJson(json);
    expect(parseResult.success).toBe(true);

    const validator = new StructureValidator();
    const result = validator.validate(parseResult.data! as Resource, profilesByType.get('Patient')!);

    const errors = result.issues.filter(i => i.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('no cardinality errors on Patient.link.* when link is absent', () => {
    const validator = new StructureValidator();
    const resource = { resourceType: 'Patient', id: 'no-link' } as unknown as Resource;
    const result = validator.validate(resource, profilesByType.get('Patient')!);

    const linkIssues = result.issues.filter(i => i.path?.startsWith('Patient.link'));
    expect(linkIssues).toEqual([]);
  });

  it('no cardinality errors on Patient.communication.* when communication is absent', () => {
    const validator = new StructureValidator();
    const resource = { resourceType: 'Patient', id: 'no-comm' } as unknown as Resource;
    const result = validator.validate(resource, profilesByType.get('Patient')!);

    const commIssues = result.issues.filter(i => i.path?.startsWith('Patient.communication'));
    expect(commIssues).toEqual([]);
  });

  it('still reports errors when backbone IS present but children are missing', () => {
    const validator = new StructureValidator();
    const resource = {
      resourceType: 'Patient',
      id: 'with-empty-link',
      link: [{}],  // link present but required children (other, type) missing
    } as unknown as Resource;

    const result = validator.validate(resource, profilesByType.get('Patient')!);

    const linkChildErrors = result.issues.filter(
      i => i.severity === 'error' &&
        i.path?.startsWith('Patient.link.') &&
        i.code === 'CARDINALITY_MIN_VIOLATION',
    );
    // Patient.link.other (min=1) and Patient.link.type (min=1) should be flagged
    expect(linkChildErrors.length).toBeGreaterThanOrEqual(2);
  });

  it('Observation without component has no component.* cardinality errors', () => {
    const validator = new StructureValidator();
    const resource = {
      resourceType: 'Observation',
      id: 'obs-simple',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
    } as unknown as Resource;

    const result = validator.validate(resource, profilesByType.get('Observation')!);

    const componentIssues = result.issues.filter(i => i.path?.startsWith('Observation.component.'));
    expect(componentIssues).toEqual([]);
  });
});

// =============================================================================
// Bug 2: FHIRPath System.String type mismatch
// =============================================================================

describe('Regression: FHIRPath System type URLs', () => {
  it('Patient.id does not produce TYPE_MISMATCH', () => {
    const validator = new StructureValidator();
    const resource = { resourceType: 'Patient', id: 'test-id' } as unknown as Resource;
    const result = validator.validate(resource, profilesByType.get('Patient')!);

    const idTypeErrors = result.issues.filter(
      i => i.path === 'Patient.id' && i.code === 'TYPE_MISMATCH',
    );
    expect(idTypeErrors).toEqual([]);
  });

  it('Resource.id with various string values does not produce TYPE_MISMATCH', () => {
    const validator = new StructureValidator();
    const ids = ['simple', 'with-dash', 'a1b2c3', 'A'.repeat(64)];

    for (const id of ids) {
      const resource = { resourceType: 'Patient', id } as unknown as Resource;
      const result = validator.validate(resource, profilesByType.get('Patient')!);

      const idTypeErrors = result.issues.filter(
        i => i.path === 'Patient.id' && i.code === 'TYPE_MISMATCH',
      );
      expect(idTypeErrors).toEqual([]);
    }
  });
});
