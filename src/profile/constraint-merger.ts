/**
 * fhir-profile — Constraint Merging Engine
 *
 * Implements field-level merging of differential ElementDefinition constraints
 * onto snapshot elements. This is the most granular part of snapshot generation.
 *
 * Corresponds to HAPI FHIR R4:
 * - `ProfileUtilities.updateFromDefinition()` → {@link mergeConstraints}
 * - `ProfileUtilities.updateFromBase()` → {@link setBaseTraceability}
 *
 * Merge strategies per field (from HAPI research):
 * - **Overwrite**: short, definition, comment, requirements, label, fixed, pattern,
 *   maxLength, minValue, maxValue, mustSupport, defaultValue, meaningWhenMissing
 * - **Validate-then-overwrite**: min, max, type[], binding
 * - **Append/union**: constraint[], alias[], example[], mapping[]
 * - **Conditional**: isModifier (extensions only), isSummary (base guard)
 *
 * @module fhir-profile
 */

import type {
  ElementDefinition,
  ElementDefinitionBase,
  ElementDefinitionBinding,
  ElementDefinitionConstraint,
  ElementDefinitionExample,
  ElementDefinitionMapping,
  ElementDefinitionType,
  FhirString,
  FhirUnsignedInt,
} from '../model/index.js';
import type { SnapshotIssue } from './types.js';
import { createSnapshotIssue } from './types.js';

// =============================================================================
// Section 1: Main Entry Point — mergeConstraints
// =============================================================================

/**
 * Apply differential constraints onto a snapshot element.
 *
 * Corresponds to HAPI `updateFromDefinition(dest, source, ...)`.
 * The `dest` element is mutated in place and also returned.
 *
 * @param dest - The working snapshot element (initially cloned from base).
 * @param source - The differential element to apply.
 * @param issues - Mutable array to collect issues.
 * @returns The mutated `dest` element.
 */
export function mergeConstraints(
  dest: ElementDefinition,
  source: ElementDefinition,
  issues: SnapshotIssue[],
): ElementDefinition {
  const path = dest.path ?? source.path ?? '<unknown>';

  // --- Cardinality (validate-then-overwrite) ---
  mergeCardinality(dest, source, issues, path);

  // --- Types (validate-then-replace) ---
  if (source.type !== undefined) {
    const merged = mergeTypes(dest.type, source.type, issues, path);
    dest.type = merged;
  }

  // --- Binding (validate-then-overwrite) ---
  if (source.binding !== undefined) {
    const merged = mergeBinding(dest.binding, source.binding, issues, path);
    dest.binding = merged;
  }

  // --- Documentation fields (pure overwrite) ---
  if (source.short !== undefined) dest.short = source.short;
  if (source.definition !== undefined) dest.definition = source.definition;
  if (source.comment !== undefined) dest.comment = source.comment;
  if (source.requirements !== undefined) dest.requirements = source.requirements;
  if (source.label !== undefined) dest.label = source.label;

  // --- Value constraints (pure overwrite) ---
  if (source.fixed !== undefined) dest.fixed = source.fixed;
  if (source.pattern !== undefined) dest.pattern = source.pattern;
  if (source.maxLength !== undefined) dest.maxLength = source.maxLength;
  if (source.minValue !== undefined) dest.minValue = source.minValue;
  if (source.maxValue !== undefined) dest.maxValue = source.maxValue;
  if (source.defaultValue !== undefined) dest.defaultValue = source.defaultValue;
  if (source.meaningWhenMissing !== undefined) dest.meaningWhenMissing = source.meaningWhenMissing;
  if (source.orderMeaning !== undefined) dest.orderMeaning = source.orderMeaning;

  // --- Flags (overwrite / conditional) ---
  if (source.mustSupport !== undefined) dest.mustSupport = source.mustSupport;

  // isSummary: guard — if base already has it, do not allow change
  if (source.isSummary !== undefined) {
    if (dest.isSummary !== undefined && dest.isSummary !== source.isSummary) {
      issues.push(
        createSnapshotIssue(
          'warning',
          'INVALID_CONSTRAINT',
          `Cannot change isSummary from ${String(dest.isSummary)} to ${String(source.isSummary)}`,
          path,
        ),
      );
    } else {
      dest.isSummary = source.isSummary;
    }
  }

  // isModifier: conditional — only extensions can change this
  if (source.isModifier !== undefined) {
    dest.isModifier = source.isModifier;
  }
  if (source.isModifierReason !== undefined) {
    dest.isModifierReason = source.isModifierReason;
  }

  // --- Slicing (overwrite if present in diff) ---
  if (source.slicing !== undefined) dest.slicing = source.slicing;
  if (source.sliceName !== undefined) dest.sliceName = source.sliceName;
  if (source.sliceIsConstraining !== undefined) dest.sliceIsConstraining = source.sliceIsConstraining;

  // --- Other identity fields ---
  if (source.representation !== undefined) dest.representation = source.representation;
  if (source.code !== undefined) dest.code = source.code;
  if (source.contentReference !== undefined) dest.contentReference = source.contentReference;
  if (source.condition !== undefined) dest.condition = source.condition;

  // --- Append/union fields ---
  dest.constraint = mergeConstraintList(dest.constraint, source.constraint);
  dest.alias = mergeStringArray(dest.alias, source.alias) as FhirString[] | undefined;
  dest.example = mergeExampleList(dest.example, source.example);
  dest.mapping = mergeMappingList(dest.mapping, source.mapping);

  return dest;
}

