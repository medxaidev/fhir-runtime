/**
 * fhir-profile — Error Types
 *
 * Structured error hierarchy for the FHIR profile module.
 * All errors extend {@link ProfileError} so consumers can catch
 * profile-related failures with a single `catch` clause.
 *
 * Error hierarchy:
 * ```
 * ProfileError (base)
 * ├── SnapshotCircularDependencyError
 * ├── BaseNotFoundError
 * ├── ConstraintViolationError
 * └── UnconsumedDifferentialError
 * ```
 *
 * @module fhir-profile
 */

// =============================================================================
// Section 1: Base Error
// =============================================================================

/**
 * Base error class for all fhir-profile failures.
 *
 * Provides a stable `name` property and preserves the original `cause`
 * when wrapping lower-level errors.
 *
 * @example
 * ```typescript
 * try {
 *   await generator.generate(sd);
 * } catch (err) {
 *   if (err instanceof ProfileError) {
 *     // Handle any profile-related error
 *   }
 * }
 * ```
 */
export class ProfileError extends Error {
  override readonly name: string = 'ProfileError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    // Restore prototype chain (required for `instanceof` after transpilation)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// =============================================================================
// Section 2: SnapshotCircularDependencyError
// =============================================================================

/**
 * Thrown when snapshot generation detects a circular dependency in the
 * profile chain.
 *
 * This occurs when profile A's base chain eventually references A again,
 * which would cause infinite recursion during snapshot generation.
 * HAPI detects this via a `snapshotStack` of URLs currently being generated.
 *
 * @example
 * ```typescript
 * throw new SnapshotCircularDependencyError(
 *   'http://example.org/ProfileA',
 *   [
 *     'http://example.org/ProfileA',
 *     'http://example.org/ProfileB',
 *     'http://example.org/ProfileA', // cycle back
 *   ]
 * );
 * ```
 */
export class SnapshotCircularDependencyError extends ProfileError {
  override readonly name = 'SnapshotCircularDependencyError';

  /** The canonical URL of the profile that triggered the cycle. */
  readonly url: string;

  /** The full chain of URLs forming the cycle. */
  readonly chain: readonly string[];

  constructor(url: string, chain: string[]) {
    const display = chain.join(' → ');
    super(`Circular snapshot dependency detected for ${url}: ${display}`);
    this.url = url;
    this.chain = chain;
  }
}

// =============================================================================
// Section 3: BaseNotFoundError
// =============================================================================

/**
 * Thrown when the base StructureDefinition required for snapshot generation
 * cannot be loaded from any source.
 *
 * This is a fatal error — snapshot generation cannot proceed without the
 * base profile's snapshot to merge against.
 *
 * @example
 * ```typescript
 * throw new BaseNotFoundError(
 *   'http://hl7.org/fhir/StructureDefinition/Patient',
 *   'http://hl7.org/fhir/StructureDefinition/UnknownBase'
 * );
 * ```
 */
export class BaseNotFoundError extends ProfileError {
  override readonly name = 'BaseNotFoundError';

  /** The canonical URL of the derived profile being generated. */
  readonly derivedUrl: string;

  /** The canonical URL of the base that could not be found. */
  readonly baseUrl: string;

  constructor(derivedUrl: string, baseUrl: string, cause?: Error) {
    super(
      `Base StructureDefinition not found for ${derivedUrl}: ${baseUrl}`,
      cause ? { cause } : undefined,
    );
    this.derivedUrl = derivedUrl;
    this.baseUrl = baseUrl;
  }
}

// =============================================================================
// Section 4: ConstraintViolationError
// =============================================================================

/**
 * Thrown when constraint merging detects an illegal tightening or
 * incompatible constraint.
 *
 * This covers violations such as:
 * - Cardinality loosening (`derived.min < base.min`)
 * - Cardinality widening (`derived.max > base.max`)
 * - Type expansion (derived types not a subset of base types)
 * - Binding relaxation (relaxing a REQUIRED binding)
 *
 * Only thrown when {@link SnapshotGeneratorOptions.throwOnError} is `true`.
 * Otherwise, violations are recorded as issues in the result.
 *
 * @example
 * ```typescript
 * throw new ConstraintViolationError(
 *   'CARDINALITY_VIOLATION',
 *   'Patient.identifier',
 *   'Derived min (0) is less than base min (1)'
 * );
 * ```
 */
export class ConstraintViolationError extends ProfileError {
  override readonly name = 'ConstraintViolationError';

  /** The type of constraint violation. */
  readonly violationType: string;

  /** The element path where the violation occurred. */
  readonly path: string;

  constructor(violationType: string, path: string, message: string) {
    super(`Constraint violation at ${path}: ${message}`);
    this.violationType = violationType;
    this.path = path;
  }
}

// =============================================================================
// Section 5: UnconsumedDifferentialError
// =============================================================================

/**
 * Thrown when differential elements remain unconsumed after snapshot
 * generation completes.
 *
 * This indicates that the algorithm could not find a matching base
 * element for one or more differential entries. Common causes:
 * - Incorrect path in differential
 * - Slicing mismatch
 * - Unsupported constraint pattern
 *
 * HAPI detects this via the `GENERATED_IN_SNAPSHOT` marker pattern.
 *
 * Only thrown when {@link SnapshotGeneratorOptions.throwOnError} is `true`.
 * Otherwise, each unconsumed element is recorded as an issue.
 *
 * @example
 * ```typescript
 * throw new UnconsumedDifferentialError([
 *   'Patient.nonExistentField',
 *   'Patient.identifier:BadSlice',
 * ]);
 * ```
 */
export class UnconsumedDifferentialError extends ProfileError {
  override readonly name = 'UnconsumedDifferentialError';

  /** Paths of the unconsumed differential elements. */
  readonly unconsumedPaths: readonly string[];

  constructor(unconsumedPaths: string[]) {
    const count = unconsumedPaths.length;
    const pathList = unconsumedPaths.slice(0, 5).join(', ');
    const suffix = count > 5 ? `, ... (${count} total)` : '';
    super(
      `${count} differential element(s) not consumed during snapshot generation: ${pathList}${suffix}`,
    );
    this.unconsumedPaths = unconsumedPaths;
  }
}
