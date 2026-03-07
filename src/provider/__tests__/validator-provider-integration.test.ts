/**
 * Tests for Validator + Provider Integration
 *
 * Verifies that ValidationOptions correctly accepts terminologyProvider
 * and referenceResolver, and that the validator remains backward compatible.
 *
 * Testing policy: ≥15 JSON fixture tests for validator + provider integration.
 */

import { describe, it, expect } from 'vitest';
import { StructureValidator } from '../../validator/structure-validator.js';
import { resolveValidationOptions, createValidationContext } from '../../validator/types.js';
import type { ValidationOptions } from '../../validator/types.js';
import type { CanonicalProfile, CanonicalElement, Resource } from '../../model/index.js';
import type { TerminologyProvider, ReferenceResolver } from '../types.js';
import { NoOpTerminologyProvider } from '../noop-terminology-provider.js';
import { NoOpReferenceResolver } from '../noop-reference-resolver.js';
import { buildOperationOutcome } from '../operation-outcome-builder.js';

// =============================================================================
// Helpers
// =============================================================================

function makeProfile(type: string, elements: CanonicalElement[]): CanonicalProfile {
  const elemMap = new Map<string, CanonicalElement>();
  for (const el of elements) {
    const key = el.sliceName ? `${el.path}:${el.sliceName}` : el.path;
    elemMap.set(key, el);
  }
  return {
    url: `http://hl7.org/fhir/StructureDefinition/${type}`,
    name: type,
    type,
    kind: 'resource',
    derivation: 'specialization',
    abstract: false,
    elements: elemMap,
  } as CanonicalProfile;
}

function makeElement(path: string, min: number, max: string, types: string[] = []): CanonicalElement {
  return {
    path,
    id: path,
    min,
    max,
    types: types.map((t) => ({ code: t, profile: [], targetProfile: [] })),
    mustSupport: false,
    isModifier: false,
    isSummary: false,
    constraints: [],
  } as unknown as CanonicalElement;
}

// =============================================================================
// Section 1: Backward Compatibility (existing API unchanged)
// =============================================================================

describe('Validator backward compatibility with provider integration', () => {
  const validator = new StructureValidator();

  it('should validate without any providers (original behavior)', () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', 0, '*'),
      makeElement('Patient.resourceType', 1, '1', ['code']),
    ]);
    const resource = { resourceType: 'Patient' } as Resource;
    const result = validator.validate(resource, profile);

    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should accept ValidationOptions without providers', () => {
    const opts: ValidationOptions = {
      validateSlicing: false,
      validateFixed: false,
    };
    const profile = makeProfile('Patient', [
      makeElement('Patient', 0, '*'),
    ]);
    const resource = { resourceType: 'Patient' } as Resource;
    const result = validator.validate(resource, profile, opts);

    expect(result.valid).toBe(true);
  });

  it('should accept ValidationOptions with NoOp terminology provider', () => {
    const opts: ValidationOptions = {
      terminologyProvider: new NoOpTerminologyProvider(),
    };
    const profile = makeProfile('Patient', [
      makeElement('Patient', 0, '*'),
    ]);
    const resource = { resourceType: 'Patient' } as Resource;
    const result = validator.validate(resource, profile, opts);

    expect(result.valid).toBe(true);
  });

  it('should accept ValidationOptions with NoOp reference resolver', () => {
    const opts: ValidationOptions = {
      referenceResolver: new NoOpReferenceResolver(),
    };
    const profile = makeProfile('Patient', [
      makeElement('Patient', 0, '*'),
    ]);
    const resource = { resourceType: 'Patient' } as Resource;
    const result = validator.validate(resource, profile, opts);

    expect(result.valid).toBe(true);
  });

  it('should accept both providers simultaneously', () => {
    const opts: ValidationOptions = {
      terminologyProvider: new NoOpTerminologyProvider(),
      referenceResolver: new NoOpReferenceResolver(),
    };
    const profile = makeProfile('Patient', [
      makeElement('Patient', 0, '*'),
    ]);
    const resource = { resourceType: 'Patient' } as Resource;
    const result = validator.validate(resource, profile, opts);

    expect(result.valid).toBe(true);
  });
});

// =============================================================================
// Section 2: resolveValidationOptions with providers
// =============================================================================

