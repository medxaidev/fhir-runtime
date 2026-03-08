/**
 * fhir-pipeline — InvariantValidationStep
 *
 * Evaluates FHIRPath invariant constraints from the profile elements.
 * Wraps the existing {@link validateInvariants} function as a pipeline step.
 *
 * @module fhir-pipeline
 */

import type { CanonicalProfile, Resource } from '../../model/index.js';
import type { ValidationIssue } from '../../validator/types.js';
import { validateInvariants } from '../../validator/invariant-validator.js';
import { extractValues } from '../../validator/path-extractor.js';
import type { ValidationStep, PipelineContext } from '../types.js';

// =============================================================================
// InvariantValidationStep
// =============================================================================

/**
 * Pipeline step that evaluates FHIRPath invariant constraints.
 *
 * Iterates over all profile elements with constraints and evaluates
 * each constraint's FHIRPath expression against the resource values.
 */
export class InvariantValidationStep implements ValidationStep {
  readonly name = 'invariant';
  readonly priority = 30;

  async validate(
    resource: Resource,
    profile: CanonicalProfile,
    _context: PipelineContext,
  ): Promise<ValidationIssue[]> {
    const issues: ValidationIssue[] = [];

    for (const element of profile.elements.values()) {
      if (element.path === profile.type) continue;
      if (!element.constraints || element.constraints.length === 0) continue;

      const values = extractValues(
        resource as unknown as Record<string, unknown>,
        element.path,
      );

      for (const value of values) {
        validateInvariants(element, value, resource, issues);
      }
    }

    return issues;
  }
}
