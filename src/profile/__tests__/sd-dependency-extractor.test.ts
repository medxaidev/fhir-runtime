import { describe, it, expect } from 'vitest';
import { extractSDDependencies } from '../sd-dependency-extractor.js';
import type { StructureDefinition } from '../../model/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeSD(
  url: string,
  elements: any[],
): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url,
    name: 'Test',
    kind: 'resource',
    type: 'Patient',
    abstract: false,
    status: 'active',
    snapshot: { element: elements },
  } as unknown as StructureDefinition;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('extractSDDependencies', () => {
  it('extracts type codes excluding primitives', () => {
    const sd = makeSD('http://test/Patient', [
      { path: 'Patient', type: [] },
      { path: 'Patient.id', type: [{ code: 'id' }] },
      { path: 'Patient.name', type: [{ code: 'HumanName' }] },
      { path: 'Patient.identifier', type: [{ code: 'Identifier' }] },
      { path: 'Patient.active', type: [{ code: 'boolean' }] },
    ]);
    const deps = extractSDDependencies(sd);
    expect(deps).toContain('HumanName');
    expect(deps).toContain('Identifier');
    expect(deps).not.toContain('boolean');
    expect(deps).not.toContain('id');
  });

  it('extracts type.profile URLs', () => {
    const sd = makeSD('http://test/USCorePatient', [
      {
        path: 'Patient.extension',
        type: [{
          code: 'Extension',
          profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-race'],
        }],
      },
    ]);
    const deps = extractSDDependencies(sd);
    expect(deps).toContain('Extension');
    expect(deps).toContain('http://hl7.org/fhir/us/core/StructureDefinition/us-core-race');
  });

  it('extracts type.targetProfile URLs', () => {
    const sd = makeSD('http://test/Observation', [
      {
        path: 'Observation.subject',
        type: [{
          code: 'Reference',
          targetProfile: [
            'http://hl7.org/fhir/StructureDefinition/Patient',
            'http://hl7.org/fhir/StructureDefinition/Group',
          ],
        }],
      },
    ]);
    const deps = extractSDDependencies(sd);
    expect(deps).toContain('Reference');
    expect(deps).toContain('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(deps).toContain('http://hl7.org/fhir/StructureDefinition/Group');
  });

  it('excludes self URL', () => {
    const sd = makeSD('http://test/Patient', [
      {
        path: 'Patient.link.other',
        type: [{
          code: 'Reference',
          targetProfile: ['http://test/Patient'],
        }],
      },
    ]);
    const deps = extractSDDependencies(sd);
    expect(deps).not.toContain('http://test/Patient');
    expect(deps).toContain('Reference');
  });

  it('returns sorted, de-duplicated results', () => {
    const sd = makeSD('http://test/Patient', [
      { path: 'Patient.name', type: [{ code: 'HumanName' }] },
      { path: 'Patient.telecom', type: [{ code: 'ContactPoint' }] },
      { path: 'Patient.address', type: [{ code: 'Address' }] },
      { path: 'Patient.contact.name', type: [{ code: 'HumanName' }] },
    ]);
    const deps = extractSDDependencies(sd);
    expect(deps).toEqual(['Address', 'ContactPoint', 'HumanName']);
  });

  it('includes primitives when includePrimitives is true', () => {
    const sd = makeSD('http://test/Patient', [
      { path: 'Patient.active', type: [{ code: 'boolean' }] },
      { path: 'Patient.name', type: [{ code: 'HumanName' }] },
    ]);
    const deps = extractSDDependencies(sd, { includePrimitives: true });
    expect(deps).toContain('boolean');
    expect(deps).toContain('HumanName');
  });

  it('returns empty array for SD without snapshot', () => {
    const sd = {
      resourceType: 'StructureDefinition',
      url: 'http://test/Empty',
      name: 'Empty',
      kind: 'resource',
      type: 'Patient',
      abstract: false,
      status: 'active',
    } as unknown as StructureDefinition;
    expect(extractSDDependencies(sd)).toEqual([]);
  });

  it('handles elements without type array', () => {
    const sd = makeSD('http://test/Patient', [
      { path: 'Patient' },
      { path: 'Patient.name', type: [{ code: 'HumanName' }] },
    ]);
    const deps = extractSDDependencies(sd);
    expect(deps).toEqual(['HumanName']);
  });

  it('handles sliced elements with extension profiles', () => {
    const sd = makeSD('http://test/USCorePatient', [
      {
        path: 'Patient.extension',
        sliceName: 'race',
        type: [{
          code: 'Extension',
          profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-race'],
        }],
      },
      {
        path: 'Patient.extension',
        sliceName: 'ethnicity',
        type: [{
          code: 'Extension',
          profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity'],
        }],
      },
    ]);
    const deps = extractSDDependencies(sd);
    expect(deps).toContain('Extension');
    expect(deps).toContain('http://hl7.org/fhir/us/core/StructureDefinition/us-core-race');
    expect(deps).toContain('http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity');
  });
});