// =============================================================================
// Section 2: Base Traceability — setBaseTraceability
// =============================================================================

/**
 * Populate `dest.base` with traceability information from the base element.
 *
 * Corresponds to HAPI `updateFromBase(derived, base)`.
 * If `base` already has a `.base`, we copy from `base.base` (preserving
 * original ancestry). Otherwise we copy from `base` directly.
 *
 * @param dest - The element to set base traceability on.
 * @param base - The base element to derive traceability from.
 */
export function setBaseTraceability(
  dest: ElementDefinition,
  base: ElementDefinition,
): void {
  const baseInfo: ElementDefinitionBase = base.base
    ? {
      path: base.base.path,
      min: base.base.min,
      max: base.base.max,
    }
    : {
      path: base.path ?? ('' as FhirString),
      min: base.min ?? (0 as FhirUnsignedInt),
      max: base.max ?? ('*' as FhirString),
    };

  dest.base = baseInfo;
}

// =============================================================================
// Section 3: Cardinality Merging
// =============================================================================

/**
 * Merge cardinality constraints (min/max) with validation.
 *
 * Rules:
 * - `derived.min` must be >= `base.min` (except for slices)
 * - `derived.max` must be <= `base.max`
 *
 * @internal Exported for direct testing.
 */
export function mergeCardinality(
  dest: ElementDefinition,
  source: ElementDefinition,
  issues: SnapshotIssue[],
  path?: string,
): void {
  const elementPath = path ?? dest.path ?? '<unknown>';

  // --- min ---
  if (source.min !== undefined) {
    const baseMin = dest.min ?? 0;
    const derivedMin = source.min;

    // Slice exception: slices can have min < base min
    const isSlice = source.sliceName !== undefined && source.sliceName !== '';

    if (!isSlice && derivedMin < baseMin) {
      issues.push(
        createSnapshotIssue(
          'error',
          'CARDINALITY_VIOLATION',
          `Derived min (${derivedMin}) is less than base min (${baseMin})`,
          elementPath,
        ),
      );
    }
    dest.min = derivedMin;
  }

  // --- max ---
  if (source.max !== undefined) {
    const baseMax = dest.max ?? '*';
    const derivedMax = source.max;

    if (isLargerMax(derivedMax, baseMax)) {
      issues.push(
        createSnapshotIssue(
          'error',
          'CARDINALITY_VIOLATION',
          `Derived max (${derivedMax}) is greater than base max (${baseMax})`,
          elementPath,
        ),
      );
    }
    dest.max = derivedMax;
  }
}

