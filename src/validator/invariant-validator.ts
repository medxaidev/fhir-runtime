/**
 * FHIRPath Invariant Validator
 *
 * Evaluates FHIRPath constraint expressions from StructureDefinition
 * elements and reports violations as ValidationIssues.
 *
 * @module validator
 */

import type { Invariant, CanonicalElement } from '../model/canonical-profile.js';
import type { ValidationIssue } from './types.js';
import { createValidationIssue } from './types.js';
import { evalFhirPathBoolean } from '../fhirpath/parse.js';
import { toTypedValue } from '../fhirpath/utils.js';
import type { TypedValue } from '../fhirpath/types.js';

// =============================================================================
// Public API
// =============================================================================

/**
 * Options for invariant validation.
 */
export interface InvariantValidationOptions {
  /** Skip all invariant evaluation. */
  skipInvariants?: boolean;
  /** Skip invariants from inherited profiles (only evaluate local constraints). */
  skipInheritedInvariants?: boolean;
  /** Profile URL of the current profile (used to filter inherited constraints). */
  currentProfileUrl?: string;
}

/**
 * Validate FHIRPath invariants (constraint.expression) on a single element value.
 *
 * For each constraint on the element that has an expression, the expression
 * is evaluated against the value. If it evaluates to `false`, a validation
 * issue is recorded.
 *
 * @param element - The canonical element with constraints.
 * @param value - The value at the element path (raw JS value).
 * @param resource - The root resource being validated (for %resource context).
 * @param issues - Mutable array to push validation issues into.
 * @param options - Validation options.
 */
export function validateInvariants(
  element: CanonicalElement,
  value: unknown,
  resource: unknown,
  issues: ValidationIssue[],
  options: InvariantValidationOptions = {},
): void {
  if (options.skipInvariants) {
    return;
  }

  if (!element.constraints || element.constraints.length === 0) {
    return;
  }

  for (const constraint of element.constraints) {
    validateSingleInvariant(constraint, element.path, value, resource, issues, options);
  }
}

/**
 * Validate a single FHIRPath invariant constraint.
 *
 * @param constraint - The invariant to validate.
 * @param path - The element path for error reporting.
 * @param value - The value to validate.
 * @param resource - The root resource.
 * @param issues - Mutable array to push issues into.
 * @param options - Validation options.
 */
export function validateSingleInvariant(
  constraint: Invariant,
  path: string,
  value: unknown,
  resource: unknown,
  issues: ValidationIssue[],
  options: InvariantValidationOptions = {},
): void {
  // Skip constraints without expression (human-only)
  if (!constraint.expression) {
    return;
  }

  // Skip inherited invariants if requested
  if (
    options.skipInheritedInvariants &&
    options.currentProfileUrl &&
    constraint.source &&
    constraint.source !== options.currentProfileUrl
  ) {
    return;
  }

  try {
    const typedValue = toTypedValue(value);
    const typedResource = toTypedValue(resource);

    // Build variables for the FHIRPath context
    const variables: Record<string, TypedValue> = {
      '%resource': typedResource,
    };

    const result = evalFhirPathBoolean(constraint.expression, [typedValue], variables);

    if (!result) {
      issues.push(
        createValidationIssue(
          constraint.severity === 'error' ? 'error' : 'warning',
          'INVARIANT_VIOLATION',
          constraint.human || `Constraint '${constraint.key}' failed`,
          {
            path,
            expression: constraint.expression,
            diagnostics: `Constraint key: ${constraint.key}`,
          },
        ),
      );
    }
  } catch (error: unknown) {
    // FHIRPath evaluation error — report as warning, don't block validation
    const message = error instanceof Error ? error.message : String(error);
    issues.push(
      createValidationIssue(
        'warning',
        'INVARIANT_EVALUATION_ERROR',
        `Failed to evaluate constraint '${constraint.key}': ${message}`,
        {
          path,
          expression: constraint.expression,
          diagnostics: message,
        },
      ),
    );
  }
}

/**
 * Validate all invariants for multiple element-value pairs.
 *
 * Convenience function for batch validation of all constraints
 * across a resource's elements.
 *
 * @param elements - Array of [element, values] pairs.
 * @param resource - The root resource.
 * @param options - Validation options.
 * @returns Array of validation issues.
 */
export function validateAllInvariants(
  elements: Array<{ element: CanonicalElement; values: unknown[] }>,
  resource: unknown,
  options: InvariantValidationOptions = {},
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  if (options.skipInvariants) {
    return issues;
  }

  for (const { element, values } of elements) {
    for (const value of values) {
      validateInvariants(element, value, resource, issues, options);
    }
  }

  return issues;
}
