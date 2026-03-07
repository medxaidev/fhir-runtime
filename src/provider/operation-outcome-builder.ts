/**
 * fhir-provider — OperationOutcome Builder
 *
 * Converts internal result types ({@link ValidationResult}, {@link ParseResult},
 * {@link SnapshotResult}) into standard FHIR R4 OperationOutcome resources.
 *
 * This is essential for fhir-server integration, where REST API responses
 * must include OperationOutcome resources to communicate processing results.
 *
 * @module fhir-provider
 */

import type { ValidationResult, ValidationIssue, ValidationIssueCode } from '../validator/types.js';
import type { ParseResult, ParseIssue, ParseErrorCode } from '../parser/parse-error.js';
import type { SnapshotResult, SnapshotIssue, SnapshotIssueCode } from '../profile/types.js';
import type { OperationOutcome, OperationOutcomeIssue, OperationOutcomeIssueType } from './types.js';

// =============================================================================
// Section 1: ValidationResult → OperationOutcome
// =============================================================================

/**
 * Map from {@link ValidationIssueCode} to FHIR OperationOutcome issue type.
 */
const VALIDATION_ISSUE_TYPE_MAP: Record<ValidationIssueCode, OperationOutcomeIssueType> = {
  CARDINALITY_MIN_VIOLATION: 'structure',
  CARDINALITY_MAX_VIOLATION: 'structure',
  TYPE_MISMATCH: 'value',
  INVALID_CHOICE_TYPE: 'value',
  REQUIRED_ELEMENT_MISSING: 'required',
  FIXED_VALUE_MISMATCH: 'value',
  PATTERN_VALUE_MISMATCH: 'value',
  SLICING_NO_MATCH: 'structure',
  SLICING_CARDINALITY_VIOLATION: 'structure',
  SLICING_ORDER_VIOLATION: 'structure',
  REFERENCE_TARGET_MISMATCH: 'value',
  PROFILE_NOT_FOUND: 'not-found',
  RESOURCE_TYPE_MISMATCH: 'invalid',
  UNKNOWN_ELEMENT: 'structure',
  INVARIANT_NOT_EVALUATED: 'not-supported',
  INVARIANT_VIOLATION: 'invariant',
  INVARIANT_EVALUATION_ERROR: 'processing',
  INTERNAL_ERROR: 'processing',
};

/**
 * Convert a {@link ValidationIssue} to an {@link OperationOutcomeIssue}.
 */
function validationIssueToOutcomeIssue(issue: ValidationIssue): OperationOutcomeIssue {
  const outcomeIssue: OperationOutcomeIssue = {
    severity: issue.severity,
    code: VALIDATION_ISSUE_TYPE_MAP[issue.code] ?? 'processing',
    details: { text: `[${issue.code}] ${issue.message}` },
    ...(issue.diagnostics !== undefined ? { diagnostics: issue.diagnostics } : {}),
    ...(issue.path !== undefined || issue.expression !== undefined
      ? { expression: [issue.expression ?? issue.path!] }
      : {}),
  };
  return outcomeIssue;
}

/**
 * Build a FHIR OperationOutcome from a {@link ValidationResult}.
 *
 * Maps each {@link ValidationIssue} to an OperationOutcome.issue entry
 * with appropriate severity, issue type code, details, and expression.
 *
 * If the validation result has no issues, returns an OperationOutcome
 * with a single informational issue indicating success.
 *
 * @param result - The validation result to convert.
 * @returns A FHIR R4 OperationOutcome resource.
 *
 * @example
 * ```typescript
 * const result = validator.validate(patient, patientProfile);
 * const outcome = buildOperationOutcome(result);
 * // outcome.resourceType === 'OperationOutcome'
 * // outcome.issue.length >= 1
 * ```
 */
export function buildOperationOutcome(result: ValidationResult): OperationOutcome {
  if (result.issues.length === 0) {
    return {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'information',
          code: 'informational',
          details: { text: 'Validation successful' },
        },
      ],
    };
  }

  return {
    resourceType: 'OperationOutcome',
    issue: result.issues.map(validationIssueToOutcomeIssue),
  };
}

// =============================================================================
// Section 2: ParseResult → OperationOutcome
// =============================================================================

/**
 * Map from {@link ParseErrorCode} to FHIR OperationOutcome issue type.
 */
