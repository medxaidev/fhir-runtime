/**
 * FHIR JSON Parse Error Types
 *
 * Structured error types for the fhir-parser module. Provides precise
 * error localization via JSON path tracking and supports collecting
 * multiple issues (errors + warnings) in a single parse pass.
 *
 * Design decisions:
 * - Result type over exceptions: allows multi-error collection
 * - Path tracking: every issue carries the JSON path for precise localization
 * - Warning support: non-fatal issues (e.g., unknown properties) reported
 *   as warnings without blocking the parse
 *
 * @module fhir-parser
 */

// =============================================================================
// Section 1: Severity & Error Codes
// =============================================================================

/**
 * Severity level of a parse issue.
 *
 * - `error` — the issue prevents correct interpretation of the data
 * - `warning` — the data can still be used, but something unexpected was found
 */
export type ParseSeverity = 'error' | 'warning';

/**
 * Machine-readable error codes for parse issues.
 *
 * Each code corresponds to a specific category of parsing problem.
 * Consumers can switch on these codes for programmatic error handling.
 */
export type ParseErrorCode =
  /** JSON syntax error (e.g., malformed JSON string) */
  | 'INVALID_JSON'
  /** Missing required `resourceType` property */
  | 'MISSING_RESOURCE_TYPE'
  /** `resourceType` value is not a recognized FHIR resource type */
  | 'UNKNOWN_RESOURCE_TYPE'
  /** Primitive value has wrong JavaScript type (e.g., string where number expected) */
  | 'INVALID_PRIMITIVE'
  /** Object structure does not match expected shape (e.g., array where object expected) */
  | 'INVALID_STRUCTURE'
  /** Choice type `[x]` property name has an unrecognized type suffix */
  | 'INVALID_CHOICE_TYPE'
  /** Multiple variants of the same choice type field are present */
  | 'MULTIPLE_CHOICE_VALUES'
  /** `_element` array length does not match the corresponding value array */
  | 'ARRAY_MISMATCH'
  /** Unexpected `null` value in a non-nullable position */
  | 'UNEXPECTED_NULL'
  /** Property name not recognized for this type (severity: warning) */
  | 'UNEXPECTED_PROPERTY';

// =============================================================================
// Section 2: Parse Issue
// =============================================================================

/**
 * A single issue encountered during parsing.
 *
 * Issues are collected throughout the parse process and returned in the
 * {@link ParseResult}. Both errors and warnings use this same structure.
 *
 * @example
 * ```typescript
 * const issue: ParseIssue = {
 *   severity: 'error',
 *   code: 'MISSING_RESOURCE_TYPE',
 *   message: 'Object is missing the required "resourceType" property',
 *   path: '$',
 * };
 * ```
 */
export interface ParseIssue {
  /** Severity level — `error` blocks successful parsing, `warning` does not */
  readonly severity: ParseSeverity;

  /** Machine-readable error code for programmatic handling */
  readonly code: ParseErrorCode;

  /** Human-readable description of the issue */
  readonly message: string;

  /**
   * JSON path where the issue was detected.
   *
   * Uses dot notation with array indices:
   * - `"StructureDefinition"` — root level
   * - `"StructureDefinition.snapshot.element[0].type[1].code"` — nested
   * - `"$"` — before resourceType is known
   */
  readonly path: string;
}

// =============================================================================
// Section 3: Parse Result
// =============================================================================

/**
 * Result of a parse operation.
 *
 * Uses a discriminated union on `success`:
 * - `success: true` — parsing succeeded; `data` contains the parsed value,
 *   `issues` may contain warnings
 * - `success: false` — parsing failed; `data` is `undefined`,
 *   `issues` contains at least one error
 *
 * @typeParam T - The expected output type (e.g., `StructureDefinition`)
 *
 * @example
 * ```typescript
 * const result = parseFhirJson(jsonString);
 * if (result.success) {
 *   console.log(result.data.url); // T is available
 * } else {
 *   for (const issue of result.issues) {
 *     console.error(`[${issue.path}] ${issue.message}`);
 *   }
 * }
 * ```
 */
export type ParseResult<T> =
  | { readonly success: true; readonly data: T; readonly issues: readonly ParseIssue[] }
  | { readonly success: false; readonly data: undefined; readonly issues: readonly ParseIssue[] };

// =============================================================================
// Section 4: Factory Helpers
// =============================================================================

/**
 * Create a successful parse result.
 *
 * @param data - The parsed value
 * @param issues - Any warnings collected during parsing (default: none)
 */
export function parseSuccess<T>(data: T, issues: ParseIssue[] = []): ParseResult<T> {
  return { success: true, data, issues };
}

/**
 * Create a failed parse result.
 *
 * @param issues - The error(s) that caused the failure (must contain at least one error)
 */
export function parseFailure<T>(issues: ParseIssue[]): ParseResult<T> {
  if (!hasErrors(issues)) {
    throw new Error('parseFailure requires at least one error in issues array');
  }
  return { success: false, data: undefined, issues };
}

/**
 * Create a single parse issue.
 *
 * Convenience factory to reduce boilerplate when constructing issues.
 *
 * @param severity - Error or warning
 * @param code - Machine-readable error code
 * @param message - Human-readable description
 * @param path - JSON path where the issue was detected
 */
export function createIssue(
  severity: ParseSeverity,
  code: ParseErrorCode,
  message: string,
  path: string,
): ParseIssue {
  return { severity, code, message, path };
}

/**
 * Check whether an issues array contains at least one error (not just warnings).
 *
 * Useful for determining whether to return success or failure after
 * collecting issues from sub-parsers.
 */
export function hasErrors(issues: readonly ParseIssue[]): boolean {
  return issues.some((issue) => issue.severity === 'error');
}
