/**
 * fhir-profile — Path Utility Functions
 *
 * Path matching and manipulation utilities used by the snapshot generation
 * algorithm. These functions underpin the base-driven traversal in
 * {@link ElementMerger} (the `processPaths` equivalent).
 *
 * Key concepts:
 * - **Element path**: dot-separated segments like `"Patient.name.given"`
 * - **Choice type path**: ends with `[x]`, e.g. `"Observation.value[x]"`
 * - **Concrete choice path**: resolved form, e.g. `"Observation.valueString"`
 * - **Slice name**: stored in element id with `:` separator, e.g. `"Patient.identifier:MRN"`
 *
 * @module fhir-profile
 */

import type { ElementDefinition } from '../model/index.js';
import type { DiffElementTracker, TraversalScope } from './types.js';

// =============================================================================
// Section 1: Basic Path Operations
// =============================================================================

/**
 * Check whether two paths match exactly.
 *
 * @example
 * pathMatches('Patient.name', 'Patient.name')       // true
 * pathMatches('Patient.name', 'Patient.identifier')  // false
 */
export function pathMatches(basePath: string, diffPath: string): boolean {
  return basePath === diffPath;
}

/**
 * Check whether `childPath` is a direct child of `parentPath`.
 *
 * A direct child has exactly one more segment than the parent.
 *
 * @example
 * isDirectChild('Patient.name', 'Patient.name.given')       // true
 * isDirectChild('Patient.name', 'Patient.name.given.value')  // false
 * isDirectChild('Patient.name', 'Patient.identifier')        // false
 */
export function isDirectChild(parentPath: string, childPath: string): boolean {
  if (!childPath.startsWith(parentPath + '.')) {
    return false;
  }
  const remainder = childPath.slice(parentPath.length + 1);
  return remainder.length > 0 && !remainder.includes('.');
}

/**
 * Check whether `descendantPath` is a descendant of `ancestorPath`
 * (at any depth).
 *
 * @example
 * isDescendant('Patient.name', 'Patient.name.given')        // true
 * isDescendant('Patient.name', 'Patient.name.given.value')  // true
 * isDescendant('Patient.name', 'Patient.name')              // false
 * isDescendant('Patient.name', 'Patient.identifier')        // false
 */
export function isDescendant(ancestorPath: string, descendantPath: string): boolean {
  return descendantPath.startsWith(ancestorPath + '.');
}

/**
 * Get the depth (number of segments) of a path.
 *
 * @example
 * pathDepth('Patient')             // 1
 * pathDepth('Patient.name')        // 2
 * pathDepth('Patient.name.given')  // 3
 */
export function pathDepth(path: string): number {
  if (path.length === 0) return 0;
  let count = 1;
  for (let i = 0; i < path.length; i++) {
    if (path.charCodeAt(i) === 46 /* '.' */) count++;
  }
  return count;
}

/**
 * Get the parent path (everything before the last `.`).
 *
 * @example
 * parentPath('Patient.name.given')  // 'Patient.name'
 * parentPath('Patient.name')        // 'Patient'
 * parentPath('Patient')             // undefined
 */
export function parentPath(path: string): string | undefined {
  const lastDot = path.lastIndexOf('.');
  return lastDot === -1 ? undefined : path.slice(0, lastDot);
}

/**
 * Get the last segment (tail) of a path.
 *
 * @example
 * tailSegment('Patient.name.given')  // 'given'
 * tailSegment('Patient')             // 'Patient'
 */
export function tailSegment(path: string): string {
  const lastDot = path.lastIndexOf('.');
  return lastDot === -1 ? path : path.slice(lastDot + 1);
}

// =============================================================================
// Section 2: Choice Type Path Operations
// =============================================================================

/**
 * Check whether a path ends with `[x]` (choice type wildcard).
 *
 * @example
 * isChoiceTypePath('Observation.value[x]')  // true
 * isChoiceTypePath('Observation.valueString')  // false
 * isChoiceTypePath('Observation.value')  // false
 */
