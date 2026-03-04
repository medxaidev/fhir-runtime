/**
 * fhir-validator — Path Extractor
 *
 * Extracts values from FHIR resource instances using element paths.
 * Handles nested objects, arrays, and choice type (`[x]`) paths.
 *
 * This is the core utility that bridges CanonicalProfile element paths
 * (e.g., `Patient.name.family`) to actual values in a resource JSON object.
 *
 * @module fhir-validator
 */

// =============================================================================
// Section 1: Constants
// =============================================================================

/**
 * Known FHIR type suffixes for choice type resolution.
 *
 * When encountering a `[x]` path like `Observation.value[x]`, the extractor
 * checks for concrete properties like `valueString`, `valueQuantity`, etc.
 * Suffixes are capitalized per FHIR JSON serialization rules.
 */
const CHOICE_TYPE_SUFFIXES: readonly string[] = [
  // Primitive types
  'Boolean',
  'Integer',
  'Decimal',
  'String',
  'Uri',
  'Url',
  'Canonical',
  'Base64Binary',
  'Instant',
  'Date',
  'DateTime',
  'Time',
  'Code',
  'Oid',
  'Id',
  'Markdown',
  'UnsignedInt',
  'PositiveInt',
  'Uuid',
  // Complex types
  'Address',
  'Age',
  'Annotation',
  'Attachment',
  'CodeableConcept',
  'Coding',
  'ContactPoint',
  'Count',
  'Distance',
  'Duration',
  'HumanName',
  'Identifier',
  'Money',
  'Period',
  'Quantity',
  'Range',
  'Ratio',
  'Reference',
  'SampledData',
  'Signature',
  'Timing',
  'ContactDetail',
  'Contributor',
  'DataRequirement',
  'Expression',
  'ParameterDefinition',
  'RelatedArtifact',
  'TriggerDefinition',
  'UsageContext',
  'Dosage',
  'Meta',
];

// =============================================================================
// Section 2: extractValues
// =============================================================================

/**
 * Extract values from a resource instance using an element path.
 *
 * Navigates the resource object following the dot-separated path segments.
 * Arrays are automatically expanded — if an intermediate node is an array,
 * extraction continues into each element.
 *
 * @param resource - The resource object to extract from.
 * @param path - Element path (e.g., `'Patient.name.family'`).
 * @returns Array of extracted values (empty if path not found).
 *
 * @example
 * ```typescript
 * const patient = {
 *   resourceType: 'Patient',
 *   name: [
 *     { family: 'Smith', given: ['John', 'James'] },
 *     { family: 'Doe' },
 *   ],
 * };
 *
 * extractValues(patient, 'Patient.name')
 * // → [{ family: 'Smith', given: ['John', 'James'] }, { family: 'Doe' }]
 *
 * extractValues(patient, 'Patient.name.family')
 * // → ['Smith', 'Doe']
 *
 * extractValues(patient, 'Patient.name.given')
 * // → ['John', 'James']
 * ```
 */
export function extractValues(
  resource: Record<string, unknown>,
  path: string,
): unknown[] {
  if (!resource || typeof resource !== 'object') {
    return [];
  }

  const segments = path.split('.');

  // First segment is the resource type (e.g., 'Patient')
  // If the path is just the resource type, return the resource itself
  if (segments.length === 0) {
    return [];
  }

  if (segments.length === 1) {
    // Root path — return the resource itself if type matches
    if (resource.resourceType === segments[0] || segments[0] === '') {
      return [resource];
    }
    return [];
  }

  // Skip the first segment (resource type) and navigate from there
  const propertySegments = segments.slice(1);
  return extractFromNode(resource, propertySegments, 0);
}

/**
 * Recursively extract values from a node following path segments.
 *
 * @internal
 */
