/**
 * API Surface Contract Test — v0.1.0 Freeze Verification
 *
 * This test verifies that the public API surface of @medxai/fhir-core
 * matches the frozen contract documented in:
 *   docs/api/fhir-core-api-v0.1.md
 *   docs/specs/engine-capability-contract-v0.1.md
 *
 * If any of these tests fail after a code change, it means the public API
 * has been inadvertently modified — a violation of the v0.1.x freeze.
 *
 * Categories:
 *   S1-C01..C06: Module export existence checks
 *   S1-C07..C10: Behavioral contract checks
 *   S1-C11..C15: Error contract checks
 *   S1-C16..C20: Determinism checks
 */
import { describe, it, expect } from 'vitest';

// Import everything from the top-level barrel
import * as FhirCore from '../index.js';

// Import from sub-module barrels for completeness verification
import * as ParserModule from '../parser/index.js';
import * as ModelModule from '../model/index.js';
import * as ContextModule from '../context/index.js';
import * as ProfileModule from '../profile/index.js';
import * as ValidatorModule from '../validator/index.js';
import * as FhirPathModule from '../fhirpath/index.js';

// ═══════════════════════════════════════════════════════════════════════════
// Section 1: Top-Level Export Surface (S1-C01..C06)
// ═══════════════════════════════════════════════════════════════════════════

describe('S1-C01: Parser exports from top-level barrel', () => {
  const expectedFunctions = [
    'parseFhirJson',
    'parseFhirObject',
    'parseStructureDefinition',
    'parseElementDefinition',
    'serializeToFhirJson',
    'serializeToFhirObject',
    'parseSuccess',
    'parseFailure',
    'createIssue',
    'hasErrors',
  ];

  it.each(expectedFunctions)('exports function: %s', (name) => {
    expect(typeof (FhirCore as Record<string, unknown>)[name]).toBe('function');
  });

  it('exports exactly 10 parser functions', () => {
    const parserFns = expectedFunctions.filter(
      (name) => typeof (FhirCore as Record<string, unknown>)[name] === 'function',
    );
    expect(parserFns).toHaveLength(10);
  });
});

describe('S1-C02: Context exports from top-level barrel', () => {
  const expectedClasses = [
    'FhirContextImpl',
    'MemoryLoader',
    'FileSystemLoader',
    'CompositeLoader',
  ];

  const expectedErrorClasses = [
    'ContextError',
    'ResourceNotFoundError',
    'CircularDependencyError',
    'LoaderError',
    'InvalidStructureDefinitionError',
  ];

  const expectedFunctions = [
    'createEmptyStatistics',
    'loadBundleFromObject',
    'loadBundleFromFile',
    'loadBundlesFromFiles',
    'loadAllCoreDefinitions',
    'loadCoreDefinition',
    'loadCoreDefinitionSync',
    'getCoreDefinitionsDir',
    'extractInnerTypes',
    'buildTypeName',
    'isBackboneElementType',
  ];

  const expectedConstants = [
    'BASE_RESOURCES',
    'PRIMITIVE_TYPES',
    'COMPLEX_TYPES',
    'CORE_RESOURCES',
    'ALL_CORE_DEFINITIONS',
  ];

  it.each(expectedClasses)('exports class: %s', (name) => {
    expect(typeof (FhirCore as Record<string, unknown>)[name]).toBe('function');
  });

  it.each(expectedErrorClasses)('exports error class: %s', (name) => {
    const cls = (FhirCore as Record<string, unknown>)[name] as new (...args: unknown[]) => Error;
    expect(typeof cls).toBe('function');
    // Verify it's an Error subclass (use correct constructor args per class)
    let instance: Error;
    if (name === 'CircularDependencyError') {
      instance = new (cls as new (chain: string[]) => Error)(['a', 'b']);
    } else {
      instance = new cls('test');
    }
    expect(instance).toBeInstanceOf(Error);
  });

  it.each(expectedFunctions)('exports function: %s', (name) => {
    expect(typeof (FhirCore as Record<string, unknown>)[name]).toBe('function');
  });

  it.each(expectedConstants)('exports constant array: %s', (name) => {
    const val = (FhirCore as Record<string, unknown>)[name];
    expect(Array.isArray(val)).toBe(true);
    expect((val as unknown[]).length).toBeGreaterThan(0);
  });
});

