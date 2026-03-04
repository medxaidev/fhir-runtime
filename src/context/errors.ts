/**
 * fhir-context — Error Types
 *
 * Structured error hierarchy for the FHIR context module.
 * All errors extend {@link ContextError} so consumers can catch
 * context-related failures with a single `catch` clause.
 *
 * Error hierarchy:
 * ```
 * ContextError (base)
 * ├── ResourceNotFoundError
 * ├── CircularDependencyError
 * ├── LoaderError
 * └── InvalidStructureDefinitionError
 * ```
 *
 * @module fhir-context
 */

// =============================================================================
// Section 1: Base Error
// =============================================================================

/**
 * Base error class for all fhir-context failures.
 *
 * Provides a stable `name` property and preserves the original `cause`
 * when wrapping lower-level errors.
 */
export class ContextError extends Error {
  override readonly name: string = 'ContextError';

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    // Restore prototype chain (required for `instanceof` after transpilation)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// =============================================================================
// Section 2: ResourceNotFoundError
// =============================================================================

/**
 * Thrown when a StructureDefinition cannot be resolved by any loader.
 *
 * @example
 * ```typescript
 * throw new ResourceNotFoundError(
 *   'http://hl7.org/fhir/StructureDefinition/UnknownType',
 *   ['memory', 'filesystem']
 * );
 * ```
 */
export class ResourceNotFoundError extends ContextError {
  override readonly name = 'ResourceNotFoundError';

  /** The canonical URL that could not be resolved */
  readonly url: string;

  /** Loader source types that were tried */
  readonly triedSources: readonly string[];

  constructor(url: string, triedSources: string[] = []) {
    const sourcesMsg =
      triedSources.length > 0
        ? ` (tried: ${triedSources.join(', ')})`
        : '';
    super(`StructureDefinition not found: ${url}${sourcesMsg}`);
    this.url = url;
    this.triedSources = triedSources;
  }
}

// =============================================================================
// Section 3: CircularDependencyError
// =============================================================================

/**
 * Thrown when a circular `baseDefinition` chain is detected during
 * inheritance resolution.
 *
 * @example
 * ```typescript
 * throw new CircularDependencyError([
 *   'http://example.org/A',
 *   'http://example.org/B',
 *   'http://example.org/A',  // cycle back to A
 * ]);
 * ```
 */
export class CircularDependencyError extends ContextError {
  override readonly name = 'CircularDependencyError';

  /** The full chain of URLs that forms the cycle */
  readonly chain: readonly string[];

  constructor(chain: string[]) {
    const display = chain.join(' → ');
    super(`Circular dependency detected: ${display}`);
    this.chain = chain;
  }
}

// =============================================================================
// Section 4: LoaderError
// =============================================================================

/**
 * Thrown when a {@link StructureDefinitionLoader} encounters an I/O
 * or parse failure while loading a definition.
 *
 * The original error is preserved as `cause` for debugging.
 *
 * @example
 * ```typescript
 * throw new LoaderError(
 *   'http://hl7.org/fhir/StructureDefinition/Patient',
 *   'filesystem',
 *   originalError
 * );
 * ```
 */
export class LoaderError extends ContextError {
  override readonly name = 'LoaderError';

  /** The canonical URL being loaded when the error occurred */
  readonly url: string;

  /** The loader source type that failed */
  readonly sourceType: string;

  constructor(url: string, sourceType: string, cause?: Error) {
    super(
      `Loader '${sourceType}' failed to load ${url}: ${cause?.message ?? 'unknown error'}`,
      cause ? { cause } : undefined,
    );
    this.url = url;
    this.sourceType = sourceType;
  }
}

// =============================================================================
// Section 5: InvalidStructureDefinitionError
// =============================================================================

/**
 * Thrown when a loaded or registered StructureDefinition is missing
 * required fields or has invalid structure.
 *
 * Required fields for a valid StructureDefinition:
 * - `url` — canonical URL
 * - `name` — computer-friendly name
 * - `status` — publication status
 * - `kind` — resource | complex-type | primitive-type | logical
 *
 * @example
 * ```typescript
 * throw new InvalidStructureDefinitionError(
 *   'Missing required field: url',
 *   'http://example.org/MyProfile'
 * );
 * ```
 */
export class InvalidStructureDefinitionError extends ContextError {
  override readonly name = 'InvalidStructureDefinitionError';

  /** The URL of the invalid definition (if available) */
  readonly url: string | undefined;

  constructor(reason: string, url?: string) {
    const urlMsg = url ? ` (${url})` : '';
    super(`Invalid StructureDefinition${urlMsg}: ${reason}`);
    this.url = url;
  }
}
