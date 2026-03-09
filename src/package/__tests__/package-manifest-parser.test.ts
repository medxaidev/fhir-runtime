import { describe, it, expect } from 'vitest';
import { parsePackageManifest, parsePackageManifestFromString } from '../package-manifest-parser.js';

describe('parsePackageManifest', () => {
  it('should parse a valid manifest with all fields', () => {
    const raw = {
      name: 'hl7.fhir.us.core',
      version: '6.1.0',
      fhirVersions: ['4.0.1'],
      type: 'fhir.ig',
      canonical: 'http://hl7.org/fhir/us/core',
      title: 'US Core',
      description: 'US Core IG',
      license: 'CC0-1.0',
      author: 'HL7',
      url: 'https://build.fhir.org/ig/HL7/US-Core/',
      dependencies: {
        'hl7.fhir.r4.core': '4.0.1',
        'hl7.terminology.r4': '5.0.0',
      },
    };

    const result = parsePackageManifest(raw);
    expect(result).toBeDefined();
    expect(result!.name).toBe('hl7.fhir.us.core');
    expect(result!.version).toBe('6.1.0');
    expect(result!.fhirVersions).toEqual(['4.0.1']);
    expect(result!.type).toBe('fhir.ig');
    expect(result!.canonical).toBe('http://hl7.org/fhir/us/core');
    expect(result!.title).toBe('US Core');
    expect(result!.description).toBe('US Core IG');
    expect(result!.license).toBe('CC0-1.0');
    expect(result!.author).toBe('HL7');
    expect(result!.dependencies).toEqual({
      'hl7.fhir.r4.core': '4.0.1',
      'hl7.terminology.r4': '5.0.0',
    });
  });

  it('should parse a minimal manifest (name + version only)', () => {
    const result = parsePackageManifest({ name: 'test', version: '1.0.0' });
    expect(result).toBeDefined();
    expect(result!.name).toBe('test');
    expect(result!.version).toBe('1.0.0');
    expect(result!.dependencies).toBeUndefined();
    expect(result!.fhirVersions).toBeUndefined();
  });

  it('should return undefined for null input', () => {
    expect(parsePackageManifest(null)).toBeUndefined();
  });

  it('should return undefined for non-object input', () => {
    expect(parsePackageManifest('string')).toBeUndefined();
    expect(parsePackageManifest(42)).toBeUndefined();
  });

  it('should return undefined for array input', () => {
    expect(parsePackageManifest([])).toBeUndefined();
  });

  it('should return undefined when name is missing', () => {
    expect(parsePackageManifest({ version: '1.0.0' })).toBeUndefined();
  });

  it('should return undefined when version is missing', () => {
    expect(parsePackageManifest({ name: 'test' })).toBeUndefined();
  });

  it('should return undefined when name is empty string', () => {
    expect(parsePackageManifest({ name: '', version: '1.0.0' })).toBeUndefined();
  });

  it('should filter non-string fhirVersions entries', () => {
    const result = parsePackageManifest({
      name: 'test',
      version: '1.0.0',
      fhirVersions: ['4.0.1', 42, null, '5.0.0'],
    });
    expect(result!.fhirVersions).toEqual(['4.0.1', '5.0.0']);
  });

  it('should skip non-string dependency values', () => {
    const result = parsePackageManifest({
      name: 'test',
      version: '1.0.0',
      dependencies: { 'pkg-a': '1.0.0', 'pkg-b': 42 },
    });
    expect(result!.dependencies).toEqual({ 'pkg-a': '1.0.0' });
  });
});

describe('parsePackageManifestFromString', () => {
  it('should parse valid JSON string', () => {
    const result = parsePackageManifestFromString('{"name":"test","version":"1.0.0"}');
    expect(result).toBeDefined();
    expect(result!.name).toBe('test');
  });

  it('should return undefined for invalid JSON', () => {
    expect(parsePackageManifestFromString('not json')).toBeUndefined();
  });

  it('should return undefined for valid JSON but invalid manifest', () => {
    expect(parsePackageManifestFromString('{"foo":"bar"}')).toBeUndefined();
  });
});
