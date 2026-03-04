/**
 * fhir-validator — Slicing Validation
 *
 * Implements slicing validation logic for FHIR array elements:
 * - {@link validateSlicing} — orchestrates slice matching, cardinality, rules, and ordering
 * - {@link findMatchingSlice} — matches a value to a named slice via discriminators
 * - {@link matchesDiscriminator} — checks a single discriminator against a value
 * - {@link isSliceOrderValid} — validates ordered slicing constraints
 * - {@link extractValueAtPath} — extracts a nested value from an object using a dot path
 * - {@link getSliceDiscriminatorValue} — retrieves the expected discriminator value from a slice element
 *
 * @module fhir-validator
 */

import type { CanonicalElement, SlicingDiscriminatorDef } from '../model/canonical-profile.js';
import type { ValidationIssue } from './types.js';
import { createValidationIssue } from './types.js';
import { validateCardinality, deepEqual, matchesPattern, inferFhirType } from './validation-rules.js';

// =============================================================================
// Section 1: extractValueAtPath
// =============================================================================

/**
 * Extract a value from an object using a simple dot-separated path.
 *
 * This is a lightweight path extractor for discriminator evaluation.
 * Unlike the full `extractValues` in path-extractor.ts, this operates
 * on plain objects (not full FHIR resources) and returns a single value.
 *
 * Handles:
 * - Simple dot paths: `"system"`, `"coding.system"`
 * - `$this` (returns the value itself)
 * - `resolve()` is ignored (returns the value at the preceding path)
 *
 * @param value - The object to extract from.
 * @param path - Dot-separated path (e.g., `"coding.system"`).
 * @returns The extracted value, or `undefined` if not found.
 */
export function extractValueAtPath(value: unknown, path: string): unknown {
  if (value === null || value === undefined) {
    return undefined;
  }

  // $this refers to the value itself
  if (path === '$this') {
    return value;
  }

  // Strip resolve() — we can't actually resolve references here
  const cleanPath = path.replace(/\.resolve\(\)/g, '');

  if (cleanPath === '' || cleanPath === '$this') {
    return value;
  }

  const segments = cleanPath.split('.');
  let current: unknown = value;

  for (const segment of segments) {
    if (current === null || current === undefined) {
      return undefined;
    }

    // If current is an array, try to extract from the first element
    // (discriminators typically work on the first matching element)
    if (Array.isArray(current)) {
      if (current.length === 0) return undefined;
      current = current[0];
    }

    if (typeof current !== 'object' || current === null) {
      return undefined;
    }

    current = (current as Record<string, unknown>)[segment];
  }

  return current;
}

// =============================================================================
// Section 2: getSliceDiscriminatorValue
// =============================================================================

/**
 * Get the expected discriminator value from a slice element definition.
 *
 * For a "value" discriminator, the expected value comes from the slice's
 * `fixed` or `pattern` constraint. The discriminator path is used to
 * navigate into the fixed/pattern value if it's a complex object.
 *
 * @param slice - The slice element definition.
 * @param discriminatorPath - The discriminator path (e.g., `"system"`).
 * @returns The expected value for this discriminator, or `undefined`.
 */
export function getSliceDiscriminatorValue(
  slice: CanonicalElement,
  discriminatorPath: string,
): unknown {
  // Try fixed value first
  if (slice.fixed !== undefined) {
    if (discriminatorPath === '$this') {
      return slice.fixed;
    }
    return extractValueAtPath(slice.fixed, discriminatorPath);
  }

  // Try pattern value
  if (slice.pattern !== undefined) {
    if (discriminatorPath === '$this') {
      return slice.pattern;
    }
    return extractValueAtPath(slice.pattern, discriminatorPath);
  }

  return undefined;
}

// =============================================================================
// Section 3: getSliceTypes
// =============================================================================

/**
 * Get the expected type codes from a slice element definition.
 *
 * For a "type" discriminator, the expected types come from the slice's
 * `types` array.
 *
 * @param slice - The slice element definition.
 * @param _discriminatorPath - The discriminator path (currently unused).
 * @returns Array of expected type code strings.
 */
export function getSliceTypes(
  slice: CanonicalElement,
  _discriminatorPath: string,
): string[] {
  return slice.types.map((t) => t.code);
}

