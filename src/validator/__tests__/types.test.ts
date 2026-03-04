/**
 * fhir-validator — Types & Helper Functions Tests
 *
 * Tests for ValidationOptions, ValidationResult, ValidationIssue,
 * ValidationIssueCode, ValidationContext, and helper functions.
 */

import { describe, it, expect } from 'vitest';
import type {
  ValidationOptions,
  ValidationResult,
  ValidationIssue,
  ValidationIssueCode,
  ValidationContext,
} from '../types.js';
import {
  createValidationIssue,
  createValidationContext,
  resolveValidationOptions,
  hasValidationErrors,
  filterIssuesBySeverity,
  filterIssuesByCode,
} from '../types.js';
import type { CanonicalProfile, Resource } from '../../model/index.js';

// =============================================================================
// Helpers
// =============================================================================

/** Minimal CanonicalProfile for testing. */
function makeProfile(overrides?: Partial<CanonicalProfile>): CanonicalProfile {
  return {
    url: 'http://example.org/StructureDefinition/TestProfile',
    name: 'TestProfile',
    type: 'Patient',
    kind: 'resource' as any,
    derivation: 'constraint' as any,
    abstract: false,
    elements: new Map(),
    ...overrides,
  } as CanonicalProfile;
}

// =============================================================================
// Section 1: createValidationIssue
// =============================================================================

describe('createValidationIssue', () => {
  it('creates an issue with required fields only', () => {
    const issue = createValidationIssue(
      'error',
      'TYPE_MISMATCH',
      'Expected string, got number',
    );

    expect(issue.severity).toBe('error');
    expect(issue.code).toBe('TYPE_MISMATCH');
    expect(issue.message).toBe('Expected string, got number');
    expect(issue.path).toBeUndefined();
    expect(issue.expression).toBeUndefined();
    expect(issue.diagnostics).toBeUndefined();
  });

  it('creates an issue with path', () => {
    const issue = createValidationIssue(
      'warning',
      'UNKNOWN_ELEMENT',
      'Unknown element found',
      { path: 'Patient.foo' },
    );

    expect(issue.severity).toBe('warning');
    expect(issue.code).toBe('UNKNOWN_ELEMENT');
    expect(issue.path).toBe('Patient.foo');
    expect(issue.expression).toBeUndefined();
  });

  it('creates an issue with all optional fields', () => {
    const issue = createValidationIssue(
      'information',
      'INVARIANT_NOT_EVALUATED',
      'FHIRPath not supported yet',
      {
        path: 'Patient.name',
        expression: 'Patient.name.exists()',
        diagnostics: 'inv-1: name.exists()',
      },
    );

    expect(issue.severity).toBe('information');
    expect(issue.code).toBe('INVARIANT_NOT_EVALUATED');
    expect(issue.message).toBe('FHIRPath not supported yet');
    expect(issue.path).toBe('Patient.name');
    expect(issue.expression).toBe('Patient.name.exists()');
    expect(issue.diagnostics).toBe('inv-1: name.exists()');
  });

  it('creates error-severity issue', () => {
    const issue = createValidationIssue('error', 'CARDINALITY_MIN_VIOLATION', 'min=1, found 0');
    expect(issue.severity).toBe('error');
  });

  it('creates warning-severity issue', () => {
    const issue = createValidationIssue('warning', 'REFERENCE_TARGET_MISMATCH', 'ref mismatch');
    expect(issue.severity).toBe('warning');
  });

  it('creates information-severity issue', () => {
    const issue = createValidationIssue('information', 'INVARIANT_NOT_EVALUATED', 'skipped');
    expect(issue.severity).toBe('information');
  });

  it('handles empty options object', () => {
    const issue = createValidationIssue('error', 'INTERNAL_ERROR', 'oops', {});
    expect(issue.path).toBeUndefined();
    expect(issue.expression).toBeUndefined();
    expect(issue.diagnostics).toBeUndefined();
  });
});

// =============================================================================
// Section 2: createValidationContext
// =============================================================================

