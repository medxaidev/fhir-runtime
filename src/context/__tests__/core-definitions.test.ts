/**
 * Tests for FHIR R4 Core Definitions Preparation (Task 3.5)
 *
 * Covers:
 * - Core definition manifest completeness
 * - Loading individual definitions (sync and async)
 * - Loading all definitions as a Map
 * - Inheritance chain completeness (no broken references)
 * - Validation of extracted definitions
 *
 * @module fhir-context
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { existsSync } from 'node:fs';

import type { StructureDefinition } from '../../model/index.js';
import {
  BASE_RESOURCES,
  PRIMITIVE_TYPES,
  COMPLEX_TYPES,
  CORE_RESOURCES,
  ALL_CORE_DEFINITIONS,
  getCoreDefinitionsDir,
  loadCoreDefinitionSync,
  loadCoreDefinition,
  loadAllCoreDefinitions,
} from '../core-definitions/index.js';
import { StructureDefinitionRegistry } from '../registry.js';
import {
  InheritanceChainResolver,
  type DefinitionProvider,
} from '../inheritance-resolver.js';
import { ResourceNotFoundError } from '../errors.js';

// =============================================================================
// Helpers
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CORE_DIR = getCoreDefinitionsDir();

// =============================================================================
// Section 1: Manifest Completeness
// =============================================================================

describe('Core definition manifest', () => {
  it('BASE_RESOURCES contains the essential base types', () => {
    expect(BASE_RESOURCES).toContain('Resource');
    expect(BASE_RESOURCES).toContain('DomainResource');
    expect(BASE_RESOURCES).toContain('Element');
    expect(BASE_RESOURCES).toContain('BackboneElement');
    expect(BASE_RESOURCES).toContain('Extension');
  });

  it('PRIMITIVE_TYPES contains all 20 FHIR R4 primitives', () => {
    expect(PRIMITIVE_TYPES.length).toBe(20);
    expect(PRIMITIVE_TYPES).toContain('string');
    expect(PRIMITIVE_TYPES).toContain('boolean');
    expect(PRIMITIVE_TYPES).toContain('integer');
    expect(PRIMITIVE_TYPES).toContain('decimal');
    expect(PRIMITIVE_TYPES).toContain('dateTime');
    expect(PRIMITIVE_TYPES).toContain('code');
    expect(PRIMITIVE_TYPES).toContain('uri');
    expect(PRIMITIVE_TYPES).toContain('canonical');
  });

  it('COMPLEX_TYPES contains common complex types', () => {
    expect(COMPLEX_TYPES).toContain('CodeableConcept');
    expect(COMPLEX_TYPES).toContain('Coding');
    expect(COMPLEX_TYPES).toContain('Identifier');
    expect(COMPLEX_TYPES).toContain('Reference');
    expect(COMPLEX_TYPES).toContain('Quantity');
    expect(COMPLEX_TYPES).toContain('Period');
    expect(COMPLEX_TYPES).toContain('HumanName');
    expect(COMPLEX_TYPES).toContain('Meta');
    expect(COMPLEX_TYPES).toContain('Narrative');
  });

  it('CORE_RESOURCES contains commonly used clinical resources', () => {
    expect(CORE_RESOURCES).toContain('Patient');
    expect(CORE_RESOURCES).toContain('Observation');
    expect(CORE_RESOURCES).toContain('Condition');
    expect(CORE_RESOURCES).toContain('Encounter');
    expect(CORE_RESOURCES).toContain('MedicationRequest');
    expect(CORE_RESOURCES).toContain('Bundle');
    expect(CORE_RESOURCES).toContain('StructureDefinition');
    expect(CORE_RESOURCES).toContain('ValueSet');
  });

  it('ALL_CORE_DEFINITIONS is the union of all categories', () => {
    const expected =
      BASE_RESOURCES.length +
      PRIMITIVE_TYPES.length +
      COMPLEX_TYPES.length +
      CORE_RESOURCES.length;
    expect(ALL_CORE_DEFINITIONS.length).toBe(expected);
    expect(ALL_CORE_DEFINITIONS.length).toBe(73);
  });

  it('ALL_CORE_DEFINITIONS has no duplicates', () => {
    const unique = new Set(ALL_CORE_DEFINITIONS);
    expect(unique.size).toBe(ALL_CORE_DEFINITIONS.length);
  });

  it('all JSON files exist on disk', () => {
    for (const name of ALL_CORE_DEFINITIONS) {
      const filePath = join(CORE_DIR, `${name}.json`);
      expect(existsSync(filePath), `Missing: ${name}.json`).toBe(true);
    }
  });
});

// =============================================================================
// Section 2: Individual Definition Loading
// =============================================================================

describe('loadCoreDefinitionSync', () => {
  it('loads Resource (root, no baseDefinition)', () => {
    const sd = loadCoreDefinitionSync('Resource', CORE_DIR);
    expect(sd.url).toBe('http://hl7.org/fhir/StructureDefinition/Resource');
    expect(sd.name).toBe('Resource');
    expect(sd.kind).toBe('resource');
    expect(sd.abstract).toBe(true);
    expect(sd.baseDefinition).toBeUndefined();
  });

  it('loads DomainResource (extends Resource)', () => {
    const sd = loadCoreDefinitionSync('DomainResource', CORE_DIR);
    expect(sd.url).toBe('http://hl7.org/fhir/StructureDefinition/DomainResource');
    expect(sd.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Resource');
    expect(sd.abstract).toBe(true);
  });

  it('loads Element (root of data type hierarchy)', () => {
    const sd = loadCoreDefinitionSync('Element', CORE_DIR);
    expect(sd.url).toBe('http://hl7.org/fhir/StructureDefinition/Element');
    expect(sd.kind).toBe('complex-type');
    expect(sd.baseDefinition).toBeUndefined();
  });

  it('loads Patient (concrete resource)', () => {
    const sd = loadCoreDefinitionSync('Patient', CORE_DIR);
    expect(sd.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(sd.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/DomainResource');
    expect(sd.abstract).toBe(false);
    expect(sd.snapshot).toBeDefined();
  });

  it('loads string (primitive type)', () => {
    const sd = loadCoreDefinitionSync('string', CORE_DIR);
    expect(sd.url).toBe('http://hl7.org/fhir/StructureDefinition/string');
    expect(sd.kind).toBe('primitive-type');
    expect(sd.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Element');
  });

  it('loads CodeableConcept (complex type)', () => {
    const sd = loadCoreDefinitionSync('CodeableConcept', CORE_DIR);
    expect(sd.url).toBe('http://hl7.org/fhir/StructureDefinition/CodeableConcept');
    expect(sd.kind).toBe('complex-type');
    expect(sd.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Element');
  });

  it('loads Bundle (extends Resource directly, not DomainResource)', () => {
    const sd = loadCoreDefinitionSync('Bundle', CORE_DIR);
    expect(sd.url).toBe('http://hl7.org/fhir/StructureDefinition/Bundle');
    expect(sd.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Resource');
  });

  it('throws LoaderError for non-existent definition', () => {
    expect(() => loadCoreDefinitionSync('NonExistent', CORE_DIR)).toThrow();
  });
});

describe('loadCoreDefinition (async)', () => {
  it('loads Patient asynchronously', async () => {
    const sd = await loadCoreDefinition('Patient', CORE_DIR);
    expect(sd.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(sd.name).toBe('Patient');
  });

  it('loads Extension asynchronously', async () => {
    const sd = await loadCoreDefinition('Extension', CORE_DIR);
    expect(sd.url).toBe('http://hl7.org/fhir/StructureDefinition/Extension');
    expect(sd.kind).toBe('complex-type');
  });
});

// =============================================================================
// Section 3: Load All Definitions
// =============================================================================

describe('loadAllCoreDefinitions', () => {
  it('loads all 73 definitions into a Map', async () => {
    const defs = await loadAllCoreDefinitions();
    expect(defs.size).toBe(73);
  });

  it('all definitions have valid url and name', async () => {
    const defs = await loadAllCoreDefinitions();
    defs.forEach((sd, url) => {
      expect(sd.url, `${url} missing url`).toBeDefined();
      expect(sd.name, `${url} missing name`).toBeDefined();
      expect(sd.kind, `${url} missing kind`).toBeDefined();
      expect(sd.status, `${url} missing status`).toBeDefined();
    });
  });

  it('all definitions are FHIR R4 v4.0.1', async () => {
    const defs = await loadAllCoreDefinitions();
    defs.forEach((sd) => {
      expect(sd.version).toBe('4.0.1');
    });
  });

  it('contains all base resources', async () => {
    const defs = await loadAllCoreDefinitions();
    for (const name of BASE_RESOURCES) {
      const url = `http://hl7.org/fhir/StructureDefinition/${name}`;
      expect(defs.has(url), `Missing base: ${name}`).toBe(true);
    }
  });

  it('contains all primitive types', async () => {
    const defs = await loadAllCoreDefinitions();
    for (const name of PRIMITIVE_TYPES) {
      const url = `http://hl7.org/fhir/StructureDefinition/${name}`;
      expect(defs.has(url), `Missing primitive: ${name}`).toBe(true);
    }
  });
});

// =============================================================================
// Section 4: Inheritance Chain Completeness
// =============================================================================

describe('Inheritance chain completeness', () => {
  let allDefs: Map<string, StructureDefinition>;
  let resolver: InheritanceChainResolver;

  // Load once for all tests in this block
  it('setup: load all definitions', async () => {
    allDefs = await loadAllCoreDefinitions();
    const provider: DefinitionProvider = {
      async loadStructureDefinition(url: string) {
        const sd = allDefs.get(url);
        if (!sd) throw new ResourceNotFoundError(url, ['core-definitions']);
        return sd;
      },
    };
    resolver = new InheritanceChainResolver(provider);
  });

  it('all resource types have complete inheritance chains', async () => {
    for (const name of CORE_RESOURCES) {
      const url = `http://hl7.org/fhir/StructureDefinition/${name}`;
      const chain = await resolver.resolve(url);
      expect(chain.length, `${name} chain too short`).toBeGreaterThanOrEqual(2);
      // All resource chains must end at Resource
      expect(
        chain[chain.length - 1],
        `${name} chain does not end at Resource`,
      ).toBe('http://hl7.org/fhir/StructureDefinition/Resource');
    }
  });

  it('all primitive types chain to Element', async () => {
    for (const name of PRIMITIVE_TYPES) {
      const url = `http://hl7.org/fhir/StructureDefinition/${name}`;
      const chain = await resolver.resolve(url);
      expect(chain.length, `${name} chain too short`).toBeGreaterThanOrEqual(2);
      expect(
        chain[chain.length - 1],
        `${name} chain does not end at Element`,
      ).toBe('http://hl7.org/fhir/StructureDefinition/Element');
    }
  });

  it('all complex types chain to Element', async () => {
    for (const name of COMPLEX_TYPES) {
      const url = `http://hl7.org/fhir/StructureDefinition/${name}`;
      const chain = await resolver.resolve(url);
      expect(chain.length, `${name} chain too short`).toBeGreaterThanOrEqual(2);
      expect(
        chain[chain.length - 1],
        `${name} chain does not end at Element`,
      ).toBe('http://hl7.org/fhir/StructureDefinition/Element');
    }
  });

  it('Patient chain: Patient → DomainResource → Resource', async () => {
    const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(chain).toEqual([
      'http://hl7.org/fhir/StructureDefinition/Patient',
      'http://hl7.org/fhir/StructureDefinition/DomainResource',
      'http://hl7.org/fhir/StructureDefinition/Resource',
    ]);
  });

  it('Bundle chain: Bundle → Resource (no DomainResource)', async () => {
    const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Bundle');
    expect(chain).toEqual([
      'http://hl7.org/fhir/StructureDefinition/Bundle',
      'http://hl7.org/fhir/StructureDefinition/Resource',
    ]);
  });

  it('Extension chain: Extension → Element', async () => {
    const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Extension');
    expect(chain).toEqual([
      'http://hl7.org/fhir/StructureDefinition/Extension',
      'http://hl7.org/fhir/StructureDefinition/Element',
    ]);
  });

  it('no circular dependencies in any definition', async () => {
    for (const name of ALL_CORE_DEFINITIONS) {
      const url = `http://hl7.org/fhir/StructureDefinition/${name}`;
      // Should not throw CircularDependencyError
      await expect(resolver.resolve(url)).resolves.toBeDefined();
    }
  });
});

// =============================================================================
// Section 5: Registry Integration
// =============================================================================

describe('Registry integration with core definitions', () => {
  it('all core definitions can be registered in the registry', async () => {
    const defs = await loadAllCoreDefinitions();
    const registry = new StructureDefinitionRegistry();

    defs.forEach((sd) => registry.register(sd));

    expect(registry.size).toBe(73);
  });

  it('registry queries work after bulk registration', async () => {
    const defs = await loadAllCoreDefinitions();
    const registry = new StructureDefinitionRegistry();
    defs.forEach((sd) => registry.register(sd));

    // Spot-check some definitions
    expect(registry.has('http://hl7.org/fhir/StructureDefinition/Patient')).toBe(true);
    expect(registry.has('http://hl7.org/fhir/StructureDefinition/string')).toBe(true);
    expect(registry.has('http://hl7.org/fhir/StructureDefinition/CodeableConcept')).toBe(true);
    expect(registry.has('http://hl7.org/fhir/StructureDefinition/NonExistent')).toBe(false);

    const patient = registry.get('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(patient).toBeDefined();
    expect((patient as any).name).toBe('Patient');
  });

  it('versioned lookup works with core definitions', async () => {
    const defs = await loadAllCoreDefinitions();
    const registry = new StructureDefinitionRegistry();
    defs.forEach((sd) => registry.register(sd));

    // All core defs are version 4.0.1
    const patient = registry.get('http://hl7.org/fhir/StructureDefinition/Patient|4.0.1');
    expect(patient).toBeDefined();
    expect((patient as any).version).toBe('4.0.1');
  });
});
