/**
 * fhir-provider — NoOp Reference Resolver
 *
 * Default implementation of {@link ReferenceResolver} that treats all
 * references as existing without performing any actual resolution.
 * This allows the runtime to function standalone without a FHIR server
 * or resource store.
 *
 * Behavior:
 * - `resolve()` → always returns `undefined` (no resource available)
 * - `exists()` → always returns `true` (assume reference target exists)
 *
 * @module fhir-provider
 */

import type { Resource } from '../model/index.js';
import type { ReferenceResolver } from './types.js';

/**
 * A no-operation reference resolver that assumes all references exist.
 *
 * Use this as a default resolver when no resource store is available.
 * All references are assumed to exist, but no actual resources are returned.
 *
 * @example
 * ```typescript
 * const resolver = new NoOpReferenceResolver();
 * const exists = await resolver.exists('Patient/123');
 * console.log(exists); // true
 *
 * const resource = await resolver.resolve('Patient/123');
 * console.log(resource); // undefined
 * ```
 */
export class NoOpReferenceResolver implements ReferenceResolver {
  /**
   * Always returns `undefined`.
   *
   * No actual reference resolution is performed.
   */
  async resolve(_reference: string): Promise<Resource | undefined> {
    return undefined;
  }

  /**
   * Always returns `true`.
   *
   * Assumes all reference targets exist without checking.
   */
  async exists(_reference: string): Promise<boolean> {
    return true;
  }
}
