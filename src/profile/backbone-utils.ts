/**
 * fhir-profile — BackboneElement Utilities (STAGE-7)
 *
 * Provides functions for working with FHIR BackboneElement types
 * and array elements within CanonicalProfiles.
 *
 * @module fhir-profile
 */

import type { CanonicalElement, CanonicalProfile } from '../model/index.js';

// =============================================================================
// Section 1: Detection
// =============================================================================

/**
 * Check if an element is a BackboneElement (has nested children in SD).
 *
 * A BackboneElement is identified by either having no type codes
 * (its structure is defined by child elements) or having an explicit
 * `BackboneElement` type code.
 *
 * @param element - The canonical element to check.
 * @returns true if the element is a BackboneElement.
 */
export function isBackboneElement(element: CanonicalElement): boolean {
  return element.types.length === 0 || element.types.some((t) => t.code === 'BackboneElement');
}

/**
 * Check if an element allows multiple values (is an array element).
 *
 * @param element - The canonical element to check.
 * @returns true if max > 1 or max is unbounded.
 */
export function isArrayElement(element: CanonicalElement): boolean {
  return element.max === 'unbounded' || (typeof element.max === 'number' && element.max > 1);
}

// =============================================================================
// Section 2: Children
// =============================================================================

/**
 * Get the direct children of a BackboneElement from a profile.
 *
 * Returns only direct children (one level deep), filtering out
 * the standard infrastructure elements: `id`, `extension`, `modifierExtension`.
 *
 * @param parentPath - The parent element path (e.g. "Patient.contact").
 * @param profile - The canonical profile containing all elements.
 * @returns Array of direct child CanonicalElements.
 */
export function getBackboneChildren(
  parentPath: string,
  profile: CanonicalProfile,
): CanonicalElement[] {
  const prefix = parentPath + '.';
  const skipSuffixes = new Set(['id', 'extension', 'modifierExtension']);
  const result: CanonicalElement[] = [];

  for (const [path, el] of profile.elements) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length);
    if (rest.includes('.')) continue; // only direct children
    if (skipSuffixes.has(rest)) continue;
    result.push(el);
  }

  return result;
}
