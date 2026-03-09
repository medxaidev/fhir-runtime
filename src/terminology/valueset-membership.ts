/**
 * fhir-terminology — ValueSet Membership
 *
 * Determines whether a code belongs to a ValueSet by evaluating
 * expansion, compose include/exclude rules, and CodeSystem hierarchy.
 *
 * @module fhir-terminology
 */

import type {
  ValueSetDefinition,
  ValueSetComposeInclude,
  ValueSetComposeFilter,
} from './types.js';
import type { CodeSystemRegistry } from './codesystem-registry.js';

// =============================================================================
// Public API
// =============================================================================

/**
 * Check whether a code (with system) is a member of a ValueSet.
 *
 * Evaluation order:
 * 1. If ValueSet has `expansion` → check expansion.contains
 * 2. If ValueSet has `compose` → check include/exclude rules
 * 3. Otherwise → not a member
 *
 * @param vs - The ValueSet definition to check against.
 * @param system - The CodeSystem URL of the code.
 * @param code - The code value.
 * @param csRegistry - Optional CodeSystem registry for filter evaluation.
 * @returns `true` if the code is a member of the ValueSet.
 */
export function isCodeInValueSet(
  vs: ValueSetDefinition,
  system: string,
  code: string,
  csRegistry?: CodeSystemRegistry,
): boolean {
  // 1. Check expansion first (pre-expanded)
  if (vs.expansion) {
    return vs.expansion.contains.some(
      (c) => c.system === system && c.code === code,
    );
  }

  // 2. Check compose rules
  if (vs.compose) {
    const included = vs.compose.include.some(
      (inc) => matchesInclude(inc, system, code, csRegistry),
    );
    if (!included) return false;

    // Check exclude rules
    if (vs.compose.exclude) {
      const excluded = vs.compose.exclude.some(
        (exc) => matchesInclude(exc, system, code, csRegistry),
      );
      if (excluded) return false;
    }

    return true;
  }

  // 3. No expansion or compose → not a member
  return false;
}

// =============================================================================
// Internal Helpers
// =============================================================================

/**
 * Check whether a code matches a single include/exclude clause.
 */
function matchesInclude(
  inc: ValueSetComposeInclude,
  system: string,
  code: string,
  csRegistry?: CodeSystemRegistry,
): boolean {
  // System must match
  if (inc.system !== system) return false;

  // If explicit concept list → enumerate match
  if (inc.concept && inc.concept.length > 0) {
    return inc.concept.some((c) => c.code === code);
  }

  // If filters → evaluate filters
  if (inc.filter && inc.filter.length > 0) {
    return inc.filter.every((f) => matchesFilter(f, system, code, csRegistry));
  }

  // No concept list and no filters → entire CodeSystem is included
  // If we have a registry, verify the code actually exists in the CodeSystem
  if (csRegistry) {
    return csRegistry.hasCode(system, code);
  }
  // Without registry, assume the code is valid (can't verify)
  return true;
}

/**
 * Evaluate a single filter against a code.
 *
 * Currently supported operations:
 * - `=` : exact match on property (only `concept` property supported)
 * - `is-a` : hierarchical descendant check
 * - `in` : comma-separated list membership
 * - `not-in` : comma-separated list exclusion
 * - `regex` : regex match on code
 * - `exists` : check if concept exists in CodeSystem
 * - `is-not-a` : not a descendant
 */
function matchesFilter(
  filter: ValueSetComposeFilter,
  system: string,
  code: string,
  csRegistry?: CodeSystemRegistry,
): boolean {
  switch (filter.op) {
    case '=':
      return code === filter.value;

    case 'is-a': {
      if (!csRegistry) return false;
      // code must be the ancestor itself or a descendant
      if (code === filter.value) return true;
      return csRegistry.isDescendantOf(system, code, filter.value);
    }

    case 'is-not-a': {
      if (!csRegistry) return true; // can't verify, assume not excluded
      if (code === filter.value) return false;
      return !csRegistry.isDescendantOf(system, code, filter.value);
    }

    case 'in': {
      const values = filter.value.split(',').map((v) => v.trim());
      return values.includes(code);
    }

    case 'not-in': {
      const values = filter.value.split(',').map((v) => v.trim());
      return !values.includes(code);
    }

    case 'regex': {
      try {
        return new RegExp(filter.value).test(code);
      } catch {
        return false;
      }
    }

    case 'exists': {
      if (!csRegistry) return false;
      const exists = csRegistry.hasCode(system, code);
      return filter.value === 'true' ? exists : !exists;
    }

    default:
      return false;
  }
}
