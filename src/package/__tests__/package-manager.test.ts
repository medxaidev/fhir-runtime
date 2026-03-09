import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { PackageManager } from '../package-manager.js';

const FIXTURES = join(__dirname, 'fixtures', 'packages');
const TEST_IG = join(FIXTURES, 'test-ig');
const DEP_IG = join(FIXTURES, 'dep-ig');

describe('PackageManager', () => {
  it('should register a package', async () => {
    const manager = new PackageManager();
    const info = await manager.registerPackage(TEST_IG);
    expect(info.name).toBe('test.fhir.ig');
    expect(info.version).toBe('1.0.0');
    expect(info.resourceCount).toBe(5);
    expect(manager.packageCount).toBe(1);
  });

  it('should register multiple packages', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    await manager.registerPackage(DEP_IG);
    expect(manager.packageCount).toBe(2);
  });

  it('should list registered packages', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    await manager.registerPackage(DEP_IG);
    const packages = manager.getPackages();
    expect(packages.length).toBe(2);
    expect(packages.map((p) => p.name)).toContain('test.fhir.ig');
    expect(packages.map((p) => p.name)).toContain('test.fhir.dep');
  });

  it('should check hasPackage', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    expect(manager.hasPackage('test.fhir.ig')).toBe(true);
    expect(manager.hasPackage('nonexistent')).toBe(false);
  });

  it('should get package loader', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    const loader = manager.getPackageLoader('test.fhir.ig');
    expect(loader).toBeDefined();
    expect(loader!.getSourceType()).toBe('npm-package');
  });

  it('should throw for invalid package path', async () => {
    const manager = new PackageManager();
    await expect(manager.registerPackage('/nonexistent')).rejects.toThrow();
  });

  it('should resolve canonical URL across packages', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    await manager.registerPackage(DEP_IG);

    const result = manager.resolveCanonical(
      'http://example.org/fhir/test-ig/StructureDefinition/test-patient',
    );
    expect(result).toBeDefined();
    expect(result!.packageName).toBe('test.fhir.ig');
  });

  it('should resolve canonical from dep package', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    await manager.registerPackage(DEP_IG);

    const result = manager.resolveCanonical(
      'http://example.org/fhir/dep-ig/StructureDefinition/dep-condition',
    );
    expect(result).toBeDefined();
    expect(result!.packageName).toBe('test.fhir.dep');
  });

  it('should return undefined for unknown canonical', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    expect(manager.resolveCanonical('http://unknown')).toBeUndefined();
  });

  it('should resolve all by type', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    await manager.registerPackage(DEP_IG);

    const sds = manager.resolveAllByType('StructureDefinition');
    expect(sds.length).toBe(3);
  });

  it('should create a CompositeLoader', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    const loader = manager.createLoader();
    expect(loader.getSourceType()).toContain('composite');
    expect(
      loader.canLoad('http://example.org/fhir/test-ig/StructureDefinition/test-patient'),
    ).toBe(true);
  });

  it('should throw when creating loader with no packages', () => {
    const manager = new PackageManager();
    expect(() => manager.createLoader()).toThrow();
  });

  it('should resolve dependencies', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    await manager.registerPackage(DEP_IG);

    const graph = manager.resolveDependencies('test.fhir.dep');
    expect(graph.root).toBe('test.fhir.dep');
    expect(graph.nodes.size).toBe(2);
    // test-ig should come before dep-ig in topological order
    expect(graph.order.indexOf('test.fhir.ig')).toBeLessThan(
      graph.order.indexOf('test.fhir.dep'),
    );
  });

  it('should clear all packages', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    expect(manager.packageCount).toBe(1);
    manager.clear();
    expect(manager.packageCount).toBe(0);
  });

  it('should discover packages from cache path', async () => {
    const manager = new PackageManager();
    const results = await manager.discoverPackages(FIXTURES);
    // Should find test-ig, dep-ig, no-index-ig
    expect(results.length).toBe(3);
  });

  it('should return empty for nonexistent cache path', async () => {
    const manager = new PackageManager();
    const results = await manager.discoverPackages('/nonexistent');
    expect(results.length).toBe(0);
  });

  it('should load SD through created loader', async () => {
    const manager = new PackageManager();
    await manager.registerPackage(TEST_IG);
    const loader = manager.createLoader();
    const sd = await loader.load(
      'http://example.org/fhir/test-ig/StructureDefinition/test-patient',
    );
    expect(sd).not.toBeNull();
    expect(sd!.name).toBe('TestPatient');
  });
});
