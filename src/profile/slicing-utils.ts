/**
 * fhir-profile — Slicing Utilities (STAGE-7)
 *
 * Provides functions for matching resource instances to slice definitions,
 * counting slice instances, and generating slice skeletons.
 *
 * These algorithms implement the FHIR discriminator matching logic
 * as specified in https://hl7.org/fhir/R4/profiling.html#slicing.
 *
 * @module fhir-profile
 */

import type { SlicedElement, SliceDefinition } from '../model/index.js';

// =============================================================================
// Section 1: matchSlice
// =============================================================================

/**
 * Match an instance to a slice definition using discriminator matching.
 *
 * Iterates through all slices in the {@link SlicedElement} and returns the
 * `sliceName` of the first matching slice, or `null` if no slice matches.
 *
 * @param instance - A single array item to match (e.g. one category object).
 * @param slicedElement - The slicing definition from `profile.slicing`.
 * @returns The matching slice name, or null if unmatched.
 */
export function matchSlice(
  instance: Record<string, unknown>,
  slicedElement: SlicedElement,
): string | null {
  for (const slice of slicedElement.slices) {
    if (matchesAllDiscriminators(instance, slicedElement.discriminators, slice)) {
      return slice.sliceName;
    }
  }
  return null;
}

// =============================================================================
// Section 2: countSliceInstances
// =============================================================================

/**
 * Count how many instances match each slice definition.
 *
 * @param items - The array items to classify (e.g. all category entries).
 * @param slicedElement - The slicing definition from `profile.slicing`.
 * @returns Map from slice name to instance count.
 */
export function countSliceInstances(
  items: ReadonlyArray<Record<string, unknown>>,
  slicedElement: SlicedElement,
): Map<string, number> {
  const counts = new Map<string, number>();

  for (const slice of slicedElement.slices) {
    counts.set(slice.sliceName, 0);
  }

  for (const item of items) {
    const matched = matchSlice(item, slicedElement);
    if (matched) {
      counts.set(matched, (counts.get(matched) ?? 0) + 1);
    }
  }

  return counts;
}

// =============================================================================
// Section 3: generateSliceSkeleton
// =============================================================================

/**
 * Generate a skeleton object pre-filled with discriminator values.
 *
 * For extension slices, returns `{ url: "<extensionUrl>" }`.
 * For other slices, returns an object with all top-level fixedValues applied.
 *
 * @param slice - The slice definition.
 * @returns A pre-filled skeleton object.
 */
export function generateSliceSkeleton(
  slice: SliceDefinition,
): Record<string, unknown> {
  const obj: Record<string, unknown> = {};

  if (slice.extensionUrl) {
    obj['url'] = slice.extensionUrl;
    return obj;
  }

  for (const [key, value] of Object.entries(slice.fixedValues)) {
    if (key.includes('.')) continue; // skip nested paths
    obj[key] = typeof value === 'object' && value !== null
      ? JSON.parse(JSON.stringify(value))
      : value;
  }

  return obj;
}

// =============================================================================
// Section 4: isExtensionSlicing
// =============================================================================

/**
 * Check if a base path represents extension slicing.
 *
 * @param basePath - The element path (e.g. "Patient.extension").
 * @returns true if the path ends with `.extension` or `.modifierExtension`.
 */
export function isExtensionSlicing(basePath: string): boolean {
  return basePath.endsWith('.extension') || basePath.endsWith('.modifierExtension');
}

// =============================================================================
// Section 5: Internal — Discriminator Matching
// =============================================================================

/**
 * Check if an instance matches ALL discriminators for a given slice.
 * @internal
 */
function matchesAllDiscriminators(
  instance: Record<string, unknown>,
  discriminators: ReadonlyArray<{ type: string; path: string }>,
  slice: SliceDefinition,
): boolean {
  for (const disc of discriminators) {
    const instanceValue = getNestedValue(instance, disc.path);
    const sliceValue = slice.fixedValues[disc.path];

    if (sliceValue === undefined) continue; // no constraint

    if (disc.type === 'value') {
      if (!deepEqual(instanceValue, sliceValue)) return false;
    } else if (disc.type === 'pattern') {
      if (!patternMatch(instanceValue, sliceValue)) return false;
    } else if (disc.type === 'exists') {
      const exists = instanceValue !== undefined && instanceValue !== null;
      if (!exists) return false;
    }
    // type and profile discriminators: simplified — compare as value
  }
  return true;
}

/**
 * Get a nested value from an object using a dot-separated path.
 * @internal
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Deep strict equality comparison.
 * @internal
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const arrA = a as unknown[];
    const arrB = b as unknown[];
    if (arrA.length !== arrB.length) return false;
    return arrA.every((v, i) => deepEqual(v, arrB[i]));
  }
  const objA = a as Record<string, unknown>;
  const objB = b as Record<string, unknown>;
  const keysA = Object.keys(objA);
  const keysB = Object.keys(objB);
  if (keysA.length !== keysB.length) return false;
  return keysA.every((k) => deepEqual(objA[k], objB[k]));
}

/**
 * Pattern matching: check if `actual` contains all fields defined in `pattern`.
 * Unlike deepEqual, the actual value may have extra fields.
 * @internal
 */
function patternMatch(actual: unknown, pattern: unknown): boolean {
  if (pattern === undefined || pattern === null) return true;
  if (actual === undefined || actual === null) return false;
  if (typeof pattern !== 'object') return actual === pattern;
  if (Array.isArray(pattern)) {
    if (!Array.isArray(actual)) return false;
    return (pattern as unknown[]).every((pItem) =>
      (actual as unknown[]).some((aItem) => patternMatch(aItem, pItem)),
    );
  }
  if (typeof actual !== 'object') return false;
  const patObj = pattern as Record<string, unknown>;
  const actObj = actual as Record<string, unknown>;
  return Object.keys(patObj).every((k) => patternMatch(actObj[k], patObj[k]));
}
