/**
 * fhir-validator — Error Types Tests
 *
 * Tests for ValidatorError, ProfileNotFoundError, and ValidationFailedError.
 */

import { describe, it, expect } from 'vitest';
import {
  ValidatorError,
  ProfileNotFoundError,
  ValidationFailedError,
} from '../errors.js';
import { createValidationIssue } from '../types.js';
import type { ValidationIssue } from '../types.js';

// =============================================================================
// Section 1: ValidatorError (base)
// =============================================================================

describe('ValidatorError', () => {
  it('creates with message', () => {
    const err = new ValidatorError('something went wrong');
    expect(err.message).toBe('something went wrong');
    expect(err.name).toBe('ValidatorError');
  });

  it('is an instance of Error', () => {
    const err = new ValidatorError('test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ValidatorError);
  });

  it('preserves cause', () => {
    const cause = new Error('root cause');
    const err = new ValidatorError('wrapper', { cause });
    expect((err as any).cause).toBe(cause);
  });

  it('has no cause when not provided', () => {
    const err = new ValidatorError('no cause');
    expect((err as any).cause).toBeUndefined();
  });

  it('has a stack trace', () => {
    const err = new ValidatorError('with stack');
    expect(err.stack).toBeDefined();
    expect(err.stack).toContain('ValidatorError');
  });

  it('name property is readonly', () => {
    const err = new ValidatorError('test');
    // name is readonly via override, verify it stays stable
    expect(err.name).toBe('ValidatorError');
  });
});

// =============================================================================
// Section 2: ProfileNotFoundError
// =============================================================================

describe('ProfileNotFoundError', () => {
  it('creates with profile URL', () => {
    const err = new ProfileNotFoundError(
      'http://example.org/StructureDefinition/MyProfile',
    );
    expect(err.message).toBe(
      'Profile not found: http://example.org/StructureDefinition/MyProfile',
    );
    expect(err.name).toBe('ProfileNotFoundError');
    expect(err.profileUrl).toBe(
      'http://example.org/StructureDefinition/MyProfile',
    );
  });

  it('is an instance of ValidatorError and Error', () => {
    const err = new ProfileNotFoundError('http://example.org/Profile');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ValidatorError);
    expect(err).toBeInstanceOf(ProfileNotFoundError);
  });

  it('preserves cause', () => {
    const cause = new Error('load failed');
    const err = new ProfileNotFoundError('http://example.org/Profile', cause);
    expect((err as any).cause).toBe(cause);
  });

  it('has no cause when not provided', () => {
    const err = new ProfileNotFoundError('http://example.org/Profile');
    expect((err as any).cause).toBeUndefined();
  });

  it('profileUrl is accessible', () => {
    const url = 'http://hl7.org/fhir/StructureDefinition/Patient';
    const err = new ProfileNotFoundError(url);
    expect(err.profileUrl).toBe(url);
  });

  it('can be caught as ValidatorError', () => {
    let caught = false;
    try {
      throw new ProfileNotFoundError('http://example.org/Profile');
    } catch (err) {
      if (err instanceof ValidatorError) {
        caught = true;
      }
    }
    expect(caught).toBe(true);
  });
});

// =============================================================================
// Section 3: ValidationFailedError
// =============================================================================