// =============================================================================
// Section 4: matchesDiscriminator
// =============================================================================

/**
 * Check if a value matches a single discriminator for a slice.
 *
 * Supports 4 discriminator types:
 * - `value`: The value at the discriminator path must deeply equal the
 *   slice's fixed/pattern value at the same path.
 * - `pattern`: The value at the discriminator path must match the
 *   slice's pattern (partial/subset match).
 * - `type`: The inferred FHIR type of the value at the discriminator
 *   path must match one of the slice's allowed types.
 * - `exists`: The discriminator path must exist (have a non-undefined value)
 *   in the value.
 * - `profile`: Always returns `true` (placeholder — full profile conformance
 *   checking requires context resolution not available here).
 *
 * @param value - The actual value to check.
 * @param slice - The slice element definition.
 * @param discriminator - The discriminator definition.
 * @returns `true` if the value matches this discriminator.
 */
export function matchesDiscriminator(
  value: unknown,
  slice: CanonicalElement,
  discriminator: SlicingDiscriminatorDef,
): boolean {
  const { type, path } = discriminator;

  switch (type) {
    case 'value': {
      const actualValue = extractValueAtPath(value, path);
      const expectedValue = getSliceDiscriminatorValue(slice, path);
      if (expectedValue === undefined) {
        // No fixed/pattern constraint on this slice for this path
        return true;
      }
      return deepEqual(actualValue, expectedValue);
    }

    case 'pattern': {
      const actualValue = extractValueAtPath(value, path);
      const expectedPattern = getSliceDiscriminatorValue(slice, path);
      if (expectedPattern === undefined) {
        return true;
      }
      return matchesPattern(actualValue, expectedPattern);
    }

    case 'type': {
      const actualValue = extractValueAtPath(value, path);
      const actualType = inferFhirType(actualValue);
      const expectedTypes = getSliceTypes(slice, path);
      if (expectedTypes.length === 0) {
        return true;
      }
      return expectedTypes.includes(actualType);
    }

    case 'exists': {
      const actualValue = extractValueAtPath(value, path);
      // "exists" discriminator: the path must exist (not undefined)
      return actualValue !== undefined;
    }

    case 'profile': {
      // Profile conformance checking requires context resolution
      // which is not available at this level. Return true as placeholder.
      return true;
    }

    default:
      return false;
  }
}

// =============================================================================
// Section 5: findMatchingSlice
// =============================================================================

/**
 * Find which named slice a value matches based on discriminators.
 *
 * Iterates through the slice elements and checks each discriminator.
 * A value matches a slice if ALL discriminators match.
 *
 * @param value - The actual value to match.
 * @param slices - Array of slice element definitions (must have `sliceName`).
 * @param discriminators - The discriminator definitions from the slicing root.
 * @returns The matching slice element, or `undefined` if no match.
 */
export function findMatchingSlice(
  value: unknown,
  slices: CanonicalElement[],
  discriminators: SlicingDiscriminatorDef[],
): CanonicalElement | undefined {
  for (const slice of slices) {
    if (!slice.sliceName) continue;

    let allMatch = true;
    for (const disc of discriminators) {
      if (!matchesDiscriminator(value, slice, disc)) {
        allMatch = false;
        break;
      }
    }

    if (allMatch) return slice;
  }

  return undefined;
}

// =============================================================================
// Section 6: isSliceOrderValid
// =============================================================================

/**
 * Check if values appear in the correct order according to slice definitions.
 *
 * For ordered slicing, values must appear in the same order as the slice
 * definitions. Values matching slice A must all appear before values
 * matching slice B if slice A is defined before slice B.
 *
 * @param values - The actual values in the array.
 * @param slices - The slice element definitions (in definition order).
 * @param discriminators - The discriminator definitions.
 * @returns `true` if the values are in valid order.
 */
