/**
 * canonical-builder.test.ts — Unit tests for the canonical builder module.
 *
 * Covers:
 * - buildCanonicalProfile (full SD → CanonicalProfile conversion)
 * - buildCanonicalElement (single element normalization)
 * - buildTypeConstraints (type array conversion)
 * - buildBindingConstraint (binding conversion)
 * - buildInvariants (constraint → invariant conversion)
 * - buildSlicingDefinition (slicing definition conversion)
 *
 * Fixture-based tests across 6 categories (30 JSON fixtures).
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  ElementDefinition,
  ElementDefinitionType,
  ElementDefinitionBinding,
  ElementDefinitionConstraint,
  ElementDefinitionSlicing,
  StructureDefinition,
} from '../../model/index.js';
import {
  buildCanonicalProfile,
  buildCanonicalElement,
  buildTypeConstraints,
  buildBindingConstraint,
  buildInvariants,
  buildSlicingDefinition,
} from '../canonical-builder.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

function loadFixture(category: string, name: string): Record<string, unknown> {
  const filePath = resolve(FIXTURES_DIR, category, `${name}.json`);
  return JSON.parse(readFileSync(filePath, 'utf-8'));
}

/** Cast a plain object to ElementDefinition. */
function ed(obj: Record<string, unknown>): ElementDefinition {
  return obj as unknown as ElementDefinition;
}

/** Cast a plain object to StructureDefinition. */
function sd(obj: Record<string, unknown>): StructureDefinition {
  return obj as unknown as StructureDefinition;
}

// ===========================================================================
// Section 1: buildCanonicalProfile — Unit Tests
// ===========================================================================

describe('buildCanonicalProfile', () => {
  it('converts basic SD with snapshot', () => {
    const input = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/TestPatient',
      version: '1.0',
      name: 'TestPatient',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Patient',
      derivation: 'constraint',
      snapshot: {
        element: [
          { path: 'Patient', id: 'Patient', min: 0, max: '*' },
          { path: 'Patient.name', id: 'Patient.name', min: 1, max: '*' },
        ],
      },
    });
    const result = buildCanonicalProfile(input);
    expect(result.url).toBe('http://example.org/TestPatient');
    expect(result.version).toBe('1.0');
    expect(result.name).toBe('TestPatient');
    expect(result.kind).toBe('resource');
    expect(result.abstract).toBe(false);
    expect(result.type).toBe('Patient');
    expect(result.baseProfile).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(result.derivation).toBe('constraint');
    expect(result.elements.size).toBe(2);
  });

  it('throws when snapshot is missing', () => {
    const input = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/NoSnapshot',
      name: 'NoSnapshot',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
    });
    expect(() => buildCanonicalProfile(input)).toThrow('no snapshot');
  });

  it('throws when snapshot has empty elements', () => {
    const input = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/Empty',
      name: 'Empty',
      kind: 'resource',
      abstract: false,
      type: 'Patient',
      snapshot: { element: [] },
    });
    expect(() => buildCanonicalProfile(input)).toThrow('no snapshot');
  });

  it('preserves element insertion order in Map', () => {
    const input = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/Order',
      name: 'Order',
      kind: 'resource',
      abstract: false,
      type: 'Observation',
      snapshot: {
        element: [
          { path: 'Observation', id: 'Observation', min: 0, max: '*' },
          { path: 'Observation.code', id: 'Observation.code', min: 1, max: '1' },
          { path: 'Observation.value[x]', id: 'Observation.value[x]', min: 0, max: '1' },
        ],
      },
    });
    const result = buildCanonicalProfile(input);
    const keys = [...result.elements.keys()];
    expect(keys).toEqual(['Observation', 'Observation.code', 'Observation.value[x]']);
  });

  it('handles SD without version or baseDefinition', () => {
    const input = sd({
      resourceType: 'StructureDefinition',
      url: 'http://example.org/NoVersion',
      name: 'NoVersion',
      kind: 'resource',
      abstract: true,
      type: 'Resource',
      snapshot: {
        element: [{ path: 'Resource', id: 'Resource', min: 0, max: '*' }],
      },
    });
    const result = buildCanonicalProfile(input);
    expect(result.version).toBeUndefined();
    expect(result.baseProfile).toBeUndefined();
    expect(result.abstract).toBe(true);
  });
});