function extractFromNode(
  node: unknown,
  segments: string[],
  index: number,
): unknown[] {
  // If we've consumed all segments, return the current node (including null)
  if (index >= segments.length) {
    return [node];
  }

  // Cannot traverse further into null/undefined
  if (node === null || node === undefined) {
    return [];
  }

  // If current node is an array, recurse into each element
  if (Array.isArray(node)) {
    const results: unknown[] = [];
    for (const item of node) {
      results.push(...extractFromNode(item, segments, index));
    }
    return results;
  }

  // Current node must be an object
  if (typeof node !== 'object') {
    return [];
  }

  const obj = node as Record<string, unknown>;
  const segment = segments[index];

  // Check for choice type path (ends with [x])
  if (segment.endsWith('[x]')) {
    return extractChoiceTypeValues(obj, segments, index);
  }

  // Standard property lookup
  const value = obj[segment];

  if (value === undefined) {
    return [];
  }

  // If value is an array and we have more segments, expand into each element
  if (Array.isArray(value) && index < segments.length - 1) {
    const results: unknown[] = [];
    for (const item of value) {
      results.push(...extractFromNode(item, segments, index + 1));
    }
    return results;
  }

  // If value is an array and this is the last segment, return all elements
  if (Array.isArray(value) && index === segments.length - 1) {
    return value;
  }

  // Continue recursion
  return extractFromNode(value, segments, index + 1);
}

/**
 * Extract values for a choice type path segment (e.g., `value[x]`).
 *
 * Searches the object for any concrete property matching the choice base
 * with a known type suffix (e.g., `valueString`, `valueQuantity`).
 *
 * @internal
 */
function extractChoiceTypeValues(
  obj: Record<string, unknown>,
  segments: string[],
  index: number,
): unknown[] {
  const segment = segments[index];
  const baseName = segment.slice(0, -3); // Remove '[x]'

  // Try each known suffix
  for (const suffix of CHOICE_TYPE_SUFFIXES) {
    const concreteKey = baseName + suffix;
    if (concreteKey in obj) {
      const value = obj[concreteKey];
      return extractFromNode(value, segments, index + 1);
    }
  }

  // Fallback: scan object keys for any property starting with baseName
  // followed by an uppercase letter (handles custom/unknown types)
  for (const key of Object.keys(obj)) {
    if (
      key.startsWith(baseName) &&
      key.length > baseName.length &&
      key[baseName.length] >= 'A' &&
      key[baseName.length] <= 'Z'
    ) {
      const value = obj[key];
      return extractFromNode(value, segments, index + 1);
    }
  }

  return [];
}

// =============================================================================
// Section 3: pathExists
// =============================================================================

/**
 * Check if a path exists in the resource (even if value is null/undefined).
 *
 * Unlike `extractValues`, this checks for property existence rather than
 * value presence. A property set to `null` or `undefined` still "exists".
 *
 * @param resource - The resource object to check.
 * @param path - Element path (e.g., `'Patient.name'`).
 * @returns `true` if the path exists in the resource.
 *
 * @example
 * ```typescript
 * pathExists({ resourceType: 'Patient', name: [] }, 'Patient.name')
 * // → true
 *
 * pathExists({ resourceType: 'Patient' }, 'Patient.name')
 * // → false
 * ```
 */
export function pathExists(
  resource: Record<string, unknown>,
  path: string,
): boolean {
  if (!resource || typeof resource !== 'object') {
    return false;
  }

  const segments = path.split('.');

  if (segments.length <= 1) {
    return true; // Root path always exists
  }

  const propertySegments = segments.slice(1);
  return propertyExistsInNode(resource, propertySegments, 0);
}

/**
 * Recursively check if a property exists in a node.
 *
 * @internal
 */
function propertyExistsInNode(
  node: unknown,
  segments: string[],
  index: number,
): boolean {
  if (node === null || node === undefined) {
    return false;
  }

  if (index >= segments.length) {
    return true;
  }

  // If current node is an array, check any element
  if (Array.isArray(node)) {
    return node.some((item) => propertyExistsInNode(item, segments, index));
  }

  if (typeof node !== 'object') {
    return false;
  }

  const obj = node as Record<string, unknown>;
  const segment = segments[index];

  // Choice type
  if (segment.endsWith('[x]')) {
    const baseName = segment.slice(0, -3);
    for (const key of Object.keys(obj)) {
      if (
        key.startsWith(baseName) &&
        key.length > baseName.length &&
        key[baseName.length] >= 'A' &&
        key[baseName.length] <= 'Z'
      ) {
        return propertyExistsInNode(obj[key], segments, index + 1);
      }
    }
    return false;
  }

  // Standard property
  if (!(segment in obj)) {
    return false;
  }

  const value = obj[segment];

  // If value is an array, check within elements
  if (Array.isArray(value)) {
    if (index === segments.length - 1) {
      return true; // The array property itself exists
    }
    return value.some((item) => propertyExistsInNode(item, segments, index + 1));
  }

  return propertyExistsInNode(value, segments, index + 1);
}

