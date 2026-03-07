/**
 * Tests for OperationOutcome Builder
 *
 * Verifies conversion of ValidationResult, ParseResult, and SnapshotResult
 * into standard FHIR R4 OperationOutcome resources.
 *
 * Testing policy: ≥15 JSON fixture tests for OperationOutcomeBuilder (from ValidationResult),
 * ≥5 for ParseResult, ≥5 for SnapshotResult.
 */

import { describe, it, expect } from 'vitest';
import {
  buildOperationOutcome,
  buildOperationOutcomeFromParse,
  buildOperationOutcomeFromSnapshot,
} from '../operation-outcome-builder.js';
import type { ValidationResult, ValidationIssue } from '../../validator/types.js';
import type { ParseResult } from '../../parser/parse-error.js';
import type { SnapshotResult, SnapshotIssue } from '../../profile/types.js';
import type { CanonicalProfile, Resource, StructureDefinition } from '../../model/index.js';

// =============================================================================
// Helpers
// =============================================================================

const EMPTY_PROFILE: CanonicalProfile = {
  url: 'http://hl7.org/fhir/StructureDefinition/Patient',
  name: 'Patient',
  type: 'Patient',
  kind: 'resource',
  derivation: 'specialization',
  abstract: false,
  elements: new Map(),
} as CanonicalProfile;

const EMPTY_RESOURCE: Resource = { resourceType: 'Patient' } as Resource;

function makeValidationResult(issues: ValidationIssue[]): ValidationResult {
  return {
    valid: !issues.some((i) => i.severity === 'error'),
    resource: EMPTY_RESOURCE,
    profileUrl: EMPTY_PROFILE.url,
    profile: EMPTY_PROFILE,
    issues,
  };
}

function makeSnapshotResult(issues: SnapshotIssue[]): SnapshotResult {
  return {
    structureDefinition: { url: 'http://example.org/SD/Test' } as StructureDefinition,
    issues,
    success: !issues.some((i) => i.severity === 'error'),
  };
}

// =============================================================================
// Section 1: buildOperationOutcome (from ValidationResult)  — ≥15 tests
// =============================================================================

describe('buildOperationOutcome', () => {
  it('should return success OperationOutcome for valid result with no issues', () => {
    const result = makeValidationResult([]);
    const oo = buildOperationOutcome(result);

    expect(oo.resourceType).toBe('OperationOutcome');
    expect(oo.issue).toHaveLength(1);
    expect(oo.issue[0].severity).toBe('information');
    expect(oo.issue[0].code).toBe('informational');
    expect(oo.issue[0].details?.text).toContain('successful');
  });

  it('should map CARDINALITY_MIN_VIOLATION to structure', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'CARDINALITY_MIN_VIOLATION', message: 'min=1 but found 0', path: 'Patient.name' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue).toHaveLength(1);
    expect(oo.issue[0].severity).toBe('error');
    expect(oo.issue[0].code).toBe('structure');
    expect(oo.issue[0].details?.text).toContain('CARDINALITY_MIN_VIOLATION');
    expect(oo.issue[0].expression).toEqual(['Patient.name']);
  });

  it('should map CARDINALITY_MAX_VIOLATION to structure', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'CARDINALITY_MAX_VIOLATION', message: 'max=1 but found 2', path: 'Patient.active' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('structure');
    expect(oo.issue[0].expression).toEqual(['Patient.active']);
  });

  it('should map TYPE_MISMATCH to value', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'TYPE_MISMATCH', message: 'expected string', path: 'Patient.name.family' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('value');
  });

  it('should map REQUIRED_ELEMENT_MISSING to required', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'REQUIRED_ELEMENT_MISSING', message: 'missing identifier', path: 'Patient.identifier' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('required');
  });

  it('should map FIXED_VALUE_MISMATCH to value', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'FIXED_VALUE_MISMATCH', message: 'does not match fixed', path: 'Patient.gender' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('value');
  });

  it('should map PATTERN_VALUE_MISMATCH to value', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'PATTERN_VALUE_MISMATCH', message: 'pattern mismatch', path: 'Patient.identifier.type' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('value');
  });

  it('should map SLICING_NO_MATCH to structure', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'SLICING_NO_MATCH', message: 'no matching slice', path: 'Patient.extension' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('structure');
  });

  it('should map INVARIANT_VIOLATION to invariant', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'INVARIANT_VIOLATION', message: 'pat-1 failed', path: 'Patient' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('invariant');
  });

  it('should map PROFILE_NOT_FOUND to not-found', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'PROFILE_NOT_FOUND', message: 'profile missing', path: 'Patient' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('not-found');
  });

  it('should map RESOURCE_TYPE_MISMATCH to invalid', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'RESOURCE_TYPE_MISMATCH', message: 'wrong type' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('invalid');
  });

  it('should map UNKNOWN_ELEMENT to structure', () => {
    const result = makeValidationResult([
      { severity: 'warning', code: 'UNKNOWN_ELEMENT', message: 'unknown element', path: 'Patient.foo' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].severity).toBe('warning');
    expect(oo.issue[0].code).toBe('structure');
  });

  it('should map INTERNAL_ERROR to processing', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'INTERNAL_ERROR', message: 'internal error' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('processing');
  });

  it('should handle multiple issues', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'CARDINALITY_MIN_VIOLATION', message: 'min error', path: 'Patient.name' },
      { severity: 'warning', code: 'UNKNOWN_ELEMENT', message: 'unknown', path: 'Patient.x' },
      { severity: 'information', code: 'INVARIANT_NOT_EVALUATED', message: 'skipped', path: 'Patient' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue).toHaveLength(3);
    expect(oo.issue[0].severity).toBe('error');
    expect(oo.issue[1].severity).toBe('warning');
    expect(oo.issue[2].severity).toBe('information');
  });

  it('should include diagnostics when present', () => {
    const result = makeValidationResult([
      {
        severity: 'error',
        code: 'TYPE_MISMATCH',
        message: 'type mismatch',
        path: 'Patient.birthDate',
        diagnostics: 'Expected: date, Actual: string',
      },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].diagnostics).toBe('Expected: date, Actual: string');
  });

  it('should use expression field when path is absent but expression is present', () => {
    const result = makeValidationResult([
      {
        severity: 'error',
        code: 'INVARIANT_VIOLATION',
        message: 'invariant failed',
        expression: 'Patient.name.where(use="official")',
      },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].expression).toEqual(['Patient.name.where(use="official")']);
  });

  it('should map INVARIANT_EVALUATION_ERROR to processing', () => {
    const result = makeValidationResult([
      { severity: 'warning', code: 'INVARIANT_EVALUATION_ERROR', message: 'eval error', path: 'Patient' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('processing');
  });

  it('should map REFERENCE_TARGET_MISMATCH to value', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'REFERENCE_TARGET_MISMATCH', message: 'wrong target', path: 'Patient.managingOrganization' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('value');
  });

  it('should map SLICING_ORDER_VIOLATION to structure', () => {
    const result = makeValidationResult([
      { severity: 'error', code: 'SLICING_ORDER_VIOLATION', message: 'order wrong', path: 'Patient.extension' },
    ]);
    const oo = buildOperationOutcome(result);

    expect(oo.issue[0].code).toBe('structure');
  });
});

