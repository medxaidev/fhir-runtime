import { describe, it, expect } from 'vitest';
import {
  matchSlice,
  countSliceInstances,
  generateSliceSkeleton,
  isExtensionSlicing,
} from '../slicing-utils.js';
import type { SlicedElement, SliceDefinition } from '../../model/index.js';

// ── Fixtures ──────────────────────────────────────────────────────────────

const categorySlicing: SlicedElement = {
  basePath: 'Observation.category',
  discriminators: [{ type: 'pattern', path: 'coding' }],
  rules: 'open',
  ordered: false,
  slices: [
    {
      id: 'Observation.category:VSCat',
      sliceName: 'VSCat',
      basePath: 'Observation.category',
      min: 1,
      max: 1,
      fixedValues: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
          },
        ],
      },
      mustSupport: true,
    },
    {
      id: 'Observation.category:LabCat',
      sliceName: 'LabCat',
      basePath: 'Observation.category',
      min: 0,
      max: 1,
      fixedValues: {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'laboratory',
          },
        ],
      },
      mustSupport: false,
    },
  ],
};

const extensionSlicing: SlicedElement = {
  basePath: 'Patient.extension',
  discriminators: [{ type: 'value', path: 'url' }],
  rules: 'open',
  ordered: false,
  slices: [
    {
      id: 'Patient.extension:race',
      sliceName: 'race',
      basePath: 'Patient.extension',
      min: 0,
      max: 1,
      fixedValues: {
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      },
      mustSupport: false,
      extensionUrl: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      extensionProfile: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    },
    {
      id: 'Patient.extension:ethnicity',
      sliceName: 'ethnicity',
      basePath: 'Patient.extension',
      min: 0,
      max: 1,
      fixedValues: {
        url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
      },
      mustSupport: false,
      extensionUrl: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
      extensionProfile: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
    },
  ],
};

// ── matchSlice ────────────────────────────────────────────────────────────

describe('matchSlice', () => {
  it('matches a pattern discriminator (vital-signs)', () => {
    const instance = {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
        },
      ],
      text: 'Vital Signs',
    };
    expect(matchSlice(instance, categorySlicing)).toBe('VSCat');
  });

  it('matches a pattern discriminator (laboratory)', () => {
    const instance = {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'laboratory',
        },
      ],
    };
    expect(matchSlice(instance, categorySlicing)).toBe('LabCat');
  });

  it('returns null for unmatched instance', () => {
    const instance = {
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'social-history',
        },
      ],
    };
    expect(matchSlice(instance, categorySlicing)).toBeNull();
  });

  it('matches extension slice by url (value discriminator)', () => {
    const instance = {
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
      extension: [{ url: 'ombCategory', valueCoding: { code: '2106-3' } }],
    };
    expect(matchSlice(instance, extensionSlicing)).toBe('race');
  });

  it('matches ethnicity extension', () => {
    const instance = {
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-ethnicity',
    };
    expect(matchSlice(instance, extensionSlicing)).toBe('ethnicity');
  });

  it('returns null for unknown extension url', () => {
    const instance = {
      url: 'http://example.org/custom-extension',
    };
    expect(matchSlice(instance, extensionSlicing)).toBeNull();
  });
});

// ── countSliceInstances ───────────────────────────────────────────────────

describe('countSliceInstances', () => {
  it('counts matching instances for each slice', () => {
    const items = [
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
          },
        ],
      },
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'vital-signs',
          },
        ],
        text: 'Another vital-signs',
      },
      {
        coding: [
          {
            system: 'http://terminology.hl7.org/CodeSystem/observation-category',
            code: 'laboratory',
          },
        ],
      },
      {
        coding: [{ system: 'http://example.org', code: 'custom' }],
      },
    ];
    const counts = countSliceInstances(items, categorySlicing);
    expect(counts.get('VSCat')).toBe(2);
    expect(counts.get('LabCat')).toBe(1);
  });

  it('returns zero counts for no matches', () => {
    const counts = countSliceInstances([], categorySlicing);
    expect(counts.get('VSCat')).toBe(0);
    expect(counts.get('LabCat')).toBe(0);
  });
});

// ── generateSliceSkeleton ─────────────────────────────────────────────────

describe('generateSliceSkeleton', () => {
  it('generates skeleton from pattern fixedValues', () => {
    const skeleton = generateSliceSkeleton(categorySlicing.slices[0]);
    expect(skeleton).toEqual({
      coding: [
        {
          system: 'http://terminology.hl7.org/CodeSystem/observation-category',
          code: 'vital-signs',
        },
      ],
    });
  });

  it('generates skeleton for extension slice with url', () => {
    const skeleton = generateSliceSkeleton(extensionSlicing.slices[0]);
    expect(skeleton).toEqual({
      url: 'http://hl7.org/fhir/us/core/StructureDefinition/us-core-race',
    });
  });

  it('deep-clones object values', () => {
    const skeleton = generateSliceSkeleton(categorySlicing.slices[0]);
    // Mutate the skeleton and verify original is unchanged
    (skeleton.coding as unknown[])[0] = { modified: true };
    expect(categorySlicing.slices[0].fixedValues.coding).toEqual([
      {
        system: 'http://terminology.hl7.org/CodeSystem/observation-category',
        code: 'vital-signs',
      },
    ]);
  });
});

// ── isExtensionSlicing ────────────────────────────────────────────────────

describe('isExtensionSlicing', () => {
  it('returns true for .extension paths', () => {
    expect(isExtensionSlicing('Patient.extension')).toBe(true);
  });

  it('returns true for .modifierExtension paths', () => {
    expect(isExtensionSlicing('Observation.modifierExtension')).toBe(true);
  });

  it('returns false for non-extension paths', () => {
    expect(isExtensionSlicing('Observation.category')).toBe(false);
    expect(isExtensionSlicing('Patient.identifier')).toBe(false);
  });
});
