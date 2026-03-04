/**
 * fhir-validator — Structure Validator (Orchestrator)
 *
 * Main validator class that coordinates all validation rules to validate
 * a FHIR resource instance against a {@link CanonicalProfile}.
 *
 * Integrates:
 * - Path extraction ({@link extractValues})
 * - Cardinality validation ({@link validateCardinality})
 * - Type validation ({@link validateType})
 * - Fixed/pattern validation ({@link validateFixed}, {@link validatePattern})
 * - Reference validation ({@link validateReference})
 * - Slicing validation ({@link validateSlicing})
 *
 * Exported:
 * - {@link StructureValidator} — main validator class
 *
 * @module fhir-validator
 */

import type { CanonicalProfile, CanonicalElement, Resource } from '../model/index.js';
import type { ValidationOptions, ValidationResult, ValidationIssue } from './types.js';
import { createValidationIssue, resolveValidationOptions } from './types.js';
import { ProfileNotFoundError, ValidationFailedError } from './errors.js';
import { extractValues } from './path-extractor.js';
import {
  validateCardinality,
  validateType,
  validateFixed,
  validatePattern,
  validateReference,
} from './validation-rules.js';
import { validateSlicing } from './slicing-validator.js';
import { validateInvariants } from './invariant-validator.js';

// =============================================================================
// Section 1: StructureValidator
// =============================================================================

/**
 * Main validator class for structural validation of FHIR resources.
 *
 * Validates a resource instance against a {@link CanonicalProfile} by
 * orchestrating all individual validation rules (cardinality, type,
 * fixed/pattern, reference, slicing).
 *
 * @example
 * ```typescript
 * const validator = new StructureValidator();
 *
 * // Validate with an explicit profile
 * const result = validator.validate(patient, patientProfile);
 *
 * if (!result.valid) {
 *   for (const issue of result.issues) {
 *     console.error(`${issue.severity}: ${issue.message}`);
 *   }
 * }
 * ```
 */
export class StructureValidator {
  private readonly options: Required<ValidationOptions>;

  constructor(options?: ValidationOptions) {
    this.options = resolveValidationOptions(options);
  }

  // ===========================================================================
  // Public API
  // ===========================================================================

  /**
   * Validate a resource instance against a CanonicalProfile.
   *
   * @param resource - The FHIR resource to validate.
   * @param profile - The CanonicalProfile to validate against.
   * @param options - Optional per-call overrides for validation options.
   * @returns The validation result with all issues.
   * @throws {@link ProfileNotFoundError} if profile is undefined.
   * @throws {@link ValidationFailedError} if failFast is enabled and an error is found.
   */
  validate(
    resource: Resource,
    profile: CanonicalProfile,
    options?: ValidationOptions,
  ): ValidationResult {
    if (!profile) {
      throw new ProfileNotFoundError('No profile provided for validation');
    }

    const opts = options
      ? resolveValidationOptions({ ...this.options, ...options })
      : this.options;

    const issues: ValidationIssue[] = [];

    // Step 1: Check resource type matches profile type
    this.validateResourceType(resource, profile, issues, opts);

    // Step 2: Validate all elements
    this.validateElements(resource, profile, issues, opts, 0);

    return {
      valid: !issues.some((i) => i.severity === 'error'),
      resource,
      profileUrl: opts.profileUrl || profile.url,
      profile,
      issues,
    };
  }

  // ===========================================================================
  // Private: Resource Type Check
  // ===========================================================================

  /**
   * Check that the resource type matches the profile type.
   */
  private validateResourceType(
    resource: Resource,
    profile: CanonicalProfile,
    issues: ValidationIssue[],
    opts: Required<ValidationOptions>,
  ): void {
    if (!resource.resourceType) {
      issues.push(
        createValidationIssue(
          'error',
          'RESOURCE_TYPE_MISMATCH',
          `Resource is missing 'resourceType' property`,
        ),
      );
      this.checkFailFast(opts, issues);
      return;
    }

    if (resource.resourceType !== profile.type) {
      issues.push(
        createValidationIssue(
          'error',
          'RESOURCE_TYPE_MISMATCH',
          `Expected resourceType '${profile.type}', but found '${resource.resourceType}'`,
          {
            diagnostics: `Expected: ${profile.type}, Actual: ${resource.resourceType}`,
          },
        ),
      );
      this.checkFailFast(opts, issues);
    }
  }

  // ===========================================================================
  // Private: Element Traversal
  // ===========================================================================

  /**
   * Validate all elements in the profile against the resource.
   */
  private validateElements(
    resource: Resource,
    profile: CanonicalProfile,
    issues: ValidationIssue[],
    opts: Required<ValidationOptions>,
    depth: number,
  ): void {
    if (depth >= opts.maxDepth) {
      issues.push(
        createValidationIssue(
          'warning',
          'INTERNAL_ERROR',
          `Maximum validation depth (${opts.maxDepth}) exceeded`,
          { diagnostics: `Depth: ${depth}` },
        ),
      );
      return;
    }

    for (const element of profile.elements.values()) {
      // Skip root element (already validated via resourceType check)
      if (element.path === profile.type) continue;

      // Skip slice-specific elements (handled by slicing validation)
      if (element.sliceName) continue;

      // Extract values from resource at this element's path
      const values = extractValues(resource as unknown as Record<string, unknown>, element.path);

      // Validate cardinality
      validateCardinality(element, values, issues);
      this.checkFailFast(opts, issues);

      // Validate each value individually
      for (const value of values) {
        // Type validation
        validateType(element, value, issues);
        this.checkFailFast(opts, issues);

        // Fixed/pattern validation
        if (opts.validateFixed) {
          validateFixed(element, value, issues);
          validatePattern(element, value, issues);
          this.checkFailFast(opts, issues);
        }

        // Reference validation
        if (element.types.some((t) => t.code === 'Reference')) {
          validateReference(element, value, issues);
          this.checkFailFast(opts, issues);
        }
      }

      // FHIRPath invariant validation
      if (!opts.skipInvariants && element.constraints && element.constraints.length > 0) {
        for (const value of values) {
          validateInvariants(element, value, resource, issues, {
            skipInvariants: opts.skipInvariants,
          });
          this.checkFailFast(opts, issues);
        }
      }

      // Slicing validation
      if (opts.validateSlicing && element.slicing) {
        const sliceElements = this.getSliceElements(profile, element.path);
        validateSlicing(element, sliceElements, values, issues);
        this.checkFailFast(opts, issues);
      }
    }
  }

  // ===========================================================================
  // Private: Helpers
  // ===========================================================================

  /**
   * Get all named slice elements for a slicing root path.
   */
  private getSliceElements(
    profile: CanonicalProfile,
    slicingRootPath: string,
  ): CanonicalElement[] {
    const slices: CanonicalElement[] = [];

    for (const element of profile.elements.values()) {
      if (element.path === slicingRootPath && element.sliceName) {
        slices.push(element);
      }
    }

    return slices;
  }

  /**
   * Check if failFast is enabled and there are errors; if so, throw.
   */
  private checkFailFast(
    opts: Required<ValidationOptions>,
    issues: ValidationIssue[],
  ): void {
    if (opts.failFast && issues.some((i) => i.severity === 'error')) {
      throw new ValidationFailedError(
        'Validation failed (failFast enabled)',
        issues,
      );
    }
  }
}
