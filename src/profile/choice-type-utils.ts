/**
 * fhir-profile — Choice Type Utilities (STAGE-7)
 *
 * Provides functions for working with FHIR choice types (`[x]` elements).
 * Choice types allow a single element to have multiple possible data types,
 * e.g. `Observation.value[x]` can be `valueQuantity`, `valueString`, etc.
 *
 * @module fhir-profile
 */

import type { CanonicalElement } from '../model/index.js';

// =============================================================================
// Section 1: Detection
// =============================================================================

/**
 * Check if an element is a choice type (path ends with `[x]` and has >1 type).
 *
 * @param element - The canonical element to check.
 * @returns true if the element is a choice type.
 */
export function isChoiceType(element: CanonicalElement): boolean {
  return element.path.endsWith('[x]') && element.types.length > 1;
}

// =============================================================================
// Section 2: Path Utilities
// =============================================================================

/**
 * Get the base name from a choice element path.
 *
 * @example getChoiceBaseName("Observation.value[x]") → "value"
 * @example getChoiceBaseName("MedicationRequest.medication[x]") → "medication"
 *
 * @param elementPath - The full element path ending with `[x]`.
 * @returns The base name without `[x]`.
 */
export function getChoiceBaseName(elementPath: string): string {
  const name = elementPath.split('.').pop() ?? '';
  return name.replace('[x]', '');
}

/**
 * Build the concrete JSON key for a choice type variant.
 *
 * @example buildChoiceJsonKey("value", "Quantity") → "valueQuantity"
 * @example buildChoiceJsonKey("onset", "DateTime") → "onsetDateTime"
 *
 * @param baseName - The base name (e.g. "value").
 * @param typeCode - The FHIR type code (e.g. "Quantity").
 * @returns The JSON key (e.g. "valueQuantity").
 */
export function buildChoiceJsonKey(baseName: string, typeCode: string): string {
  return baseName + typeCode.charAt(0).toUpperCase() + typeCode.slice(1);
}

/**
 * Parse a JSON key back to extract the type code.
 *
 * @example parseChoiceJsonKey("valueQuantity", "value") → "Quantity"
 * @example parseChoiceJsonKey("onsetDateTime", "onset") → "DateTime"
 * @example parseChoiceJsonKey("status", "value") → null
 *
 * @param jsonKey - The concrete JSON key found in the resource.
 * @param baseName - The choice type base name.
 * @returns The type code, or null if the key doesn't match.
 */
export function parseChoiceJsonKey(jsonKey: string, baseName: string): string | null {
  if (!jsonKey.startsWith(baseName)) return null;
  const rest = jsonKey.slice(baseName.length);
  if (rest.length === 0) return null;
  if (rest[0] !== rest[0].toUpperCase()) return null;
  return rest;
}

// =============================================================================
// Section 3: Resolution
// =============================================================================

/**
 * Result of resolving a choice type against a resource.
 */
export interface ChoiceTypeResolution {
  /** Base name without [x], e.g. "value" */
  baseName: string;
  /** All available type codes from the element definition */
  availableTypes: string[];
  /** The currently active type code, or null if not set */
  activeType: string | null;
  /** The concrete JSON key for the active type, or null */
  activeJsonKey: string | null;
}

/**
 * Resolve which choice type variant is active in a resource.
 *
 * Scans the resource's keys to find which concrete `value[x]` variant exists.
 *
 * @param element - The choice type element definition.
 * @param resource - The resource object to inspect.
 * @returns Resolution result with active type info.
 */
export function resolveActiveChoiceType(
  element: CanonicalElement,
  resource: Record<string, unknown>,
): ChoiceTypeResolution {
  const baseName = getChoiceBaseName(element.path);
  const availableTypes = element.types.map((t) => t.code);

  let activeType: string | null = null;
  let activeJsonKey: string | null = null;

  for (const typeCode of availableTypes) {
    const jsonKey = buildChoiceJsonKey(baseName, typeCode);
    if (jsonKey in resource) {
      activeType = typeCode;
      activeJsonKey = jsonKey;
      break;
    }
  }

  return { baseName, availableTypes, activeType, activeJsonKey };
}

/**
 * Resolve a choice type element from a JSON key found in the resource.
 *
 * Scans all `[x]` elements in the profile's element map to find the
 * matching choice element and type code.
 *
 * @param jsonKey - The concrete JSON key (e.g. "valueQuantity").
 * @param elements - The profile's element map.
 * @returns The matching element and type code, or null.
 */
export function resolveChoiceFromJsonKey(
  jsonKey: string,
  elements: Map<string, CanonicalElement>,
): { element: CanonicalElement; typeCode: string } | null {
  for (const [path, el] of elements) {
    if (!path.endsWith('[x]')) continue;
    const baseName = getChoiceBaseName(path);
    const typeCode = parseChoiceJsonKey(jsonKey, baseName);
    if (typeCode) {
      // FHIR JSON capitalizes the first letter in the key (e.g. valueString → 'String'),
      // but primitive type codes are lowercase ('string'). Compare case-insensitively.
      const matched = el.types.find(
        (t) => t.code === typeCode || t.code === typeCode.charAt(0).toLowerCase() + typeCode.slice(1),
      );
      if (matched) {
        return { element: el, typeCode: matched.code };
      }
    }
  }
  return null;
}
