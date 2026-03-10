/**
 * Suite A: Base Profile Conformance Tests
 *
 * For each common FHIR R4 resource type, generates a minimal valid resource
 * from its CanonicalProfile and validates it, asserting zero errors.
 *
 * Also tests bare-minimum resources (just resourceType + id) to verify
 * no false cardinality errors on optional elements.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';

import { loadBundleFromFile, StructureValidator } from '../../index.js';
import type { CanonicalProfile, Resource } from '../../index.js';
import { generateMinimalResource, generateBareResource } from './resource-generator.js';

const SPEC_DIR = resolve(__dirname, '..', '..', '..', 'spec', 'fhir', 'r4');
const PROFILES_RESOURCES = resolve(SPEC_DIR, 'profiles-resources.json');

// Top ~40 most commonly used FHIR R4 resource types
const TARGET_TYPES = [
  'Patient',
  'Observation',
  'Encounter',
  'Condition',
  'Procedure',
  'MedicationRequest',
  'DiagnosticReport',
  'Immunization',
  'AllergyIntolerance',
  'CarePlan',
  'CareTeam',
  'Claim',
  'ClaimResponse',
  'Communication',
  'Composition',
  'Consent',
  'Coverage',
  'Device',
  'DocumentReference',
  'Endpoint',
  'EpisodeOfCare',
  'ExplanationOfBenefit',
  'Goal',
  'Group',
  'HealthcareService',
  'Location',
  'Medication',
  'MedicationAdministration',
  'MedicationDispense',
  'MedicationStatement',
  'NutritionOrder',
  'Organization',
  'Practitioner',
  'PractitionerRole',
  'Provenance',
  'Questionnaire',
  'QuestionnaireResponse',
  'RelatedPerson',
  'ServiceRequest',
  'Specimen',
  'Task',
];

let profilesByType: Map<string, CanonicalProfile>;

beforeAll(() => {
  const result = loadBundleFromFile(PROFILES_RESOURCES, {
    filterKind: 'resource',
    excludeAbstract: true,
  });
  profilesByType = new Map(result.profiles.map((p) => [p.type, p]));
}, 60_000);

// =============================================================================
// A1: Generated minimal resources should validate with zero errors
// =============================================================================

describe('A1: Generated minimal resources — zero errors', () => {
  for (const resourceType of TARGET_TYPES) {
    it(`${resourceType}: minimal generated resource produces zero errors`, () => {
      const profile = profilesByType.get(resourceType);
      if (!profile) {
        // Skip types not found in the spec bundle (shouldn't happen)
        console.warn(`Profile not found for ${resourceType}, skipping`);
        return;
      }

      const resource = generateMinimalResource(profile);
      const validator = new StructureValidator({ skipInvariants: true });
      const result = validator.validate(resource as unknown as Resource, profile);

      const errors = result.issues.filter((i) => i.severity === 'error');

      if (errors.length > 0) {
        console.log(`\n=== ${resourceType} generated resource ===`);
        console.log(JSON.stringify(resource, null, 2).slice(0, 500));
        console.log(`\n=== ${errors.length} error(s) ===`);
        for (const e of errors) {
          console.log(`  ${e.code} | ${e.path} | ${e.message}`);
        }
      }

      expect(errors).toEqual([]);
    });
  }
});

// =============================================================================
// A2: Bare-minimum resources — no false cardinality on optional elements
// =============================================================================

describe('A2: Bare-minimum resources — no false optional cardinality', () => {
  for (const resourceType of TARGET_TYPES) {
    it(`${resourceType}: bare resource has no cardinality errors on optional backbone children`, () => {
      const profile = profilesByType.get(resourceType);
      if (!profile) return;

      const resource = generateBareResource(resourceType);
      const validator = new StructureValidator({ skipInvariants: true });
      const result = validator.validate(resource as unknown as Resource, profile);

      // Filter for cardinality errors on elements with depth > 1
      // (children of backbone elements that should be skipped when parent absent)
      const falseBackboneErrors = result.issues.filter((i) => {
        if (i.severity !== 'error') return false;
        if (i.code !== 'CARDINALITY_MIN_VIOLATION') return false;
        // Only flag children of backbone elements (path has 3+ segments)
        const segments = (i.path ?? '').split('.');
        if (segments.length < 3) return false;
        // Check if the parent backbone element is optional (min=0)
        const parentPath = segments.slice(0, segments.length - 1).join('.');
        const parentEl = profile.elements.get(parentPath);
        return parentEl != null && parentEl.min === 0;
      });

      if (falseBackboneErrors.length > 0) {
        console.log(`\n=== ${resourceType} false backbone errors ===`);
        for (const e of falseBackboneErrors) {
          console.log(`  ${e.code} | ${e.path} | ${e.message}`);
        }
      }

      expect(falseBackboneErrors).toEqual([]);
    });
  }
});

// =============================================================================
// A3: All 148 resource types — bare resource no-crash + no false backbone
// =============================================================================

describe('A3: All resource types — bare resource smoke test', () => {
  it('validates bare resources for all non-abstract types without crash', () => {
    const validator = new StructureValidator({ skipInvariants: true });
    let tested = 0;
    let crashed = 0;
    const crashedTypes: string[] = [];
    const falsePositiveTypes: string[] = [];

    for (const [type, profile] of Array.from(profilesByType.entries())) {
      if (profile.abstract) continue;

      const resource = generateBareResource(type);
      try {
        const result = validator.validate(resource as unknown as Resource, profile);

        // Check for false backbone cardinality errors
        const falseErrors = result.issues.filter((i) => {
          if (i.severity !== 'error' || i.code !== 'CARDINALITY_MIN_VIOLATION') return false;
          const segments = (i.path ?? '').split('.');
          if (segments.length < 3) return false;
          const parentPath = segments.slice(0, segments.length - 1).join('.');
          const parentEl = profile.elements.get(parentPath);
          return parentEl != null && parentEl.min === 0;
        });

        if (falseErrors.length > 0) {
          falsePositiveTypes.push(type);
        }
        tested++;
      } catch {
        crashed++;
        crashedTypes.push(type);
      }
    }

    if (crashedTypes.length > 0) {
      console.warn('Crashed types:', crashedTypes);
    }
    if (falsePositiveTypes.length > 0) {
      console.warn('False positive types:', falsePositiveTypes);
    }

    expect(tested).toBeGreaterThan(100);
    expect(crashed).toBe(0);
    expect(falsePositiveTypes).toEqual([]);
  });
});