// ===========================================================================
// Section 2: buildCanonicalElement — Unit Tests
// ===========================================================================

describe('buildCanonicalElement', () => {
  it('converts basic element with path, id, min, max', () => {
    const result = buildCanonicalElement(ed({
      path: 'Patient.name', id: 'Patient.name', min: 1, max: '*',
    }));
    expect(result.path).toBe('Patient.name');
    expect(result.id).toBe('Patient.name');
    expect(result.min).toBe(1);
    expect(result.max).toBe('unbounded');
  });

  it('converts max="*" to "unbounded"', () => {
    const result = buildCanonicalElement(ed({ path: 'P.x', min: 0, max: '*' }));
    expect(result.max).toBe('unbounded');
  });

  it('converts max="1" to number 1', () => {
    const result = buildCanonicalElement(ed({ path: 'P.x', min: 0, max: '1' }));
    expect(result.max).toBe(1);
  });

  it('converts max="5" to number 5', () => {
    const result = buildCanonicalElement(ed({ path: 'P.x', min: 0, max: '5' }));
    expect(result.max).toBe(5);
  });

  it('defaults max to 1 when undefined', () => {
    const result = buildCanonicalElement(ed({ path: 'P.x', min: 0 }));
    expect(result.max).toBe(1);
  });

  it('defaults min to 0 when undefined', () => {
    const result = buildCanonicalElement(ed({ path: 'P.x' }));
    expect(result.min).toBe(0);
  });

  it('defaults id to path when id is missing', () => {
    const result = buildCanonicalElement(ed({ path: 'Patient.name', min: 0, max: '1' }));
    expect(result.id).toBe('Patient.name');
  });

  it('normalizes boolean flags to false when undefined', () => {
    const result = buildCanonicalElement(ed({ path: 'P.x', min: 0, max: '1' }));
    expect(result.mustSupport).toBe(false);
    expect(result.isModifier).toBe(false);
    expect(result.isSummary).toBe(false);
  });

  it('preserves boolean flags when set to true', () => {
    const result = buildCanonicalElement(ed({
      path: 'P.x', min: 0, max: '1',
      mustSupport: true, isModifier: true, isSummary: true,
    }));
    expect(result.mustSupport).toBe(true);
    expect(result.isModifier).toBe(true);
    expect(result.isSummary).toBe(true);
  });

  it('defaults types and constraints to empty arrays', () => {
    const result = buildCanonicalElement(ed({ path: 'P.x', min: 0, max: '1' }));
    expect(result.types).toEqual([]);
    expect(result.constraints).toEqual([]);
  });
});

// ===========================================================================
// Section 3: buildTypeConstraints — Unit Tests
// ===========================================================================

describe('buildTypeConstraints', () => {
  it('converts single type', () => {
    const types = [{ code: 'string' }] as unknown as ElementDefinitionType[];
    const result = buildTypeConstraints(types);
    expect(result).toEqual([{ code: 'string' }]);
  });

  it('converts multiple types', () => {
    const types = [
      { code: 'string' },
      { code: 'Quantity' },
    ] as unknown as ElementDefinitionType[];
    const result = buildTypeConstraints(types);
    expect(result).toHaveLength(2);
    expect(result[0].code).toBe('string');
    expect(result[1].code).toBe('Quantity');
  });

  it('converts type with profiles and targetProfiles', () => {
    const types = [{
      code: 'Reference',
      profile: ['http://hl7.org/fhir/StructureDefinition/Reference'],
      targetProfile: ['http://hl7.org/fhir/StructureDefinition/Patient'],
    }] as unknown as ElementDefinitionType[];
    const result = buildTypeConstraints(types);
    expect(result[0].profiles).toEqual(['http://hl7.org/fhir/StructureDefinition/Reference']);
    expect(result[0].targetProfiles).toEqual(['http://hl7.org/fhir/StructureDefinition/Patient']);
  });

  it('returns empty array for undefined', () => {
    expect(buildTypeConstraints(undefined)).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(buildTypeConstraints([] as unknown as ElementDefinitionType[])).toEqual([]);
  });
});