const PARSE_ISSUE_TYPE_MAP: Record<ParseErrorCode, OperationOutcomeIssueType> = {
  INVALID_JSON: 'structure',
  MISSING_RESOURCE_TYPE: 'required',
  UNKNOWN_RESOURCE_TYPE: 'not-found',
  INVALID_PRIMITIVE: 'value',
  INVALID_STRUCTURE: 'structure',
  INVALID_CHOICE_TYPE: 'value',
  MULTIPLE_CHOICE_VALUES: 'structure',
  ARRAY_MISMATCH: 'structure',
  UNEXPECTED_NULL: 'value',
  UNEXPECTED_PROPERTY: 'informational',
};

/**
 * Convert a {@link ParseIssue} to an {@link OperationOutcomeIssue}.
 */
function parseIssueToOutcomeIssue(issue: ParseIssue): OperationOutcomeIssue {
  return {
    severity: issue.severity === 'error' ? 'error' : 'warning',
    code: PARSE_ISSUE_TYPE_MAP[issue.code] ?? 'processing',
    details: { text: `[${issue.code}] ${issue.message}` },
    expression: [issue.path],
  };
}

/**
 * Build a FHIR OperationOutcome from a {@link ParseResult}.
 *
 * Maps each {@link ParseIssue} to an OperationOutcome.issue entry.
 * If the parse result is successful with no issues, returns an
 * OperationOutcome with a single informational success message.
 *
 * @param result - The parse result to convert.
 * @returns A FHIR R4 OperationOutcome resource.
 *
 * @example
 * ```typescript
 * const result = parseFhirJson(jsonString);
 * const outcome = buildOperationOutcomeFromParse(result);
 * ```
 */
export function buildOperationOutcomeFromParse(result: ParseResult<unknown>): OperationOutcome {
  if (result.issues.length === 0) {
    return {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'information',
          code: 'informational',
          details: { text: 'Parsing successful' },
        },
      ],
    };
  }

  return {
    resourceType: 'OperationOutcome',
    issue: result.issues.map(parseIssueToOutcomeIssue),
  };
}

// =============================================================================
// Section 3: SnapshotResult → OperationOutcome
// =============================================================================

/**
 * Map from {@link SnapshotIssueCode} to FHIR OperationOutcome issue type.
 */
const SNAPSHOT_ISSUE_TYPE_MAP: Record<SnapshotIssueCode, OperationOutcomeIssueType> = {
  CIRCULAR_DEPENDENCY: 'processing',
  BASE_NOT_FOUND: 'not-found',
  BASE_MISSING_SNAPSHOT: 'not-found',
  DIFFERENTIAL_NOT_CONSUMED: 'structure',
  CARDINALITY_VIOLATION: 'business-rule',
  TYPE_INCOMPATIBLE: 'value',
  BINDING_VIOLATION: 'business-rule',
  SLICING_ERROR: 'structure',
  PATH_NOT_FOUND: 'not-found',
  INVALID_CONSTRAINT: 'business-rule',
  INTERNAL_ERROR: 'processing',
};

/**
 * Convert a {@link SnapshotIssue} to an {@link OperationOutcomeIssue}.
 */
function snapshotIssueToOutcomeIssue(issue: SnapshotIssue): OperationOutcomeIssue {
  return {
    severity: issue.severity,
    code: SNAPSHOT_ISSUE_TYPE_MAP[issue.code] ?? 'processing',
    details: { text: `[${issue.code}] ${issue.message}` },
    ...(issue.details !== undefined ? { diagnostics: issue.details } : {}),
    ...(issue.path !== undefined ? { expression: [issue.path] } : {}),
  };
}

/**
 * Build a FHIR OperationOutcome from a {@link SnapshotResult}.
 *
 * Maps each {@link SnapshotIssue} to an OperationOutcome.issue entry.
 * If the snapshot result is successful with no issues, returns an
 * OperationOutcome with a single informational success message.
 *
 * @param result - The snapshot result to convert.
 * @returns A FHIR R4 OperationOutcome resource.
 *
 * @example
 * ```typescript
 * const result = await generator.generate(sd);
 * const outcome = buildOperationOutcomeFromSnapshot(result);
 * ```
 */
export function buildOperationOutcomeFromSnapshot(result: SnapshotResult): OperationOutcome {
  if (result.issues.length === 0) {
    return {
      resourceType: 'OperationOutcome',
      issue: [
        {
          severity: 'information',
          code: 'informational',
          details: { text: 'Snapshot generation successful' },
        },
      ],
    };
  }

  return {
    resourceType: 'OperationOutcome',
    issue: result.issues.map(snapshotIssueToOutcomeIssue),
  };
}
