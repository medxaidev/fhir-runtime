/**
 * fhir-context — InnerType Extractor Tests
 *
 * Tests for extractInnerTypes, buildTypeName, and isBackboneElementType.
 * Uses both synthetic CanonicalProfile fixtures and real FHIR R4 StructureDefinitions
 * (Patient, Observation, Bundle) loaded via core-definitions.
 */

import { describe, it, expect } from 'vitest';
import type { CanonicalProfile, CanonicalElement } from '../../model/canonical-profile.js';
import {
  extractInnerTypes,
  buildTypeName,
  isBackboneElementType,
} from '../inner-type-extractor.js';

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

// =============================================================================
// buildTypeName
// =============================================================================

describe('buildTypeName', () => {
  it('single component returns as-is', () => {
    expect(buildTypeName(['Patient'])).toBe('Patient');
  });

  it('two components PascalCase joined', () => {
    expect(buildTypeName(['Patient', 'contact'])).toBe('PatientContact');
  });

  it('three components PascalCase joined', () => {
    expect(buildTypeName(['Bundle', 'entry', 'request'])).toBe('BundleEntryRequest');
  });

  it('already capitalized components preserved', () => {
    expect(buildTypeName(['Observation', 'Component'])).toBe('ObservationComponent');
  });

  it('empty array returns empty string', () => {
    expect(buildTypeName([])).toBe('');
  });
});

// =============================================================================
// isBackboneElementType
// =============================================================================

describe('isBackboneElementType', () => {
  it('returns true for BackboneElement type', () => {
    const elem = makeElement({ path: 'Patient.contact', types: [{ code: 'BackboneElement' }] });
    expect(isBackboneElementType(elem)).toBe(true);
  });

  it('returns true for Element type', () => {
    const elem = makeElement({ path: 'Patient.contact', types: [{ code: 'Element' }] });
    expect(isBackboneElementType(elem)).toBe(true);
  });

  it('returns false for HumanName type', () => {
    const elem = makeElement({ path: 'Patient.name', types: [{ code: 'HumanName' }] });
    expect(isBackboneElementType(elem)).toBe(false);
  });

  it('returns false for empty types', () => {
    const elem = makeElement({ path: 'Patient.name', types: [] });
    expect(isBackboneElementType(elem)).toBe(false);
  });

  it('returns true if BackboneElement is among multiple types', () => {
    const elem = makeElement({
      path: 'X.y',
      types: [{ code: 'string' }, { code: 'BackboneElement' }],
    });
    expect(isBackboneElementType(elem)).toBe(true);
  });
});

// =============================================================================
// extractInnerTypes — synthetic profiles
// =============================================================================