describe('createValidationContext', () => {
  it('creates context with default options', () => {
    const profile = makeProfile();
    const ctx = createValidationContext(profile);

    expect(ctx.profile).toBe(profile);
    expect(ctx.issues).toEqual([]);
    expect(ctx.depth).toBe(0);
    expect(ctx.options.validateSlicing).toBe(true);
    expect(ctx.options.validateFixed).toBe(true);
    expect(ctx.options.maxDepth).toBe(50);
    expect(ctx.options.failFast).toBe(false);
    expect(ctx.options.profileUrl).toBe('http://example.org/StructureDefinition/TestProfile');
  });

  it('creates context with custom options', () => {
    const profile = makeProfile();
    const ctx = createValidationContext(profile, {
      profileUrl: 'http://custom.org/Profile',
      validateSlicing: false,
      validateFixed: false,
      maxDepth: 10,
      failFast: true,
    });

    expect(ctx.options.profileUrl).toBe('http://custom.org/Profile');
    expect(ctx.options.validateSlicing).toBe(false);
    expect(ctx.options.validateFixed).toBe(false);
    expect(ctx.options.maxDepth).toBe(10);
    expect(ctx.options.failFast).toBe(true);
  });

  it('creates context with partial options (defaults fill in)', () => {
    const profile = makeProfile();
    const ctx = createValidationContext(profile, {
      failFast: true,
    });

    expect(ctx.options.failFast).toBe(true);
    expect(ctx.options.validateSlicing).toBe(true); // default
    expect(ctx.options.validateFixed).toBe(true); // default
    expect(ctx.options.maxDepth).toBe(50); // default
  });

  it('issues array is mutable', () => {
    const profile = makeProfile();
    const ctx = createValidationContext(profile);

    expect(ctx.issues.length).toBe(0);
    ctx.issues.push(createValidationIssue('error', 'TYPE_MISMATCH', 'test'));
    expect(ctx.issues.length).toBe(1);
  });

  it('depth is mutable', () => {
    const profile = makeProfile();
    const ctx = createValidationContext(profile);

    expect(ctx.depth).toBe(0);
    ctx.depth = 5;
    expect(ctx.depth).toBe(5);
  });
});

// =============================================================================
// Section 3: resolveValidationOptions
// =============================================================================

describe('resolveValidationOptions', () => {
  it('returns all defaults when no options provided', () => {
    const resolved = resolveValidationOptions();

    expect(resolved.profileUrl).toBe('');
    expect(resolved.validateSlicing).toBe(true);
    expect(resolved.validateFixed).toBe(true);
    expect(resolved.maxDepth).toBe(50);
    expect(resolved.failFast).toBe(false);
  });

  it('returns all defaults when empty object provided', () => {
    const resolved = resolveValidationOptions({});

    expect(resolved.profileUrl).toBe('');
    expect(resolved.validateSlicing).toBe(true);
    expect(resolved.validateFixed).toBe(true);
    expect(resolved.maxDepth).toBe(50);
    expect(resolved.failFast).toBe(false);
  });

  it('preserves user-provided values', () => {
    const resolved = resolveValidationOptions({
      profileUrl: 'http://example.org/Profile',
      validateSlicing: false,
      validateFixed: false,
      maxDepth: 25,
      failFast: true,
    });

    expect(resolved.profileUrl).toBe('http://example.org/Profile');
    expect(resolved.validateSlicing).toBe(false);
    expect(resolved.validateFixed).toBe(false);
    expect(resolved.maxDepth).toBe(25);
    expect(resolved.failFast).toBe(true);
  });

  it('fills in missing fields with defaults', () => {
    const resolved = resolveValidationOptions({
      maxDepth: 100,
    });

    expect(resolved.profileUrl).toBe('');
    expect(resolved.validateSlicing).toBe(true);
    expect(resolved.validateFixed).toBe(true);
    expect(resolved.maxDepth).toBe(100);
    expect(resolved.failFast).toBe(false);
  });
});

// =============================================================================
// Section 4: hasValidationErrors
// =============================================================================

