import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { existsSync } from 'node:fs';
import { NpmPackageLoader } from '../npm-package-loader.js';
import { PackageManager } from '../package-manager.js';
import { resolveCanonical, resolveAllByType, parseCanonicalUrl } from '../canonical-resolver.js';

// Path to real extracted US Core package
const US_CORE_PKG = join(__dirname, '..', '..', '..', 'spec', 'us-core', 'extracted', 'package');
const HAS_US_CORE = existsSync(join(US_CORE_PKG, 'package.json'));

// Path to mock fixture packages
const FIXTURES = join(__dirname, 'fixtures', 'packages');
const TEST_IG = join(FIXTURES, 'test-ig');
const DEP_IG = join(FIXTURES, 'dep-ig');
const NO_INDEX_IG = join(FIXTURES, 'no-index-ig');

describe('Package Integration', () => {
  describe('Mock packages end-to-end', () => {
    it('should register and load SD through PackageManager + CompositeLoader', async () => {
      const manager = new PackageManager();
      await manager.registerPackage(TEST_IG);
      const loader = manager.createLoader();
      const sd = await loader.load(
        'http://example.org/fhir/test-ig/StructureDefinition/test-patient',
      );
      expect(sd).not.toBeNull();
      expect(sd!.name).toBe('TestPatient');
      expect(sd!.type).toBe('Patient');
      expect(sd!.baseDefinition).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    });

    it('should resolve cross-package: test-ig + dep-ig', async () => {
      const manager = new PackageManager();
      await manager.registerPackage(TEST_IG);
      await manager.registerPackage(DEP_IG);

      const r1 = manager.resolveCanonical(
        'http://example.org/fhir/test-ig/StructureDefinition/test-patient',
      );
      const r2 = manager.resolveCanonical(
        'http://example.org/fhir/dep-ig/StructureDefinition/dep-condition',
      );
      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
      expect(r1!.packageName).toBe('test.fhir.ig');
      expect(r2!.packageName).toBe('test.fhir.dep');
    });

    it('should resolve dependencies between test-ig and dep-ig', async () => {
      const manager = new PackageManager();
      await manager.registerPackage(TEST_IG);
      await manager.registerPackage(DEP_IG);

      const graph = manager.resolveDependencies('test.fhir.dep');
      expect(graph.root).toBe('test.fhir.dep');
      expect(graph.order.indexOf('test.fhir.ig')).toBeLessThan(
        graph.order.indexOf('test.fhir.dep'),
      );
    });

    it('should discover all mock packages from fixtures dir', async () => {
      const manager = new PackageManager();
      const results = await manager.discoverPackages(FIXTURES);
      expect(results.length).toBe(3);
      const names = results.map((r) => r.name).sort();
      expect(names).toContain('test.fhir.ig');
      expect(names).toContain('test.fhir.dep');
      expect(names).toContain('test.fhir.noindex');
    });

    it('should load all SDs across discovered packages', async () => {
      const manager = new PackageManager();
      await manager.discoverPackages(FIXTURES);
      const sds = manager.resolveAllByType('StructureDefinition');
      // test-ig: 2 + dep-ig: 1 + no-index-ig: 1 = 4
      expect(sds.length).toBe(4);
    });

    it('should load all ValueSets across discovered packages', async () => {
      const manager = new PackageManager();
      await manager.discoverPackages(FIXTURES);
      const vs = manager.resolveAllByType('ValueSet');
      // test-ig: 1 + dep-ig: 1 + no-index-ig: 1 = 3
      expect(vs.length).toBe(3);
    });

    it('should handle versioned canonical resolution', () => {
      const loaders = [new NpmPackageLoader(TEST_IG)];
      const result = resolveCanonical(
        'http://example.org/fhir/test-ig/StructureDefinition/test-patient|1.0.0',
        loaders,
      );
      expect(result).toBeDefined();
      expect(result!.version).toBe('1.0.0');
    });

    it('should create loader that integrates with CompositeLoader pattern', async () => {
      const manager = new PackageManager();
      await manager.registerPackage(TEST_IG);
      await manager.registerPackage(DEP_IG);

      const loader = manager.createLoader();
      expect(loader.getSourceType()).toContain('composite');

      // Should load from test-ig
      const sd1 = await loader.load(
        'http://example.org/fhir/test-ig/StructureDefinition/test-patient',
      );
      expect(sd1).not.toBeNull();

      // Should load from dep-ig
      const sd2 = await loader.load(
        'http://example.org/fhir/dep-ig/StructureDefinition/dep-condition',
      );
      expect(sd2).not.toBeNull();

      // Should return null for unknown
      const sd3 = await loader.load('http://example.org/fhir/not-found');
      expect(sd3).toBeNull();
    });

    it('should handle parseCanonicalUrl in resolution flow', () => {
      const { url, version } = parseCanonicalUrl(
        'http://example.org/fhir/test-ig/StructureDefinition/test-patient|1.0.0',
      );
      expect(url).toBe('http://example.org/fhir/test-ig/StructureDefinition/test-patient');
      expect(version).toBe('1.0.0');
    });

    it('should load resource from no-index package via scan', async () => {
      const loader = new NpmPackageLoader(NO_INDEX_IG);
      const sd = await loader.load(
        'http://example.org/fhir/noindex/StructureDefinition/noindex-patient',
      );
      expect(sd).not.toBeNull();
      expect(sd!.name).toBe('NoIndexPatient');
    });

    it('should get all entries from all resource types', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const entries = loader.getEntries();
      const types = new Set(entries.map((e) => e.resourceType));
      expect(types.has('StructureDefinition')).toBe(true);
      expect(types.has('ValueSet')).toBe(true);
      expect(types.has('CodeSystem')).toBe(true);
      expect(types.has('SearchParameter')).toBe(true);
    });
  });

  describe.runIf(HAS_US_CORE)('US Core Package (real)', () => {
    it('should load US Core package manifest', () => {
      const loader = new NpmPackageLoader(US_CORE_PKG);
      const manifest = loader.getManifest();
      expect(manifest).toBeDefined();
      expect(manifest!.name).toBe('hl7.fhir.us.core');
      expect(manifest!.fhirVersions).toContain('4.0.1');
    });

    it('should parse US Core .index.json', () => {
      const loader = new NpmPackageLoader(US_CORE_PKG);
      const index = loader.getIndex();
      expect(index).toBeDefined();
      expect(index!.files.length).toBeGreaterThan(100);
    });

    it('should find US Core StructureDefinitions', () => {
      const loader = new NpmPackageLoader(US_CORE_PKG);
      const sds = loader.getEntriesByType('StructureDefinition');
      expect(sds.length).toBeGreaterThanOrEqual(50);
    });

    it('should find US Core ValueSets', () => {
      const loader = new NpmPackageLoader(US_CORE_PKG);
      const vs = loader.getEntriesByType('ValueSet');
      expect(vs.length).toBeGreaterThanOrEqual(10);
    });

    it('should find US Core CodeSystems', () => {
      const loader = new NpmPackageLoader(US_CORE_PKG);
      const cs = loader.getEntriesByType('CodeSystem');
      expect(cs.length).toBeGreaterThanOrEqual(3);
    });

    it('should load US Core Patient profile', async () => {
      const loader = new NpmPackageLoader(US_CORE_PKG);
      const sd = await loader.load(
        'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
      );
      expect(sd).not.toBeNull();
      expect(sd!.name).toContain('Patient');
      expect(sd!.type).toBe('Patient');
    });

    it('should load US Core Observation profile', async () => {
      const loader = new NpmPackageLoader(US_CORE_PKG);
      const sd = await loader.load(
        'http://hl7.org/fhir/us/core/StructureDefinition/us-core-observation-lab',
      );
      expect(sd).not.toBeNull();
      expect(sd!.type).toBe('Observation');
    });

    it('should resolve US Core patient via canonical resolver', () => {
      const loaders = [new NpmPackageLoader(US_CORE_PKG)];
      const result = resolveCanonical(
        'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
        loaders,
      );
      expect(result).toBeDefined();
      expect(result!.packageName).toBe('hl7.fhir.us.core');
      expect(result!.resourceType).toBe('StructureDefinition');
    });

    it('should resolve all US Core SDs', () => {
      const loaders = [new NpmPackageLoader(US_CORE_PKG)];
      const results = resolveAllByType('StructureDefinition', loaders);
      expect(results.length).toBeGreaterThanOrEqual(50);
    });

    it('should load US Core through PackageManager', async () => {
      const manager = new PackageManager();
      const info = await manager.registerPackage(US_CORE_PKG);
      expect(info.name).toBe('hl7.fhir.us.core');
      expect(info.resourceCount).toBeGreaterThan(100);
    });

    it('should create CompositeLoader from US Core', async () => {
      const manager = new PackageManager();
      await manager.registerPackage(US_CORE_PKG);
      const loader = manager.createLoader();
      const sd = await loader.load(
        'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient',
      );
      expect(sd).not.toBeNull();
    });

    it('should report US Core dependencies', async () => {
      const manager = new PackageManager();
      await manager.registerPackage(US_CORE_PKG);
      const info = manager.getPackages()[0];
      expect(info.manifest.dependencies).toBeDefined();
      expect(info.manifest.dependencies!['hl7.fhir.r4.core']).toBe('4.0.1');
    });

    it('should load all US Core StructureDefinitions', async () => {
      const loader = new NpmPackageLoader(US_CORE_PKG);
      const sds = await loader.loadAllStructureDefinitions();
      expect(sds.length).toBeGreaterThanOrEqual(50);
      expect(sds.every((sd) => sd.resourceType === 'StructureDefinition')).toBe(true);
    }, 15_000);

    it('should load all US Core ValueSets', async () => {
      const loader = new NpmPackageLoader(US_CORE_PKG);
      const vs = await loader.loadAllValueSets();
      expect(vs.length).toBeGreaterThanOrEqual(10);
    });
  });
});
