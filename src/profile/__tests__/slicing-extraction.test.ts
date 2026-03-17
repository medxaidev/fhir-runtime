import { describe, it, expect } from 'vitest';
import { buildCanonicalProfile } from '../canonical-builder.js';
import type { StructureDefinition } from '../../model/index.js';

// ── Synthetic SD with slicing (mimics US Core Observation category slicing) ──

const observationSDWithSlicing: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://test.org/StructureDefinition/TestObservation',
  name: 'TestObservation',
  kind: 'resource',
  type: 'Observation',
  abstract: false,
  status: 'active',
  snapshot: {
    element: [
      {
        id: 'Observation',
        path: 'Observation',
        min: 0,
        max: '*',
      },
      {
        id: 'Observation.id',
        path: 'Observation.id',
        min: 0,
        max: '1',
        type: [{ code: 'id' }],
      },
      {
        id: 'Observation.status',
        path: 'Observation.status',
        min: 1,
        max: '1',
        type: [{ code: 'code' }],
      },
      {
        id: 'Observation.category',
        path: 'Observation.category',
        min: 1,
        max: '*',
        type: [{ code: 'CodeableConcept' }],
        slicing: {
          discriminator: [{ type: 'pattern', path: 'coding' }],
          rules: 'open',
          ordered: false,
        },
      },
      // Slice: VSCat
      {
        id: 'Observation.category:VSCat',
        path: 'Observation.category',
        sliceName: 'VSCat',
        min: 1,
        max: '1',
        type: [{ code: 'CodeableConcept' }],
        mustSupport: true,
        patternCodeableConcept: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'vital-signs',
            },
          ],
        },
      },
      // Child of VSCat slice
      {
        id: 'Observation.category:VSCat.coding',
        path: 'Observation.category.coding',
        min: 1,
        max: '*',
        type: [{ code: 'Coding' }],
      },
      // Slice: LabCat
      {
        id: 'Observation.category:LabCat',
        path: 'Observation.category',
        sliceName: 'LabCat',
        min: 0,
        max: '1',
        type: [{ code: 'CodeableConcept' }],
        patternCodeableConcept: {
          coding: [
            {
              system: 'http://terminology.hl7.org/CodeSystem/observation-category',
              code: 'laboratory',
            },
          ],
        },
      },
      {
        id: 'Observation.code',
        path: 'Observation.code',
        min: 1,
        max: '1',
        type: [{ code: 'CodeableConcept' }],
      },
    ],
  } as unknown as StructureDefinition['snapshot'],
} as unknown as StructureDefinition;

// ── SD with extension slicing ─────────────────────────────────────────────

const patientSDWithExtSlicing: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://test.org/StructureDefinition/TestPatient',
  name: 'TestPatient',
  kind: 'resource',
  type: 'Patient',
  abstract: false,
  status: 'active',
  snapshot: {
    element: [
      {
        id: 'Patient',
        path: 'Patient',
        min: 0,
        max: '*',
      },
      {
        id: 'Patient.extension',
        path: 'Patient.extension',
        min: 0,
        max: '*',
        type: [{ code: 'Extension' }],
        slicing: {
          discriminator: [{ type: 'value', path: 'url' }],
          rules: 'open',
          ordered: false,
        },
      },
      {
        id: 'Patient.extension:race',
        path: 'Patient.extension',
        sliceName: 'race',
        min: 0,
        max: '1',
        type: [
          {
            code: 'Extension',
            profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-race'],
          },
        ],
        mustSupport: true,
      },
      {
        id: 'Patient.extension:ethnicity',
        path: 'Patient.extension',
        sliceName: 'ethnicity',
        min: 0,
        max: '1',
        type: [
          {
            code: 'Extension',
            profile: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity'],
          },
        ],
      },
      {
        id: 'Patient.name',
        path: 'Patient.name',
        min: 1,
        max: '*',
        type: [{ code: 'HumanName' }],
      },
    ],
  } as unknown as StructureDefinition['snapshot'],
} as unknown as StructureDefinition;

// ── SD without slicing ────────────────────────────────────────────────────

const simpleSD: StructureDefinition = {
  resourceType: 'StructureDefinition',
  url: 'http://test.org/StructureDefinition/SimplePatient',
  name: 'SimplePatient',
  kind: 'resource',
  type: 'Patient',
  abstract: false,
  status: 'active',
  snapshot: {
    element: [
      {
        id: 'Patient',
        path: 'Patient',
        min: 0,
        max: '*',
      },
      {
        id: 'Patient.name',
        path: 'Patient.name',
        min: 0,
        max: '*',
        type: [{ code: 'HumanName' }],
      },
    ],
  } as unknown as StructureDefinition['snapshot'],
} as unknown as StructureDefinition;

// ── Tests ─────────────────────────────────────────────────────────────────