// ===========================================================================
// Section 4: buildBindingConstraint — Unit Tests
// ===========================================================================

describe('buildBindingConstraint', () => {
  it('converts required binding with valueSet', () => {
    const binding = {
      strength: 'required',
      valueSet: 'http://hl7.org/fhir/ValueSet/gender',
      description: 'Gender codes',
    } as unknown as ElementDefinitionBinding;
    const result = buildBindingConstraint(binding);
    expect(result).toBeDefined();
    expect(result!.strength).toBe('required');
    expect(result!.valueSetUrl).toBe('http://hl7.org/fhir/ValueSet/gender');
    expect(result!.description).toBe('Gender codes');
  });

  it('returns undefined for undefined binding', () => {
    expect(buildBindingConstraint(undefined)).toBeUndefined();
  });

  it('returns undefined for binding without strength', () => {
    const binding = { valueSet: 'http://example.org' } as unknown as ElementDefinitionBinding;
    expect(buildBindingConstraint(binding)).toBeUndefined();
  });

  it('handles binding without valueSet', () => {
    const binding = { strength: 'preferred' } as unknown as ElementDefinitionBinding;
    const result = buildBindingConstraint(binding);
    expect(result).toBeDefined();
    expect(result!.strength).toBe('preferred');
    expect(result!.valueSetUrl).toBeUndefined();
  });

  it('handles all binding strengths', () => {
    for (const strength of ['required', 'extensible', 'preferred', 'example']) {
      const binding = { strength } as unknown as ElementDefinitionBinding;
      const result = buildBindingConstraint(binding);
      expect(result!.strength).toBe(strength);
    }
  });
});

// ===========================================================================
// Section 5: buildInvariants — Unit Tests
// ===========================================================================

describe('buildInvariants', () => {
  it('converts single constraint', () => {
    const constraints = [{
      key: 'ele-1',
      severity: 'error',
      human: 'Must have value or children',
      expression: 'hasValue()',
      source: 'http://hl7.org/fhir/StructureDefinition/Element',
    }] as unknown as ElementDefinitionConstraint[];
    const result = buildInvariants(constraints);
    expect(result).toHaveLength(1);
    expect(result[0].key).toBe('ele-1');
    expect(result[0].severity).toBe('error');
    expect(result[0].human).toBe('Must have value or children');
    expect(result[0].expression).toBe('hasValue()');
    expect(result[0].source).toBe('http://hl7.org/fhir/StructureDefinition/Element');
  });

  it('returns empty array for undefined', () => {
    expect(buildInvariants(undefined)).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(buildInvariants([] as unknown as ElementDefinitionConstraint[])).toEqual([]);
  });

  it('handles constraint without expression', () => {
    const constraints = [{
      key: 'custom-1',
      severity: 'error',
      human: 'Custom constraint',
    }] as unknown as ElementDefinitionConstraint[];
    const result = buildInvariants(constraints);
    expect(result[0].expression).toBeUndefined();
  });

  it('converts multiple constraints', () => {
    const constraints = [
      { key: 'a', severity: 'error', human: 'A' },
      { key: 'b', severity: 'warning', human: 'B' },
    ] as unknown as ElementDefinitionConstraint[];
    const result = buildInvariants(constraints);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('a');
    expect(result[1].key).toBe('b');
  });
});

// ===========================================================================
// Section 6: buildSlicingDefinition — Unit Tests
// ===========================================================================

