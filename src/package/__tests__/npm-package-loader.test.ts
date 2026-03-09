import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { NpmPackageLoader } from '../npm-package-loader.js';

const FIXTURES = join(__dirname, 'fixtures', 'packages');
const TEST_IG = join(FIXTURES, 'test-ig');
const DEP_IG = join(FIXTURES, 'dep-ig');
const NO_INDEX_IG = join(FIXTURES, 'no-index-ig');

describe('NpmPackageLoader', () => {
  describe('with .index.json', () => {
    it('should load manifest from package', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const manifest = loader.getManifest();
      expect(manifest).toBeDefined();
      expect(manifest!.name).toBe('test.fhir.ig');
      expect(manifest!.version).toBe('1.0.0');
    });

    it('should parse .index.json', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const index = loader.getIndex();
      expect(index).toBeDefined();
      expect(index!.indexVersion).toBe(2);
      expect(index!.files.length).toBeGreaterThan(0);
    });

    it('should list entries from index', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const entries = loader.getEntries();
      expect(entries.length).toBe(5);
    });

    it('should filter entries by StructureDefinition type', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const sds = loader.getEntriesByType('StructureDefinition');
      expect(sds.length).toBe(2);
      expect(sds.every((e) => e.resourceType === 'StructureDefinition')).toBe(true);
    });

    it('should filter entries by ValueSet type', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const vs = loader.getEntriesByType('ValueSet');
      expect(vs.length).toBe(1);
    });

    it('should filter entries by CodeSystem type', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const cs = loader.getEntriesByType('CodeSystem');
      expect(cs.length).toBe(1);
    });

    it('should load a StructureDefinition by canonical URL', async () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const sd = await loader.load(
        'http://example.org/fhir/test-ig/StructureDefinition/test-patient',
      );
      expect(sd).not.toBeNull();
      expect(sd!.url).toBe('http://example.org/fhir/test-ig/StructureDefinition/test-patient');
      expect(sd!.name).toBe('TestPatient');
    });

    it('should load a second StructureDefinition', async () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const sd = await loader.load(
        'http://example.org/fhir/test-ig/StructureDefinition/test-observation',
      );
      expect(sd).not.toBeNull();
      expect(sd!.name).toBe('TestObservation');
    });

    it('should return null for non-existent URL', async () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const sd = await loader.load('http://example.org/fhir/not-found');
      expect(sd).toBeNull();
    });

    it('should return null for ValueSet URL via load() (not a SD)', async () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const result = await loader.load(
        'http://example.org/fhir/test-ig/ValueSet/test-gender',
      );
      expect(result).toBeNull();
    });

    it('should report canLoad for known SD URLs', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      expect(
        loader.canLoad('http://example.org/fhir/test-ig/StructureDefinition/test-patient'),
      ).toBe(true);
    });

    it('should report !canLoad for unknown URLs', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      expect(loader.canLoad('http://example.org/fhir/not-found')).toBe(false);
    });

    it('should report !canLoad for non-SD resource URLs', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      expect(
        loader.canLoad('http://example.org/fhir/test-ig/ValueSet/test-gender'),
      ).toBe(false);
    });

    it('should return npm-package as source type', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      expect(loader.getSourceType()).toBe('npm-package');
    });

    it('should report correct resourceCount', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      expect(loader.resourceCount).toBe(5);
    });

    it('should loadAllStructureDefinitions', async () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const sds = await loader.loadAllStructureDefinitions();
      expect(sds.length).toBe(2);
      expect(sds.every((sd) => sd.resourceType === 'StructureDefinition')).toBe(true);
    });

    it('should loadAllValueSets', async () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const vs = await loader.loadAllValueSets();
      expect(vs.length).toBe(1);
      expect((vs[0] as Record<string, unknown>)['resourceType']).toBe('ValueSet');
    });

    it('should loadAllCodeSystems', async () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const cs = await loader.loadAllCodeSystems();
      expect(cs.length).toBe(1);
      expect((cs[0] as Record<string, unknown>)['resourceType']).toBe('CodeSystem');
    });

    it('should loadResource for any URL in index', async () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const vs = await loader.loadResource(
        'http://example.org/fhir/test-ig/ValueSet/test-gender',
      );
      expect(vs).not.toBeNull();
      expect((vs as Record<string, unknown>)['resourceType']).toBe('ValueSet');
    });

    it('should resolveCanonical for known URLs', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      const entry = loader.resolveCanonical(
        'http://example.org/fhir/test-ig/StructureDefinition/test-patient',
      );
      expect(entry).toBeDefined();
      expect(entry!.filename).toBe('StructureDefinition-test-patient.json');
    });

    it('should return packagePath', () => {
      const loader = new NpmPackageLoader(TEST_IG);
      expect(loader.packagePath).toBe(TEST_IG);
    });
  });

  describe('with resourceTypes filter', () => {
    it('should only include specified resource types', () => {
      const loader = new NpmPackageLoader(TEST_IG, {
        resourceTypes: ['StructureDefinition'],
      });
      const entries = loader.getEntries();
      expect(entries.every((e) => e.resourceType === 'StructureDefinition')).toBe(true);
      expect(entries.length).toBe(2);
    });

    it('should include only ValueSet when filtered', () => {
      const loader = new NpmPackageLoader(TEST_IG, {
        resourceTypes: ['ValueSet', 'CodeSystem'],
      });
      const entries = loader.getEntries();
      expect(entries.length).toBe(2);
    });
  });

  describe('without .index.json (fallback scan)', () => {
    it('should discover resources by scanning directory', () => {
      const loader = new NpmPackageLoader(NO_INDEX_IG);
      expect(loader.getIndex()).toBeUndefined();
      const entries = loader.getEntries();
      expect(entries.length).toBe(2); // SD + VS
    });

    it('should load SD from scanned package', async () => {
      const loader = new NpmPackageLoader(NO_INDEX_IG);
      const sd = await loader.load(
        'http://example.org/fhir/noindex/StructureDefinition/noindex-patient',
      );
      expect(sd).not.toBeNull();
      expect(sd!.name).toBe('NoIndexPatient');
    });

    it('should canLoad for scanned SD URLs', () => {
      const loader = new NpmPackageLoader(NO_INDEX_IG);
      expect(
        loader.canLoad('http://example.org/fhir/noindex/StructureDefinition/noindex-patient'),
      ).toBe(true);
    });

    it('should report correct resourceCount from scan', () => {
      const loader = new NpmPackageLoader(NO_INDEX_IG);
      expect(loader.resourceCount).toBe(2);
    });

    it('should still parse manifest without index', () => {
      const loader = new NpmPackageLoader(NO_INDEX_IG);
      const manifest = loader.getManifest();
      expect(manifest).toBeDefined();
      expect(manifest!.name).toBe('test.fhir.noindex');
    });
  });

  describe('dep-ig package', () => {
    it('should load dep-ig package', () => {
      const loader = new NpmPackageLoader(DEP_IG);
      expect(loader.getManifest()!.name).toBe('test.fhir.dep');
      expect(loader.resourceCount).toBe(2);
    });

    it('should load SD from dep-ig', async () => {
      const loader = new NpmPackageLoader(DEP_IG);
      const sd = await loader.load(
        'http://example.org/fhir/dep-ig/StructureDefinition/dep-condition',
      );
      expect(sd).not.toBeNull();
      expect(sd!.name).toBe('DepCondition');
    });
  });

  describe('edge cases', () => {
    it('should handle non-existent package path gracefully', () => {
      const loader = new NpmPackageLoader('/nonexistent/path');
      expect(loader.getManifest()).toBeUndefined();
      expect(loader.resourceCount).toBe(0);
    });

    it('should handle useIndex=false option', () => {
      const loader = new NpmPackageLoader(TEST_IG, { useIndex: false });
      expect(loader.getIndex()).toBeUndefined();
      // Should still find resources via scan
      expect(loader.resourceCount).toBeGreaterThan(0);
    });
  });
});
