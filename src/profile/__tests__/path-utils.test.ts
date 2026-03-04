/**
 * path-utils.test.ts — Unit tests for fhir-profile path utility functions.
 *
 * Covers all path operations required by the snapshot generation algorithm:
 * - Basic path operations (match, child, descendant, depth, parent, tail)
 * - Choice type path operations ([x] matching and type extraction)
 * - Slice path operations (:sliceName detection and extraction)
 * - Scope computation (getChildScope for base-driven traversal)
 * - Diff matching (getDiffMatches, hasInnerDiffMatches)
 * - Path rewriting (datatype expansion)
 */

import { describe, it, expect } from 'vitest';
import type { ElementDefinition } from '../../model/index.js';
import type { DiffElementTracker } from '../types.js';
import { createDiffTracker } from '../types.js';
import {
  pathMatches,
  isDirectChild,
  isDescendant,
  pathDepth,
  parentPath,
  tailSegment,
  isChoiceTypePath,
  matchesChoiceType,
  extractChoiceTypeName,
  hasSliceName,
  extractSliceName,
  getChildScope,
  getDiffMatches,
  hasInnerDiffMatches,
  rewritePath,
} from '../path-utils.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal ElementDefinition with just a path (and optional id). */
function ed(path: string, id?: string): ElementDefinition {
  return { path, id } as ElementDefinition;
}

/** Create a DiffElementTracker from a path string. */
function dt(path: string, id?: string): DiffElementTracker {
  return createDiffTracker(ed(path, id));
}

// ===========================================================================
// Section 1: pathMatches
// ===========================================================================

describe('pathMatches', () => {
  it('returns true for identical paths', () => {
    expect(pathMatches('Patient.name', 'Patient.name')).toBe(true);
  });

  it('returns false for different paths', () => {
    expect(pathMatches('Patient.name', 'Patient.identifier')).toBe(false);
  });

  it('returns false for prefix relationship', () => {
    expect(pathMatches('Patient.name', 'Patient.name.given')).toBe(false);
  });

  it('returns true for root-level paths', () => {
    expect(pathMatches('Patient', 'Patient')).toBe(true);
  });
});

// ===========================================================================
// Section 2: isDirectChild
// ===========================================================================

describe('isDirectChild', () => {
  it('returns true for direct child', () => {
    expect(isDirectChild('Patient.name', 'Patient.name.given')).toBe(true);
  });

  it('returns false for grandchild', () => {
    expect(isDirectChild('Patient.name', 'Patient.name.given.value')).toBe(false);
  });

  it('returns false for unrelated path', () => {
    expect(isDirectChild('Patient.name', 'Patient.identifier')).toBe(false);
  });

  it('returns false for same path', () => {
    expect(isDirectChild('Patient.name', 'Patient.name')).toBe(false);
  });

  it('returns true for root-level child', () => {
    expect(isDirectChild('Patient', 'Patient.name')).toBe(true);
  });

  it('does not match partial segment names', () => {
    // "Patient.name" should NOT match "Patient.nameExtra"
    expect(isDirectChild('Patient', 'Patient.nameExtra')).toBe(true);
    // But "Patient.name" should NOT be a child of "Patient.nam"
    expect(isDirectChild('Patient.nam', 'Patient.name')).toBe(false);
  });
});

// ===========================================================================
// Section 3: isDescendant
// ===========================================================================

describe('isDescendant', () => {
  it('returns true for direct child', () => {
    expect(isDescendant('Patient.name', 'Patient.name.given')).toBe(true);
  });

  it('returns true for deep descendant', () => {
    expect(isDescendant('Patient.name', 'Patient.name.given.value')).toBe(true);
  });

  it('returns false for same path', () => {
    expect(isDescendant('Patient.name', 'Patient.name')).toBe(false);
  });

  it('returns false for unrelated path', () => {
    expect(isDescendant('Patient.name', 'Patient.identifier')).toBe(false);
  });

  it('returns false for partial segment match', () => {
    expect(isDescendant('Patient.name', 'Patient.nameExtra.foo')).toBe(false);
  });
});

// ===========================================================================
// Section 4: pathDepth
// ===========================================================================