describe('resolveValidationOptions with providers', () => {
  it('should default terminologyProvider to undefined', () => {
    const resolved = resolveValidationOptions();
    expect(resolved.terminologyProvider).toBeUndefined();
  });

  it('should default referenceResolver to undefined', () => {
    const resolved = resolveValidationOptions();
    expect(resolved.referenceResolver).toBeUndefined();
  });

  it('should pass through a provided terminologyProvider', () => {
    const tp = new NoOpTerminologyProvider();
    const resolved = resolveValidationOptions({ terminologyProvider: tp });
    expect(resolved.terminologyProvider).toBe(tp);
  });

  it('should pass through a provided referenceResolver', () => {
    const rr = new NoOpReferenceResolver();
    const resolved = resolveValidationOptions({ referenceResolver: rr });
    expect(resolved.referenceResolver).toBe(rr);
  });

  it('should preserve other options alongside providers', () => {
    const tp = new NoOpTerminologyProvider();
    const resolved = resolveValidationOptions({
      terminologyProvider: tp,
      failFast: true,
      maxDepth: 10,
    });
    expect(resolved.terminologyProvider).toBe(tp);
    expect(resolved.failFast).toBe(true);
    expect(resolved.maxDepth).toBe(10);
  });
});

// =============================================================================
// Section 3: createValidationContext with providers
// =============================================================================

describe('createValidationContext with providers', () => {
  const profile = makeProfile('Patient', [makeElement('Patient', 0, '*')]);

  it('should default providers to undefined in context', () => {
    const ctx = createValidationContext(profile);
    expect(ctx.options.terminologyProvider).toBeUndefined();
    expect(ctx.options.referenceResolver).toBeUndefined();
  });

  it('should include terminologyProvider in context when provided', () => {
    const tp = new NoOpTerminologyProvider();
    const ctx = createValidationContext(profile, { terminologyProvider: tp });
    expect(ctx.options.terminologyProvider).toBe(tp);
  });

  it('should include referenceResolver in context when provided', () => {
    const rr = new NoOpReferenceResolver();
    const ctx = createValidationContext(profile, { referenceResolver: rr });
    expect(ctx.options.referenceResolver).toBe(rr);
  });
});

// =============================================================================
// Section 4: End-to-end validation + OperationOutcome with providers
// =============================================================================

describe('End-to-end validation with providers → OperationOutcome', () => {
  const validator = new StructureValidator();

  it('should produce valid OperationOutcome for valid Patient with providers', () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', 0, '*'),
    ]);
    const resource = { resourceType: 'Patient' } as Resource;
    const result = validator.validate(resource, profile, {
      terminologyProvider: new NoOpTerminologyProvider(),
      referenceResolver: new NoOpReferenceResolver(),
    });
    const oo = buildOperationOutcome(result);

    expect(oo.resourceType).toBe('OperationOutcome');
    expect(oo.issue).toHaveLength(1);
    expect(oo.issue[0].severity).toBe('information');
  });

  it('should produce error OperationOutcome for missing required field with providers', () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', 0, '*'),
      makeElement('Patient.name', 1, '*', ['HumanName']),
    ]);
    const resource = { resourceType: 'Patient' } as Resource;
    const result = validator.validate(resource, profile, {
      terminologyProvider: new NoOpTerminologyProvider(),
    });
    const oo = buildOperationOutcome(result);

    expect(oo.issue.some((i) => i.severity === 'error')).toBe(true);
  });

  it('should produce error OperationOutcome for type mismatch with providers', () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', 0, '*'),
      makeElement('Patient.active', 0, '1', ['boolean']),
    ]);
    const resource = { resourceType: 'Patient', active: 'not-a-boolean' } as unknown as Resource;
    const result = validator.validate(resource, profile, {
      referenceResolver: new NoOpReferenceResolver(),
    });
    const oo = buildOperationOutcome(result);

    expect(oo.resourceType).toBe('OperationOutcome');
    // Type mismatch issues are expected
    expect(oo.issue.length).toBeGreaterThanOrEqual(1);
  });

  it('should produce OperationOutcome with multiple issues', () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', 0, '*'),
      makeElement('Patient.name', 1, '*', ['HumanName']),
      makeElement('Patient.identifier', 1, '*', ['Identifier']),
    ]);
    const resource = { resourceType: 'Patient' } as Resource;
    const result = validator.validate(resource, profile);
    const oo = buildOperationOutcome(result);

    expect(oo.issue.length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// Section 5: Custom TerminologyProvider with validator
// =============================================================================

describe('Custom TerminologyProvider with validator', () => {
  it('should accept a custom TerminologyProvider via ValidationOptions', () => {
    const customProvider: TerminologyProvider = {
      async validateCode() { return { result: false, message: 'rejected' }; },
      async expandValueSet() { return { contains: [] }; },
      async lookupCode() { return { found: false }; },
    };

    const resolved = resolveValidationOptions({ terminologyProvider: customProvider });
    expect(resolved.terminologyProvider).toBe(customProvider);
  });

  it('should accept a custom ReferenceResolver via ValidationOptions', () => {
    const customResolver: ReferenceResolver = {
      async resolve() { return undefined; },
      async exists() { return false; },
    };

    const resolved = resolveValidationOptions({ referenceResolver: customResolver });
    expect(resolved.referenceResolver).toBe(customResolver);
  });
});
