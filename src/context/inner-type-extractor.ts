/**
 * fhir-context — InnerType Extractor
 *
 * Extracts inner types (BackboneElement sub-types) from a {@link CanonicalProfile}.
 * These inner types represent nested complex structures within a FHIR resource,
 * such as `Patient.contact` → `PatientContact`.
 *
 * Inspired by Medplum's `StructureDefinitionParser.enterInnerType()` and
 * `buildTypeName()` from `@medplum/core/src/typeschema/types.ts`.
 *
 * ## Algorithm
 *
 * 1. Traverse all elements in the profile's `elements` Map
 * 2. Identify elements whose `types` include `BackboneElement` or `Element`
 * 3. For each such element, collect all direct child elements (path prefix match)
 * 4. Build a new `CanonicalProfile` for the inner type with a generated name
 *
 * ## Naming Convention
 *
 * Path segments are PascalCase-joined:
 * - `Patient.contact` → `PatientContact`
 * - `Bundle.entry.request` → `BundleEntryRequest`
 * - `Observation.component` → `ObservationComponent`
 *
 * @module fhir-context
 */

import type { CanonicalProfile, CanonicalElement } from '../model/canonical-profile.js';

// =============================================================================
// Section 1: buildTypeName
// =============================================================================

/**
 * Build a PascalCase type name from path segments.
 *
 * @param components - Path segments (e.g., `['Patient', 'contact']`)
 * @returns PascalCase type name (e.g., `'PatientContact'`)
 *
 * @example
 * ```typescript
 * buildTypeName(['Patient', 'contact'])  // → 'PatientContact'
 * buildTypeName(['Bundle', 'entry', 'request'])  // → 'BundleEntryRequest'
 * buildTypeName(['Patient'])  // → 'Patient'
 * ```
 */
export function buildTypeName(components: string[]): string {
  if (components.length === 1) {
    return components[0];
  }
  return components.map(capitalize).join('');
}

/**
 * Capitalize the first letter of a string.
 * @internal
 */
function capitalize(s: string): string {
  if (s.length === 0) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// =============================================================================
// Section 2: isBackboneElement
// =============================================================================

/**
 * Check if an element defines a BackboneElement or Element inner type.
 *
 * An element is an inner type root if:
 * - Its `types` array contains a type with `code === 'BackboneElement'` or `code === 'Element'`
 * - It is not the root element of the profile (path has at least one dot)
 *
 * @param element - The canonical element to check
 * @returns `true` if this element defines an inner type
 */
export function isBackboneElementType(element: CanonicalElement): boolean {
  return element.types.some(
    (t) => t.code === 'BackboneElement' || t.code === 'Element',
  );
}

// =============================================================================
// Section 3: extractInnerTypes
// =============================================================================

/**
 * Extract inner types from a CanonicalProfile.
 *
 * Scans the profile's elements for BackboneElement/Element types and creates
 * independent `CanonicalProfile` instances for each, containing only their
 * direct child elements.
 *
 * The returned Map is keyed by the generated type name (e.g., `'PatientContact'`).
 * Each inner type has its `parentType` set to the profile's type name.
 *
 * **Note:** This function also handles nested BackboneElements. For example,
 * if `Bundle.entry` is a BackboneElement containing `Bundle.entry.request`
 * (also a BackboneElement), both `BundleEntry` and `BundleEntryRequest` will
 * be extracted. `BundleEntryRequest` will have `parentType: 'BundleEntry'`.
 *
 * @param profile - The CanonicalProfile to extract inner types from
 * @returns Map of inner type name → CanonicalProfile
 *
 * @example
 * ```typescript
 * const innerTypes = extractInnerTypes(patientProfile);
 * // innerTypes.get('PatientContact')  → CanonicalProfile for Patient.contact
 * // innerTypes.get('PatientCommunication')  → CanonicalProfile for Patient.communication
 * // innerTypes.get('PatientLink')  → CanonicalProfile for Patient.link
 * ```
 */
export function extractInnerTypes(
  profile: CanonicalProfile,
): Map<string, CanonicalProfile> {
  const innerTypes = new Map<string, CanonicalProfile>();

  // Step 1: Identify all BackboneElement roots
  const backboneRoots: Array<{ path: string; typeName: string }> = [];

  for (const [path, element] of profile.elements) {
    // Skip root element
    if (!path.includes('.')) continue;

    if (isBackboneElementType(element)) {
      const segments = path.split('.');
      const typeName = buildTypeName(segments);
      backboneRoots.push({ path, typeName });
    }
  }

  // Step 2: For each backbone root, collect direct child elements
  for (const { path: rootPath, typeName } of backboneRoots) {
    const childElements = new Map<string, CanonicalElement>();
    const prefix = rootPath + '.';

    for (const [elementPath, element] of profile.elements) {
      // Must start with the root path + '.'
      if (!elementPath.startsWith(prefix)) continue;

      // Must be a DIRECT child — no further dots after the prefix
      const remainder = elementPath.substring(prefix.length);
      if (remainder.includes('.')) continue;

      childElements.set(elementPath, element);
    }

    // Determine parent type name
    const rootSegments = rootPath.split('.');
    let parentTypeName: string;
    if (rootSegments.length === 2) {
      // Direct child of resource (e.g., Patient.contact → parent is Patient)
      parentTypeName = rootSegments[0];
    } else {
      // Nested backbone (e.g., Bundle.entry.request → parent is BundleEntry)
      parentTypeName = buildTypeName(rootSegments.slice(0, -1));
    }

    const innerProfile: CanonicalProfile = {
      url: profile.url + '#' + typeName,
      name: typeName,
      kind: profile.kind,
      type: typeName,
      abstract: false,
      elements: childElements,
      parentType: parentTypeName,
    };

    innerTypes.set(typeName, innerProfile);
  }

  return innerTypes;
}
