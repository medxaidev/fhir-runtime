/**
 * fhir-context — InnerType Context Registration Tests
 *
 * Tests for FhirContext.registerCanonicalProfile, getInnerType, hasInnerType.
 * Verifies that InnerTypes extracted from CanonicalProfiles are correctly
 * registered and queryable through the FhirContext.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import type { CanonicalProfile, CanonicalElement } from '../../model/canonical-profile.js';
import { FhirContextImpl } from '../fhir-context.js';
import { MemoryLoader } from '../loaders/memory-loader.js';
import { extractInnerTypes } from '../inner-type-extractor.js';

// =============================================================================
// Helpers
// =============================================================================

function makeElement(overrides: Partial<CanonicalElement> & { path: string }): CanonicalElement {
  return {
    id: overrides.path,
    min: 0,
    max: 'unbounded' as const,
    types: [],
    constraints: [],
    mustSupport: false,
    isModifier: false,
    isSummary: false,
    ...overrides,
  };
}

function makeProfile(
  type: string,
  elements: Array<Partial<CanonicalElement> & { path: string }>,
): CanonicalProfile {
  const elemMap = new Map<string, CanonicalElement>();
  for (const e of elements) {
    elemMap.set(e.path, makeElement(e));
  }
  return {
    url: `http://hl7.org/fhir/StructureDefinition/${type}`,
    name: type,
    kind: 'resource',
    type,
    abstract: false,
    elements: elemMap,
  };
}

function makePatientProfile(): CanonicalProfile {
  const profile = makeProfile('Patient', [
    { path: 'Patient' },
    { path: 'Patient.id', types: [{ code: 'id' }] },
    { path: 'Patient.name', types: [{ code: 'HumanName' }] },
    { path: 'Patient.contact', types: [{ code: 'BackboneElement' }] },
    { path: 'Patient.contact.relationship', types: [{ code: 'CodeableConcept' }] },
    { path: 'Patient.contact.name', types: [{ code: 'HumanName' }] },
    { path: 'Patient.communication', types: [{ code: 'BackboneElement' }] },
    { path: 'Patient.communication.language', types: [{ code: 'CodeableConcept' }] },
    { path: 'Patient.link', types: [{ code: 'BackboneElement' }] },
    { path: 'Patient.link.other', types: [{ code: 'Reference' }] },
    { path: 'Patient.link.type', types: [{ code: 'code' }] },
  ]);
  profile.innerTypes = extractInnerTypes(profile);
  return profile;
}

function makeObservationProfile(): CanonicalProfile {
  const profile = makeProfile('Observation', [
    { path: 'Observation' },
    { path: 'Observation.code', types: [{ code: 'CodeableConcept' }] },
    { path: 'Observation.component', types: [{ code: 'BackboneElement' }] },
    { path: 'Observation.component.code', types: [{ code: 'CodeableConcept' }] },
    { path: 'Observation.component.value', types: [{ code: 'Quantity' }] },
    { path: 'Observation.referenceRange', types: [{ code: 'BackboneElement' }] },
    { path: 'Observation.referenceRange.low', types: [{ code: 'Quantity' }] },
    { path: 'Observation.referenceRange.high', types: [{ code: 'Quantity' }] },
  ]);
  profile.innerTypes = extractInnerTypes(profile);
  return profile;
}

// =============================================================================
// Tests
// =============================================================================

describe('FhirContext InnerType registration', () => {
  let ctx: FhirContextImpl;

  beforeEach(() => {
    ctx = new FhirContextImpl({ loaders: [new MemoryLoader(new Map())] });
  });

  it('registerCanonicalProfile makes inner types queryable via getInnerType', () => {
    const patient = makePatientProfile();
    ctx.registerCanonicalProfile(patient);

    const contact = ctx.getInnerType('PatientContact');
    expect(contact).toBeDefined();
    expect(contact!.type).toBe('PatientContact');
    expect(contact!.parentType).toBe('Patient');
    expect(contact!.elements.size).toBe(2); // relationship, name
  });

  it('hasInnerType returns true for registered and false for unregistered', () => {
    const patient = makePatientProfile();
    ctx.registerCanonicalProfile(patient);

    expect(ctx.hasInnerType('PatientContact')).toBe(true);
    expect(ctx.hasInnerType('PatientCommunication')).toBe(true);
    expect(ctx.hasInnerType('PatientLink')).toBe(true);
    expect(ctx.hasInnerType('PatientName')).toBe(false);
    expect(ctx.hasInnerType('ObservationComponent')).toBe(false);
  });

  it('multiple profiles register all inner types', () => {
    ctx.registerCanonicalProfile(makePatientProfile());
    ctx.registerCanonicalProfile(makeObservationProfile());

    // Patient inner types
    expect(ctx.hasInnerType('PatientContact')).toBe(true);
    expect(ctx.hasInnerType('PatientCommunication')).toBe(true);
    expect(ctx.hasInnerType('PatientLink')).toBe(true);

    // Observation inner types
    expect(ctx.hasInnerType('ObservationComponent')).toBe(true);
    expect(ctx.hasInnerType('ObservationReferenceRange')).toBe(true);

    // Verify content
    const component = ctx.getInnerType('ObservationComponent')!;
    expect(component.elements.size).toBe(2); // code, value
    expect(component.parentType).toBe('Observation');
  });

  it('re-registering a profile updates inner types', () => {
    const patient1 = makePatientProfile();
    ctx.registerCanonicalProfile(patient1);

    // Verify initial state
    expect(ctx.getInnerType('PatientContact')!.elements.size).toBe(2);

    // Create an updated profile with an extra field in contact
    const patient2 = makeProfile('Patient', [
      { path: 'Patient' },
      { path: 'Patient.contact', types: [{ code: 'BackboneElement' }] },
      { path: 'Patient.contact.relationship', types: [{ code: 'CodeableConcept' }] },
      { path: 'Patient.contact.name', types: [{ code: 'HumanName' }] },
      { path: 'Patient.contact.telecom', types: [{ code: 'ContactPoint' }] },
    ]);
    patient2.innerTypes = extractInnerTypes(patient2);
    ctx.registerCanonicalProfile(patient2);

    // Should reflect updated inner type
    expect(ctx.getInnerType('PatientContact')!.elements.size).toBe(3);
  });

  it('dispose clears all inner types', () => {
    ctx.registerCanonicalProfile(makePatientProfile());

    expect(ctx.hasInnerType('PatientContact')).toBe(true);

    ctx.dispose();

    // After dispose, should throw
    expect(() => ctx.hasInnerType('PatientContact')).toThrow(/disposed/);
  });

  it('profile without innerTypes does not throw', () => {
    const profile = makeProfile('Simple', [
      { path: 'Simple' },
      { path: 'Simple.name', types: [{ code: 'string' }] },
    ]);
    // No innerTypes set (undefined)

    expect(() => ctx.registerCanonicalProfile(profile)).not.toThrow();
    expect(ctx.hasInnerType('SimpleAnything')).toBe(false);
  });

  it('getInnerType returns undefined for non-existent type', () => {
    expect(ctx.getInnerType('NonExistent')).toBeUndefined();
  });
});