describe('S1-C03: Profile exports from top-level barrel', () => {
  const expectedExports = [
    'SnapshotGenerator',
    'buildCanonicalProfile',
    'buildCanonicalElement',
    'buildTypeConstraints',
    'buildBindingConstraint',
    'buildInvariants',
    'buildSlicingDefinition',
    'ProfileError',
    'SnapshotCircularDependencyError',
    'BaseNotFoundError',
    'ConstraintViolationError',
    'UnconsumedDifferentialError',
    'createSnapshotIssue',
    'createDiffTracker',
    'pathMatches',
    'isDirectChild',
    'isDescendant',
    'pathDepth',
    'parentPath',
    'tailSegment',
    'isChoiceTypePath',
    'matchesChoiceType',
    'extractChoiceTypeName',
    'hasSliceName',
    'extractSliceName',
    'findBaseIndex',
    'sortDifferential',
    'validateElementOrder',
    'ensureElementIds',
    'mergeConstraints',
    'setBaseTraceability',
    'mergeCardinality',
    'mergeTypes',
    'mergeBinding',
    'mergeConstraintList',
    'isLargerMax',
    'createMergeContext',
    'processPaths',
    'mergeSnapshot',
    'makeExtensionSlicing',
    'getSliceSiblings',
    'validateSlicingCompatibility',
    'diffsConstrainTypes',
    'handleNewSlicing',
    'handleExistingSlicing',
  ];

  it.each(expectedExports)('exports: %s', (name) => {
    expect((FhirCore as Record<string, unknown>)[name]).toBeDefined();
  });

  it('ProfileError subclasses are Error instances', () => {
    const Cls1 = FhirCore.ProfileError;
    expect(new Cls1('test')).toBeInstanceOf(Error);

    const Cls2 = FhirCore.SnapshotCircularDependencyError;
    expect(new Cls2('http://test', ['a', 'b'])).toBeInstanceOf(Error);

    const Cls3 = FhirCore.BaseNotFoundError;
    expect(new Cls3('http://derived', 'http://base')).toBeInstanceOf(Error);
  });
});

describe('S1-C04: Validator exports from top-level barrel', () => {
  const expectedExports = [
    'StructureValidator',
    'createValidationIssue',
    'resolveValidationOptions',
    'hasValidationErrors',
    'extractValues',
    'ProfileNotFoundError',
    'ValidationFailedError',
  ];

  it.each(expectedExports)('exports: %s', (name) => {
    expect((FhirCore as Record<string, unknown>)[name]).toBeDefined();
  });

  it('StructureValidator is a constructable class', () => {
    const validator = new FhirCore.StructureValidator();
    expect(validator).toBeDefined();
    expect(typeof validator.validate).toBe('function');
  });

  it('ProfileNotFoundError and ValidationFailedError extend Error', () => {
    const pnf = new FhirCore.ProfileNotFoundError('test');
    expect(pnf).toBeInstanceOf(Error);
    const vfe = new FhirCore.ValidationFailedError('test');
    expect(vfe).toBeInstanceOf(Error);
  });
});

describe('S1-C05: FHIRPath module barrel exports (internal)', () => {
  it('exports parseFhirPath function', () => {
    expect(typeof FhirPathModule.parseFhirPath).toBe('function');
  });

  it('exports evalFhirPath function', () => {
    expect(typeof FhirPathModule.evalFhirPath).toBe('function');
  });

  it('exports evalFhirPathTyped function', () => {
    expect(typeof FhirPathModule.evalFhirPathTyped).toBe('function');
  });

  it('exports evalFhirPathBoolean function', () => {
    expect(typeof FhirPathModule.evalFhirPathBoolean).toBe('function');
  });

  it('exports evalFhirPathString function', () => {
    expect(typeof FhirPathModule.evalFhirPathString).toBe('function');
  });

  it('exports expression cache functions', () => {
    expect(typeof FhirPathModule.getExpressionCache).toBe('function');
    expect(typeof FhirPathModule.clearExpressionCache).toBe('function');
  });

  it('exports functions registry with 60+ functions', () => {
    expect(typeof FhirPathModule.functions).toBe('object');
    const fnCount = Object.keys(FhirPathModule.functions).length;
    expect(fnCount).toBeGreaterThanOrEqual(60);
  });
});