describe('buildSlicingDefinition', () => {
  it('converts basic slicing', () => {
    const slicing = {
      discriminator: [{ type: 'value', path: 'url' }],
      rules: 'open',
      ordered: false,
      description: 'By url',
    } as unknown as ElementDefinitionSlicing;
    const result = buildSlicingDefinition(slicing);
    expect(result).toBeDefined();
    expect(result!.discriminators).toEqual([{ type: 'value', path: 'url' }]);
    expect(result!.rules).toBe('open');
    expect(result!.ordered).toBe(false);
    expect(result!.description).toBe('By url');
  });

  it('returns undefined for undefined slicing', () => {
    expect(buildSlicingDefinition(undefined)).toBeUndefined();
  });

  it('defaults ordered to false when missing', () => {
    const slicing = {
      discriminator: [{ type: 'type', path: '$this' }],
      rules: 'open',
    } as unknown as ElementDefinitionSlicing;
    const result = buildSlicingDefinition(slicing);
    expect(result!.ordered).toBe(false);
  });

  it('handles empty discriminator array', () => {
    const slicing = {
      rules: 'openAtEnd',
    } as unknown as ElementDefinitionSlicing;
    const result = buildSlicingDefinition(slicing);
    expect(result!.discriminators).toEqual([]);
  });

  it('handles multiple discriminators', () => {
    const slicing = {
      discriminator: [
        { type: 'value', path: 'system' },
        { type: 'value', path: 'code' },
      ],
      rules: 'closed',
      ordered: true,
    } as unknown as ElementDefinitionSlicing;
    const result = buildSlicingDefinition(slicing);
    expect(result!.discriminators).toHaveLength(2);
    expect(result!.ordered).toBe(true);
    expect(result!.rules).toBe('closed');
  });
});

// ===========================================================================
// Section 7: Fixture-based tests — 27-build-canonical-profile
// ===========================================================================

describe('Fixture: 27-build-canonical-profile', () => {
  it('basic-profile', () => {
    const fixture = loadFixture('27-build-canonical-profile', 'basic-profile');
    const expected = fixture.expected as any;
    const result = buildCanonicalProfile(sd(fixture.input as Record<string, unknown>));
    expect(result.url).toBe(expected.url);
    expect(result.version).toBe(expected.version);
    expect(result.name).toBe(expected.name);
    expect(result.kind).toBe(expected.kind);
    expect(result.type).toBe(expected.type);
    expect(result.baseProfile).toBe(expected.baseProfile);
    expect(result.abstract).toBe(expected.abstract);
    expect(result.derivation).toBe(expected.derivation);
    expect(result.elements.size).toBe(expected.elementCount);
    expect([...result.elements.keys()]).toEqual(expected.elementPaths);
  });

  it('abstract-type', () => {
    const fixture = loadFixture('27-build-canonical-profile', 'abstract-type');
    const expected = fixture.expected as any;
    const result = buildCanonicalProfile(sd(fixture.input as Record<string, unknown>));
    expect(result.url).toBe(expected.url);
    expect(result.name).toBe(expected.name);
    expect(result.abstract).toBe(expected.abstract);
    expect(result.derivation).toBe(expected.derivation);
    expect(result.elements.size).toBe(expected.elementCount);
  });

  it('no-snapshot-error', () => {
    const fixture = loadFixture('27-build-canonical-profile', 'no-snapshot-error');
    const expected = fixture.expected as any;
    expect(() => buildCanonicalProfile(sd(fixture.input as Record<string, unknown>))).toThrow(
      expected.errorContains,
    );
  });

  it('no-version', () => {
    const fixture = loadFixture('27-build-canonical-profile', 'no-version');
    const expected = fixture.expected as any;
    const result = buildCanonicalProfile(sd(fixture.input as Record<string, unknown>));
    expect(result.url).toBe(expected.url);
    expect(result.version).toBeUndefined();
    expect(result.name).toBe(expected.name);
    expect(result.elements.size).toBe(expected.elementCount);
  });

  it('element-order-preserved', () => {
    const fixture = loadFixture('27-build-canonical-profile', 'element-order-preserved');
    const expected = fixture.expected as any;
    const result = buildCanonicalProfile(sd(fixture.input as Record<string, unknown>));
    expect(result.elements.size).toBe(expected.elementCount);
    expect([...result.elements.keys()]).toEqual(expected.elementPaths);
  });
});

// ===========================================================================
// Section 8: Fixture-based tests — 28-build-canonical-element
// ===========================================================================