describe('buildCanonicalProfile — slicing extraction', () => {
  it('extracts slicing map for category pattern discriminator', () => {
    const profile = buildCanonicalProfile(observationSDWithSlicing);
    expect(profile.slicing).toBeDefined();
    expect(profile.slicing!.has('Observation.category')).toBe(true);
  });

  it('preserves base element in elements map (not overwritten by slice)', () => {
    const profile = buildCanonicalProfile(observationSDWithSlicing);
    const catEl = profile.elements.get('Observation.category');
    expect(catEl).toBeDefined();
    // The base element should have slicing discriminator
    expect(catEl!.slicing).toBeDefined();
    expect(catEl!.slicing!.discriminators[0].type).toBe('pattern');
    expect(catEl!.slicing!.discriminators[0].path).toBe('coding');
  });

  it('extracts correct number of slices for category', () => {
    const profile = buildCanonicalProfile(observationSDWithSlicing);
    const slicedEl = profile.slicing!.get('Observation.category')!;
    expect(slicedEl.slices.length).toBe(2);
  });

  it('extracts VSCat slice details', () => {
    const profile = buildCanonicalProfile(observationSDWithSlicing);
    const slicedEl = profile.slicing!.get('Observation.category')!;
    const vsCat = slicedEl.slices.find((s) => s.sliceName === 'VSCat');
    expect(vsCat).toBeDefined();
    expect(vsCat!.id).toBe('Observation.category:VSCat');
    expect(vsCat!.min).toBe(1);
    expect(vsCat!.max).toBe(1);
    expect(vsCat!.mustSupport).toBe(true);
  });

  it('extracts LabCat slice details', () => {
    const profile = buildCanonicalProfile(observationSDWithSlicing);
    const slicedEl = profile.slicing!.get('Observation.category')!;
    const labCat = slicedEl.slices.find((s) => s.sliceName === 'LabCat');
    expect(labCat).toBeDefined();
    expect(labCat!.min).toBe(0);
    expect(labCat!.max).toBe(1);
    expect(labCat!.mustSupport).toBe(false);
  });

  it('extracts discriminator metadata', () => {
    const profile = buildCanonicalProfile(observationSDWithSlicing);
    const slicedEl = profile.slicing!.get('Observation.category')!;
    expect(slicedEl.discriminators.length).toBe(1);
    expect(slicedEl.discriminators[0].type).toBe('pattern');
    expect(slicedEl.discriminators[0].path).toBe('coding');
    expect(slicedEl.rules).toBe('open');
    expect(slicedEl.ordered).toBe(false);
  });

  it('extracts fixedValues from patternCodeableConcept', () => {
    const profile = buildCanonicalProfile(observationSDWithSlicing);
    const slicedEl = profile.slicing!.get('Observation.category')!;
    const vsCat = slicedEl.slices.find((s) => s.sliceName === 'VSCat')!;
    expect(vsCat.fixedValues).toBeDefined();
    expect(vsCat.fixedValues['codeableConcept']).toEqual({
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
        },
      ],
    });
  });

  it('non-slice elements are preserved correctly', () => {
    const profile = buildCanonicalProfile(observationSDWithSlicing);
    expect(profile.elements.has('Observation')).toBe(true);
    expect(profile.elements.has('Observation.id')).toBe(true);
    expect(profile.elements.has('Observation.status')).toBe(true);
    expect(profile.elements.has('Observation.code')).toBe(true);
  });
});

describe('buildCanonicalProfile — extension slicing', () => {
  it('extracts extension slicing map', () => {
    const profile = buildCanonicalProfile(patientSDWithExtSlicing);
    expect(profile.slicing).toBeDefined();
    expect(profile.slicing!.has('Patient.extension')).toBe(true);
  });

  it('extracts race extension slice with extensionUrl', () => {
    const profile = buildCanonicalProfile(patientSDWithExtSlicing);
    const extSlicing = profile.slicing!.get('Patient.extension')!;
    const race = extSlicing.slices.find((s) => s.sliceName === 'race');
    expect(race).toBeDefined();
    expect(race!.extensionUrl).toBe(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    );
    expect(race!.extensionProfile).toBe(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    );
    expect(race!.mustSupport).toBe(true);
  });

  it('extracts ethnicity extension slice', () => {
    const profile = buildCanonicalProfile(patientSDWithExtSlicing);
    const extSlicing = profile.slicing!.get('Patient.extension')!;
    const eth = extSlicing.slices.find((s) => s.sliceName === 'ethnicity');
    expect(eth).toBeDefined();
    expect(eth!.extensionUrl).toBe(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
    );
  });

  it('sets url in fixedValues for extension slices', () => {
    const profile = buildCanonicalProfile(patientSDWithExtSlicing);
    const extSlicing = profile.slicing!.get('Patient.extension')!;
    const race = extSlicing.slices.find((s) => s.sliceName === 'race')!;
    expect(race.fixedValues['url']).toBe(
      'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    );
  });

  it('uses value discriminator type for extension slicing', () => {
    const profile = buildCanonicalProfile(patientSDWithExtSlicing);
    const extSlicing = profile.slicing!.get('Patient.extension')!;
    expect(extSlicing.discriminators[0].type).toBe('value');
    expect(extSlicing.discriminators[0].path).toBe('url');
  });
});

describe('buildCanonicalProfile — no slicing', () => {
  it('returns undefined slicing for SD without slicing', () => {
    const profile = buildCanonicalProfile(simpleSD);
    expect(profile.slicing).toBeUndefined();
  });

  it('still builds elements correctly', () => {
    const profile = buildCanonicalProfile(simpleSD);
    expect(profile.elements.has('Patient')).toBe(true);
    expect(profile.elements.has('Patient.name')).toBe(true);
  });
});
