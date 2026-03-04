/**
 * fhir-validator — Integration Tests
 *
 * End-to-end tests using StructureValidator with fixture-driven scenarios.
 * Covers 5 categories:
 * - 01-base-resources (5 fixtures): valid/invalid Patient, Observation, Condition
 * - 02-custom-profiles (5 fixtures): ChinesePatient, fixed, pattern constraints
 * - 03-slicing (5 fixtures): closed/open/ordered slicing, required slices
 * - 04-choice-ref (5 fixtures): reference validation, URN warnings, multi-target
 * - 05-complex (5 fixtures): multiple issues, resourceType mismatch, failFast, perf
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { CanonicalProfile, CanonicalElement, Resource } from '../../model/index.js';
import type { ValidationIssue } from '../types.js';
import { StructureValidator } from '../structure-validator.js';
import { ValidationFailedError } from '../errors.js';

// =============================================================================
// Helpers
// =============================================================================

const FIXTURE_BASE = resolve(__dirname, 'fixtures', 'integration');

function loadFixture(sub: string, file: string): any {
  return JSON.parse(readFileSync(resolve(FIXTURE_BASE, sub, file), 'utf-8'));
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

function toProfile(raw: any): CanonicalProfile {
  const elements = new Map<string, CanonicalElement>();
  for (const el of raw.elements) {
    const elem = toElement(el);
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

function runFixture(sub: string, file: string) {
  const fixture = loadFixture(sub, file);
  const profile = toProfile(fixture.profile);
  const opts = fixture.options ?? {};
  const validator = new StructureValidator(opts);

  if (fixture.expectThrows) {
    expect(() => validator.validate(fixture.resource as Resource, profile)).toThrow(ValidationFailedError);
    return;
  }

  const result = validator.validate(fixture.resource as Resource, profile);

  expect(result.valid).toBe(fixture.expectedValid);

  if (fixture.expectedErrorCount !== undefined) {
    const errors = result.issues.filter((i: ValidationIssue) => i.severity === 'error');
    expect(errors).toHaveLength(fixture.expectedErrorCount);
  }

  if (fixture.expectedMinErrorCount !== undefined) {
    const errors = result.issues.filter((i: ValidationIssue) => i.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(fixture.expectedMinErrorCount);
  }

  if (fixture.expectedIssueCodes) {
    for (const code of fixture.expectedIssueCodes) {
      expect(result.issues.some((i: ValidationIssue) => i.code === code)).toBe(true);
    }
  }

  if (fixture.expectedHasWarnings) {
    expect(result.issues.some((i: ValidationIssue) => i.severity === 'warning')).toBe(true);
  }

  return result;
}

// =============================================================================
// 1. Base Resource Validation
// =============================================================================

describe('Integration: Base Resources', () => {
  const files = [
    '01-valid-patient.json',
    '02-valid-observation.json',
    '03-invalid-patient-missing-name.json',
    '04-invalid-observation-missing-status.json',
    '05-valid-condition.json',
  ];

  for (const file of files) {
    const fixture = loadFixture('01-base-resources', file);
    it(fixture.description, () => {
      runFixture('01-base-resources', file);
    });
  }
});

// =============================================================================
// 2. Custom Profile Validation
// =============================================================================

describe('Integration: Custom Profiles', () => {
  const files = [
    '01-chinese-patient-valid.json',
    '02-chinese-patient-missing-identifier.json',
    '03-profile-fixed-status.json',
    '04-profile-pattern-category.json',
    '05-profile-pattern-mismatch.json',
  ];

  for (const file of files) {
    const fixture = loadFixture('02-custom-profiles', file);
    it(fixture.description, () => {
      runFixture('02-custom-profiles', file);
    });
  }
});

// =============================================================================
// 3. Slicing Validation
// =============================================================================

describe('Integration: Slicing', () => {
  const files = [
    '01-valid-identifier-slicing.json',
    '02-missing-required-slice.json',
    '03-closed-unmatched.json',
    '04-open-slicing-unmatched-ok.json',
    '05-ordered-slicing-wrong-order.json',
  ];

  for (const file of files) {
    const fixture = loadFixture('03-slicing', file);
    it(fixture.description, () => {
      runFixture('03-slicing', file);
    });
  }
});

// =============================================================================
// 4. Choice Type + Reference Validation
// =============================================================================

describe('Integration: Choice Type & Reference', () => {
  const files = [
    '01-valid-reference-patient.json',
    '02-invalid-reference-wrong-type.json',
    '03-reference-multiple-targets.json',
    '04-urn-reference-warning.json',
    '05-reference-no-constraint.json',
  ];

  for (const file of files) {
    const fixture = loadFixture('04-choice-ref', file);
    it(fixture.description, () => {
      runFixture('04-choice-ref', file);
    });
  }
});

// =============================================================================
// 5. Complex Scenarios
// =============================================================================

describe('Integration: Complex Scenarios', () => {
  it('Multiple issues — 3+ errors accumulated', () => {
    runFixture('05-complex', '01-multiple-issues.json');
  });

  it('Resource type mismatch', () => {
    runFixture('05-complex', '02-resourcetype-mismatch.json');
  });

  it('Empty resource — missing all required fields', () => {
    runFixture('05-complex', '03-empty-resource.json');
  });

  it('Large resource — performance (<100ms)', () => {
    const fixture = loadFixture('05-complex', '04-large-resource.json');
    const profile = toProfile(fixture.profile);
    const validator = new StructureValidator();

    const start = performance.now();
    const result = validator.validate(fixture.resource as Resource, profile);
    const duration = performance.now() - start;

    expect(result.valid).toBe(true);
    expect(duration).toBeLessThan(fixture.maxDurationMs);
  });

  it('failFast stops on first error', () => {
    runFixture('05-complex', '05-failfast-stops-early.json');
  });
});

// =============================================================================
// 6. Cross-cutting: Issue codes coverage
// =============================================================================

describe('Integration: Issue code coverage', () => {
  const validator = new StructureValidator();

  it('CARDINALITY_MIN_VIOLATION is produced', () => {
    const result = runFixture('01-base-resources', '03-invalid-patient-missing-name.json');
    expect(result!.issues.some((i: ValidationIssue) => i.code === 'CARDINALITY_MIN_VIOLATION')).toBe(true);
  });

  it('FIXED_VALUE_MISMATCH is produced', () => {
    const result = runFixture('02-custom-profiles', '03-profile-fixed-status.json');
    expect(result!.issues.some((i: ValidationIssue) => i.code === 'FIXED_VALUE_MISMATCH')).toBe(true);
  });

  it('PATTERN_VALUE_MISMATCH is produced', () => {
    const result = runFixture('02-custom-profiles', '05-profile-pattern-mismatch.json');
    expect(result!.issues.some((i: ValidationIssue) => i.code === 'PATTERN_VALUE_MISMATCH')).toBe(true);
  });

  it('REFERENCE_TARGET_MISMATCH is produced', () => {
    const result = runFixture('04-choice-ref', '02-invalid-reference-wrong-type.json');
    expect(result!.issues.some((i: ValidationIssue) => i.code === 'REFERENCE_TARGET_MISMATCH')).toBe(true);
  });

  it('SLICING_NO_MATCH is produced', () => {
    const result = runFixture('03-slicing', '03-closed-unmatched.json');
    expect(result!.issues.some((i: ValidationIssue) => i.code === 'SLICING_NO_MATCH')).toBe(true);
  });

  it('SLICING_ORDER_VIOLATION is produced', () => {
    const result = runFixture('03-slicing', '05-ordered-slicing-wrong-order.json');
    expect(result!.issues.some((i: ValidationIssue) => i.code === 'SLICING_ORDER_VIOLATION')).toBe(true);
  });

  it('RESOURCE_TYPE_MISMATCH is produced', () => {
    const result = runFixture('05-complex', '02-resourcetype-mismatch.json');
    expect(result!.issues.some((i: ValidationIssue) => i.code === 'RESOURCE_TYPE_MISMATCH')).toBe(true);
  });
});

// =============================================================================
// 7. Error message quality
// =============================================================================

describe('Integration: Error message quality', () => {
  it('issues include path information', () => {
    const result = runFixture('01-base-resources', '03-invalid-patient-missing-name.json');
    const issue = result!.issues.find((i: ValidationIssue) => i.code === 'CARDINALITY_MIN_VIOLATION');
    expect(issue).toBeDefined();
    expect(issue!.path).toBeDefined();
    expect(issue!.path).toContain('Patient.name');
  });

  it('issues include human-readable message', () => {
    const result = runFixture('05-complex', '02-resourcetype-mismatch.json');
    const issue = result!.issues.find((i: ValidationIssue) => i.code === 'RESOURCE_TYPE_MISMATCH');
    expect(issue).toBeDefined();
    expect(issue!.message).toBeTruthy();
    expect(issue!.message.length).toBeGreaterThan(10);
  });

  it('result.profileUrl is populated', () => {
    const result = runFixture('01-base-resources', '01-valid-patient.json');
    expect(result!.profileUrl).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
  });
});