describe('pathDepth', () => {
  it('returns 1 for root path', () => {
    expect(pathDepth('Patient')).toBe(1);
  });

  it('returns 2 for two-segment path', () => {
    expect(pathDepth('Patient.name')).toBe(2);
  });

  it('returns 3 for three-segment path', () => {
    expect(pathDepth('Patient.name.given')).toBe(3);
  });

  it('returns 0 for empty string', () => {
    expect(pathDepth('')).toBe(0);
  });
});

// ===========================================================================
// Section 5: parentPath
// ===========================================================================

describe('parentPath', () => {
  it('returns parent for multi-segment path', () => {
    expect(parentPath('Patient.name.given')).toBe('Patient.name');
  });

  it('returns root for two-segment path', () => {
    expect(parentPath('Patient.name')).toBe('Patient');
  });

  it('returns undefined for root path', () => {
    expect(parentPath('Patient')).toBeUndefined();
  });
});

// ===========================================================================
// Section 6: tailSegment
// ===========================================================================

describe('tailSegment', () => {
  it('returns last segment', () => {
    expect(tailSegment('Patient.name.given')).toBe('given');
  });

  it('returns whole string for root path', () => {
    expect(tailSegment('Patient')).toBe('Patient');
  });

  it('returns last segment for two-segment path', () => {
    expect(tailSegment('Patient.name')).toBe('name');
  });
});

// ===========================================================================
// Section 7: isChoiceTypePath
// ===========================================================================

describe('isChoiceTypePath', () => {
  it('returns true for [x] path', () => {
    expect(isChoiceTypePath('Observation.value[x]')).toBe(true);
  });

  it('returns false for concrete path', () => {
    expect(isChoiceTypePath('Observation.valueString')).toBe(false);
  });

  it('returns false for plain path', () => {
    expect(isChoiceTypePath('Observation.code')).toBe(false);
  });

  it('returns true for nested choice path', () => {
    expect(isChoiceTypePath('MedicationRequest.medication[x]')).toBe(true);
  });
});

// ===========================================================================
// Section 8: matchesChoiceType
// ===========================================================================

describe('matchesChoiceType', () => {
  it('matches valueString to value[x]', () => {
    expect(matchesChoiceType('Observation.value[x]', 'Observation.valueString')).toBe(true);
  });

  it('matches valueQuantity to value[x]', () => {
    expect(matchesChoiceType('Observation.value[x]', 'Observation.valueQuantity')).toBe(true);
  });

  it('matches valueCodeableConcept to value[x]', () => {
    expect(matchesChoiceType('Observation.value[x]', 'Observation.valueCodeableConcept')).toBe(true);
  });

  it('does not match unrelated path', () => {
    expect(matchesChoiceType('Observation.value[x]', 'Observation.code')).toBe(false);
  });

  it('does not match bare base (no type suffix)', () => {
    expect(matchesChoiceType('Observation.value[x]', 'Observation.value')).toBe(false);
  });

  it('does not match lowercase suffix', () => {
    expect(matchesChoiceType('Observation.value[x]', 'Observation.valuestring')).toBe(false);
  });

  it('returns false when choicePath is not a choice', () => {
    expect(matchesChoiceType('Observation.code', 'Observation.codeString')).toBe(false);
  });

  it('matches medication[x] to medicationReference', () => {
    expect(matchesChoiceType('MedicationRequest.medication[x]', 'MedicationRequest.medicationReference')).toBe(true);
  });
});

// ===========================================================================
// Section 9: extractChoiceTypeName
// ===========================================================================

describe('extractChoiceTypeName', () => {
  it('extracts String from valueString', () => {
    expect(extractChoiceTypeName('Observation.value[x]', 'Observation.valueString')).toBe('String');
  });

  it('extracts Quantity from valueQuantity', () => {
    expect(extractChoiceTypeName('Observation.value[x]', 'Observation.valueQuantity')).toBe('Quantity');
  });

  it('extracts CodeableConcept from valueCodeableConcept', () => {
    expect(extractChoiceTypeName('Observation.value[x]', 'Observation.valueCodeableConcept')).toBe('CodeableConcept');
  });

  it('returns undefined for non-matching path', () => {
    expect(extractChoiceTypeName('Observation.value[x]', 'Observation.code')).toBeUndefined();
  });

  it('extracts Reference from medicationReference', () => {
    expect(extractChoiceTypeName('MedicationRequest.medication[x]', 'MedicationRequest.medicationReference')).toBe('Reference');
  });
});

