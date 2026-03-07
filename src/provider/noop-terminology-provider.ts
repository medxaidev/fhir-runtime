/**
 * fhir-provider — NoOp Terminology Provider
 *
 * Default implementation of {@link TerminologyProvider} that accepts all
 * codes without performing any actual terminology validation. This allows
 * the runtime to function standalone without a terminology server.
 *
 * Behavior:
 * - `validateCode()` → always returns `{ result: true }`
 * - `expandValueSet()` → always returns empty expansion `{ contains: [] }`
 * - `lookupCode()` → always returns `{ found: false }`
 *
 * @module fhir-provider
 */

import type {
  TerminologyProvider,
  ValidateCodeParams,
  ValidateCodeResult,
  ExpandValueSetParams,
  ValueSetExpansion,
  LookupCodeParams,
  LookupCodeResult,
} from './types.js';

/**
 * A no-operation terminology provider that accepts all codes.
 *
 * Use this as a default provider when no terminology server is available.
 * All codes are considered valid, no ValueSet expansions are returned,
 * and code lookups always report "not found".
 *
 * @example
 * ```typescript
 * const provider = new NoOpTerminologyProvider();
 * const result = await provider.validateCode({ system: 'http://loinc.org', code: '12345-6' });
 * console.log(result.result); // true
 * ```
 */
export class NoOpTerminologyProvider implements TerminologyProvider {
  /**
   * Always returns `{ result: true }`.
   *
   * No actual code validation is performed.
   */
  async validateCode(_params: ValidateCodeParams): Promise<ValidateCodeResult> {
    return { result: true };
  }

  /**
   * Always returns an empty expansion `{ contains: [] }`.
   *
   * No actual ValueSet expansion is performed.
   */
  async expandValueSet(_params: ExpandValueSetParams): Promise<ValueSetExpansion> {
    return { contains: [] };
  }

  /**
   * Always returns `{ found: false }`.
   *
   * No actual code lookup is performed.
   */
  async lookupCode(_params: LookupCodeParams): Promise<LookupCodeResult> {
    return { found: false };
  }
}