describe('ValidationFailedError', () => {
  it('creates with message and issues', () => {
    const issues: ValidationIssue[] = [
      createValidationIssue('error', 'TYPE_MISMATCH', 'bad type'),
    ];
    const err = new ValidationFailedError('Validation failed', issues);

    expect(err.message).toBe('Validation failed');
    expect(err.name).toBe('ValidationFailedError');
    expect(err.issues).toBe(issues);
    expect(err.issues.length).toBe(1);
  });

  it('is an instance of ValidatorError and Error', () => {
    const err = new ValidationFailedError('fail', []);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ValidatorError);
    expect(err).toBeInstanceOf(ValidationFailedError);
  });

  it('preserves cause', () => {
    const cause = new Error('inner');
    const err = new ValidationFailedError('fail', [], cause);
    expect((err as any).cause).toBe(cause);
  });

  it('has no cause when not provided', () => {
    const err = new ValidationFailedError('fail', []);
    expect((err as any).cause).toBeUndefined();
  });

  it('stores multiple issues', () => {
    const issues: ValidationIssue[] = [
      createValidationIssue('error', 'TYPE_MISMATCH', 'bad type'),
      createValidationIssue('error', 'CARDINALITY_MIN_VIOLATION', 'min=1'),
      createValidationIssue('warning', 'UNKNOWN_ELEMENT', 'unknown'),
    ];
    const err = new ValidationFailedError('Multiple issues', issues);

    expect(err.issues.length).toBe(3);
    expect(err.issues[0].code).toBe('TYPE_MISMATCH');
    expect(err.issues[1].code).toBe('CARDINALITY_MIN_VIOLATION');
    expect(err.issues[2].code).toBe('UNKNOWN_ELEMENT');
  });

  it('stores empty issues array', () => {
    const err = new ValidationFailedError('No issues', []);
    expect(err.issues.length).toBe(0);
  });

  it('can be caught as ValidatorError', () => {
    let caught = false;
    try {
      throw new ValidationFailedError('fail', []);
    } catch (err) {
      if (err instanceof ValidatorError) {
        caught = true;
      }
    }
    expect(caught).toBe(true);
  });

  it('issues are accessible after catch', () => {
    const issues: ValidationIssue[] = [
      createValidationIssue('error', 'FIXED_VALUE_MISMATCH', 'mismatch'),
    ];

    try {
      throw new ValidationFailedError('fail', issues);
    } catch (err) {
      if (err instanceof ValidationFailedError) {
        expect(err.issues.length).toBe(1);
        expect(err.issues[0].code).toBe('FIXED_VALUE_MISMATCH');
      }
    }
  });
});

// =============================================================================
// Section 4: Error hierarchy — instanceof checks
// =============================================================================

describe('Error hierarchy', () => {
  it('all errors are instanceof Error', () => {
    expect(new ValidatorError('a')).toBeInstanceOf(Error);
    expect(new ProfileNotFoundError('b')).toBeInstanceOf(Error);
    expect(new ValidationFailedError('c', [])).toBeInstanceOf(Error);
  });

  it('all errors are instanceof ValidatorError', () => {
    expect(new ValidatorError('a')).toBeInstanceOf(ValidatorError);
    expect(new ProfileNotFoundError('b')).toBeInstanceOf(ValidatorError);
    expect(new ValidationFailedError('c', [])).toBeInstanceOf(ValidatorError);
  });

  it('subclasses are not instanceof each other', () => {
    const pnf = new ProfileNotFoundError('x');
    const vfe = new ValidationFailedError('y', []);

    expect(pnf).not.toBeInstanceOf(ValidationFailedError);
    expect(vfe).not.toBeInstanceOf(ProfileNotFoundError);
  });

  it('each error has correct name property', () => {
    expect(new ValidatorError('a').name).toBe('ValidatorError');
    expect(new ProfileNotFoundError('b').name).toBe('ProfileNotFoundError');
    expect(new ValidationFailedError('c', []).name).toBe('ValidationFailedError');
  });
});

// =============================================================================
// Section 5: Barrel exports
// =============================================================================

describe('Barrel exports', () => {
  it('all error classes are importable from index', async () => {
    const mod = await import('../index.js');
    expect(mod.ValidatorError).toBeDefined();
    expect(mod.ProfileNotFoundError).toBeDefined();
    expect(mod.ValidationFailedError).toBeDefined();
  });

  it('all type helpers are importable from index', async () => {
    const mod = await import('../index.js');
    expect(mod.createValidationIssue).toBeDefined();
    expect(mod.createValidationContext).toBeDefined();
    expect(mod.resolveValidationOptions).toBeDefined();
    expect(mod.hasValidationErrors).toBeDefined();
    expect(mod.filterIssuesBySeverity).toBeDefined();
    expect(mod.filterIssuesByCode).toBeDefined();
  });
});
