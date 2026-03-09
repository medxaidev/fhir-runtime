/**
 * fhir-terminology — Binding Strength Validation Strategy
 *
 * Maps FHIR binding strength levels to validation behavior:
 * - required → error if code not in ValueSet
 * - extensible → warning if code not in ValueSet
 * - preferred → information if code not in ValueSet
 * - example → skip (no validation)
 *
 * @module fhir-terminology
 */

import type { BindingStrength } from '../model/index.js';

// =============================================================================
// Public API
// =============================================================================

/**
 * Determine the issue severity for a binding strength when the code
 * is NOT in the ValueSet.
 *
 * @returns The severity, or `undefined` if validation should be skipped.
 */
export function severityForBindingStrength(
  strength: BindingStrength,
): 'error' | 'warning' | 'information' | undefined {
  switch (strength) {
    case 'required':
      return 'error';
    case 'extensible':
      return 'warning';
    case 'preferred':
      return 'information';
    case 'example':
      return undefined; // skip
    default:
      return undefined;
  }
}

/**
 * Determine the issue severity when no TerminologyProvider is available.
 *
 * - required → warning (can't verify, but should be reported)
 * - extensible → information
 * - preferred / example → undefined (skip)
 */
export function severityWhenNoProvider(
  strength: BindingStrength,
): 'warning' | 'information' | undefined {
  switch (strength) {
    case 'required':
      return 'warning';
    case 'extensible':
      return 'information';
    default:
      return undefined;
  }
}

/**
 * Whether a given binding strength requires terminology validation.
 *
 * `example` bindings never require validation.
 */
export function requiresValidation(strength: BindingStrength): boolean {
  return strength !== 'example';
}

/**
 * Human-readable description of a binding strength.
 */
export function bindingStrengthDescription(strength: BindingStrength): string {
  switch (strength) {
    case 'required':
      return 'To be conformant, the concept in this element SHALL be from the specified value set.';
    case 'extensible':
      return 'To be conformant, the concept in this element SHALL be from the specified value set if any of the codes within the value set can apply to the concept being communicated.';
    case 'preferred':
      return 'Instances are encouraged to draw from the specified codes for interoperability purposes but are not required to do so.';
    case 'example':
      return 'Instances are not expected or even encouraged to draw from the specified value set.';
    default:
      return 'Unknown binding strength.';
  }
}