// =============================================================================
// Section 4: findChoiceTypeField
// =============================================================================

/**
 * Find the concrete choice type property name in an object.
 *
 * Given a choice base name (e.g., `'value'`), searches the object for
 * a property like `valueString`, `valueQuantity`, etc.
 *
 * @param obj - The object to search.
 * @param baseName - The choice type base name (without `[x]`).
 * @returns The concrete property name, or `undefined` if not found.
 *
 * @example
 * ```typescript
 * findChoiceTypeField({ valueQuantity: { value: 120 } }, 'value')
 * // → 'valueQuantity'
 *
 * findChoiceTypeField({ code: '12345' }, 'value')
 * // → undefined
 * ```
 */
export function findChoiceTypeField(
  obj: Record<string, unknown>,
  baseName: string,
): string | undefined {
  // Try known suffixes first (fast path)
  for (const suffix of CHOICE_TYPE_SUFFIXES) {
    const key = baseName + suffix;
    if (key in obj) {
      return key;
    }
  }

  // Fallback: scan keys
  for (const key of Object.keys(obj)) {
    if (
      key.startsWith(baseName) &&
      key.length > baseName.length &&
      key[baseName.length] >= 'A' &&
      key[baseName.length] <= 'Z'
    ) {
      return key;
    }
  }

  return undefined;
}

// =============================================================================
// Section 5: normalizeChoicePath
// =============================================================================

/**
 * Normalize a choice type path to a concrete path.
 *
 * Replaces the `[x]` suffix with the actual type suffix found in the object.
 *
 * @param basePath - The choice type path (e.g., `'Observation.value[x]'`).
 * @param concreteField - The concrete field name (e.g., `'valueQuantity'`).
 * @returns The normalized path (e.g., `'Observation.valueQuantity'`).
 *
 * @example
 * ```typescript
 * normalizeChoicePath('Observation.value[x]', 'valueQuantity')
 * // → 'Observation.valueQuantity'
 *
 * normalizeChoicePath('Extension.value[x]', 'valueString')
 * // → 'Extension.valueString'
 * ```
 */
export function normalizeChoicePath(
  basePath: string,
  concreteField: string,
): string {
  if (!basePath.endsWith('[x]')) {
    return basePath;
  }

  // Replace the last segment (which ends with [x]) with the concrete field
  const lastDot = basePath.lastIndexOf('.');
  if (lastDot === -1) {
    return concreteField;
  }

  return basePath.slice(0, lastDot + 1) + concreteField;
}

// =============================================================================
// Section 6: extractChoiceTypeSuffix
// =============================================================================

/**
 * Extract the type suffix from a concrete choice type property name.
 *
 * @param concreteField - The concrete field name (e.g., `'valueQuantity'`).
 * @param baseName - The choice type base name (e.g., `'value'`).
 * @returns The type suffix (e.g., `'Quantity'`), or `undefined` if not a match.
 *
 * @example
 * ```typescript
 * extractChoiceTypeSuffix('valueQuantity', 'value')
 * // → 'Quantity'
 *
 * extractChoiceTypeSuffix('valueString', 'value')
 * // → 'String'
 *
 * extractChoiceTypeSuffix('code', 'value')
 * // → undefined
 * ```
 */
export function extractChoiceTypeSuffix(
  concreteField: string,
  baseName: string,
): string | undefined {
  if (!concreteField.startsWith(baseName)) {
    return undefined;
  }

  if (concreteField.length <= baseName.length) {
    return undefined;
  }

  const suffix = concreteField.slice(baseName.length);
  if (suffix[0] >= 'A' && suffix[0] <= 'Z') {
    return suffix;
  }

  return undefined;
}