// =============================================================================
// Section 2: buildOperationOutcomeFromParse  — ≥5 tests
// =============================================================================

describe('buildOperationOutcomeFromParse', () => {
  it('should return success for a successful parse with no issues', () => {
    const result: ParseResult<unknown> = { success: true, data: {}, issues: [] };
    const oo = buildOperationOutcomeFromParse(result);

    expect(oo.resourceType).toBe('OperationOutcome');
    expect(oo.issue).toHaveLength(1);
    expect(oo.issue[0].severity).toBe('information');
    expect(oo.issue[0].details?.text).toContain('Parsing successful');
  });

  it('should map INVALID_JSON to structure', () => {
    const result: ParseResult<unknown> = {
      success: false,
      data: undefined,
      issues: [{ severity: 'error', code: 'INVALID_JSON', message: 'bad json', path: '$' }],
    };
    const oo = buildOperationOutcomeFromParse(result);

    expect(oo.issue).toHaveLength(1);
    expect(oo.issue[0].severity).toBe('error');
    expect(oo.issue[0].code).toBe('structure');
    expect(oo.issue[0].expression).toEqual(['$']);
  });

  it('should map MISSING_RESOURCE_TYPE to required', () => {
    const result: ParseResult<unknown> = {
      success: false,
      data: undefined,
      issues: [{ severity: 'error', code: 'MISSING_RESOURCE_TYPE', message: 'missing resourceType', path: '$' }],
    };
    const oo = buildOperationOutcomeFromParse(result);

    expect(oo.issue[0].code).toBe('required');
  });

  it('should map INVALID_PRIMITIVE to value', () => {
    const result: ParseResult<unknown> = {
      success: false,
      data: undefined,
      issues: [{ severity: 'error', code: 'INVALID_PRIMITIVE', message: 'bad primitive', path: 'Patient.birthDate' }],
    };
    const oo = buildOperationOutcomeFromParse(result);

    expect(oo.issue[0].code).toBe('value');
  });

  it('should handle multiple parse issues', () => {
    const result: ParseResult<unknown> = {
      success: false,
      data: undefined,
      issues: [
        { severity: 'error', code: 'INVALID_JSON', message: 'bad json', path: '$' },
        { severity: 'warning', code: 'UNEXPECTED_PROPERTY', message: 'unknown prop', path: 'Patient.foo' },
      ],
    };
    const oo = buildOperationOutcomeFromParse(result);

    expect(oo.issue).toHaveLength(2);
    expect(oo.issue[0].severity).toBe('error');
    expect(oo.issue[1].severity).toBe('warning');
  });

  it('should map UNKNOWN_RESOURCE_TYPE to not-found', () => {
    const result: ParseResult<unknown> = {
      success: false,
      data: undefined,
      issues: [{ severity: 'error', code: 'UNKNOWN_RESOURCE_TYPE', message: 'unknown type', path: '$' }],
    };
    const oo = buildOperationOutcomeFromParse(result);

    expect(oo.issue[0].code).toBe('not-found');
  });

  it('should map UNEXPECTED_PROPERTY to informational', () => {
    const result: ParseResult<unknown> = {
      success: true,
      data: {},
      issues: [{ severity: 'warning', code: 'UNEXPECTED_PROPERTY', message: 'unknown prop', path: 'Patient.x' }],
    };
    const oo = buildOperationOutcomeFromParse(result);

    expect(oo.issue[0].code).toBe('informational');
  });
});