// ===========================================================================
// Section 10: hasSliceName
// ===========================================================================

describe('hasSliceName', () => {
  it('returns true when id contains colon', () => {
    expect(hasSliceName('Patient.identifier:MRN')).toBe(true);
  });

  it('returns true for slice with child path', () => {
    expect(hasSliceName('Patient.identifier:MRN.system')).toBe(true);
  });

  it('returns false for plain id', () => {
    expect(hasSliceName('Patient.identifier')).toBe(false);
  });

  it('returns false for root path', () => {
    expect(hasSliceName('Patient')).toBe(false);
  });
});

// ===========================================================================
// Section 11: extractSliceName
// ===========================================================================

describe('extractSliceName', () => {
  it('extracts slice name from simple id', () => {
    expect(extractSliceName('Patient.identifier:MRN')).toBe('MRN');
  });

  it('extracts slice name when child path follows', () => {
    expect(extractSliceName('Patient.identifier:MRN.system')).toBe('MRN');
  });

  it('returns undefined for plain id', () => {
    expect(extractSliceName('Patient.identifier')).toBeUndefined();
  });

  it('extracts complex slice name', () => {
    expect(extractSliceName('Patient.extension:ethnicity')).toBe('ethnicity');
  });
});

// ===========================================================================
// Section 12: getChildScope
// ===========================================================================

describe('getChildScope', () => {
  const elements: ElementDefinition[] = [
    ed('Patient'),                    // 0
    ed('Patient.id'),                 // 1
    ed('Patient.name'),               // 2
    ed('Patient.name.given'),         // 3
    ed('Patient.name.family'),        // 4
    ed('Patient.identifier'),         // 5
    ed('Patient.identifier.system'),  // 6
    ed('Patient.identifier.value'),   // 7
  ];

  it('returns correct scope for element with children', () => {
    const scope = getChildScope(elements, 2); // Patient.name
    expect(scope).toBeDefined();
    expect(scope!.start).toBe(3);
    expect(scope!.end).toBe(4);
  });

  it('returns correct scope for element with multiple descendants', () => {
    const scope = getChildScope(elements, 0); // Patient
    expect(scope).toBeDefined();
    expect(scope!.start).toBe(1);
    expect(scope!.end).toBe(7);
  });

  it('returns correct scope for identifier', () => {
    const scope = getChildScope(elements, 5); // Patient.identifier
    expect(scope).toBeDefined();
    expect(scope!.start).toBe(6);
    expect(scope!.end).toBe(7);
  });

  it('returns undefined for leaf element', () => {
    const scope = getChildScope(elements, 3); // Patient.name.given (leaf)
    expect(scope).toBeUndefined();
  });

  it('returns undefined for last element', () => {
    const scope = getChildScope(elements, 7); // Patient.identifier.value (last)
    expect(scope).toBeUndefined();
  });

  it('returns undefined for out-of-bounds index', () => {
    expect(getChildScope(elements, -1)).toBeUndefined();
    expect(getChildScope(elements, 100)).toBeUndefined();
  });
});

// ===========================================================================
// Section 13: getDiffMatches
// ===========================================================================

