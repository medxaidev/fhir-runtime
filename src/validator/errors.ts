/**
 * fhir-validator — Error Types
 *
 * Structured error hierarchy for the FHIR validator module.
 * All errors extend {@link ValidatorError} so consumers can catch
 * validator-related failures with a single `catch` clause.
 *
 * Error hierarchy:
 * ```
 * ValidatorError (base)
 * ├── ProfileNotFoundError
 * └── ValidationFailedError
 * ```
 *
 * @module fhir-validator
 */

import type { ValidationIssue } from './types.js';

// =============================================================================
// Section 1: Base Error
// =============================================================================

/**
 * Base error class for all fhir-validator failures.
 *
 * Provides a stable `name` property and preserves the original `cause`
 * when wrapping lower-level errors.
 *
 * @example
 * ```typescript
 * try {
 *   await validator.validate(resource);
 * } catch (err) {
 *   if (err instanceof ValidatorError) {
 *     // Handle any validator-related error
 *   }
 * }
 * ```
 */
export class ValidatorError extends Error {
  override readonly name: string = 'ValidatorError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    // Restore prototype chain (required for `instanceof` after transpilation)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// =============================================================================
// Section 2: ProfileNotFoundError
// =============================================================================

/**
 * Thrown when the profile required for validation cannot be found or loaded.
 *
 * This occurs when:
 * - The specified `profileUrl` does not exist in the FhirContext
 * - The profile exists but has no snapshot
 * - No profile URL is specified and none can be inferred from the resource
 *
 * @example
 * ```typescript
 * throw new ProfileNotFoundError(
 *   'http://example.org/StructureDefinition/UnknownProfile',
 * );
 * ```
 */
export class ProfileNotFoundError extends ValidatorError {
  override readonly name = 'ProfileNotFoundError';

  /** The canonical URL of the profile that could not be found. */
  readonly profileUrl: string;

  constructor(profileUrl: string, cause?: Error) {
    super(
      `Profile not found: ${profileUrl}`,
      cause ? { cause } : undefined,
    );
    this.profileUrl = profileUrl;
  }
}

// =============================================================================
// Section 3: ValidationFailedError
// =============================================================================

/**
 * Thrown when validation fails and {@link ValidationOptions.failFast} is enabled.
 *
 * Contains the issues accumulated up to the point of failure. This allows
 * callers to inspect the first error(s) that triggered the failure.
 *
 * @example
 * ```typescript
 * try {
 *   await validator.validate(resource, { failFast: true });
 * } catch (err) {
 *   if (err instanceof ValidationFailedError) {
 *     console.error('First error:', err.issues[0].message);
 *   }
 * }
 * ```
 */
export class ValidationFailedError extends ValidatorError {
  override readonly name = 'ValidationFailedError';

  /** The validation issues accumulated before failure. */
  readonly issues: readonly ValidationIssue[];

  constructor(message: string, issues: readonly ValidationIssue[], cause?: Error) {
    super(
      message,
      cause ? { cause } : undefined,
    );
    this.issues = issues;
  }
}