export function isChoiceTypePath(path: string): boolean {
  return path.endsWith('[x]');
}

/**
 * Check whether `concretePath` matches a choice type `choicePath`.
 *
 * The concrete path must share the same prefix (minus `[x]`) and the
 * remaining suffix must start with an uppercase letter (the type name).
 *
 * @example
 * matchesChoiceType('Observation.value[x]', 'Observation.valueString')    // true
 * matchesChoiceType('Observation.value[x]', 'Observation.valueQuantity')  // true
 * matchesChoiceType('Observation.value[x]', 'Observation.code')           // false
 * matchesChoiceType('Observation.value[x]', 'Observation.value')          // false
 */
export function matchesChoiceType(choicePath: string, concretePath: string): boolean {
  if (!choicePath.endsWith('[x]')) return false;
  const base = choicePath.slice(0, -3); // Remove '[x]'
  if (!concretePath.startsWith(base)) return false;
  const suffix = concretePath.slice(base.length);
  // Suffix must be non-empty and start with uppercase (type name)
  return suffix.length > 0 && suffix.charCodeAt(0) >= 65 && suffix.charCodeAt(0) <= 90;
}

/**
 * Extract the type name from a concrete choice path given the choice base.
 *
 * @example
 * extractChoiceTypeName('Observation.value[x]', 'Observation.valueString')    // 'String'
 * extractChoiceTypeName('Observation.value[x]', 'Observation.valueQuantity')  // 'Quantity'
 * extractChoiceTypeName('Observation.value[x]', 'Observation.code')           // undefined
 */
export function extractChoiceTypeName(
  choicePath: string,
  concretePath: string,
): string | undefined {
  if (!matchesChoiceType(choicePath, concretePath)) return undefined;
  const base = choicePath.slice(0, -3);
  return concretePath.slice(base.length);
}

// =============================================================================
// Section 3: Slice Path Operations
// =============================================================================

/**
 * Check whether an element id contains a slice name (`:` separator).
 *
 * In FHIR, slice names appear in element ids, not in paths.
 * Format: `"ResourceType.path:sliceName"` or `"ResourceType.path:sliceName.child"`
 *
 * @example
 * hasSliceName('Patient.identifier:MRN')            // true
 * hasSliceName('Patient.identifier:MRN.system')     // true
 * hasSliceName('Patient.identifier')                // false
 */
export function hasSliceName(elementId: string): boolean {
  return elementId.includes(':');
}

/**
 * Extract the first slice name from an element id.
 *
 * @example
 * extractSliceName('Patient.identifier:MRN')         // 'MRN'
 * extractSliceName('Patient.identifier:MRN.system')   // 'MRN'
 * extractSliceName('Patient.identifier')              // undefined
 */
export function extractSliceName(elementId: string): string | undefined {
  const colonIdx = elementId.indexOf(':');
  if (colonIdx === -1) return undefined;
  // Slice name ends at the next '.' or end of string
  const afterColon = elementId.slice(colonIdx + 1);
  const dotIdx = afterColon.indexOf('.');
  return dotIdx === -1 ? afterColon : afterColon.slice(0, dotIdx);
}

// =============================================================================
// Section 4: Scope Computation (processPaths core dependency)
// =============================================================================

/**
 * Compute the child element scope for a parent element in a list.
 *
 * Returns a {@link TraversalScope} covering all direct and indirect
 * children of the element at `parentIndex`. Both `start` and `end`
 * are inclusive indices.
 *
 * Returns `undefined` if the parent has no children.
 *
 * @example
 * // elements: [Patient, Patient.id, Patient.name, Patient.name.given,
 * //            Patient.name.family, Patient.identifier]
 * getChildScope(elements, 2)
 * // → { elements, start: 3, end: 4 }  (Patient.name.given, Patient.name.family)
 */