export function isSliceOrderValid(
  values: unknown[],
  slices: CanonicalElement[],
  discriminators: SlicingDiscriminatorDef[],
): boolean {
  // Build a slice index map: sliceName → position in definition order
  const sliceOrder = new Map<string, number>();
  let orderIndex = 0;
  for (const slice of slices) {
    if (slice.sliceName) {
      sliceOrder.set(slice.sliceName, orderIndex++);
    }
  }

  // Track the highest slice index seen so far
  let lastSliceIndex = -1;

  for (const value of values) {
    const matched = findMatchingSlice(value, slices, discriminators);
    if (!matched || !matched.sliceName) {
      // Unmatched values don't affect ordering
      continue;
    }

    const currentIndex = sliceOrder.get(matched.sliceName) ?? -1;
    if (currentIndex < lastSliceIndex) {
      return false; // Out of order
    }
    lastSliceIndex = currentIndex;
  }

  return true;
}

// =============================================================================
// Section 7: validateSlicing
// =============================================================================

/**
 * Validate slicing constraints for an array element.
 *
 * Performs the following checks:
 * 1. **Slice matching** — each value is matched to a named slice via discriminators.
 * 2. **Slice cardinality** — each slice's min/max is checked against matched values.
 * 3. **Slicing rules** — for `closed` slicing, unmatched values produce errors.
 *    For `openAtEnd`, unmatched values must appear after all matched values.
 * 4. **Ordering** — for `ordered` slicing, matched values must appear in
 *    slice definition order.
 *
 * @param slicingRoot - The element with the slicing definition.
 * @param sliceElements - The named slice element definitions.
 * @param values - The actual values in the array.
 * @param issues - Mutable array to push validation issues into.
 */
export function validateSlicing(
  slicingRoot: CanonicalElement,
  sliceElements: CanonicalElement[],
  values: unknown[],
  issues: ValidationIssue[],
): void {
  if (!slicingRoot.slicing) {
    return;
  }

  const { discriminators, rules, ordered } = slicingRoot.slicing;

  // Step 1: Match each value to a slice
  const sliceMatches = new Map<string, unknown[]>();
  const unmatchedValues: unknown[] = [];
  const unmatchedIndices: number[] = [];
  let lastMatchedIndex = -1;

  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    const matchedSlice = findMatchingSlice(value, sliceElements, discriminators);

    if (matchedSlice && matchedSlice.sliceName) {
      const sliceName = matchedSlice.sliceName;
      if (!sliceMatches.has(sliceName)) {
        sliceMatches.set(sliceName, []);
      }
      sliceMatches.get(sliceName)!.push(value);
      lastMatchedIndex = i;
    } else {
      unmatchedValues.push(value);
      unmatchedIndices.push(i);
    }
  }

  // Step 2: Validate slice cardinality
  for (const slice of sliceElements) {
    if (!slice.sliceName) continue;
    const sliceValues = sliceMatches.get(slice.sliceName) ?? [];
    validateCardinality(slice, sliceValues, issues);
  }

  // Step 3: Check slicing rules
  if (rules === 'closed' && unmatchedValues.length > 0) {
    issues.push(
      createValidationIssue(
        'error',
        'SLICING_NO_MATCH',
        `Slicing at '${slicingRoot.path}' is closed, but ${unmatchedValues.length} value(s) do not match any defined slice`,
        {
          path: slicingRoot.path,
          diagnostics: `Unmatched value count: ${unmatchedValues.length}`,
        },
      ),
    );
  }

  if (rules === 'openAtEnd' && unmatchedValues.length > 0) {
    // For openAtEnd, unmatched values must appear AFTER all matched values
    const hasUnmatchedBeforeMatched = unmatchedIndices.some(
      (idx) => idx < lastMatchedIndex,
    );
    if (hasUnmatchedBeforeMatched) {
      issues.push(
        createValidationIssue(
          'error',
          'SLICING_NO_MATCH',
          `Slicing at '${slicingRoot.path}' is openAtEnd, but unmatched values appear before matched slice values`,
          {
            path: slicingRoot.path,
            diagnostics: `Unmatched values must appear after all slice-matched values`,
          },
        ),
      );
    }
  }

  // Step 4: Check ordering
  if (ordered && !isSliceOrderValid(values, sliceElements, discriminators)) {
    issues.push(
      createValidationIssue(
        'error',
        'SLICING_ORDER_VIOLATION',
        `Slicing at '${slicingRoot.path}' requires ordered slices, but values are out of order`,
        {
          path: slicingRoot.path,
          diagnostics: `Values must appear in the same order as slice definitions`,
        },
      ),
    );
  }
}
