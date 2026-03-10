/**
 * Suite B: US Core Example Conformance Tests
 *
 * Validates all 236 US Core official examples against their base FHIR R4
 * profiles and asserts zero false-positive errors.
 *
 * This upgrades the existing UC4 test from "no crash" to "no false errors".
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { resolve } from 'node:path';
import { readFileSync, readdirSync, existsSync } from 'node:fs';

import { loadBundleFromFile, StructureValidator } from '../../index.js';
import type { CanonicalProfile, Resource } from '../../index.js';

const SPEC_DIR = resolve(__dirname, '..', '..', '..', 'spec', 'fhir', 'r4');
const PROFILES_RESOURCES = resolve(SPEC_DIR, 'profiles-resources.json');
const US_CORE_EXAMPLE_DIR = resolve(
  __dirname, '..', '..', '..', 'spec', 'us-core', 'extracted', 'package', 'example',
);

interface ExampleInfo {
  filename: string;
  resource: Record<string, unknown>;
  resourceType: string;
}

let profilesByType: Map<string, CanonicalProfile>;
let allExamples: ExampleInfo[];
let usCoreDirExists: boolean;

beforeAll(() => {
  // Load base R4 profiles
  const result = loadBundleFromFile(PROFILES_RESOURCES, {
    filterKind: 'resource',
    excludeAbstract: true,
  });
  profilesByType = new Map(result.profiles.map((p) => [p.type, p]));

  // Load US Core examples (may not exist if gitignored and not extracted)
  usCoreDirExists = existsSync(US_CORE_EXAMPLE_DIR);
  allExamples = [];

  if (usCoreDirExists) {
    const files = readdirSync(US_CORE_EXAMPLE_DIR).filter((f) => f.endsWith('.json'));
    for (const filename of files) {
      try {
        const raw = JSON.parse(readFileSync(resolve(US_CORE_EXAMPLE_DIR, filename), 'utf-8'));
        if (!raw.resourceType) continue;
        allExamples.push({ filename, resource: raw, resourceType: raw.resourceType });
      } catch {
        // skip unparseable
      }
    }
  }
}, 60_000);

// =============================================================================
// B1: All US Core examples validate against base R4 profile with zero errors
// =============================================================================

describe('B1: US Core examples — zero false-positive errors on base R4 profile', () => {
  it('loads US Core examples', () => {
    if (!usCoreDirExists) {
      console.warn('US Core examples not found (gitignored). Skipping Suite B.');
      return;
    }
    expect(allExamples.length).toBeGreaterThan(100);
  });

  it('all examples validate against base R4 profile without TYPE_MISMATCH errors', () => {
    if (!usCoreDirExists || allExamples.length === 0) return;

    const validator = new StructureValidator({
      skipInvariants: true,
      validateSlicing: false,
    });

    let tested = 0;
    const failures: Array<{ filename: string; resourceType: string; errors: string[] }> = [];

    for (const example of allExamples) {
      const profile = profilesByType.get(example.resourceType);
      if (!profile) continue;

      try {
        const result = validator.validate(example.resource as unknown as Resource, profile);

        // Filter for TYPE_MISMATCH errors only (the class of bug we're targeting)
        const typeMismatchErrors = result.issues.filter(
          (i) => i.severity === 'error' && i.code === 'TYPE_MISMATCH',
        );

        if (typeMismatchErrors.length > 0) {
          failures.push({
            filename: example.filename,
            resourceType: example.resourceType,
            errors: typeMismatchErrors.map((e) => `${e.path}: ${e.message}`),
          });
        }
        tested++;
      } catch {
        // crash — not our focus here, handled by existing UC4
      }
    }

    if (failures.length > 0) {
      console.log(`\n=== TYPE_MISMATCH failures (${failures.length}/${tested}) ===`);
      for (const f of failures.slice(0, 20)) {
        console.log(`  ${f.filename} (${f.resourceType}):`);
        for (const e of f.errors.slice(0, 5)) {
          console.log(`    ${e}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });

  it('all examples validate without false backbone cardinality errors', () => {
    if (!usCoreDirExists || allExamples.length === 0) return;

    const validator = new StructureValidator({
      skipInvariants: true,
      validateSlicing: false,
    });

    let tested = 0;
    const failures: Array<{ filename: string; resourceType: string; errors: string[] }> = [];

    for (const example of allExamples) {
      const profile = profilesByType.get(example.resourceType);
      if (!profile) continue;

      try {
        const result = validator.validate(example.resource as unknown as Resource, profile);

        // Filter for cardinality errors on children of absent optional backbones
        const falseCardErrors = result.issues.filter((i) => {
          if (i.severity !== 'error' || i.code !== 'CARDINALITY_MIN_VIOLATION') return false;
          const segments = (i.path ?? '').split('.');
          if (segments.length < 3) return false;
          const parentPath = segments.slice(0, segments.length - 1).join('.');
          const parentEl = profile.elements.get(parentPath);
          if (!parentEl || parentEl.min > 0) return false;
          // Check if parent value is actually absent in the resource
          const parentKey = parentPath.replace(`${example.resourceType}.`, '').split('.')[0];
          return !(parentKey in example.resource);
        });

        if (falseCardErrors.length > 0) {
          failures.push({
            filename: example.filename,
            resourceType: example.resourceType,
            errors: falseCardErrors.map((e) => `${e.path}: ${e.message}`),
          });
        }
        tested++;
      } catch {
        // crash — not our focus here
      }
    }

    if (failures.length > 0) {
      console.log(`\n=== False backbone cardinality failures (${failures.length}/${tested}) ===`);
      for (const f of failures.slice(0, 20)) {
        console.log(`  ${f.filename} (${f.resourceType}):`);
        for (const e of f.errors.slice(0, 5)) {
          console.log(`    ${e}`);
        }
      }
    }

    expect(failures).toEqual([]);
  });
});

// =============================================================================
// B2: Per-resource-type breakdown for key types
// =============================================================================

const KEY_TYPES = ['Patient', 'Observation', 'Encounter', 'Condition', 'Procedure',
  'MedicationRequest', 'DiagnosticReport', 'Immunization', 'DocumentReference'];

describe('B2: Key resource types — zero errors on US Core examples', () => {
  for (const resourceType of KEY_TYPES) {
    it(`${resourceType} examples produce zero errors`, () => {
      if (!usCoreDirExists || allExamples.length === 0) return;

      const profile = profilesByType.get(resourceType);
      if (!profile) return;

      const examples = allExamples.filter((e) => e.resourceType === resourceType);
      if (examples.length === 0) return;

      const validator = new StructureValidator({
        skipInvariants: true,
        validateSlicing: false,
      });

      for (const example of examples) {
        const result = validator.validate(example.resource as unknown as Resource, profile);

        const errors = result.issues.filter((i) => i.severity === 'error');

        if (errors.length > 0) {
          console.log(`\n=== ${example.filename} (${resourceType}) — ${errors.length} error(s) ===`);
          for (const e of errors.slice(0, 10)) {
            console.log(`  ${e.code} | ${e.path} | ${e.message}`);
          }
        }

        expect(errors).toEqual([]);
      }
    });
  }
});