// =============================================================================
// Section 4: Type Merging
// =============================================================================

/**
 * Merge type constraints with compatibility validation.
 *
 * Each derived type must be compatible with at least one base type.
 * Special allowances: Extension, Element, *, Resource/DomainResource.
 *
 * If valid, derived types replace base types entirely.
 *
 * @returns The merged type array (derived types if valid, base types if no diff).
 */
export function mergeTypes(
  baseTypes: readonly ElementDefinitionType[] | undefined,
  diffTypes: readonly ElementDefinitionType[] | undefined,
  issues: SnapshotIssue[],
  path: string,
): ElementDefinitionType[] | undefined {
  if (diffTypes === undefined || diffTypes.length === 0) {
    return baseTypes ? [...baseTypes] : undefined;
  }

  if (baseTypes === undefined || baseTypes.length === 0) {
    // No base types to validate against — accept derived as-is
    return [...diffTypes];
  }

  // Validate each derived type against base types
  for (const derivedType of diffTypes) {
    if (!isTypeCompatible(derivedType, baseTypes)) {
      issues.push(
        createSnapshotIssue(
          'error',
          'TYPE_INCOMPATIBLE',
          `Type '${derivedType.code}' is not compatible with base types [${baseTypes.map((t) => t.code).join(', ')}]`,
          path,
        ),
      );
    }
  }

  // Replace base types with derived types (HAPI behavior)
  return [...diffTypes];
}

/**
 * Check whether a derived type is compatible with at least one base type.
 *
 * Special allowances (from HAPI):
 * - `Extension`, `Element`, `*` are always compatible
 * - `Resource`/`DomainResource` are compatible with concrete resource types
 * - `uri` is compatible with `string` (historical workaround)
 */
function isTypeCompatible(
  derivedType: ElementDefinitionType,
  baseTypes: readonly ElementDefinitionType[],
): boolean {
  const dc = derivedType.code;

  // Universal wildcards
  if (dc === 'Extension' || dc === 'Element' || dc === '*') return true;

  for (const baseType of baseTypes) {
    const bc = baseType.code;

    // Exact match
    if (dc === bc) return true;

    // Base wildcard
    if (bc === '*' || bc === 'Element') return true;

    // Resource compatibility
    if (bc === 'Resource' || bc === 'DomainResource') return true;

    // Historical workaround: uri vs string
    if ((dc === 'uri' && bc === 'string') || (dc === 'string' && bc === 'uri')) return true;
  }

  return false;
}

// =============================================================================
// Section 5: Binding Merging
// =============================================================================

/**
 * Merge binding constraints with strength validation.
 *
 * Rules:
 * - Cannot relax a REQUIRED binding (REQUIRED → anything else = error)
 * - Derived binding replaces base binding
 *
 * @returns The merged binding.
 */
export function mergeBinding(
  baseBinding: ElementDefinitionBinding | undefined,
  diffBinding: ElementDefinitionBinding | undefined,
  issues: SnapshotIssue[],
  path: string,
): ElementDefinitionBinding | undefined {
  if (diffBinding === undefined) return baseBinding;

  // Validate: cannot relax REQUIRED binding
  if (baseBinding && baseBinding.strength === 'required' && diffBinding.strength !== 'required') {
    issues.push(
      createSnapshotIssue(
        'error',
        'BINDING_VIOLATION',
        `Cannot relax REQUIRED binding to '${diffBinding.strength}'`,
        path,
      ),
    );
  }

  // Replace base binding with derived binding (HAPI behavior)
  return { ...diffBinding };
}

// =============================================================================
// Section 6: Constraint (Invariant) List Merging
// =============================================================================