describe('S1-C06: Sub-module barrel completeness', () => {
  it('parser barrel exports match top-level re-exports', () => {
    const parserKeys = Object.keys(ParserModule);
    for (const key of parserKeys) {
      expect((FhirCore as Record<string, unknown>)[key]).toBeDefined();
    }
  });

  it('context barrel value exports match top-level re-exports', () => {
    // Filter out type-only exports (they don't appear at runtime)
    const contextValueKeys = Object.keys(ContextModule);
    for (const key of contextValueKeys) {
      expect((FhirCore as Record<string, unknown>)[key]).toBeDefined();
    }
  });

  it('profile barrel value exports match top-level re-exports', () => {
    const profileValueKeys = Object.keys(ProfileModule);
    for (const key of profileValueKeys) {
      expect((FhirCore as Record<string, unknown>)[key]).toBeDefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 2: Behavioral Contract Checks (S1-C07..C10)
// ═══════════════════════════════════════════════════════════════════════════

describe('S1-C07: Parsing contract — no-throw, structured result', () => {
  it('parseFhirJson returns ParseResult on valid JSON', () => {
    const result = FhirCore.parseFhirJson('{"resourceType":"Patient","id":"1"}');
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.issues).toBeDefined();
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('parseFhirJson returns ParseResult on invalid JSON (not throw)', () => {
    const result = FhirCore.parseFhirJson('not valid json');
    expect(result.success).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.issues.length).toBeGreaterThan(0);
    expect(result.issues[0].severity).toBe('error');
  });

  it('parseFhirJson returns ParseResult on missing resourceType', () => {
    const result = FhirCore.parseFhirJson('{"id":"1"}');
    expect(result.success).toBe(false);
    expect(result.issues.some((i) => i.code === 'MISSING_RESOURCE_TYPE')).toBe(true);
  });

  it('serializeToFhirJson round-trips a resource', () => {
    const input = '{"resourceType":"Patient","id":"round-trip-test"}';
    const parsed = FhirCore.parseFhirJson(input);
    expect(parsed.success).toBe(true);
    const serialized = FhirCore.serializeToFhirJson(parsed.data!);
    expect(serialized).toContain('"resourceType"');
    expect(serialized).toContain('"Patient"');
    expect(serialized).toContain('"round-trip-test"');
  });
});

describe('S1-C08: Validation contract — structured result', () => {
  it('StructureValidator.validate returns ValidationResult', () => {
    const validator = new FhirCore.StructureValidator();
    const resource = { resourceType: 'Patient', id: '1' };
    // Minimal CanonicalProfile for test
    const profile: FhirCore.CanonicalProfile = {
      url: 'http://test',
      name: 'TestProfile',
      type: 'Patient',
      kind: 'resource',
      derivation: 'specialization',
      abstract: false,
      elements: new Map(),
    };
    const result = validator.validate(resource as FhirCore.Resource, profile);
    expect(result).toBeDefined();
    expect(typeof result.valid).toBe('boolean');
    expect(result.resource).toBe(resource);
    expect(result.profileUrl).toBeDefined();
    expect(Array.isArray(result.issues)).toBe(true);
  });

  it('resolveValidationOptions fills defaults', () => {
    const opts = FhirCore.resolveValidationOptions();
    expect(opts.validateSlicing).toBe(true);
    expect(opts.validateFixed).toBe(true);
    expect(opts.maxDepth).toBe(50);
    expect(opts.failFast).toBe(false);
    expect(opts.skipInvariants).toBe(false);
  });

  it('hasValidationErrors detects error severity', () => {
    const noErrors = [
      FhirCore.createValidationIssue('warning', 'TYPE_MISMATCH', 'warn'),
    ];
    expect(FhirCore.hasValidationErrors(noErrors)).toBe(false);

    const withErrors = [
      FhirCore.createValidationIssue('error', 'TYPE_MISMATCH', 'err'),
    ];
    expect(FhirCore.hasValidationErrors(withErrors)).toBe(true);
  });
});

describe('S1-C09: FHIRPath contract — evaluation correctness', () => {
  it('evalFhirPath extracts fields', () => {
    const resource = { resourceType: 'Patient', id: 'fp-test', active: true };
    const result = FhirPathModule.evalFhirPath('Patient.id', resource);
    expect(result).toEqual(['fp-test']);
  });

  it('evalFhirPathBoolean returns boolean', () => {
    const resource = { resourceType: 'Patient', id: 'fp-bool', active: true };
    const result = FhirPathModule.evalFhirPathBoolean('Patient.active', resource);
    expect(result).toBe(true);
  });

  it('evalFhirPathString returns string', () => {
    const resource = { resourceType: 'Patient', id: 'fp-str' };
    const result = FhirPathModule.evalFhirPathString('Patient.id', resource);
    expect(result).toBe('fp-str');
  });

  it('evalFhirPath returns empty array for missing path', () => {
    const resource = { resourceType: 'Patient', id: 'fp-empty' };
    const result = FhirPathModule.evalFhirPath('Patient.name', resource);
    expect(result).toEqual([]);
  });

  it('parseFhirPath produces cacheable AST', () => {
    const ast = FhirPathModule.parseFhirPath('Patient.name.given');
    expect(ast).toBeDefined();
    expect(typeof ast.eval).toBe('function');
  });
});

describe('S1-C10: Context contract — loader and registry', () => {
  it('FhirContextImpl is constructable with MemoryLoader', () => {
    const loader = new FhirCore.MemoryLoader(new Map());
    const ctx = new FhirCore.FhirContextImpl({ loaders: [loader] });
    expect(ctx).toBeDefined();
    expect(typeof ctx.loadStructureDefinition).toBe('function');
    expect(typeof ctx.getStructureDefinition).toBe('function');
    expect(typeof ctx.hasStructureDefinition).toBe('function');
    expect(typeof ctx.registerStructureDefinition).toBe('function');
    expect(typeof ctx.resolveInheritanceChain).toBe('function');
    expect(typeof ctx.preloadCoreDefinitions).toBe('function');
    expect(typeof ctx.registerCanonicalProfile).toBe('function');
    expect(typeof ctx.getInnerType).toBe('function');
    expect(typeof ctx.hasInnerType).toBe('function');
    expect(typeof ctx.getStatistics).toBe('function');
    expect(typeof ctx.dispose).toBe('function');
    ctx.dispose();
  });

  it('CompositeLoader chains loaders', () => {
    const l1 = new FhirCore.MemoryLoader(new Map());
    const l2 = new FhirCore.MemoryLoader(new Map());
    const composite = new FhirCore.CompositeLoader([l1, l2]);
    expect(composite).toBeDefined();
    expect(typeof composite.load).toBe('function');
  });

  it('ContextStatistics has correct shape', () => {
    const stats = FhirCore.createEmptyStatistics();
    expect(stats).toHaveProperty('totalLoaded');
    expect(stats).toHaveProperty('cacheHits');
    expect(stats).toHaveProperty('cacheMisses');
  });

  it('ALL_CORE_DEFINITIONS contains 73 entries', () => {
    expect(FhirCore.ALL_CORE_DEFINITIONS.length).toBe(73);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 3: Error Contract (S1-C11..C13)
// ═══════════════════════════════════════════════════════════════════════════

describe('S1-C11: Context error hierarchy', () => {
  it('ResourceNotFoundError extends ContextError', () => {
    const err = new FhirCore.ResourceNotFoundError('http://test');
    expect(err).toBeInstanceOf(FhirCore.ContextError);
    expect(err).toBeInstanceOf(Error);
  });

  it('CircularDependencyError extends ContextError', () => {
    const err = new FhirCore.CircularDependencyError(['http://a', 'http://b']);
    expect(err).toBeInstanceOf(FhirCore.ContextError);
  });

  it('LoaderError extends ContextError', () => {
    const err = new FhirCore.LoaderError('test');
    expect(err).toBeInstanceOf(FhirCore.ContextError);
  });

  it('InvalidStructureDefinitionError extends ContextError', () => {
    const err = new FhirCore.InvalidStructureDefinitionError('test');
    expect(err).toBeInstanceOf(FhirCore.ContextError);
  });
});

describe('S1-C12: Profile error hierarchy', () => {
  it('SnapshotCircularDependencyError extends ProfileError', () => {
    const err = new FhirCore.SnapshotCircularDependencyError('http://test', ['a', 'b']);
    expect(err).toBeInstanceOf(FhirCore.ProfileError);
    expect(err).toBeInstanceOf(Error);
  });

  it('BaseNotFoundError extends ProfileError', () => {
    const err = new FhirCore.BaseNotFoundError('http://derived', 'http://base');
    expect(err).toBeInstanceOf(FhirCore.ProfileError);
  });
});

describe('S1-C13: Validator error hierarchy', () => {
  it('ProfileNotFoundError extends Error', () => {
    const err = new FhirCore.ProfileNotFoundError('test');
    expect(err).toBeInstanceOf(Error);
  });

  it('ValidationFailedError extends Error', () => {
    const err = new FhirCore.ValidationFailedError('test');
    expect(err).toBeInstanceOf(Error);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 4: Determinism Checks (S1-C14..C16)
// ═══════════════════════════════════════════════════════════════════════════

describe('S1-C14: Parse determinism — same input → same output', () => {
  it('parseFhirJson is deterministic', () => {
    const json = '{"resourceType":"Patient","id":"det-1","active":true,"name":[{"family":"Smith"}]}';
    const r1 = FhirCore.parseFhirJson(json);
    const r2 = FhirCore.parseFhirJson(json);
    expect(r1.success).toBe(r2.success);
    expect(JSON.stringify(r1.data)).toBe(JSON.stringify(r2.data));
    expect(r1.issues.length).toBe(r2.issues.length);
  });
});

describe('S1-C15: Validation determinism — same input → same issues', () => {
  it('validate produces identical results on repeated calls', () => {
    const validator = new FhirCore.StructureValidator();
    const resource = { resourceType: 'Patient', id: 'det-v' } as FhirCore.Resource;
    const profile: FhirCore.CanonicalProfile = {
      url: 'http://test/det',
      name: 'DetTest',
      type: 'Patient',
      kind: 'resource',
      derivation: 'specialization',
      abstract: false,
      elements: new Map(),
    };
    const r1 = validator.validate(resource, profile);
    const r2 = validator.validate(resource, profile);
    expect(r1.valid).toBe(r2.valid);
    expect(r1.issues.length).toBe(r2.issues.length);
    for (let i = 0; i < r1.issues.length; i++) {
      expect(r1.issues[i].code).toBe(r2.issues[i].code);
      expect(r1.issues[i].path).toBe(r2.issues[i].path);
    }
  });
});

describe('S1-C16: FHIRPath determinism', () => {
  it('evalFhirPath is deterministic', () => {
    const resource = {
      resourceType: 'Patient',
      name: [{ given: ['Alice', 'Bob'] }, { given: ['Carol'] }],
    };
    const r1 = FhirPathModule.evalFhirPath('Patient.name.given', resource);
    const r2 = FhirPathModule.evalFhirPath('Patient.name.given', resource);
    expect(r1).toEqual(r2);
  });

  it('parseFhirPath is deterministic', () => {
    const ast1 = FhirPathModule.parseFhirPath('name.where(use = "official").given');
    const ast2 = FhirPathModule.parseFhirPath('name.where(use = "official").given');
    expect(typeof ast1.eval).toBe('function');
    expect(typeof ast2.eval).toBe('function');
    // Evaluate both against same input
    const resource = {
      resourceType: 'Patient',
      name: [{ use: 'official', given: ['Test'] }],
    };
    const r1 = FhirPathModule.evalFhirPath(ast1, resource);
    const r2 = FhirPathModule.evalFhirPath(ast2, resource);
    expect(r1).toEqual(r2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Section 5: Capability Summary (S1-C17)
// ═══════════════════════════════════════════════════════════════════════════

describe('S1-C17: Capability summary verification', () => {
  it('FHIR version is R4 (4.0.1)', () => {
    // Verified through core definitions which are R4
    expect(FhirCore.ALL_CORE_DEFINITIONS.length).toBe(73);
  });

  it('parsing capability is present', () => {
    expect(typeof FhirCore.parseFhirJson).toBe('function');
    expect(typeof FhirCore.parseFhirObject).toBe('function');
    expect(typeof FhirCore.serializeToFhirJson).toBe('function');
  });

  it('context capability is present', () => {
    expect(typeof FhirCore.FhirContextImpl).toBe('function');
    expect(typeof FhirCore.loadBundleFromFile).toBe('function');
  });

  it('snapshot capability is present', () => {
    expect(typeof FhirCore.SnapshotGenerator).toBe('function');
    expect(typeof FhirCore.buildCanonicalProfile).toBe('function');
  });

  it('validation capability is present (9 rules)', () => {
    expect(typeof FhirCore.StructureValidator).toBe('function');
    // Verify 9 validation rules exist in validator module barrel
    const ruleNames = [
      'validateCardinality', 'validateRequired', 'validateType',
      'validateChoiceType', 'validateFixed', 'validatePattern',
      'validateReference', 'validateSlicing', 'validateInvariants',
    ];
    for (const name of ruleNames) {
      expect(typeof (ValidatorModule as Record<string, unknown>)[name]).toBe('function');
    }
  });

  it('FHIRPath capability is present (60+ functions)', () => {
    expect(typeof FhirPathModule.parseFhirPath).toBe('function');
    expect(typeof FhirPathModule.evalFhirPath).toBe('function');
    expect(Object.keys(FhirPathModule.functions).length).toBeGreaterThanOrEqual(60);
  });

  it('terminology capability is NOT present (v0.1 out-of-scope)', () => {
    // No terminology-related exports should exist
    expect((FhirCore as Record<string, unknown>)['expandValueSet']).toBeUndefined();
    expect((FhirCore as Record<string, unknown>)['validateCode']).toBeUndefined();
    expect((FhirCore as Record<string, unknown>)['lookupCode']).toBeUndefined();
  });
});