describe('getDiffMatches', () => {
  it('finds exact path match', () => {
    const trackers = [dt('Patient.name'), dt('Patient.identifier'), dt('Patient.birthDate')];
    const matches = getDiffMatches(trackers, 'Patient.identifier', 0, 2);
    expect(matches).toHaveLength(1);
    expect(matches[0].element.path).toBe('Patient.identifier');
  });

  it('returns empty when no match', () => {
    const trackers = [dt('Patient.name'), dt('Patient.identifier')];
    const matches = getDiffMatches(trackers, 'Patient.birthDate', 0, 1);
    expect(matches).toHaveLength(0);
  });

  it('finds choice type match', () => {
    const trackers = [dt('Observation.valueString'), dt('Observation.code')];
    const matches = getDiffMatches(trackers, 'Observation.value[x]', 0, 1);
    expect(matches).toHaveLength(1);
    expect(matches[0].element.path).toBe('Observation.valueString');
  });

  it('finds multiple choice type matches', () => {
    const trackers = [
      dt('Observation.valueString'),
      dt('Observation.valueQuantity'),
      dt('Observation.code'),
    ];
    const matches = getDiffMatches(trackers, 'Observation.value[x]', 0, 2);
    expect(matches).toHaveLength(2);
  });

  it('respects scope boundaries', () => {
    const trackers = [
      dt('Patient.name'),       // 0
      dt('Patient.identifier'), // 1
      dt('Patient.birthDate'),  // 2
    ];
    // Only search within [0, 0]
    const matches = getDiffMatches(trackers, 'Patient.identifier', 0, 0);
    expect(matches).toHaveLength(0);
  });

  it('finds multiple exact matches (slices with same path)', () => {
    const trackers = [
      dt('Patient.identifier'),
      dt('Patient.identifier'),
      dt('Patient.name'),
    ];
    const matches = getDiffMatches(trackers, 'Patient.identifier', 0, 2);
    expect(matches).toHaveLength(2);
  });
});

// ===========================================================================
// Section 14: hasInnerDiffMatches
// ===========================================================================

describe('hasInnerDiffMatches', () => {
  it('detects direct child in diff', () => {
    const trackers = [dt('Patient.name.given'), dt('Patient.identifier')];
    expect(hasInnerDiffMatches(trackers, 'Patient.name', 0, 1)).toBe(true);
  });

  it('detects deep descendant in diff', () => {
    const trackers = [dt('Patient.name.given.value')];
    expect(hasInnerDiffMatches(trackers, 'Patient.name', 0, 0)).toBe(true);
  });

  it('returns false when no descendants', () => {
    const trackers = [dt('Patient.identifier'), dt('Patient.birthDate')];
    expect(hasInnerDiffMatches(trackers, 'Patient.name', 0, 1)).toBe(false);
  });

  it('returns false for same path (not a descendant)', () => {
    const trackers = [dt('Patient.name')];
    expect(hasInnerDiffMatches(trackers, 'Patient.name', 0, 0)).toBe(false);
  });

  it('detects choice type descendant', () => {
    const trackers = [dt('Observation.valueQuantity.unit')];
    expect(hasInnerDiffMatches(trackers, 'Observation.value[x]', 0, 0)).toBe(true);
  });

  it('does not match choice type without child', () => {
    // valueQuantity alone is not an inner match — it's a direct match
    const trackers = [dt('Observation.valueQuantity')];
    expect(hasInnerDiffMatches(trackers, 'Observation.value[x]', 0, 0)).toBe(false);
  });

  it('respects scope boundaries', () => {
    const trackers = [
      dt('Patient.identifier'),       // 0
      dt('Patient.name.given'),       // 1
    ];
    // Only look at index 0
    expect(hasInnerDiffMatches(trackers, 'Patient.name', 0, 0)).toBe(false);
    // Look at both
    expect(hasInnerDiffMatches(trackers, 'Patient.name', 0, 1)).toBe(true);
  });
});

// ===========================================================================
// Section 15: rewritePath
// ===========================================================================

describe('rewritePath', () => {
  it('rewrites child path from datatype to target', () => {
    expect(rewritePath('Identifier.system', 'Identifier', 'Patient.identifier')).toBe(
      'Patient.identifier.system',
    );
  });

  it('rewrites root path (exact prefix match)', () => {
    expect(rewritePath('Identifier', 'Identifier', 'Patient.identifier')).toBe(
      'Patient.identifier',
    );
  });

  it('rewrites deep path', () => {
    expect(rewritePath('HumanName.given.value', 'HumanName', 'Patient.name')).toBe(
      'Patient.name.given.value',
    );
  });

  it('returns as-is when prefix does not match', () => {
    expect(rewritePath('Address.city', 'Identifier', 'Patient.identifier')).toBe('Address.city');
  });

  it('rewrites CodeableConcept child', () => {
    expect(rewritePath('CodeableConcept.coding', 'CodeableConcept', 'Observation.code')).toBe(
      'Observation.code.coding',
    );
  });

  it('rewrites deeply nested datatype path', () => {
    expect(
      rewritePath('CodeableConcept.coding.system', 'CodeableConcept', 'Observation.code'),
    ).toBe('Observation.code.coding.system');
  });
});