// =============================================================================
// Section 3: buildOperationOutcomeFromSnapshot  — ≥5 tests
// =============================================================================

describe('buildOperationOutcomeFromSnapshot', () => {
  it('should return success for snapshot with no issues', () => {
    const result = makeSnapshotResult([]);
    const oo = buildOperationOutcomeFromSnapshot(result);

    expect(oo.resourceType).toBe('OperationOutcome');
    expect(oo.issue).toHaveLength(1);
    expect(oo.issue[0].severity).toBe('information');
    expect(oo.issue[0].details?.text).toContain('Snapshot generation successful');
  });

  it('should map CIRCULAR_DEPENDENCY to processing', () => {
    const result = makeSnapshotResult([
      { severity: 'error', code: 'CIRCULAR_DEPENDENCY', message: 'circular dep', path: 'SomeProfile' },
    ]);
    const oo = buildOperationOutcomeFromSnapshot(result);

    expect(oo.issue[0].code).toBe('processing');
    expect(oo.issue[0].expression).toEqual(['SomeProfile']);
  });

  it('should map BASE_NOT_FOUND to not-found', () => {
    const result = makeSnapshotResult([
      { severity: 'error', code: 'BASE_NOT_FOUND', message: 'base missing', path: 'MyProfile' },
    ]);
    const oo = buildOperationOutcomeFromSnapshot(result);

    expect(oo.issue[0].code).toBe('not-found');
  });

  it('should map CARDINALITY_VIOLATION to business-rule', () => {
    const result = makeSnapshotResult([
      { severity: 'error', code: 'CARDINALITY_VIOLATION', message: 'card violation', path: 'Patient.name' },
    ]);
    const oo = buildOperationOutcomeFromSnapshot(result);

    expect(oo.issue[0].code).toBe('business-rule');
  });

  it('should include diagnostics from details field', () => {
    const result = makeSnapshotResult([
      {
        severity: 'warning',
        code: 'DIFFERENTIAL_NOT_CONSUMED',
        message: 'unconsumed diff',
        path: 'Patient.extension',
        details: 'Element Patient.extension:myExt was not consumed',
      },
    ]);
    const oo = buildOperationOutcomeFromSnapshot(result);

    expect(oo.issue[0].diagnostics).toBe('Element Patient.extension:myExt was not consumed');
    expect(oo.issue[0].code).toBe('structure');
  });

  it('should handle multiple snapshot issues', () => {
    const result = makeSnapshotResult([
      { severity: 'error', code: 'BASE_NOT_FOUND', message: 'base missing' },
      { severity: 'warning', code: 'SLICING_ERROR', message: 'slicing warn', path: 'Patient.extension' },
      { severity: 'error', code: 'INTERNAL_ERROR', message: 'internal' },
    ]);
    const oo = buildOperationOutcomeFromSnapshot(result);

    expect(oo.issue).toHaveLength(3);
    expect(oo.issue[0].code).toBe('not-found');
    expect(oo.issue[1].code).toBe('structure');
    expect(oo.issue[2].code).toBe('processing');
  });

  it('should map TYPE_INCOMPATIBLE to value', () => {
    const result = makeSnapshotResult([
      { severity: 'error', code: 'TYPE_INCOMPATIBLE', message: 'type incompatible', path: 'Patient.value[x]' },
    ]);
    const oo = buildOperationOutcomeFromSnapshot(result);

    expect(oo.issue[0].code).toBe('value');
  });
});