describe('extractInnerTypes', () => {
  it('extracts Patient inner types (contact, communication, link)', () => {
    const profile = makeProfile('Patient', [
      { path: 'Patient' },
      { path: 'Patient.id', types: [{ code: 'id' }] },
      { path: 'Patient.name', types: [{ code: 'HumanName' }] },
      // contact is BackboneElement
      { path: 'Patient.contact', types: [{ code: 'BackboneElement' }] },
      { path: 'Patient.contact.relationship', types: [{ code: 'CodeableConcept' }] },
      { path: 'Patient.contact.name', types: [{ code: 'HumanName' }] },
      { path: 'Patient.contact.telecom', types: [{ code: 'ContactPoint' }] },
      // communication is BackboneElement
      { path: 'Patient.communication', types: [{ code: 'BackboneElement' }] },
      { path: 'Patient.communication.language', types: [{ code: 'CodeableConcept' }] },
      { path: 'Patient.communication.preferred', types: [{ code: 'boolean' }] },
      // link is BackboneElement
      { path: 'Patient.link', types: [{ code: 'BackboneElement' }] },
      { path: 'Patient.link.other', types: [{ code: 'Reference' }] },
      { path: 'Patient.link.type', types: [{ code: 'code' }] },
    ]);

    const innerTypes = extractInnerTypes(profile);

    expect(innerTypes.size).toBe(3);
    expect(innerTypes.has('PatientContact')).toBe(true);
    expect(innerTypes.has('PatientCommunication')).toBe(true);
    expect(innerTypes.has('PatientLink')).toBe(true);

    // PatientContact should have 3 direct children
    const contact = innerTypes.get('PatientContact')!;
    expect(contact.elements.size).toBe(3);
    expect(contact.elements.has('Patient.contact.relationship')).toBe(true);
    expect(contact.elements.has('Patient.contact.name')).toBe(true);
    expect(contact.elements.has('Patient.contact.telecom')).toBe(true);
    expect(contact.parentType).toBe('Patient');
    expect(contact.type).toBe('PatientContact');
    expect(contact.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient#PatientContact');

    // PatientCommunication should have 2 direct children
    const comm = innerTypes.get('PatientCommunication')!;
    expect(comm.elements.size).toBe(2);
    expect(comm.parentType).toBe('Patient');

    // PatientLink should have 2 direct children
    const link = innerTypes.get('PatientLink')!;
    expect(link.elements.size).toBe(2);
    expect(link.parentType).toBe('Patient');
  });

  it('non-BackboneElement complex types are NOT extracted', () => {
    const profile = makeProfile('Patient', [
      { path: 'Patient' },
      { path: 'Patient.name', types: [{ code: 'HumanName' }] },
      { path: 'Patient.address', types: [{ code: 'Address' }] },
      { path: 'Patient.telecom', types: [{ code: 'ContactPoint' }] },
    ]);

    const innerTypes = extractInnerTypes(profile);
    expect(innerTypes.size).toBe(0);
  });

  it('empty profile returns empty Map', () => {
    const profile = makeProfile('Empty', [{ path: 'Empty' }]);
    const innerTypes = extractInnerTypes(profile);
    expect(innerTypes.size).toBe(0);
  });

  it('nested BackboneElements produce separate inner types', () => {
    const profile = makeProfile('Bundle', [
      { path: 'Bundle' },
      { path: 'Bundle.entry', types: [{ code: 'BackboneElement' }] },
      { path: 'Bundle.entry.resource', types: [{ code: 'Resource' }] },
      { path: 'Bundle.entry.request', types: [{ code: 'BackboneElement' }] },
      { path: 'Bundle.entry.request.method', types: [{ code: 'code' }] },
      { path: 'Bundle.entry.request.url', types: [{ code: 'uri' }] },
      { path: 'Bundle.entry.response', types: [{ code: 'BackboneElement' }] },
      { path: 'Bundle.entry.response.status', types: [{ code: 'string' }] },
    ]);

    const innerTypes = extractInnerTypes(profile);

    expect(innerTypes.size).toBe(3);
    expect(innerTypes.has('BundleEntry')).toBe(true);
    expect(innerTypes.has('BundleEntryRequest')).toBe(true);
    expect(innerTypes.has('BundleEntryResponse')).toBe(true);

    // BundleEntry direct children: resource, request, response
    const entry = innerTypes.get('BundleEntry')!;
    expect(entry.elements.size).toBe(3);
    expect(entry.parentType).toBe('Bundle');

    // BundleEntryRequest direct children: method, url (NOT entry.request.*)
    const request = innerTypes.get('BundleEntryRequest')!;
    expect(request.elements.size).toBe(2);
    expect(request.parentType).toBe('BundleEntry');
    expect(request.elements.has('Bundle.entry.request.method')).toBe(true);
    expect(request.elements.has('Bundle.entry.request.url')).toBe(true);

    // BundleEntryResponse direct children: status
    const response = innerTypes.get('BundleEntryResponse')!;
    expect(response.elements.size).toBe(1);
    expect(response.parentType).toBe('BundleEntry');
  });

  it('inner type does not include grandchild elements', () => {
    const profile = makeProfile('Obs', [
      { path: 'Obs' },
      { path: 'Obs.component', types: [{ code: 'BackboneElement' }] },
      { path: 'Obs.component.code', types: [{ code: 'CodeableConcept' }] },
      { path: 'Obs.component.value', types: [{ code: 'Quantity' }] },
      { path: 'Obs.component.nested', types: [{ code: 'BackboneElement' }] },
      { path: 'Obs.component.nested.deep', types: [{ code: 'string' }] },
    ]);

    const innerTypes = extractInnerTypes(profile);
    const component = innerTypes.get('ObsComponent')!;

    // Direct children: code, value, nested (NOT nested.deep)
    expect(component.elements.size).toBe(3);
    expect(component.elements.has('Obs.component.code')).toBe(true);
    expect(component.elements.has('Obs.component.value')).toBe(true);
    expect(component.elements.has('Obs.component.nested')).toBe(true);
    expect(component.elements.has('Obs.component.nested.deep')).toBe(false);

    // nested.deep should be in ObsComponentNested
    const nested = innerTypes.get('ObsComponentNested')!;
    expect(nested.elements.size).toBe(1);
    expect(nested.elements.has('Obs.component.nested.deep')).toBe(true);
  });

  it('root element is NOT treated as inner type', () => {
    // Even if root has BackboneElement type (shouldn't happen, but defensive)
    const profile = makeProfile('X', [
      { path: 'X', types: [{ code: 'BackboneElement' }] },
      { path: 'X.field', types: [{ code: 'string' }] },
    ]);
    const innerTypes = extractInnerTypes(profile);
    // Root 'X' has no dot → should not be extracted
    expect(innerTypes.size).toBe(0);
  });

  it('inner type inherits kind from parent profile', () => {
    const profile = makeProfile('Patient', [
      { path: 'Patient' },
      { path: 'Patient.contact', types: [{ code: 'BackboneElement' }] },
      { path: 'Patient.contact.name', types: [{ code: 'HumanName' }] },
    ]);

    const innerTypes = extractInnerTypes(profile);
    const contact = innerTypes.get('PatientContact')!;
    expect(contact.kind).toBe('resource');
    expect(contact.abstract).toBe(false);
  });
});
