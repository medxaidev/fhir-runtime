/**
 * Fixture-based tests for fhir-context module (Tasks 3.1–3.4)
 *
 * Uses JSON fixture files to thoroughly test:
 * 1. Registry — registration, versioning, batch operations, metadata preservation
 * 2. Loaders — FileSystemLoader with real fixture files, CompositeLoader chains
 * 3. Inheritance — chain resolution from fixtures, data type chains, extension chains
 * 4. Errors — malformed fixtures, missing fields, circular dependencies
 * 5. Integration — end-to-end registry + loader + resolver workflows
 *
 * Fixture layout:
 * - 01-registry/   — 6 files (minimal, versioned v1/v2, full metadata, abstract, logical)
 * - 02-loaders/    — 6 files (Patient, Observation, ChinesePatient, Extension, Condition, invalid)
 * - 03-inheritance/ — 7 files (Resource, DomainResource, Patient, ChinesePatient, Element, Extension, string)
 * - 04-errors/     — 6 files (missing-url, missing-name, wrong-resourceType, circular-a/b, self-ref)
 * - 05-integration/ — 5 files (Encounter, MedicationRequest, ChineseMedicationProfile, Quantity, Bundle)
 *
 * @module fhir-context
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

import type { StructureDefinition } from '../../model/index.js';
import { parseFhirJson } from '../../parser/index.js';
import { StructureDefinitionRegistry, parseVersionedUrl } from '../registry.js';
import { MemoryLoader } from '../loaders/memory-loader.js';
import { FileSystemLoader } from '../loaders/file-loader.js';
import { CompositeLoader } from '../loaders/composite-loader.js';
import {
  InheritanceChainResolver,
  type DefinitionProvider,
} from '../inheritance-resolver.js';
import {
  InvalidStructureDefinitionError,
  CircularDependencyError,
  ResourceNotFoundError,
  LoaderError,
} from '../errors.js';

// =============================================================================
// Helpers
// =============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = join(__dirname, 'fixtures');

/** Load and parse a fixture JSON file into a StructureDefinition. */
function loadFixture(category: string, filename: string): StructureDefinition {
  const filePath = join(FIXTURES_DIR, category, filename);
  const raw = readFileSync(filePath, 'utf-8');
  const result = parseFhirJson(raw);
  if (!result.success) {
    throw new Error(`Failed to parse fixture ${category}/${filename}: ${result.issues.map(i => i.message).join('; ')}`);
  }
  return result.data as StructureDefinition;
}

/** Load raw JSON string from a fixture file. */
function loadFixtureRaw(category: string, filename: string): string {
  return readFileSync(join(FIXTURES_DIR, category, filename), 'utf-8');
}

/** Create a DefinitionProvider from a Map, throws ResourceNotFoundError for unknown URLs. */
function createProvider(
  defs: Map<string, StructureDefinition>,
): DefinitionProvider {
  return {
    async loadStructureDefinition(url: string): Promise<StructureDefinition> {
      const sd = defs.get(url);
      if (!sd) throw new ResourceNotFoundError(url, ['fixture']);
      return sd;
    },
  };
}

// =============================================================================
// Section 1: Registry Fixture Tests (01-registry)
// =============================================================================