describe('Fixture: 28-build-canonical-element', () => {
  it('basic-element', () => {
    const fixture = loadFixture('28-build-canonical-element', 'basic-element');
    const expected = fixture.expected as any;
    const result = buildCanonicalElement(ed(fixture.input as Record<string, unknown>));
    expect(result.path).toBe(expected.path);
    expect(result.id).toBe(expected.id);
    expect(result.min).toBe(expected.min);
    expect(result.max).toBe(expected.max);
    expect(result.mustSupport).toBe(expected.mustSupport);
    expect(result.isModifier).toBe(expected.isModifier);
    expect(result.isSummary).toBe(expected.isSummary);
    expect(result.types).toHaveLength(expected.typesCount);
    expect(result.constraints).toHaveLength(expected.constraintsCount);
  });

  it('max-star-to-unbounded', () => {
    const fixture = loadFixture('28-build-canonical-element', 'max-star-to-unbounded');
    const result = buildCanonicalElement(ed(fixture.input as Record<string, unknown>));
    expect(result.max).toBe('unbounded');
  });

  it('max-numeric', () => {
    const fixture = loadFixture('28-build-canonical-element', 'max-numeric');
    const inputs = fixture.inputs as Record<string, unknown>[];
    const expected = fixture.expected as any[];
    inputs.forEach((input, i) => {
      const result = buildCanonicalElement(ed(input));
      expect(result.max).toBe(expected[i].max);
    });
  });

  it('boolean-flags', () => {
    const fixture = loadFixture('28-build-canonical-element', 'boolean-flags');
    const inputs = fixture.inputs as Record<string, unknown>[];
    const expected = fixture.expected as any[];
    inputs.forEach((input, i) => {
      const result = buildCanonicalElement(ed(input));
      expect(result.mustSupport).toBe(expected[i].mustSupport);
      expect(result.isModifier).toBe(expected[i].isModifier);
      expect(result.isSummary).toBe(expected[i].isSummary);
    });
  });

  it('defaults-for-missing', () => {
    const fixture = loadFixture('28-build-canonical-element', 'defaults-for-missing');
    const expected = fixture.expected as any;
    const result = buildCanonicalElement(ed(fixture.input as Record<string, unknown>));
    expect(result.path).toBe(expected.path);
    expect(result.id).toBe(expected.id);
    expect(result.min).toBe(expected.min);
    expect(result.max).toBe(expected.max);
    expect(result.mustSupport).toBe(expected.mustSupport);
    expect(result.isModifier).toBe(expected.isModifier);
    expect(result.isSummary).toBe(expected.isSummary);
    expect(result.types).toHaveLength(expected.typesCount);
    expect(result.constraints).toHaveLength(expected.constraintsCount);
  });
});

// ===========================================================================
// Section 9: Fixture-based tests — 29-build-type-constraints
// ===========================================================================

describe('Fixture: 29-build-type-constraints', () => {
  it('single-type', () => {
    const fixture = loadFixture('29-build-type-constraints', 'single-type');
    const result = buildTypeConstraints(
      fixture.input as unknown as ElementDefinitionType[],
    );
    expect(result).toEqual(fixture.expected);
  });

  it('multiple-types', () => {
    const fixture = loadFixture('29-build-type-constraints', 'multiple-types');
    const result = buildTypeConstraints(
      fixture.input as unknown as ElementDefinitionType[],
    );
    expect(result).toEqual(fixture.expected);
  });

  it('type-with-profiles', () => {
    const fixture = loadFixture('29-build-type-constraints', 'type-with-profiles');
    const result = buildTypeConstraints(
      fixture.input as unknown as ElementDefinitionType[],
    );
    expect(result).toEqual(fixture.expected);
  });

  it('undefined-types', () => {
    const fixture = loadFixture('29-build-type-constraints', 'undefined-types');
    const result = buildTypeConstraints(
      fixture.input as unknown as ElementDefinitionType[] | undefined,
    );
    expect(result).toEqual(fixture.expected);
  });

  it('empty-types', () => {
    const fixture = loadFixture('29-build-type-constraints', 'empty-types');
    const result = buildTypeConstraints(
      fixture.input as unknown as ElementDefinitionType[],
    );
    expect(result).toEqual(fixture.expected);
  });
});

// ===========================================================================
// Section 10: Fixture-based tests — 30-build-binding
// ===========================================================================

