/**
 * Tests for parse-error.ts — ParseResult, ParseIssue, factory helpers
 *
 * Validates that the error infrastructure works correctly before
 * any parser logic depends on it.
 */

import { describe, it, expect } from 'vitest';
import {
  type ParseResult,
  type ParseIssue,
  type ParseErrorCode,
  type ParseSeverity,
  parseSuccess,
  parseFailure,
  createIssue,
  hasErrors,
} from '../parse-error.js';

// =============================================================================
// createIssue
// =============================================================================

describe('createIssue', () => {
  it('creates an issue with all fields', () => {
    const issue = createIssue('error', 'INVALID_JSON', 'Bad JSON', '$.root');

    expect(issue.severity).toBe('error');
    expect(issue.code).toBe('INVALID_JSON');
    expect(issue.message).toBe('Bad JSON');
    expect(issue.path).toBe('$.root');
  });

  it('creates a warning issue', () => {
    const issue = createIssue('warning', 'UNEXPECTED_PROPERTY', 'Unknown prop "foo"', 'Patient.foo');

    expect(issue.severity).toBe('warning');
    expect(issue.code).toBe('UNEXPECTED_PROPERTY');
  });

  it('returns a readonly-compatible object', () => {
    const issue: ParseIssue = createIssue('error', 'MISSING_RESOURCE_TYPE', 'Missing', '$');

    // ParseIssue fields are readonly — this is a compile-time check.
    // At runtime, we just verify the shape is correct.
    expect(Object.keys(issue)).toEqual(['severity', 'code', 'message', 'path']);
  });
});

// =============================================================================
// parseSuccess
// =============================================================================

describe('parseSuccess', () => {
  it('creates a successful result with data and no issues', () => {
    const result = parseSuccess({ resourceType: 'Patient', id: 'p1' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ resourceType: 'Patient', id: 'p1' });
    expect(result.issues).toEqual([]);
  });

  it('creates a successful result with warnings', () => {
    const warnings = [
      createIssue('warning', 'UNEXPECTED_PROPERTY', 'Unknown "foo"', 'Patient.foo'),
    ];
    const result = parseSuccess('some-data', warnings);

    expect(result.success).toBe(true);
    expect(result.data).toBe('some-data');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('warning');
  });

  it('narrows data type correctly via discriminated union', () => {
    const result: ParseResult<{ name: string }> = parseSuccess({ name: 'test' });

    if (result.success) {
      // TypeScript should narrow result.data to { name: string }
      expect(result.data.name).toBe('test');
    } else {
      // This branch should not be reached
      expect.unreachable('Expected success');
    }
  });
});

// =============================================================================
// parseFailure
// =============================================================================

describe('parseFailure', () => {
  it('creates a failed result with errors', () => {
    const errors = [
      createIssue('error', 'INVALID_JSON', 'Syntax error', '$'),
    ];
    const result = parseFailure<string>(errors);

    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('INVALID_JSON');
  });

  it('can carry multiple errors', () => {
    const errors = [
      createIssue('error', 'MISSING_RESOURCE_TYPE', 'Missing resourceType', '$'),
      createIssue('error', 'INVALID_STRUCTURE', 'Not an object', '$'),
    ];
    const result = parseFailure<unknown>(errors);

    expect(result.success).toBe(false);
    expect(result.issues).toHaveLength(2);
  });

  it('narrows data to undefined via discriminated union', () => {
    const result: ParseResult<{ name: string }> = parseFailure([
      createIssue('error', 'INVALID_JSON', 'Bad', '$'),
    ]);

    if (!result.success) {
      expect(result.data).toBeUndefined();
    } else {
      expect.unreachable('Expected failure');
    }
  });

  it('throws when issues array is empty', () => {
    expect(() => parseFailure([])).toThrow('parseFailure requires at least one error in issues array');
  });

  it('throws when issues array contains only warnings', () => {
    const warnings = [
      createIssue('warning', 'UNEXPECTED_PROPERTY', 'Unknown prop', 'Patient.x'),
    ];
    expect(() => parseFailure(warnings)).toThrow('parseFailure requires at least one error in issues array');
  });
});

// =============================================================================
// hasErrors
// =============================================================================

describe('hasErrors', () => {
  it('returns false for empty array', () => {
    expect(hasErrors([])).toBe(false);
  });

  it('returns false for warnings only', () => {
    const issues = [
      createIssue('warning', 'UNEXPECTED_PROPERTY', 'Unknown prop', 'Patient.x'),
      createIssue('warning', 'UNEXPECTED_PROPERTY', 'Unknown prop', 'Patient.y'),
    ];
    expect(hasErrors(issues)).toBe(false);
  });

  it('returns true when at least one error exists', () => {
    const issues = [
      createIssue('warning', 'UNEXPECTED_PROPERTY', 'Unknown prop', 'Patient.x'),
      createIssue('error', 'INVALID_JSON', 'Bad JSON', '$'),
    ];
    expect(hasErrors(issues)).toBe(true);
  });

  it('returns true for all errors', () => {
    const issues = [
      createIssue('error', 'MISSING_RESOURCE_TYPE', 'Missing', '$'),
      createIssue('error', 'INVALID_STRUCTURE', 'Bad', '$'),
    ];
    expect(hasErrors(issues)).toBe(true);
  });
});

// =============================================================================
// ParseErrorCode coverage — ensure all codes are valid string literals
// =============================================================================

describe('ParseErrorCode values', () => {
  const allCodes: ParseErrorCode[] = [
    'INVALID_JSON',
    'MISSING_RESOURCE_TYPE',
    'UNKNOWN_RESOURCE_TYPE',
    'INVALID_PRIMITIVE',
    'INVALID_STRUCTURE',
    'INVALID_CHOICE_TYPE',
    'MULTIPLE_CHOICE_VALUES',
    'ARRAY_MISMATCH',
    'UNEXPECTED_NULL',
    'UNEXPECTED_PROPERTY',
  ];

  it('has 10 defined error codes', () => {
    expect(allCodes).toHaveLength(10);
  });

  it.each(allCodes)('code "%s" can be used in createIssue', (code) => {
    const issue = createIssue('error', code, `Test for ${code}`, '$');
    expect(issue.code).toBe(code);
  });
});

// =============================================================================
// ParseSeverity coverage
// =============================================================================

describe('ParseSeverity values', () => {
  const allSeverities: ParseSeverity[] = ['error', 'warning'];

  it.each(allSeverities)('severity "%s" can be used in createIssue', (severity) => {
    const issue = createIssue(severity, 'INVALID_JSON', 'test', '$');
    expect(issue.severity).toBe(severity);
  });
});
