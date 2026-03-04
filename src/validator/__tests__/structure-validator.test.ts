/**
 * fhir-validator — StructureValidator Tests
 *
 * Tests for the main orchestrator class that coordinates all validation rules.
 * Includes unit tests and fixture-driven tests across 3 categories:
 * - basic (6 fixtures): resourceType, cardinality, valid resources
 * - advanced (6 fixtures): fixed, pattern, reference, slicing
 * - options (5 fixtures): failFast, skip options, error handling
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanonicalProfile, CanonicalElement, Resource } from '../../model/index.js';
import type { ValidationIssue } from '../types.js';
import { StructureValidator } from '../structure-validator.js';
import { ProfileNotFoundError, ValidationFailedError } from '../errors.js';

// =============================================================================
// Fixture helpers
// =============================================================================

const FIXTURE_BASE = resolve(__dirname, 'fixtures', 'structure-validator');

function loadFixture(sub: string, file: string): any {
  return JSON.parse(readFileSync(resolve(FIXTURE_BASE, sub, file), 'utf-8'));
}

function toProfile(raw: any): CanonicalProfile {
  const elements = new Map<string, CanonicalElement>();
  for (const el of raw.elements) {
    elements.set(el.sliceName ? el.path : el.path, toElement(el));
  }
  return {
    url: raw.url,
    name: raw.name,
    kind: raw.kind,
    type: raw.type,
    abstract: raw.abstract,
    elements,
  };
}

function toElement(raw: any): CanonicalElement {
  return {
    path: raw.path,
    id: raw.id,
    min: raw.min,
    max: raw.max === 'unbounded' ? 'unbounded' : raw.max,
    types: raw.types ?? [],
    constraints: raw.constraints ?? [],
    mustSupport: raw.mustSupport ?? false,
    isModifier: raw.isModifier ?? false,
    isSummary: raw.isSummary ?? false,
    slicing: raw.slicing ? {
      discriminators: raw.slicing.discriminators,
      rules: raw.slicing.rules,
      ordered: raw.slicing.ordered,
    } : undefined,
    sliceName: raw.sliceName,
    fixed: raw.fixed,
    pattern: raw.pattern,
  };
}

/**
 * Build profile with proper Map handling for sliced elements.
 * Sliced elements (with sliceName) need unique keys in the Map.
 */
function toProfileWithSlices(raw: any): CanonicalProfile {
  const elements = new Map<string, CanonicalElement>();
  for (const el of raw.elements) {
    const elem = toElement(el);
    // Use a unique key for sliced elements
    const key = elem.sliceName ? `${elem.path}:${elem.sliceName}` : elem.path;
    elements.set(key, elem);
  }
  return {
    url: raw.url,
    name: raw.name,
    kind: raw.kind,
    type: raw.type,
    abstract: raw.abstract,
    elements,
  };
}

// =============================================================================
// Section 1: Constructor & Basic API — Unit Tests
// =============================================================================

describe('StructureValidator constructor', () => {
  it('creates with default options', () => {
    const v = new StructureValidator();
    expect(v).toBeInstanceOf(StructureValidator);
  });

  it('creates with custom options', () => {
    const v = new StructureValidator({ failFast: true, maxDepth: 10 });
    expect(v).toBeInstanceOf(StructureValidator);
  });
});

