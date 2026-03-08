/**
 * fhir-pipeline — StructuralValidationStep
 *
 * Wraps the existing {@link StructureValidator} as a pipeline step.
 * Delegates to the validator's `validate()` method and returns its issues.
 *
 * @module fhir-pipeline
 */

import type { CanonicalProfile, Resource } from '../../model/index.js';
import type { ValidationIssue } from '../../validator/types.js';
import { StructureValidator } from '../../validator/structure-validator.js';
import type { ValidationStep, PipelineContext } from '../types.js';

// =============================================================================
// StructuralValidationStep
// =============================================================================

/**
 * Pipeline step that performs structural validation using {@link StructureValidator}.
 *
 * Validates cardinality, types, fixed/pattern values, references, and slicing.
 */
export class StructuralValidationStep implements ValidationStep {
  readonly name = 'structural';
  readonly priority = 10;

  async validate(
    resource: Resource,
    profile: CanonicalProfile,
    context: PipelineContext,
  ): Promise<ValidationIssue[]> {
    const validator = new StructureValidator({
      maxDepth: context.options.maxDepth ?? 50,
      failFast: false,
      skipInvariants: true,
    });

    const result = validator.validate(resource, profile);
    return [...result.issues];
  }
}