describe('hasValidationErrors', () => {
  it('returns false for empty issues', () => {
    expect(hasValidationErrors([])).toBe(false);
  });

  it('returns false for warnings only', () => {
    const issues: ValidationIssue[] = [
      createValidationIssue('warning', 'UNKNOWN_ELEMENT', 'unknown'),
      createValidationIssue('warning', 'REFERENCE_TARGET_MISMATCH', 'ref'),
    ];
    expect(hasValidationErrors(issues)).toBe(false);
  });

  it('returns false for information only', () => {
    const issues: ValidationIssue[] = [
      createValidationIssue('information', 'INVARIANT_NOT_EVALUATED', 'skipped'),
    ];
    expect(hasValidationErrors(issues)).toBe(false);
  });

  it('returns true for single error', () => {
    const issues: ValidationIssue[] = [
      createValidationIssue('error', 'TYPE_MISMATCH', 'bad type'),
    ];
    expect(hasValidationErrors(issues)).toBe(true);
  });

  it('returns true for mixed issues with at least one error', () => {
    const issues: ValidationIssue[] = [
      createValidationIssue('warning', 'UNKNOWN_ELEMENT', 'unknown'),
      createValidationIssue('error', 'CARDINALITY_MIN_VIOLATION', 'min=1'),
      createValidationIssue('information', 'INVARIANT_NOT_EVALUATED', 'skipped'),
    ];
    expect(hasValidationErrors(issues)).toBe(true);
  });

  it('returns true for multiple errors', () => {
    const issues: ValidationIssue[] = [
      createValidationIssue('error', 'TYPE_MISMATCH', 'bad type'),
      createValidationIssue('error', 'CARDINALITY_MAX_VIOLATION', 'max=1'),
    ];
    expect(hasValidationErrors(issues)).toBe(true);
  });
});

// =============================================================================
// Section 5: filterIssuesBySeverity
// =============================================================================

describe('filterIssuesBySeverity', () => {
  const issues: ValidationIssue[] = [
    createValidationIssue('error', 'TYPE_MISMATCH', 'bad type'),
    createValidationIssue('warning', 'UNKNOWN_ELEMENT', 'unknown'),
    createValidationIssue('error', 'CARDINALITY_MIN_VIOLATION', 'min=1'),
    createValidationIssue('information', 'INVARIANT_NOT_EVALUATED', 'skipped'),
    createValidationIssue('warning', 'REFERENCE_TARGET_MISMATCH', 'ref'),
  ];

  it('filters errors', () => {
    const errors = filterIssuesBySeverity(issues, 'error');
    expect(errors.length).toBe(2);
    expect(errors[0].code).toBe('TYPE_MISMATCH');
    expect(errors[1].code).toBe('CARDINALITY_MIN_VIOLATION');
  });

  it('filters warnings', () => {
    const warnings = filterIssuesBySeverity(issues, 'warning');
    expect(warnings.length).toBe(2);
    expect(warnings[0].code).toBe('UNKNOWN_ELEMENT');
    expect(warnings[1].code).toBe('REFERENCE_TARGET_MISMATCH');
  });

  it('filters information', () => {
    const info = filterIssuesBySeverity(issues, 'information');
    expect(info.length).toBe(1);
    expect(info[0].code).toBe('INVARIANT_NOT_EVALUATED');
  });

  it('returns empty array when no matches', () => {
    const noErrors = filterIssuesBySeverity(
      [createValidationIssue('warning', 'UNKNOWN_ELEMENT', 'x')],
      'error',
    );
    expect(noErrors).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(filterIssuesBySeverity([], 'error')).toEqual([]);
  });
});

// =============================================================================
// Section 6: filterIssuesByCode
// =============================================================================

