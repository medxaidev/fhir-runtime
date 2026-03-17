import { describe, it, expect } from 'vitest';
import {
  isBackboneElement,
  isArrayElement,
  getBackboneChildren,
} from '../backbone-utils.js';
import type { CanonicalElement, CanonicalProfile } from '../../model/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

function makeElement(
  path: string,
  types: string[],
  max: number | 'unbounded' = 1,
): CanonicalElement {
  return {
    path,
    id: path,
    min: 0,
    max,
    types: types.map((code) => ({ code })),
    constraints: [],
    mustSupport: false,
    isModifier: false,
    isSummary: false,
  };
}

const patientProfile: CanonicalProfile = {
  url: 'http://hl7.org/fhir/StructureDefinition/Patient',
  name: 'Patient',
  kind: 'resource',
  type: 'Patient',
  abstract: false,
  elements: new Map<string, CanonicalElement>([
    ['Patient', makeElement('Patient', [])],
    ['Patient.id', makeElement('Patient.id', ['id'])],
    ['Patient.extension', makeElement('Patient.extension', ['Extension'], 'unbounded')],
    ['Patient.name', makeElement('Patient.name', ['HumanName'], 'unbounded')],
    ['Patient.contact', makeElement('Patient.contact', ['BackboneElement'], 'unbounded')],
    ['Patient.contact.id', makeElement('Patient.contact.id', ['string'])],
    ['Patient.contact.extension', makeElement('Patient.contact.extension', ['Extension'], 'unbounded')],
    ['Patient.contact.modifierExtension', makeElement('Patient.contact.modifierExtension', ['Extension'], 'unbounded')],
    ['Patient.contact.relationship', makeElement('Patient.contact.relationship', ['CodeableConcept'], 'unbounded')],
    ['Patient.contact.name', makeElement('Patient.contact.name', ['HumanName'])],
    ['Patient.contact.telecom', makeElement('Patient.contact.telecom', ['ContactPoint'], 'unbounded')],
    ['Patient.contact.gender', makeElement('Patient.contact.gender', ['code'])],
  ]),
};

// ── isBackboneElement ─────────────────────────────────────────────────────

describe('isBackboneElement', () => {
  it('returns true for BackboneElement type', () => {
    const el = makeElement('Patient.contact', ['BackboneElement']);
    expect(isBackboneElement(el)).toBe(true);
  });

  it('returns true for empty types (root element)', () => {
    const el = makeElement('Patient', []);
    expect(isBackboneElement(el)).toBe(true);
  });

  it('returns false for HumanName type', () => {
    const el = makeElement('Patient.name', ['HumanName']);
    expect(isBackboneElement(el)).toBe(false);
  });

  it('returns false for code type', () => {
    const el = makeElement('Observation.status', ['code']);
    expect(isBackboneElement(el)).toBe(false);
  });
});

// ── isArrayElement ────────────────────────────────────────────────────────

describe('isArrayElement', () => {
  it('returns true for unbounded', () => {
    const el = makeElement('Patient.name', ['HumanName'], 'unbounded');
    expect(isArrayElement(el)).toBe(true);
  });

  it('returns true for max > 1', () => {
    const el = makeElement('Patient.name', ['HumanName'], 5);
    expect(isArrayElement(el)).toBe(true);
  });

  it('returns false for max = 1', () => {
    const el = makeElement('Patient.birthDate', ['date'], 1);
    expect(isArrayElement(el)).toBe(false);
  });

  it('returns false for max = 0', () => {
    const el = makeElement('Patient.deceased', ['boolean'], 0);
    expect(isArrayElement(el)).toBe(false);
  });
});

// ── getBackboneChildren ───────────────────────────────────────────────────

describe('getBackboneChildren', () => {
  it('returns direct children excluding id/extension/modifierExtension', () => {
    const children = getBackboneChildren('Patient.contact', patientProfile);
    const paths = children.map((c) => c.path);
    expect(paths).toContain('Patient.contact.relationship');
    expect(paths).toContain('Patient.contact.name');
    expect(paths).toContain('Patient.contact.telecom');
    expect(paths).toContain('Patient.contact.gender');
    expect(paths).not.toContain('Patient.contact.id');
    expect(paths).not.toContain('Patient.contact.extension');
    expect(paths).not.toContain('Patient.contact.modifierExtension');
  });

  it('returns 4 children for Patient.contact', () => {
    const children = getBackboneChildren('Patient.contact', patientProfile);
    expect(children.length).toBe(4);
  });

  it('returns empty array for non-backbone path', () => {
    const children = getBackboneChildren('Patient.name', patientProfile);
    expect(children.length).toBe(0);
  });

  it('returns empty array for non-existent path', () => {
    const children = getBackboneChildren('Patient.foo', patientProfile);
    expect(children.length).toBe(0);
  });
});