export function getChildScope(
  elements: readonly ElementDefinition[],
  parentIndex: number,
): TraversalScope | undefined {
  if (parentIndex < 0 || parentIndex >= elements.length) return undefined;

  const parentPath = elements[parentIndex].path;
  if (!parentPath) return undefined;

  const prefix = parentPath + '.';
  const start = parentIndex + 1;

  // Find the last child element (all descendants share the prefix)
  let end = -1;
  for (let i = start; i < elements.length; i++) {
    const p = elements[i].path;
    if (p && p.startsWith(prefix)) {
      end = i;
    } else {
      break;
    }
  }

  if (end === -1) return undefined;

  return { elements, start, end };
}

/**
 * Find differential elements matching `basePath` within the given scope.
 *
 * Matching rules (mirrors HAPI `getDiffMatches`):
 * 1. Exact path match
 * 2. Choice type match (base ends with `[x]`, diff has concrete type)
 * 3. Same path with different sliceName (slice match)
 *
 * Only considers unconsumed trackers within `[diffStart, diffEnd]` inclusive.
 */
export function getDiffMatches(
  differential: readonly DiffElementTracker[],
  basePath: string,
  diffStart: number,
  diffEnd: number,
): DiffElementTracker[] {
  const matches: DiffElementTracker[] = [];
  const isChoice = isChoiceTypePath(basePath);

  for (let i = diffStart; i <= diffEnd && i < differential.length; i++) {
    const tracker = differential[i];
    const diffPath = tracker.element.path;
    if (!diffPath) continue;

    // Exact path match
    if (diffPath === basePath) {
      matches.push(tracker);
      continue;
    }

    // Choice type match: base is value[x], diff is valueString
    if (isChoice && matchesChoiceType(basePath, diffPath)) {
      matches.push(tracker);
      continue;
    }
  }

  return matches;
}

/**
 * Check whether the differential contains descendant elements of `basePath`
 * within the given scope.
 *
 * This corresponds to HAPI's `hasInnerDiffMatches()` — it detects whether
 * the diff constrains children of an element even when the element itself
 * has no direct diff match.
 */
export function hasInnerDiffMatches(
  differential: readonly DiffElementTracker[],
  basePath: string,
  diffStart: number,
  diffEnd: number,
): boolean {
  const prefix = basePath + '.';
  const isChoice = isChoiceTypePath(basePath);
  const choiceBase = isChoice ? basePath.slice(0, -3) : '';

  for (let i = diffStart; i <= diffEnd && i < differential.length; i++) {
    const diffPath = differential[i].element.path;
    if (!diffPath) continue;

    // Direct descendant
    if (diffPath.startsWith(prefix)) {
      return true;
    }

    // Choice type descendant: base is value[x], diff is valueString.extension
    if (isChoice && diffPath.startsWith(choiceBase)) {
      const afterBase = diffPath.slice(choiceBase.length);
      // Must have uppercase type name then a dot for children
      if (
        afterBase.length > 1 &&
        afterBase.charCodeAt(0) >= 65 &&
        afterBase.charCodeAt(0) <= 90 &&
        afterBase.includes('.')
      ) {
        return true;
      }
    }
  }

  return false;
}

// =============================================================================
// Section 5: Path Rewriting
// =============================================================================

/**
 * Rewrite a path from one prefix to another.
 *
 * Used during datatype expansion: when diving into a complex type's
 * snapshot, paths need to be rewritten from the datatype's namespace
 * to the target element's namespace.
 *
 * @example
 * rewritePath('Identifier.system', 'Identifier', 'Patient.identifier')
 * // → 'Patient.identifier.system'
 *
 * rewritePath('Identifier', 'Identifier', 'Patient.identifier')
 * // → 'Patient.identifier'
 *
 * rewritePath('HumanName.given', 'HumanName', 'Patient.name')
 * // → 'Patient.name.given'
 */
export function rewritePath(
  sourcePath: string,
  sourcePrefix: string,
  targetPrefix: string,
): string {
  if (sourcePath === sourcePrefix) {
    return targetPrefix;
  }
  if (sourcePath.startsWith(sourcePrefix + '.')) {
    return targetPrefix + sourcePath.slice(sourcePrefix.length);
  }
  // Fallback: return as-is if prefix doesn't match
  return sourcePath;
}