describe('filterIssuesByCode', () => {
  const issues: ValidationIssue[] = [
    createValidationIssue('error', 'TYPE_MISMATCH', 'bad type 1'),
    createValidationIssue('warning', 'UNKNOWN_ELEMENT', 'unknown'),
    createValidationIssue('error', 'TYPE_MISMATCH', 'bad type 2'),
    createValidationIssue('error', 'CARDINALITY_MIN_VIOLATION', 'min=1'),
  ];

  it('filters by specific code', () => {
    const typeIssues = filterIssuesByCode(issues, 'TYPE_MISMATCH');
    expect(typeIssues.length).toBe(2);
    expect(typeIssues[0].message).toBe('bad type 1');
    expect(typeIssues[1].message).toBe('bad type 2');
  });

  it('returns single match', () => {
    const cardIssues = filterIssuesByCode(issues, 'CARDINALITY_MIN_VIOLATION');
    expect(cardIssues.length).toBe(1);
  });

  it('returns empty array when no matches', () => {
    const noMatch = filterIssuesByCode(issues, 'INTERNAL_ERROR');
    expect(noMatch).toEqual([]);
  });

  it('returns empty array for empty input', () => {
    expect(filterIssuesByCode([], 'TYPE_MISMATCH')).toEqual([]);
  });
});

// =============================================================================
// Section 7: ValidationIssueCode exhaustiveness
// =============================================================================

describe('ValidationIssueCode', () => {
  it('all codes can be used to create issues', () => {
    const codes: ValidationIssueCode[] = [
      'CARDINALITY_MIN_VIOLATION',
      'CARDINALITY_MAX_VIOLATION',
      'TYPE_MISMATCH',
      'INVALID_CHOICE_TYPE',
      'REQUIRED_ELEMENT_MISSING',
      'FIXED_VALUE_MISMATCH',
      'PATTERN_VALUE_MISMATCH',
      'SLICING_NO_MATCH',
      'SLICING_CARDINALITY_VIOLATION',
      'SLICING_ORDER_VIOLATION',
      'REFERENCE_TARGET_MISMATCH',
      'PROFILE_NOT_FOUND',
      'RESOURCE_TYPE_MISMATCH',
      'UNKNOWN_ELEMENT',
      'INVARIANT_NOT_EVALUATED',
      'INVARIANT_VIOLATION',
      'INVARIANT_EVALUATION_ERROR',
      'INTERNAL_ERROR',
    ];

    for (const code of codes) {
      const issue = createValidationIssue('error', code, `Test: ${code}`);
      expect(issue.code).toBe(code);
    }

    // Verify we covered all 18 codes
    expect(codes.length).toBe(18);
  });
});

// =============================================================================
// Section 8: Type-level interface checks
// =============================================================================

describe('ValidationOptions interface', () => {
  it('accepts empty options', () => {
    const opts: ValidationOptions = {};
    expect(opts.profileUrl).toBeUndefined();
    expect(opts.validateSlicing).toBeUndefined();
  });

  it('accepts full options', () => {
    const opts: ValidationOptions = {
      profileUrl: 'http://example.org/Profile',
      validateSlicing: true,
      validateFixed: false,
      maxDepth: 100,
      failFast: true,
    };
    expect(opts.profileUrl).toBe('http://example.org/Profile');
    expect(opts.failFast).toBe(true);
  });
});

describe('ValidationResult interface', () => {
  it('can be constructed with all fields', () => {
    const profile = makeProfile();
    const result: ValidationResult = {
      valid: true,
      resource: { resourceType: 'Patient' } as Resource,
      profileUrl: 'http://example.org/Profile',
      profile,
      issues: [],
    };

    expect(result.valid).toBe(true);
    expect(result.resource.resourceType).toBe('Patient');
    expect(result.profileUrl).toBe('http://example.org/Profile');
    expect(result.profile).toBe(profile);
    expect(result.issues.length).toBe(0);
  });

  it('valid is false when issues contain errors', () => {
    const profile = makeProfile();
    const issues = [
      createValidationIssue('error', 'TYPE_MISMATCH', 'bad'),
    ];
    const result: ValidationResult = {
      valid: !hasValidationErrors(issues),
      resource: { resourceType: 'Patient' } as Resource,
      profileUrl: 'http://example.org/Profile',
      profile,
      issues,
    };

    expect(result.valid).toBe(false);
    expect(result.issues.length).toBe(1);
  });
});
