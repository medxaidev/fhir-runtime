/**
 * fhir-pipeline — Enhanced Error Messages
 *
 * Enriches {@link ValidationIssue} instances with fix suggestions,
 * documentation links, and expected/actual values for improved DX.
 *
 * @module fhir-pipeline
 */

import type { ValidationIssue, ValidationIssueCode } from '../../validator/types.js';
import type { EnhancedValidationIssue } from '../types.js';

// =============================================================================
// Enhancement Registry
// =============================================================================

interface EnhancementRule {
  suggestion?: string | ((issue: ValidationIssue) => string);
  documentationUrl?: string;
  extractExpectedActual?: (issue: ValidationIssue) => { expected?: string; actual?: string };
}

const ENHANCEMENT_RULES: Partial<Record<ValidationIssueCode, EnhancementRule>> = {
  CARDINALITY_MIN_VIOLATION: {
    suggestion: (issue) => {
      const match = issue.message?.match(/at least (\d+)/);
      const min = match ? match[1] : '1';
      const element = issue.path ?? 'the element';
      return `Add at least ${min} value(s) to ${element}`;
    },
    documentationUrl: 'http://hl7.org/fhir/R4/conformance-rules.html#cardinality',
    extractExpectedActual: (issue) => {
      const minMatch = issue.message?.match(/at least (\d+)/);
      const actualMatch = issue.message?.match(/found (\d+)/);
      return {
        expected: minMatch ? `min=${minMatch[1]}` : undefined,
        actual: actualMatch ? `count=${actualMatch[1]}` : undefined,
      };
    },
  },
  CARDINALITY_MAX_VIOLATION: {
    suggestion: (issue) => {
      const element = issue.path ?? 'the element';
      return `Remove excess values from ${element}`;
    },
    documentationUrl: 'http://hl7.org/fhir/R4/conformance-rules.html#cardinality',
    extractExpectedActual: (issue) => {
      const maxMatch = issue.message?.match(/at most (\d+)/);
      const actualMatch = issue.message?.match(/found (\d+)/);
      return {
        expected: maxMatch ? `max=${maxMatch[1]}` : undefined,
        actual: actualMatch ? `count=${actualMatch[1]}` : undefined,
      };
    },
  },
  TYPE_MISMATCH: {
    suggestion: (issue) => {
      const element = issue.path ?? 'the element';
      return `Check the value type of ${element} against the profile definition`;
    },
    documentationUrl: 'http://hl7.org/fhir/R4/datatypes.html',
  },
  INVALID_CHOICE_TYPE: {
    suggestion: 'Use one of the allowed type suffixes for this choice element',
    documentationUrl: 'http://hl7.org/fhir/R4/formats.html#choice',
  },
  REQUIRED_ELEMENT_MISSING: {
    suggestion: (issue) => {
      const element = issue.path ?? 'the required element';
      return `Provide a value for ${element}`;
    },
    documentationUrl: 'http://hl7.org/fhir/R4/conformance-rules.html#mustSupport',
  },
  FIXED_VALUE_MISMATCH: {
    suggestion: 'Ensure the value exactly matches the fixed value defined in the profile',
    documentationUrl: 'http://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.fixed_x_',
  },
  PATTERN_VALUE_MISMATCH: {
    suggestion: 'Ensure the value contains all fields defined in the pattern',
    documentationUrl: 'http://hl7.org/fhir/R4/elementdefinition-definitions.html#ElementDefinition.pattern_x_',
  },
  SLICING_NO_MATCH: {
    suggestion: 'Ensure the value matches at least one defined slice discriminator',
    documentationUrl: 'http://hl7.org/fhir/R4/profiling.html#slicing',
  },
  SLICING_CARDINALITY_VIOLATION: {
    suggestion: 'Check the number of values in each slice against its min/max constraints',
    documentationUrl: 'http://hl7.org/fhir/R4/profiling.html#slicing',
  },
  SLICING_ORDER_VIOLATION: {
    suggestion: 'Reorder the array values to match the declared slice order',
    documentationUrl: 'http://hl7.org/fhir/R4/profiling.html#slicing',
  },
  REFERENCE_TARGET_MISMATCH: {
    suggestion: 'Ensure the reference points to a resource of one of the allowed target types',
    documentationUrl: 'http://hl7.org/fhir/R4/references.html',
  },
  PROFILE_NOT_FOUND: {
    suggestion: 'Verify the profile URL is correct and the profile is loaded in the context',
    documentationUrl: 'http://hl7.org/fhir/R4/profiling.html',
  },
  RESOURCE_TYPE_MISMATCH: {
    suggestion: (issue) => {
      const match = issue.message?.match(/Expected resourceType '(\w+)'/);
      const expected = match ? match[1] : 'the expected type';
      return `Set resourceType to '${expected}'`;
    },
    documentationUrl: 'http://hl7.org/fhir/R4/resource.html#resource',
    extractExpectedActual: (issue) => {
      const match = issue.diagnostics?.match(/Expected: (\w+), Actual: (\w+)/);
      return {
        expected: match ? match[1] : undefined,
        actual: match ? match[2] : undefined,
      };
    },
  },
  UNKNOWN_ELEMENT: {
    suggestion: (issue) => {
      const element = issue.path ?? 'the element';
      return `Remove ${element} or check if it should be an extension`;
    },
    documentationUrl: 'http://hl7.org/fhir/R4/extensibility.html',
  },
  INVARIANT_VIOLATION: {
    suggestion: 'Review the constraint expression and ensure the resource satisfies it',
    documentationUrl: 'http://hl7.org/fhir/R4/conformance-rules.html#constraints',
  },
  INVARIANT_EVALUATION_ERROR: {
    suggestion: 'The FHIRPath expression could not be evaluated; check expression syntax',
    documentationUrl: 'http://hl7.org/fhir/R4/fhirpath.html',
  },
  INVARIANT_NOT_EVALUATED: {
    suggestion: 'Invariant evaluation was skipped; enable invariant validation if needed',
  },
  INTERNAL_ERROR: {
    suggestion: 'This is an internal error; please report it as a bug',
  },
};

// =============================================================================
// Public API
// =============================================================================

/**
 * Enhance a single validation issue with DX-friendly metadata.
 *
 * @param issue - The original validation issue.
 * @returns An enhanced issue with suggestion, documentation URL, and expected/actual.
 */
export function enhanceIssue(issue: ValidationIssue): EnhancedValidationIssue {
  const rule = ENHANCEMENT_RULES[issue.code];
  if (!rule) {
    return { ...issue };
  }

  const enhanced: EnhancedValidationIssue = { ...issue };

  if (rule.suggestion) {
    enhanced.suggestion = typeof rule.suggestion === 'function'
      ? rule.suggestion(issue)
      : rule.suggestion;
  }

  if (rule.documentationUrl) {
    enhanced.documentationUrl = rule.documentationUrl;
  }

  if (rule.extractExpectedActual) {
    const { expected, actual } = rule.extractExpectedActual(issue);
    if (expected) enhanced.expected = expected;
    if (actual) enhanced.actual = actual;
  }

  return enhanced;
}

/**
 * Enhance an array of validation issues.
 *
 * @param issues - The original validation issues.
 * @returns Enhanced issues with DX-friendly metadata.
 */
export function enhanceIssues(issues: readonly ValidationIssue[]): EnhancedValidationIssue[] {
  return issues.map(enhanceIssue);
}
