import { describe, it, expect } from 'vitest';
import {
  parsePackageIndex,
  parsePackageIndexFromString,
  filterIndexByResourceType,
} from '../package-index-parser.js';

describe('parsePackageIndex', () => {
  it('should parse a valid index with index-version 2', () => {
    const raw = {
      'index-version': 2,
      files: [
        {
          filename: 'StructureDefinition-patient.json',
          resourceType: 'StructureDefinition',
          id: 'patient',
          url: 'http://example.org/StructureDefinition/patient',
          version: '1.0.0',
          kind: 'resource',
          type: 'Patient',
        },
      ],
    };

    const result = parsePackageIndex(raw);
    expect(result).toBeDefined();
    expect(result!.indexVersion).toBe(2);
    expect(result!.files).toHaveLength(1);
    expect(result!.files[0].filename).toBe('StructureDefinition-patient.json');
    expect(result!.files[0].resourceType).toBe('StructureDefinition');
    expect(result!.files[0].id).toBe('patient');
    expect(result!.files[0].url).toBe('http://example.org/StructureDefinition/patient');
    expect(result!.files[0].version).toBe('1.0.0');
    expect(result!.files[0].kind).toBe('resource');
    expect(result!.files[0].type).toBe('Patient');
  });

  it('should parse index-version 1', () => {
    const raw = {
      'index-version': 1,
      files: [
        {
          filename: 'ValueSet-test.json',
          resourceType: 'ValueSet',
          id: 'test',
          url: 'http://example.org/ValueSet/test',
        },
      ],
    };

    const result = parsePackageIndex(raw);
    expect(result).toBeDefined();
    expect(result!.indexVersion).toBe(1);
    expect(result!.files).toHaveLength(1);
    expect(result!.files[0].version).toBeUndefined();
  });

  it('should handle indexVersion (camelCase) field', () => {
    const raw = {
      indexVersion: 2,
      files: [],
    };
    const result = parsePackageIndex(raw);
    expect(result).toBeDefined();
    expect(result!.indexVersion).toBe(2);
  });

  it('should return undefined for null input', () => {
    expect(parsePackageIndex(null)).toBeUndefined();
  });

  it('should return undefined for non-object', () => {
    expect(parsePackageIndex('string')).toBeUndefined();
  });

  it('should return undefined when index-version is missing', () => {
    expect(parsePackageIndex({ files: [] })).toBeUndefined();
  });

  it('should return undefined when files is not an array', () => {
    expect(parsePackageIndex({ 'index-version': 1, files: 'not-array' })).toBeUndefined();
  });

  it('should skip entries missing required fields', () => {
    const raw = {
      'index-version': 1,
      files: [
        { filename: 'test.json', resourceType: 'ValueSet', id: 'test', url: 'http://test' },
        { filename: 'bad.json' }, // missing resourceType, id, url
        { resourceType: 'ValueSet', id: 'x', url: 'http://x' }, // missing filename
        null,
        42,
      ],
    };
    const result = parsePackageIndex(raw);
    expect(result!.files).toHaveLength(1);
    expect(result!.files[0].filename).toBe('test.json');
  });

  it('should parse multiple entries', () => {
    const raw = {
      'index-version': 2,
      files: [
        { filename: 'a.json', resourceType: 'StructureDefinition', id: 'a', url: 'http://a' },
        { filename: 'b.json', resourceType: 'ValueSet', id: 'b', url: 'http://b' },
        { filename: 'c.json', resourceType: 'CodeSystem', id: 'c', url: 'http://c' },
      ],
    };
    const result = parsePackageIndex(raw);
    expect(result!.files).toHaveLength(3);
  });
});

describe('parsePackageIndexFromString', () => {
  it('should parse valid JSON string', () => {
    const json = JSON.stringify({
      'index-version': 1,
      files: [{ filename: 'a.json', resourceType: 'SD', id: 'a', url: 'http://a' }],
    });
    const result = parsePackageIndexFromString(json);
    expect(result).toBeDefined();
    expect(result!.files).toHaveLength(1);
  });

  it('should return undefined for invalid JSON', () => {
    expect(parsePackageIndexFromString('not json')).toBeUndefined();
  });
});

describe('filterIndexByResourceType', () => {
  const index = {
    indexVersion: 2,
    files: [
      { filename: 'a.json', resourceType: 'StructureDefinition', id: 'a', url: 'http://a' },
      { filename: 'b.json', resourceType: 'ValueSet', id: 'b', url: 'http://b' },
      { filename: 'c.json', resourceType: 'CodeSystem', id: 'c', url: 'http://c' },
      { filename: 'd.json', resourceType: 'StructureDefinition', id: 'd', url: 'http://d' },
    ],
  };

  it('should filter by single type', () => {
    const result = filterIndexByResourceType(index, ['ValueSet']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('b');
  });

  it('should filter by multiple types', () => {
    const result = filterIndexByResourceType(index, ['StructureDefinition', 'CodeSystem']);
    expect(result).toHaveLength(3);
  });

  it('should return empty for non-matching type', () => {
    const result = filterIndexByResourceType(index, ['Patient']);
    expect(result).toHaveLength(0);
  });
});
