/**
 * Tests for Enhanced Error Messages — ≥15 JSON fixture tests
 *
 * Loads issue fixtures from JSON files and verifies that enhanceIssue()
 * produces correct suggestions, documentation URLs, and expected/actual values.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { enhanceIssue, enhanceIssues } from '../report/enhanced-messages.js';
import type { ValidationIssue } from '../../validator/types.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function loadIssueFixture(name: string): ValidationIssue {
  const raw = readFileSync(join(__dirname, 'fixtures', 'error-messages', name), 'utf-8');
  return JSON.parse(raw) as ValidationIssue;
}

describe('Enhanced Messages (JSON fixtures)', () => {
  // Fixture 1: CARDINALITY_MIN_VIOLATION
  it('fixture: CARDINALITY_MIN_VIOLATION gets suggestion and expected/actual', () => {
    const issue = loadIssueFixture('cardinality-min.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toBeDefined();
    expect(enhanced.suggestion).toContain('Patient.name');
    expect(enhanced.documentationUrl).toContain('cardinality');
    expect(enhanced.expected).toBe('min=1');
    expect(enhanced.actual).toBe('count=0');
  });

  // Fixture 2: CARDINALITY_MAX_VIOLATION
  it('fixture: CARDINALITY_MAX_VIOLATION gets suggestion and expected/actual', () => {
    const issue = loadIssueFixture('cardinality-max.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toBeDefined();
    expect(enhanced.suggestion).toContain('Patient.active');
    expect(enhanced.documentationUrl).toContain('cardinality');
    expect(enhanced.expected).toBe('max=1');
    expect(enhanced.actual).toBe('count=3');
  });

  // Fixture 3: TYPE_MISMATCH
  it('fixture: TYPE_MISMATCH gets suggestion and doc URL', () => {
    const issue = loadIssueFixture('type-mismatch.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toBeDefined();
    expect(enhanced.documentationUrl).toContain('datatypes');
  });

  // Fixture 4: INVALID_CHOICE_TYPE
  it('fixture: INVALID_CHOICE_TYPE gets suggestion', () => {
    const issue = loadIssueFixture('invalid-choice.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('type suffix');
    expect(enhanced.documentationUrl).toContain('choice');
  });

  // Fixture 5: REQUIRED_ELEMENT_MISSING
  it('fixture: REQUIRED_ELEMENT_MISSING gets suggestion with path', () => {
    const issue = loadIssueFixture('required-missing.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('Patient.identifier');
    expect(enhanced.documentationUrl).toBeDefined();
  });

  // Fixture 6: FIXED_VALUE_MISMATCH
  it('fixture: FIXED_VALUE_MISMATCH gets suggestion and doc URL', () => {
    const issue = loadIssueFixture('fixed-mismatch.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('fixed value');
    expect(enhanced.documentationUrl).toContain('fixed');
  });

  // Fixture 7: PATTERN_VALUE_MISMATCH
  it('fixture: PATTERN_VALUE_MISMATCH gets suggestion and doc URL', () => {
    const issue = loadIssueFixture('pattern-mismatch.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('pattern');
    expect(enhanced.documentationUrl).toContain('pattern');
  });

  // Fixture 8: SLICING_NO_MATCH
  it('fixture: SLICING_NO_MATCH gets suggestion and doc URL', () => {
    const issue = loadIssueFixture('slicing-no-match.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('slice');
    expect(enhanced.documentationUrl).toContain('slicing');
  });

  // Fixture 9: SLICING_CARDINALITY_VIOLATION
  it('fixture: SLICING_CARDINALITY_VIOLATION gets suggestion', () => {
    const issue = loadIssueFixture('slicing-cardinality.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toBeDefined();
    expect(enhanced.documentationUrl).toContain('slicing');
  });

  // Fixture 10: REFERENCE_TARGET_MISMATCH
  it('fixture: REFERENCE_TARGET_MISMATCH gets suggestion and doc URL', () => {
    const issue = loadIssueFixture('reference-target.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('reference');
    expect(enhanced.documentationUrl).toContain('references');
  });

  // Fixture 11: RESOURCE_TYPE_MISMATCH with expected/actual extraction
  it('fixture: RESOURCE_TYPE_MISMATCH extracts expected/actual from diagnostics', () => {
    const issue = loadIssueFixture('resource-type-mismatch.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('Observation');
    expect(enhanced.expected).toBe('Observation');
    expect(enhanced.actual).toBe('Patient');
  });

  // Fixture 12: UNKNOWN_ELEMENT
  it('fixture: UNKNOWN_ELEMENT gets suggestion with path', () => {
    const issue = loadIssueFixture('unknown-element.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('Patient.foo');
    expect(enhanced.documentationUrl).toContain('extensibility');
  });

  // Fixture 13: INVARIANT_VIOLATION
  it('fixture: INVARIANT_VIOLATION gets suggestion and doc URL', () => {
    const issue = loadIssueFixture('invariant-violation.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('constraint');
    expect(enhanced.documentationUrl).toContain('constraints');
  });

  // Fixture 14: INVARIANT_EVALUATION_ERROR
  it('fixture: INVARIANT_EVALUATION_ERROR gets suggestion and doc URL', () => {
    const issue = loadIssueFixture('invariant-eval-error.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('expression');
    expect(enhanced.documentationUrl).toContain('fhirpath');
  });

  // Fixture 15: PROFILE_NOT_FOUND
  it('fixture: PROFILE_NOT_FOUND gets suggestion and doc URL', () => {
    const issue = loadIssueFixture('profile-not-found.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('profile');
    expect(enhanced.documentationUrl).toContain('profiling');
  });

  // Fixture 16: INTERNAL_ERROR
  it('fixture: INTERNAL_ERROR gets bug report suggestion', () => {
    const issue = loadIssueFixture('internal-error.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.suggestion).toContain('bug');
  });

  // Additional unit tests for enhanceIssues batch function
  it('should enhance multiple issues at once', () => {
    const issues: ValidationIssue[] = [
      loadIssueFixture('cardinality-min.json'),
      loadIssueFixture('type-mismatch.json'),
      loadIssueFixture('internal-error.json'),
    ];
    const enhanced = enhanceIssues(issues);
    expect(enhanced).toHaveLength(3);
    expect(enhanced[0].suggestion).toBeDefined();
    expect(enhanced[1].suggestion).toBeDefined();
    expect(enhanced[2].suggestion).toBeDefined();
  });

  it('should preserve original issue properties', () => {
    const issue = loadIssueFixture('cardinality-min.json');
    const enhanced = enhanceIssue(issue);
    expect(enhanced.severity).toBe(issue.severity);
    expect(enhanced.code).toBe(issue.code);
    expect(enhanced.message).toBe(issue.message);
    expect(enhanced.path).toBe(issue.path);
  });
});