describe('StructureValidator.validate — basic', () => {
  const validator = new StructureValidator();

  it('throws ProfileNotFoundError when profile is undefined', () => {
    const resource = { resourceType: 'Patient' } as Resource;
    expect(() => validator.validate(resource, undefined as any)).toThrow(ProfileNotFoundError);
  });

  it('valid minimal resource → valid=true, no issues', () => {
    const resource = { resourceType: 'Patient', id: 'p1' } as Resource;
    const profile: CanonicalProfile = {
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.resource).toBe(resource);
    expect(result.profile).toBe(profile);
  });

  it('resource type mismatch → RESOURCE_TYPE_MISMATCH', () => {
    const resource = { resourceType: 'Observation' } as Resource;
    const profile: CanonicalProfile = {
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === 'RESOURCE_TYPE_MISMATCH')).toBe(true);
  });

  it('missing resourceType → RESOURCE_TYPE_MISMATCH', () => {
    const resource = { id: 'p1' } as any as Resource;
    const profile: CanonicalProfile = {
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === 'RESOURCE_TYPE_MISMATCH')).toBe(true);
  });

  it('cardinality min violation', () => {
    const resource = { resourceType: 'Patient' } as Resource;
    const profile: CanonicalProfile = {
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Patient.name', { path: 'Patient.name', id: 'Patient.name', min: 1, max: 'unbounded' as const, types: [{ code: 'HumanName' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.valid).toBe(false);
    expect(result.issues.some(i => i.code === 'CARDINALITY_MIN_VIOLATION')).toBe(true);
  });

  it('profileUrl in result uses profile.url by default', () => {
    const resource = { resourceType: 'Patient' } as Resource;
    const profile: CanonicalProfile = {
      url: 'http://example.org/Patient',
      name: 'Patient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.profileUrl).toBe('http://example.org/Patient');
  });

  it('profileUrl in result uses options.profileUrl when provided', () => {
    const resource = { resourceType: 'Patient' } as Resource;
    const profile: CanonicalProfile = {
      url: 'http://example.org/Patient',
      name: 'Patient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    const result = validator.validate(resource, profile, { profileUrl: 'http://custom/url' });
    expect(result.profileUrl).toBe('http://custom/url');
  });
});

// =============================================================================
// Section 2: Options — Unit Tests
// =============================================================================

describe('StructureValidator options', () => {
  it('failFast throws on first error', () => {
    const validator = new StructureValidator({ failFast: true });
    const resource = { resourceType: 'Patient' } as Resource;
    const profile: CanonicalProfile = {
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Patient.name', { path: 'Patient.name', id: 'Patient.name', min: 1, max: 'unbounded' as const, types: [{ code: 'HumanName' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    expect(() => validator.validate(resource, profile)).toThrow(ValidationFailedError);
  });

  it('failFast error contains issues', () => {
    const validator = new StructureValidator({ failFast: true });
    const resource = { resourceType: 'Patient' } as Resource;
    const profile: CanonicalProfile = {
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Patient.name', { path: 'Patient.name', id: 'Patient.name', min: 1, max: 'unbounded' as const, types: [{ code: 'HumanName' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    try {
      validator.validate(resource, profile);
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationFailedError);
      expect((e as ValidationFailedError).issues.length).toBeGreaterThan(0);
    }
  });

  it('failFast=false collects all issues', () => {
    const validator = new StructureValidator({ failFast: false });
    const resource = { resourceType: 'Patient', gender: ['m', 'f'] } as any as Resource;
    const profile: CanonicalProfile = {
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Patient.name', { path: 'Patient.name', id: 'Patient.name', min: 1, max: 'unbounded' as const, types: [{ code: 'HumanName' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Patient.gender', { path: 'Patient.gender', id: 'Patient.gender', min: 0, max: 1, types: [{ code: 'code' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.issues.length).toBeGreaterThanOrEqual(2);
  });

  it('validateFixed=false skips fixed value checks', () => {
    const validator = new StructureValidator({ validateFixed: false });
    const resource = { resourceType: 'Observation', status: 'preliminary' } as any as Resource;
    const profile: CanonicalProfile = {
      url: 'http://example.org/FinalObs',
      name: 'FinalObs', kind: 'resource', type: 'Observation', abstract: false,
      elements: new Map([
        ['Observation', { path: 'Observation', id: 'Observation', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Observation.status', { path: 'Observation.status', id: 'Observation.status', min: 1, max: 1, types: [{ code: 'code' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false, fixed: 'final' }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.issues.some(i => i.code === 'FIXED_VALUE_MISMATCH')).toBe(false);
  });

  it('validateSlicing=false skips slicing checks', () => {
    const validator = new StructureValidator({ validateSlicing: false });
    const resource = {
      resourceType: 'Patient',
      identifier: [
        { system: 'http://hospital.example.org/mrn', value: '12345' },
        { system: 'http://unknown.org', value: '99999' },
      ],
    } as any as Resource;
    const profile: CanonicalProfile = {
      url: 'http://example.org/SlicedPatient',
      name: 'SlicedPatient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Patient.identifier', {
          path: 'Patient.identifier', id: 'Patient.identifier', min: 0, max: 'unbounded' as const,
          types: [{ code: 'Identifier' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false,
          slicing: { discriminators: [{ type: 'value' as const, path: 'system' }], rules: 'closed' as const, ordered: false },
        }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.issues.some(i => i.code === 'SLICING_NO_MATCH')).toBe(false);
  });

  it('per-call options override constructor options', () => {
    const validator = new StructureValidator({ validateFixed: true });
    const resource = { resourceType: 'Observation', status: 'preliminary' } as any as Resource;
    const profile: CanonicalProfile = {
      url: 'http://example.org/FinalObs',
      name: 'FinalObs', kind: 'resource', type: 'Observation', abstract: false,
      elements: new Map([
        ['Observation', { path: 'Observation', id: 'Observation', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Observation.status', { path: 'Observation.status', id: 'Observation.status', min: 1, max: 1, types: [{ code: 'code' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false, fixed: 'final' }],
      ]),
    };
    // Per-call override: skip fixed
    const result = validator.validate(resource, profile, { validateFixed: false });
    expect(result.issues.some(i => i.code === 'FIXED_VALUE_MISMATCH')).toBe(false);
  });

  it('maxDepth exceeded → warning', () => {
    const validator = new StructureValidator({ maxDepth: 0 });
    const resource = { resourceType: 'Patient' } as Resource;
    const profile: CanonicalProfile = {
      url: 'http://hl7.org/fhir/StructureDefinition/Patient',
      name: 'Patient', kind: 'resource', type: 'Patient', abstract: false,
      elements: new Map([
        ['Patient', { path: 'Patient', id: 'Patient', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Patient.name', { path: 'Patient.name', id: 'Patient.name', min: 0, max: 'unbounded' as const, types: [{ code: 'HumanName' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.issues.some(i => i.code === 'INTERNAL_ERROR' && i.message.includes('depth'))).toBe(true);
  });
});

// =============================================================================
// Section 3: Advanced validation — Unit Tests
// =============================================================================

describe('StructureValidator advanced', () => {
  const validator = new StructureValidator();

  it('fixed value mismatch detected', () => {
    const resource = { resourceType: 'Observation', status: 'preliminary' } as any as Resource;
    const profile: CanonicalProfile = {
      url: 'http://example.org/FinalObs',
      name: 'FinalObs', kind: 'resource', type: 'Observation', abstract: false,
      elements: new Map([
        ['Observation', { path: 'Observation', id: 'Observation', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Observation.status', { path: 'Observation.status', id: 'Observation.status', min: 1, max: 1, types: [{ code: 'code' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false, fixed: 'final' }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.issues.some(i => i.code === 'FIXED_VALUE_MISMATCH')).toBe(true);
  });

  it('pattern value mismatch detected', () => {
    const resource = {
      resourceType: 'Observation',
      code: { coding: [{ system: 'http://snomed.info/sct', code: '12345' }] },
    } as any as Resource;
    const profile: CanonicalProfile = {
      url: 'http://example.org/LoincObs',
      name: 'LoincObs', kind: 'resource', type: 'Observation', abstract: false,
      elements: new Map([
        ['Observation', { path: 'Observation', id: 'Observation', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Observation.code', { path: 'Observation.code', id: 'Observation.code', min: 1, max: 1, types: [{ code: 'CodeableConcept' }], constraints: [], mustSupport: false, isModifier: false, isSummary: false, pattern: { coding: [{ system: 'http://loinc.org' }] } }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.issues.some(i => i.code === 'PATTERN_VALUE_MISMATCH')).toBe(true);
  });

  it('reference target mismatch detected', () => {
    const resource = {
      resourceType: 'Observation',
      subject: { reference: 'Observation/other' },
    } as any as Resource;
    const profile: CanonicalProfile = {
      url: 'http://example.org/PatientObs',
      name: 'PatientObs', kind: 'resource', type: 'Observation', abstract: false,
      elements: new Map([
        ['Observation', { path: 'Observation', id: 'Observation', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Observation.subject', { path: 'Observation.subject', id: 'Observation.subject', min: 0, max: 1, types: [{ code: 'Reference', targetProfiles: ['http://hl7.org/fhir/StructureDefinition/Patient'] }], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.issues.some(i => i.code === 'REFERENCE_TARGET_MISMATCH')).toBe(true);
  });

  it('warnings do not make result invalid', () => {
    const resource = {
      resourceType: 'Observation',
      subject: { reference: 'urn:uuid:12345678-1234-1234-1234-123456789012' },
    } as any as Resource;
    const profile: CanonicalProfile = {
      url: 'http://example.org/RefObs',
      name: 'RefObs', kind: 'resource', type: 'Observation', abstract: false,
      elements: new Map([
        ['Observation', { path: 'Observation', id: 'Observation', min: 0, max: 1, types: [], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
        ['Observation.subject', { path: 'Observation.subject', id: 'Observation.subject', min: 0, max: 1, types: [{ code: 'Reference', targetProfiles: ['http://hl7.org/fhir/StructureDefinition/Patient'] }], constraints: [], mustSupport: false, isModifier: false, isSummary: false }],
      ]),
    };
    const result = validator.validate(resource, profile);
    expect(result.valid).toBe(true);
    expect(result.issues.some(i => i.severity === 'warning')).toBe(true);
  });
});

// =============================================================================
// Section 4: Fixture-driven — Basic
// =============================================================================

describe('Fixture: basic', () => {
  const validator = new StructureValidator();
  const files = [
    '01-valid-patient.json',
    '02-missing-required.json',
    '03-wrong-resourcetype.json',
    '04-cardinality-max-violation.json',
    '05-multiple-errors.json',
    '06-valid-observation.json',
  ];

  for (const file of files) {
    const fixture = loadFixture('basic', file);
    it(fixture.description, () => {
      const profile = toProfile(fixture.profile);
      const result = validator.validate(fixture.resource as Resource, profile);
      expect(result.valid).toBe(fixture.expectedValid);
      if (fixture.expectedIssueCount !== undefined) {
        expect(result.issues).toHaveLength(fixture.expectedIssueCount);
      }
      if (fixture.expectedIssueCodes) {
        for (const code of fixture.expectedIssueCodes) {
          expect(result.issues.some((i: ValidationIssue) => i.code === code)).toBe(true);
        }
      }
    });
  }
});

// =============================================================================
// Section 5: Fixture-driven — Advanced
// =============================================================================

describe('Fixture: advanced', () => {
  const validator = new StructureValidator();
  const files = [
    '01-fixed-value-mismatch.json',
    '02-pattern-value-mismatch.json',
    '03-reference-target-mismatch.json',
    '04-slicing-closed-violation.json',
    '05-valid-with-all-rules.json',
    '06-fixed-pattern-combined.json',
  ];

  for (const file of files) {
    const fixture = loadFixture('advanced', file);
    it(fixture.description, () => {
      // Use slice-aware profile builder for slicing fixtures
      const profile = file.includes('slicing')
        ? toProfileWithSlices(fixture.profile)
        : toProfile(fixture.profile);
      const result = validator.validate(fixture.resource as Resource, profile);
      expect(result.valid).toBe(fixture.expectedValid);
      if (fixture.expectedIssueCount !== undefined) {
        expect(result.issues).toHaveLength(fixture.expectedIssueCount);
      }
      if (fixture.expectedIssueCodes) {
        for (const code of fixture.expectedIssueCodes) {
          expect(result.issues.some((i: ValidationIssue) => i.code === code)).toBe(true);
        }
      }
    });
  }
});

// =============================================================================
// Section 6: Fixture-driven — Options
// =============================================================================

describe('Fixture: options', () => {
  it('01-failfast-throws', () => {
    const fixture = loadFixture('options', '01-failfast-throws.json');
    const profile = toProfile(fixture.profile);
    const validator = new StructureValidator(fixture.options);
    expect(() => validator.validate(fixture.resource as Resource, profile)).toThrow(ValidationFailedError);
  });

  it('02-skip-fixed-validation', () => {
    const fixture = loadFixture('options', '02-skip-fixed-validation.json');
    const profile = toProfile(fixture.profile);
    const validator = new StructureValidator(fixture.options);
    const result = validator.validate(fixture.resource as Resource, profile);
    expect(result.valid).toBe(fixture.expectedValid);
    expect(result.issues).toHaveLength(fixture.expectedIssueCount);
  });

  it('03-skip-slicing-validation', () => {
    const fixture = loadFixture('options', '03-skip-slicing-validation.json');
    const profile = toProfileWithSlices(fixture.profile);
    const validator = new StructureValidator(fixture.options);
    const result = validator.validate(fixture.resource as Resource, profile);
    expect(result.valid).toBe(fixture.expectedValid);
    expect(result.issues).toHaveLength(fixture.expectedIssueCount);
  });

  it('04-no-profile-throws', () => {
    const fixture = loadFixture('options', '04-no-profile-throws.json');
    const validator = new StructureValidator();
    expect(() => validator.validate(fixture.resource as Resource, fixture.profile as any)).toThrow(ProfileNotFoundError);
  });

  it('05-warnings-still-valid', () => {
    const fixture = loadFixture('options', '05-warnings-still-valid.json');
    const profile = toProfile(fixture.profile);
    const validator = new StructureValidator();
    const result = validator.validate(fixture.resource as Resource, profile);
    expect(result.valid).toBe(fixture.expectedValid);
  });
});

// =============================================================================
// Section 7: Barrel exports
// =============================================================================

describe('Barrel exports (StructureValidator)', () => {
  it('StructureValidator importable from index', async () => {
    const m = await import('../index.js');
    expect(m.StructureValidator).toBeDefined();
    expect(typeof m.StructureValidator).toBe('function');
  });
});