/**
 * Merge constraint (invariant) lists by appending derived constraints,
 * de-duplicating by `key`.
 *
 * Base constraints are kept; derived constraints with the same key
 * replace the base version.
 *
 * @returns The merged constraint array.
 */
export function mergeConstraintList(
  baseConstraints: readonly ElementDefinitionConstraint[] | undefined,
  diffConstraints: readonly ElementDefinitionConstraint[] | undefined,
): ElementDefinitionConstraint[] | undefined {
  if (!diffConstraints || diffConstraints.length === 0) {
    return baseConstraints ? [...baseConstraints] : undefined;
  }
  if (!baseConstraints || baseConstraints.length === 0) {
    return [...diffConstraints];
  }

  // Start with base constraints
  const result = [...baseConstraints];
  const keySet = new Set(result.map((c) => c.key));

  for (const dc of diffConstraints) {
    if (keySet.has(dc.key)) {
      // Replace existing constraint with same key
      const idx = result.findIndex((c) => c.key === dc.key);
      if (idx !== -1) result[idx] = { ...dc };
    } else {
      result.push({ ...dc });
      keySet.add(dc.key);
    }
  }

  return result;
}

// =============================================================================
// Section 7: Array Union Helpers
// =============================================================================

/**
 * Merge string arrays (alias) by union.
 */
function mergeStringArray(
  base: readonly string[] | undefined,
  diff: readonly string[] | undefined,
): string[] | undefined {
  if (!diff || diff.length === 0) return base ? [...base] : undefined;
  if (!base || base.length === 0) return [...diff];

  const set = new Set(base);
  const result = [...base];
  for (const item of diff) {
    if (!set.has(item)) {
      result.push(item);
      set.add(item);
    }
  }
  return result;
}

/**
 * Merge example lists by union (based on label).
 */
function mergeExampleList(
  base: readonly ElementDefinitionExample[] | undefined,
  diff: readonly ElementDefinitionExample[] | undefined,
): ElementDefinitionExample[] | undefined {
  if (!diff || diff.length === 0) return base ? [...base] : undefined;
  if (!base || base.length === 0) return [...diff];

  const result = [...base];
  const labelSet = new Set(result.map((e) => e.label));
  for (const ex of diff) {
    if (!labelSet.has(ex.label)) {
      result.push({ ...ex });
      labelSet.add(ex.label);
    }
  }
  return result;
}

/**
 * Merge mapping lists by union (based on identity + map).
 */
function mergeMappingList(
  base: readonly ElementDefinitionMapping[] | undefined,
  diff: readonly ElementDefinitionMapping[] | undefined,
): ElementDefinitionMapping[] | undefined {
  if (!diff || diff.length === 0) return base ? [...base] : undefined;
  if (!base || base.length === 0) return [...diff];

  const result = [...base];
  const keySet = new Set(result.map((m) => `${m.identity}|${m.map}`));
  for (const dm of diff) {
    const key = `${dm.identity}|${dm.map}`;
    if (!keySet.has(key)) {
      result.push({ ...dm });
      keySet.add(key);
    }
  }
  return result;
}

// =============================================================================
// Section 8: Max Comparison Utility
// =============================================================================

/**
 * Determine whether max value `a` is larger than max value `b`.
 *
 * FHIR max is either a non-negative integer string or `"*"` (unbounded).
 * `"*"` is treated as infinity.
 *
 * @example
 * isLargerMax('5', '3')   // true
 * isLargerMax('*', '3')   // true
 * isLargerMax('3', '*')   // false
 * isLargerMax('3', '3')   // false
 * isLargerMax('*', '*')   // false
 */
export function isLargerMax(a: string, b: string): boolean {
  if (a === b) return false;
  if (b === '*') return false; // nothing is larger than unbounded
  if (a === '*') return true;  // unbounded is larger than any number

  const numA = parseInt(a, 10);
  const numB = parseInt(b, 10);

  if (isNaN(numA) || isNaN(numB)) return false;
  return numA > numB;
}
