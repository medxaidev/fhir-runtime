import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { parseCanonicalUrl, resolveCanonical, resolveAllByType } from '../canonical-resolver.js';
import { NpmPackageLoader } from '../npm-package-loader.js';

const FIXTURES = join(__dirname, 'fixtures', 'packages');
const TEST_IG = join(FIXTURES, 'test-ig');
const DEP_IG = join(FIXTURES, 'dep-ig');

describe('parseCanonicalUrl', () => {
  it('should parse URL without version', () => {
    const result = parseCanonicalUrl('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(result.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(result.version).toBeUndefined();
  });

  it('should parse URL with version', () => {
    const result = parseCanonicalUrl('http://hl7.org/fhir/StructureDefinition/Patient|4.0.1');
    expect(result.url).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(result.version).toBe('4.0.1');
  });

  it('should handle empty version after pipe', () => {
    const result = parseCanonicalUrl('http://example.org/test|');
    expect(result.url).toBe('http://example.org/test');
    expect(result.version).toBe('');
  });

  it('should handle URL with multiple pipes (first pipe wins)', () => {
    const result = parseCanonicalUrl('http://example.org/test|1.0|extra');
    expect(result.url).toBe('http://example.org/test');
    expect(result.version).toBe('1.0|extra');
  });

  it('should handle simple string', () => {
    const result = parseCanonicalUrl('Patient');
    expect(result.url).toBe('Patient');
    expect(result.version).toBeUndefined();
  });
});

describe('resolveCanonical', () => {
  it('should resolve URL from single loader', () => {
    const loaders = [new NpmPackageLoader(TEST_IG)];
    const result = resolveCanonical(
      'http://example.org/fhir/test-ig/StructureDefinition/test-patient',
      loaders,
    );
    expect(result).toBeDefined();
    expect(result!.url).toBe('http://example.org/fhir/test-ig/StructureDefinition/test-patient');
    expect(result!.packageName).toBe('test.fhir.ig');
    expect(result!.packageVersion).toBe('1.0.0');
    expect(result!.resourceType).toBe('StructureDefinition');
    expect(result!.filename).toBe('StructureDefinition-test-patient.json');
  });

  it('should resolve URL from multiple loaders', () => {
    const loaders = [new NpmPackageLoader(TEST_IG), new NpmPackageLoader(DEP_IG)];
    const result = resolveCanonical(
      'http://example.org/fhir/dep-ig/StructureDefinition/dep-condition',
      loaders,
    );
    expect(result).toBeDefined();
    expect(result!.packageName).toBe('test.fhir.dep');
  });

  it('should return undefined for unknown URL', () => {
    const loaders = [new NpmPackageLoader(TEST_IG)];
    const result = resolveCanonical('http://example.org/fhir/not-found', loaders);
    expect(result).toBeUndefined();
  });

  it('should resolve with version suffix', () => {
    const loaders = [new NpmPackageLoader(TEST_IG)];
    const result = resolveCanonical(
      'http://example.org/fhir/test-ig/StructureDefinition/test-patient|1.0.0',
      loaders,
    );
    expect(result).toBeDefined();
    expect(result!.version).toBe('1.0.0');
  });

  it('should still resolve when version does not match (fallback to first match)', () => {
    const loaders = [new NpmPackageLoader(TEST_IG)];
    const result = resolveCanonical(
      'http://example.org/fhir/test-ig/StructureDefinition/test-patient|9.9.9',
      loaders,
    );
    // Falls back to first match since exact version not found
    expect(result).toBeDefined();
    expect(result!.url).toBe('http://example.org/fhir/test-ig/StructureDefinition/test-patient');
  });

  it('should resolve ValueSet URL', () => {
    const loaders = [new NpmPackageLoader(TEST_IG)];
    const result = resolveCanonical(
      'http://example.org/fhir/test-ig/ValueSet/test-gender',
      loaders,
    );
    expect(result).toBeDefined();
    expect(result!.resourceType).toBe('ValueSet');
  });

  it('should resolve CodeSystem URL', () => {
    const loaders = [new NpmPackageLoader(TEST_IG)];
    const result = resolveCanonical(
      'http://example.org/fhir/test-ig/CodeSystem/test-category',
      loaders,
    );
    expect(result).toBeDefined();
    expect(result!.resourceType).toBe('CodeSystem');
  });

  it('should prefer first loader when same URL in multiple loaders', () => {
    // Both loaders don't overlap in URLs, but test priority behavior
    const loaders = [new NpmPackageLoader(TEST_IG), new NpmPackageLoader(DEP_IG)];
    const result = resolveCanonical(
      'http://example.org/fhir/test-ig/StructureDefinition/test-patient',
      loaders,
    );
    expect(result!.packageName).toBe('test.fhir.ig');
  });

  it('should return undefined for empty loaders array', () => {
    const result = resolveCanonical('http://example.org/fhir/test', []);
    expect(result).toBeUndefined();
  });

  it('should resolve SearchParameter URL', () => {
    const loaders = [new NpmPackageLoader(TEST_IG)];
    const result = resolveCanonical(
      'http://example.org/fhir/test-ig/SearchParameter/test-name',
      loaders,
    );
    expect(result).toBeDefined();
    expect(result!.resourceType).toBe('SearchParameter');
  });

  it('should include version from entry in resolution', () => {
    const loaders = [new NpmPackageLoader(DEP_IG)];
    const result = resolveCanonical(
      'http://example.org/fhir/dep-ig/StructureDefinition/dep-condition',
      loaders,
    );
    expect(result!.version).toBe('2.0.0');
  });

  it('should resolve across both loaders for different URLs', () => {
    const loaders = [new NpmPackageLoader(TEST_IG), new NpmPackageLoader(DEP_IG)];
    const r1 = resolveCanonical(
      'http://example.org/fhir/test-ig/StructureDefinition/test-patient',
      loaders,
    );
    const r2 = resolveCanonical(
      'http://example.org/fhir/dep-ig/StructureDefinition/dep-condition',
      loaders,
    );
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
    expect(r1!.packageName).toBe('test.fhir.ig');
    expect(r2!.packageName).toBe('test.fhir.dep');
  });

  it('should resolve dep-ig ValueSet', () => {
    const loaders = [new NpmPackageLoader(DEP_IG)];
    const result = resolveCanonical(
      'http://example.org/fhir/dep-ig/ValueSet/dep-status',
      loaders,
    );
    expect(result).toBeDefined();
    expect(result!.resourceType).toBe('ValueSet');
    expect(result!.packageName).toBe('test.fhir.dep');
  });
});

describe('resolveAllByType', () => {
  it('should find all StructureDefinitions across loaders', () => {
    const loaders = [new NpmPackageLoader(TEST_IG), new NpmPackageLoader(DEP_IG)];
    const results = resolveAllByType('StructureDefinition', loaders);
    expect(results.length).toBe(3); // 2 from test-ig + 1 from dep-ig
    expect(results.every((r) => r.resourceType === 'StructureDefinition')).toBe(true);
  });

  it('should find all ValueSets across loaders', () => {
    const loaders = [new NpmPackageLoader(TEST_IG), new NpmPackageLoader(DEP_IG)];
    const results = resolveAllByType('ValueSet', loaders);
    expect(results.length).toBe(2);
  });

  it('should deduplicate by URL', () => {
    // Same loader twice — should still deduplicate
    const loaders = [new NpmPackageLoader(TEST_IG), new NpmPackageLoader(TEST_IG)];
    const results = resolveAllByType('StructureDefinition', loaders);
    expect(results.length).toBe(2); // Deduplicated
  });

  it('should return empty for non-matching type', () => {
    const loaders = [new NpmPackageLoader(TEST_IG)];
    const results = resolveAllByType('Questionnaire', loaders);
    expect(results.length).toBe(0);
  });
});