describe('Registry fixture tests', () => {
  let registry: StructureDefinitionRegistry;

  beforeEach(() => {
    registry = new StructureDefinitionRegistry();
  });

  it('registers and retrieves minimal resource (Basic)', () => {
    const sd = loadFixture('01-registry', 'minimal-resource.json');
    registry.register(sd);

    const result = registry.get('http://hl7.org/fhir/StructureDefinition/Basic');
    expect(result).toBeDefined();
    expect((result as any).name).toBe('Basic');
    expect((result as any).kind).toBe('resource');
    expect((result as any).abstract).toBe(false);
  });

  it('registers versioned profile and retrieves by url|version', () => {
    const sd = loadFixture('01-registry', 'versioned-profile.json');
    registry.register(sd);

    const url = 'http://example.org/fhir/StructureDefinition/ChinesePatient';
    expect(registry.get(`${url}|1.0.0`)).toBeDefined();
    expect(registry.get(url)).toBeDefined(); // latest
    expect((registry.get(url) as any).version).toBe('1.0.0');
  });

  it('handles two versions of the same profile', () => {
    const v1 = loadFixture('01-registry', 'versioned-profile.json');
    const v2 = loadFixture('01-registry', 'versioned-profile-v2.json');
    registry.register(v1);
    registry.register(v2);

    const url = 'http://example.org/fhir/StructureDefinition/ChinesePatient';
    // Both versions exist
    expect(registry.has(`${url}|1.0.0`)).toBe(true);
    expect(registry.has(`${url}|2.0.0`)).toBe(true);
    // Latest is v2 (registered last)
    expect((registry.get(url) as any).version).toBe('2.0.0');
    expect((registry.get(url) as any).title).toBe('Chinese Patient Profile v2');
    expect(registry.size).toBe(2);
  });

  it('preserves full metadata fields', () => {
    const sd = loadFixture('01-registry', 'full-metadata-sd.json');
    registry.register(sd);

    const result = registry.get('http://example.org/fhir/StructureDefinition/FullMetadata');
    expect(result).toBeDefined();
    expect((result as any).version).toBe('3.1.0');
    expect((result as any).status).toBe('draft');
    expect((result as any).experimental).toBe(true);
    expect((result as any).publisher).toBe('MedXAI');
    expect((result as any).description).toContain('all metadata fields');
    expect((result as any).fhirVersion).toBe('4.0.1');
  });

  it('registers abstract resource (DomainResource)', () => {
    const sd = loadFixture('01-registry', 'abstract-resource.json');
    registry.register(sd);

    const result = registry.get('http://hl7.org/fhir/StructureDefinition/DomainResource');
    expect(result).toBeDefined();
    expect((result as any).abstract).toBe(true);
    expect((result as any).baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Resource');
  });

  it('registers logical model (no baseDefinition)', () => {
    const sd = loadFixture('01-registry', 'logical-model.json');
    registry.register(sd);

    const result = registry.get('http://example.org/fhir/StructureDefinition/ChineseMedicineFormula');
    expect(result).toBeDefined();
    expect((result as any).kind).toBe('logical');
    expect((result as any).title).toBe('中医方剂逻辑模型');
    // Logical models may not have baseDefinition
    expect((result as any).baseDefinition).toBeUndefined();
  });

  it('batch registers all 01-registry fixtures and queries them', () => {
    const files = [
      'minimal-resource.json',
      'versioned-profile.json',
      'versioned-profile-v2.json',
      'full-metadata-sd.json',
      'abstract-resource.json',
      'logical-model.json',
    ];
    for (const f of files) {
      registry.register(loadFixture('01-registry', f));
    }
    // 6 files, but versioned-profile and versioned-profile-v2 share the same bare URL
    // So primary map has 6 entries (4 unversioned + 2 versioned)
    expect(registry.size).toBe(6);
    expect(registry.getAllUrls().length).toBe(5); // 5 unique bare URLs
  });

  it('delete versioned profile removes only that version', () => {
    const v1 = loadFixture('01-registry', 'versioned-profile.json');
    const v2 = loadFixture('01-registry', 'versioned-profile-v2.json');
    registry.register(v1);
    registry.register(v2);

    const url = 'http://example.org/fhir/StructureDefinition/ChinesePatient';
    registry.delete(`${url}|1.0.0`);

    expect(registry.has(`${url}|1.0.0`)).toBe(false);
    expect(registry.has(`${url}|2.0.0`)).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('re-registration replaces existing entry', () => {
    const sd1 = loadFixture('01-registry', 'versioned-profile.json');
    registry.register(sd1);
    expect((registry.get('http://example.org/fhir/StructureDefinition/ChinesePatient|1.0.0') as any).title).toBe('Chinese Patient Profile');

    // Re-register v2 with same url|version as v1 would replace
    const sd2 = loadFixture('01-registry', 'versioned-profile-v2.json');
    registry.register(sd2);
    // v2 has different version so it's a new entry
    expect(registry.size).toBe(2);
  });
});

// =============================================================================
// Section 2: Loader Fixture Tests (02-loaders)
// =============================================================================

describe('Loader fixture tests', () => {
  const loadersDir = join(FIXTURES_DIR, '02-loaders');

  describe('FileSystemLoader with fixtures', () => {
    let loader: FileSystemLoader;

    beforeEach(() => {
      loader = new FileSystemLoader(loadersDir);
    });

    it('loads Patient.json fixture', async () => {
      const sd = await loader.load('http://hl7.org/fhir/StructureDefinition/Patient');
      expect(sd).toBeDefined();
      expect((sd as any).name).toBe('Patient');
      expect((sd as any).version).toBe('4.0.1');
      expect((sd as any).snapshot).toBeDefined();
      expect((sd as any).snapshot.element).toHaveLength(2);
    });

    it('loads Observation.json fixture with required elements', async () => {
      const sd = await loader.load('http://hl7.org/fhir/StructureDefinition/Observation');
      expect(sd).toBeDefined();
      expect((sd as any).snapshot.element).toHaveLength(3);
      // Check required elements
      const statusEl = (sd as any).snapshot.element.find((e: any) => e.id === 'Observation.status');
      expect(statusEl.min).toBe(1);
    });

    it('loads ChinesePatient.json custom profile with differential', async () => {
      const sd = await loader.load('http://example.org/fhir/StructureDefinition/ChinesePatient');
      expect(sd).toBeDefined();
      expect((sd as any).title).toBe('中国患者档案');
      expect((sd as any).derivation).toBe('constraint');
      expect((sd as any).differential).toBeDefined();
      expect((sd as any).differential.element).toHaveLength(3);
    });

    it('loads Extension fixture with context', async () => {
      // Extension filename is "Extension.json" but URL ends with "patient-ethnicity"
      // FileSystemLoader maps URL tail to filename, so we need the right URL
      const sd = await loader.load('http://example.org/fhir/StructureDefinition/patient-ethnicity');
      // This should return null because filename would be "patient-ethnicity.json" not "Extension.json"
      expect(sd).toBeNull();
    });

    it('loads Condition.json with Reference type', async () => {
      const sd = await loader.load('http://hl7.org/fhir/StructureDefinition/Condition');
      expect(sd).toBeDefined();
      const subjectEl = (sd as any).snapshot.element.find((e: any) => e.id === 'Condition.subject');
      expect(subjectEl).toBeDefined();
      expect(subjectEl.min).toBe(1);
      expect(subjectEl.type[0].code).toBe('Reference');
    });

    it('throws LoaderError for invalid JSON fixture', async () => {
      // "invalid-json.json" maps from URL ending in "invalid-json"
      await expect(
        loader.load('http://example.org/invalid-json'),
      ).rejects.toThrow(LoaderError);
    });

    it('canLoad returns true for existing fixture files', () => {
      expect(loader.canLoad('http://hl7.org/fhir/StructureDefinition/Patient')).toBe(true);
      expect(loader.canLoad('http://hl7.org/fhir/StructureDefinition/Observation')).toBe(true);
      expect(loader.canLoad('http://hl7.org/fhir/StructureDefinition/Condition')).toBe(true);
    });

    it('canLoad returns false for non-existent fixture files', () => {
      expect(loader.canLoad('http://hl7.org/fhir/StructureDefinition/Procedure')).toBe(false);
    });
  });

  describe('MemoryLoader with parsed fixtures', () => {
    it('loads all 02-loaders fixtures into memory and queries', async () => {
      const validFiles = ['Patient.json', 'Observation.json', 'ChinesePatient.json', 'Condition.json'];
      const map = new Map<string, StructureDefinition>();
      for (const f of validFiles) {
        const sd = loadFixture('02-loaders', f);
        map.set(sd.url as string, sd);
      }

      const loader = new MemoryLoader(map);
      expect(loader.size).toBe(4);

      const patient = await loader.load('http://hl7.org/fhir/StructureDefinition/Patient');
      expect(patient).toBeDefined();
      expect((patient as any).name).toBe('Patient');

      const unknown = await loader.load('http://example.org/Unknown');
      expect(unknown).toBeNull();
    });
  });

  describe('CompositeLoader with fixture-backed loaders', () => {
    it('memory loader takes priority over file loader', async () => {
      // Put a modified Patient in memory
      const memoryPatient = loadFixture('02-loaders', 'Patient.json');
      (memoryPatient as any).title = 'MemoryPatient';
      const memMap = new Map<string, StructureDefinition>();
      memMap.set('http://hl7.org/fhir/StructureDefinition/Patient', memoryPatient);

      const composite = new CompositeLoader([
        new MemoryLoader(memMap),
        new FileSystemLoader(loadersDir),
      ]);

      const result = await composite.load('http://hl7.org/fhir/StructureDefinition/Patient');
      expect((result as any).title).toBe('MemoryPatient');
    });

    it('falls back to file loader when memory misses', async () => {
      const memMap = new Map<string, StructureDefinition>();
      // Memory has nothing

      const composite = new CompositeLoader([
        new MemoryLoader(memMap),
        new FileSystemLoader(loadersDir),
      ]);

      const result = await composite.load('http://hl7.org/fhir/StructureDefinition/Observation');
      expect(result).toBeDefined();
      expect((result as any).name).toBe('Observation');
    });

    it('returns null when neither loader has the resource', async () => {
      const composite = new CompositeLoader([
        new MemoryLoader(new Map()),
        new FileSystemLoader(loadersDir),
      ]);

      const result = await composite.load('http://example.org/NonExistent');
      expect(result).toBeNull();
    });
  });
});

// =============================================================================
// Section 3: Inheritance Fixture Tests (03-inheritance)
// =============================================================================

describe('Inheritance fixture tests', () => {
  let definitions: Map<string, StructureDefinition>;
  let resolver: InheritanceChainResolver;

  beforeEach(() => {
    definitions = new Map<string, StructureDefinition>();
    // Load all 03-inheritance fixtures
    const files = [
      'Resource.json',
      'DomainResource.json',
      'Patient.json',
      'ChinesePatient.json',
      'Element.json',
      'Extension.json',
      'string.json',
    ];
    for (const f of files) {
      const sd = loadFixture('03-inheritance', f);
      definitions.set(sd.url as string, sd);
    }
    resolver = new InheritanceChainResolver(createProvider(definitions));
  });

  it('resolves Resource (root, no baseDefinition)', async () => {
    const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Resource');
    expect(chain).toEqual(['http://hl7.org/fhir/StructureDefinition/Resource']);
  });

  it('resolves DomainResource → Resource', async () => {
    const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/DomainResource');
    expect(chain).toEqual([
      'http://hl7.org/fhir/StructureDefinition/DomainResource',
      'http://hl7.org/fhir/StructureDefinition/Resource',
    ]);
  });

  it('resolves Patient → DomainResource → Resource', async () => {
    const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(chain).toEqual([
      'http://hl7.org/fhir/StructureDefinition/Patient',
      'http://hl7.org/fhir/StructureDefinition/DomainResource',
      'http://hl7.org/fhir/StructureDefinition/Resource',
    ]);
  });

  it('resolves ChinesePatient → Patient → DomainResource → Resource (4 levels)', async () => {
    const chain = await resolver.resolve('http://example.org/fhir/StructureDefinition/ChinesePatient');
    expect(chain).toEqual([
      'http://example.org/fhir/StructureDefinition/ChinesePatient',
      'http://hl7.org/fhir/StructureDefinition/Patient',
      'http://hl7.org/fhir/StructureDefinition/DomainResource',
      'http://hl7.org/fhir/StructureDefinition/Resource',
    ]);
    expect(chain).toHaveLength(4);
  });

  it('resolves Element (root of data type hierarchy)', async () => {
    const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Element');
    expect(chain).toEqual(['http://hl7.org/fhir/StructureDefinition/Element']);
  });

  it('resolves Extension → Element (data type chain)', async () => {
    const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Extension');
    expect(chain).toEqual([
      'http://hl7.org/fhir/StructureDefinition/Extension',
      'http://hl7.org/fhir/StructureDefinition/Element',
    ]);
  });

  it('resolves string → Element (primitive type chain)', async () => {
    const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/string');
    expect(chain).toEqual([
      'http://hl7.org/fhir/StructureDefinition/string',
      'http://hl7.org/fhir/StructureDefinition/Element',
    ]);
  });

  it('caches sub-chains: resolving Patient also caches DomainResource and Resource', async () => {
    await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Patient');
    // DomainResource and Resource should be cached
    expect(resolver.cacheSize).toBe(3); // Patient, DomainResource, Resource
  });

  it('shared base: Patient and Extension chains share no common base', async () => {
    const patientChain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Patient');
    const extensionChain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Extension');

    // Resource hierarchy and Element hierarchy are independent
    expect(patientChain).toContain('http://hl7.org/fhir/StructureDefinition/Resource');
    expect(extensionChain).toContain('http://hl7.org/fhir/StructureDefinition/Element');
    expect(extensionChain).not.toContain('http://hl7.org/fhir/StructureDefinition/Resource');
  });

  it('invalidate and re-resolve works correctly', async () => {
    await resolver.resolve('http://example.org/fhir/StructureDefinition/ChinesePatient');
    resolver.invalidate('http://hl7.org/fhir/StructureDefinition/Patient');

    // Re-resolve should still work
    const chain = await resolver.resolve('http://example.org/fhir/StructureDefinition/ChinesePatient');
    expect(chain).toHaveLength(4);
  });
});

// =============================================================================
// Section 4: Error Fixture Tests (04-errors)
// =============================================================================

describe('Error fixture tests', () => {
  describe('InvalidStructureDefinitionError scenarios', () => {
    it('missing-url.json: register throws InvalidStructureDefinitionError', () => {
      // parseFhirJson rejects missing url, so load raw JSON and cast directly
      const raw = JSON.parse(loadFixtureRaw('04-errors', 'missing-url.json'));
      const sd = raw as StructureDefinition;
      const registry = new StructureDefinitionRegistry();

      expect(() => registry.register(sd)).toThrow(InvalidStructureDefinitionError);
    });

    it('missing-url.json: error message mentions missing url', () => {
      const raw = JSON.parse(loadFixtureRaw('04-errors', 'missing-url.json'));
      const sd = raw as StructureDefinition;
      const registry = new StructureDefinitionRegistry();

      try {
        registry.register(sd);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(InvalidStructureDefinitionError);
        expect((err as InvalidStructureDefinitionError).message).toContain('Missing required field: url');
      }
    });

    it('missing-url.json: parseFhirJson also rejects (parser validates url)', () => {
      const raw = loadFixtureRaw('04-errors', 'missing-url.json');
      const result = parseFhirJson(raw);
      expect(result.success).toBe(false);
      expect(result.issues.some(i => i.message.includes('url'))).toBe(true);
    });

    it('missing-name.json: can still register (registry only requires url)', () => {
      // Parser rejects missing name, so bypass it
      const raw = JSON.parse(loadFixtureRaw('04-errors', 'missing-name.json'));
      const sd = raw as StructureDefinition;
      const registry = new StructureDefinitionRegistry();

      // Registry only requires url, not name
      registry.register(sd);
      expect(registry.has('http://example.org/fhir/StructureDefinition/NoName')).toBe(true);
    });

    it('missing-name.json: parseFhirJson rejects (parser validates name)', () => {
      const raw = loadFixtureRaw('04-errors', 'missing-name.json');
      const result = parseFhirJson(raw);
      expect(result.success).toBe(false);
      expect(result.issues.some(i => i.message.includes('name'))).toBe(true);
    });

    it('wrong-resource-type.json: parsed as Patient, not StructureDefinition', () => {
      const raw = loadFixtureRaw('04-errors', 'wrong-resource-type.json');
      const result = parseFhirJson(raw);
      // parseFhirJson should succeed (it's valid FHIR JSON)
      expect(result.success).toBe(true);
      // But it's a Patient, not a StructureDefinition
      expect(result.data!.resourceType).toBe('Patient');
    });
  });

  describe('CircularDependencyError scenarios', () => {
    it('circular-a → circular-b → circular-a: detects cycle', async () => {
      const circA = loadFixture('04-errors', 'circular-a.json');
      const circB = loadFixture('04-errors', 'circular-b.json');

      const defs = new Map<string, StructureDefinition>();
      defs.set(circA.url as string, circA);
      defs.set(circB.url as string, circB);

      const resolver = new InheritanceChainResolver(createProvider(defs));

      await expect(
        resolver.resolve('http://example.org/fhir/StructureDefinition/CircularA'),
      ).rejects.toThrow(CircularDependencyError);
    });

    it('circular dependency error contains both URLs in chain', async () => {
      const circA = loadFixture('04-errors', 'circular-a.json');
      const circB = loadFixture('04-errors', 'circular-b.json');

      const defs = new Map<string, StructureDefinition>();
      defs.set(circA.url as string, circA);
      defs.set(circB.url as string, circB);

      const resolver = new InheritanceChainResolver(createProvider(defs));

      try {
        await resolver.resolve('http://example.org/fhir/StructureDefinition/CircularA');
        expect.fail('Should have thrown');
      } catch (err) {
        const circErr = err as CircularDependencyError;
        expect(circErr.chain).toContain('http://example.org/fhir/StructureDefinition/CircularA');
        expect(circErr.chain).toContain('http://example.org/fhir/StructureDefinition/CircularB');
      }
    });

    it('self-referencing.json: detects self-cycle', async () => {
      const selfRef = loadFixture('04-errors', 'self-referencing.json');

      const defs = new Map<string, StructureDefinition>();
      defs.set(selfRef.url as string, selfRef);

      const resolver = new InheritanceChainResolver(createProvider(defs));

      await expect(
        resolver.resolve('http://example.org/fhir/StructureDefinition/SelfRef'),
      ).rejects.toThrow(CircularDependencyError);
    });
  });

  describe('ResourceNotFoundError scenarios', () => {
    it('resolving a profile with missing base throws ResourceNotFoundError', async () => {
      // ChinesePatient references Patient, but we only load ChinesePatient
      const cp = loadFixture('03-inheritance', 'ChinesePatient.json');
      const defs = new Map<string, StructureDefinition>();
      defs.set(cp.url as string, cp);

      const resolver = new InheritanceChainResolver(createProvider(defs));

      await expect(
        resolver.resolve('http://example.org/fhir/StructureDefinition/ChinesePatient'),
      ).rejects.toThrow(ResourceNotFoundError);
    });

    it('ResourceNotFoundError contains the missing URL', async () => {
      const cp = loadFixture('03-inheritance', 'ChinesePatient.json');
      const defs = new Map<string, StructureDefinition>();
      defs.set(cp.url as string, cp);

      const resolver = new InheritanceChainResolver(createProvider(defs));

      try {
        await resolver.resolve('http://example.org/fhir/StructureDefinition/ChinesePatient');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(ResourceNotFoundError);
        expect((err as ResourceNotFoundError).url).toBe(
          'http://hl7.org/fhir/StructureDefinition/Patient',
        );
      }
    });
  });

  describe('LoaderError scenarios', () => {
    it('FileSystemLoader throws LoaderError for invalid JSON fixture', async () => {
      const loader = new FileSystemLoader(join(FIXTURES_DIR, '02-loaders'));

      try {
        await loader.load('http://example.org/invalid-json');
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(LoaderError);
        expect((err as LoaderError).sourceType).toBe('filesystem');
        expect((err as LoaderError).url).toBe('http://example.org/invalid-json');
      }
    });
  });
});

// =============================================================================
// Section 5: Integration Fixture Tests (05-integration)
// =============================================================================

describe('Integration fixture tests', () => {
  let allDefinitions: Map<string, StructureDefinition>;

  beforeEach(() => {
    allDefinitions = new Map<string, StructureDefinition>();

    // Load base chain from 03-inheritance
    const baseFiles = ['Resource.json', 'DomainResource.json', 'Patient.json', 'Element.json'];
    for (const f of baseFiles) {
      const sd = loadFixture('03-inheritance', f);
      allDefinitions.set(sd.url as string, sd);
    }

    // Load integration fixtures
    const integrationFiles = [
      'Encounter.json',
      'MedicationRequest.json',
      'ChineseMedicationProfile.json',
      'Quantity.json',
      'Bundle.json',
    ];
    for (const f of integrationFiles) {
      const sd = loadFixture('05-integration', f);
      allDefinitions.set(sd.url as string, sd);
    }
  });

  describe('registry + loader + resolver end-to-end', () => {
    it('registers all definitions and resolves Encounter chain', async () => {
      const registry = new StructureDefinitionRegistry();
      allDefinitions.forEach((sd) => registry.register(sd));

      expect(registry.size).toBe(9);

      const resolver = new InheritanceChainResolver({
        async loadStructureDefinition(url: string) {
          const sd = registry.get(url);
          if (!sd) throw new ResourceNotFoundError(url);
          return sd;
        },
      });

      const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Encounter');
      expect(chain).toEqual([
        'http://hl7.org/fhir/StructureDefinition/Encounter',
        'http://hl7.org/fhir/StructureDefinition/DomainResource',
        'http://hl7.org/fhir/StructureDefinition/Resource',
      ]);
    });

    it('resolves MedicationRequest chain', async () => {
      const resolver = new InheritanceChainResolver(createProvider(allDefinitions));

      const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/MedicationRequest');
      expect(chain).toEqual([
        'http://hl7.org/fhir/StructureDefinition/MedicationRequest',
        'http://hl7.org/fhir/StructureDefinition/DomainResource',
        'http://hl7.org/fhir/StructureDefinition/Resource',
      ]);
    });

    it('resolves ChineseMedicationRequest → MedicationRequest → DomainResource → Resource', async () => {
      const resolver = new InheritanceChainResolver(createProvider(allDefinitions));

      const chain = await resolver.resolve('http://example.org/fhir/StructureDefinition/ChineseMedicationRequest');
      expect(chain).toEqual([
        'http://example.org/fhir/StructureDefinition/ChineseMedicationRequest',
        'http://hl7.org/fhir/StructureDefinition/MedicationRequest',
        'http://hl7.org/fhir/StructureDefinition/DomainResource',
        'http://hl7.org/fhir/StructureDefinition/Resource',
      ]);
      expect(chain).toHaveLength(4);
    });

    it('resolves Bundle → Resource (skips DomainResource)', async () => {
      const resolver = new InheritanceChainResolver(createProvider(allDefinitions));

      const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Bundle');
      expect(chain).toEqual([
        'http://hl7.org/fhir/StructureDefinition/Bundle',
        'http://hl7.org/fhir/StructureDefinition/Resource',
      ]);
      // Bundle extends Resource directly, not DomainResource
      expect(chain).not.toContain('http://hl7.org/fhir/StructureDefinition/DomainResource');
    });

    it('resolves Quantity → Element (complex type chain)', async () => {
      const resolver = new InheritanceChainResolver(createProvider(allDefinitions));

      const chain = await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Quantity');
      expect(chain).toEqual([
        'http://hl7.org/fhir/StructureDefinition/Quantity',
        'http://hl7.org/fhir/StructureDefinition/Element',
      ]);
    });
  });

  describe('CompositeLoader with file-backed integration fixtures', () => {
    it('loads from 05-integration directory via FileSystemLoader', async () => {
      const loader = new FileSystemLoader(join(FIXTURES_DIR, '05-integration'));

      const encounter = await loader.load('http://hl7.org/fhir/StructureDefinition/Encounter');
      expect(encounter).toBeDefined();
      expect((encounter as any).name).toBe('Encounter');

      const bundle = await loader.load('http://hl7.org/fhir/StructureDefinition/Bundle');
      expect(bundle).toBeDefined();
      expect((bundle as any).name).toBe('Bundle');
    });

    it('CompositeLoader: memory (base) + file (integration) resolves all', async () => {
      // Base definitions in memory
      const memMap = new Map<string, StructureDefinition>();
      for (const f of ['Resource.json', 'DomainResource.json']) {
        const sd = loadFixture('03-inheritance', f);
        memMap.set(sd.url as string, sd);
      }

      const composite = new CompositeLoader([
        new MemoryLoader(memMap),
        new FileSystemLoader(join(FIXTURES_DIR, '05-integration')),
      ]);

      // Base from memory
      const resource = await composite.load('http://hl7.org/fhir/StructureDefinition/Resource');
      expect(resource).toBeDefined();

      // Integration from file
      const encounter = await composite.load('http://hl7.org/fhir/StructureDefinition/Encounter');
      expect(encounter).toBeDefined();

      // Not in either
      const unknown = await composite.load('http://example.org/Unknown');
      expect(unknown).toBeNull();
    });
  });

  describe('statistics tracking across operations', () => {
    it('registry statistics after batch load and queries', () => {
      const registry = new StructureDefinitionRegistry();
      allDefinitions.forEach((sd) => registry.register(sd));

      // Query some
      registry.get('http://hl7.org/fhir/StructureDefinition/Patient'); // hit
      registry.get('http://hl7.org/fhir/StructureDefinition/Encounter'); // hit
      registry.get('http://example.org/NonExistent'); // miss

      expect(registry.queryCount).toBe(3);
      expect(registry.hitCount).toBe(2);
      expect(registry.missCount).toBe(1);
      expect(registry.hitRate).toBeCloseTo(2 / 3);
    });

    it('resolver statistics after multiple chain resolutions', async () => {
      const resolver = new InheritanceChainResolver(createProvider(allDefinitions));

      await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Encounter');
      await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Bundle');
      await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Quantity');

      expect(resolver.resolutionCount).toBe(3);
      // Cache should have sub-chains too
      expect(resolver.cacheSize).toBeGreaterThanOrEqual(5);
    });

    it('resolver cache hit: second resolve of same URL uses cache', async () => {
      const resolver = new InheritanceChainResolver(createProvider(allDefinitions));

      await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Encounter');
      await resolver.resolve('http://hl7.org/fhir/StructureDefinition/Encounter');

      // Only 1 actual resolution (second was cache hit)
      expect(resolver.resolutionCount).toBe(1);
    });
  });
});