describe('Fixture: 30-build-binding', () => {
  it('required-binding', () => {
    const fixture = loadFixture('30-build-binding', 'required-binding');
    const result = buildBindingConstraint(
      fixture.input as unknown as ElementDefinitionBinding,
    );
    expect(result).toEqual(fixture.expected);
  });

  it('extensible-binding', () => {
    const fixture = loadFixture('30-build-binding', 'extensible-binding');
    const result = buildBindingConstraint(
      fixture.input as unknown as ElementDefinitionBinding,
    );
    expect(result).toEqual(fixture.expected);
  });

  it('undefined-binding', () => {
    const fixture = loadFixture('30-build-binding', 'undefined-binding');
    const result = buildBindingConstraint(
      fixture.input as unknown as ElementDefinitionBinding | undefined,
    );
    expect(result).toBeUndefined();
  });

  it('no-valueset', () => {
    const fixture = loadFixture('30-build-binding', 'no-valueset');
    const result = buildBindingConstraint(
      fixture.input as unknown as ElementDefinitionBinding,
    );
    expect(result).toEqual(fixture.expected);
  });

  it('example-binding', () => {
    const fixture = loadFixture('30-build-binding', 'example-binding');
    const result = buildBindingConstraint(
      fixture.input as unknown as ElementDefinitionBinding,
    );
    expect(result).toEqual(fixture.expected);
  });
});

// ===========================================================================
// Section 11: Fixture-based tests — 31-build-invariants
// ===========================================================================

describe('Fixture: 31-build-invariants', () => {
  it('single-invariant', () => {
    const fixture = loadFixture('31-build-invariants', 'single-invariant');
    const result = buildInvariants(
      fixture.input as unknown as ElementDefinitionConstraint[],
    );
    expect(result).toEqual(fixture.expected);
  });

  it('multiple-invariants', () => {
    const fixture = loadFixture('31-build-invariants', 'multiple-invariants');
    const result = buildInvariants(
      fixture.input as unknown as ElementDefinitionConstraint[],
    );
    expect(result).toEqual(fixture.expected);
  });

  it('undefined-constraints', () => {
    const fixture = loadFixture('31-build-invariants', 'undefined-constraints');
    const result = buildInvariants(
      fixture.input as unknown as ElementDefinitionConstraint[] | undefined,
    );
    expect(result).toEqual(fixture.expected);
  });

  it('warning-severity', () => {
    const fixture = loadFixture('31-build-invariants', 'warning-severity');
    const result = buildInvariants(
      fixture.input as unknown as ElementDefinitionConstraint[],
    );
    expect(result).toEqual(fixture.expected);
  });

  it('no-expression', () => {
    const fixture = loadFixture('31-build-invariants', 'no-expression');
    const result = buildInvariants(
      fixture.input as unknown as ElementDefinitionConstraint[],
    );
    expect(result).toEqual(fixture.expected);
  });
});

// ===========================================================================
// Section 12: Fixture-based tests — 32-build-slicing-def
// ===========================================================================

describe('Fixture: 32-build-slicing-def', () => {
  it('basic-slicing', () => {
    const fixture = loadFixture('32-build-slicing-def', 'basic-slicing');
    const result = buildSlicingDefinition(
      fixture.input as unknown as ElementDefinitionSlicing,
    );
    expect(result).toEqual(fixture.expected);
  });

  it('closed-ordered', () => {
    const fixture = loadFixture('32-build-slicing-def', 'closed-ordered');
    const result = buildSlicingDefinition(
      fixture.input as unknown as ElementDefinitionSlicing,
    );
    expect(result).toEqual(fixture.expected);
  });

  it('undefined-slicing', () => {
    const fixture = loadFixture('32-build-slicing-def', 'undefined-slicing');
    const result = buildSlicingDefinition(
      fixture.input as unknown as ElementDefinitionSlicing | undefined,
    );
    expect(result).toBeUndefined();
  });

  it('ordered-defaults-false', () => {
    const fixture = loadFixture('32-build-slicing-def', 'ordered-defaults-false');
    const result = buildSlicingDefinition(
      fixture.input as unknown as ElementDefinitionSlicing,
    );
    expect(result).toEqual(fixture.expected);
  });

  it('no-discriminators', () => {
    const fixture = loadFixture('32-build-slicing-def', 'no-discriminators');
    const result = buildSlicingDefinition(
      fixture.input as unknown as ElementDefinitionSlicing,
    );
    expect(result).toEqual(fixture.expected);
  });
});
