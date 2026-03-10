/**
 * SearchParameter Parser Tests
 */
import { describe, it, expect } from 'vitest';
import { parseSearchParameter, parseSearchParametersFromBundle } from '../search-parameter-parser.js';

// =============================================================================
// Valid SearchParameter parsing
// =============================================================================

describe('parseSearchParameter', () => {
  const validSP = {
    resourceType: 'SearchParameter',
    id: 'Patient-name',
    url: 'http://hl7.org/fhir/SearchParameter/Patient-name',
    name: 'name',
    status: 'active',
    code: 'name',
    base: ['Patient'],
    type: 'string',
    expression: 'Patient.name',
    description: 'A portion of the name',
  };

  it('parses a valid SearchParameter', () => {
    const result = parseSearchParameter(validSP);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.resourceType).toBe('SearchParameter');
      expect(result.data.url).toBe('http://hl7.org/fhir/SearchParameter/Patient-name');
      expect(result.data.name).toBe('name');
      expect(result.data.code).toBe('name');
      expect(result.data.type).toBe('string');
      expect(result.data.base).toEqual(['Patient']);
      expect(result.data.expression).toBe('Patient.name');
      expect(result.data.description).toBe('A portion of the name');
    }
  });

  it('parses a minimal valid SearchParameter', () => {
    const result = parseSearchParameter({
      resourceType: 'SearchParameter',
      url: 'http://example.org/sp/test',
      name: 'test',
      status: 'draft',
      code: 'test',
      base: ['Observation'],
      type: 'token',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.id).toBeUndefined();
      expect(result.data.expression).toBeUndefined();
      expect(result.data.description).toBeUndefined();
    }
  });

  it('parses all SearchParameter types', () => {
    const types = ['number', 'date', 'string', 'token', 'reference', 'composite', 'quantity', 'uri', 'special'];
    for (const type of types) {
      const result = parseSearchParameter({ ...validSP, type });
      expect(result.success).toBe(true);
    }
  });

  it('parses optional arrays: target, modifier, chain', () => {
    const result = parseSearchParameter({
      ...validSP,
      type: 'reference',
      target: ['Organization', 'Practitioner'],
      modifier: ['exact', 'contains'],
      chain: ['name', 'identifier'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.target).toEqual(['Organization', 'Practitioner']);
      expect(result.data.modifier).toEqual(['exact', 'contains']);
      expect(result.data.chain).toEqual(['name', 'identifier']);
    }
  });

  it('parses multipleOr and multipleAnd', () => {
    const result = parseSearchParameter({
      ...validSP,
      multipleOr: true,
      multipleAnd: false,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.multipleOr).toBe(true);
      expect(result.data.multipleAnd).toBe(false);
    }
  });

  it('parses version field', () => {
    const result = parseSearchParameter({ ...validSP, version: '4.0.1' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.version).toBe('4.0.1');
    }
  });

  it('parses with multiple base types', () => {
    const result = parseSearchParameter({
      ...validSP,
      base: ['Patient', 'Practitioner', 'RelatedPerson'],
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.base).toHaveLength(3);
    }
  });

  // =============================================================================
  // Error cases
  // =============================================================================

  it('rejects null input', () => {
    const result = parseSearchParameter(null);
    expect(result.success).toBe(false);
  });

  it('rejects non-object input', () => {
    const result = parseSearchParameter('string');
    expect(result.success).toBe(false);
  });

  it('rejects wrong resourceType', () => {
    const result = parseSearchParameter({ ...validSP, resourceType: 'Patient' });
    expect(result.success).toBe(false);
  });

  it('rejects missing url', () => {
    const { url, ...rest } = validSP;
    const result = parseSearchParameter(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const { name, ...rest } = validSP;
    const result = parseSearchParameter(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing code', () => {
    const { code, ...rest } = validSP;
    const result = parseSearchParameter(rest);
    expect(result.success).toBe(false);
  });

  it('rejects invalid status', () => {
    const result = parseSearchParameter({ ...validSP, status: 'invalid' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid type', () => {
    const result = parseSearchParameter({ ...validSP, type: 'unknown' });
    expect(result.success).toBe(false);
  });

  it('rejects non-array base', () => {
    const result = parseSearchParameter({ ...validSP, base: 'Patient' });
    expect(result.success).toBe(false);
  });

  it('rejects missing base', () => {
    const { base, ...rest } = validSP;
    const result = parseSearchParameter(rest);
    expect(result.success).toBe(false);
  });

  it('rejects missing resourceType', () => {
    const { resourceType, ...rest } = validSP;
    const result = parseSearchParameter(rest);
    expect(result.success).toBe(false);
  });
});

// =============================================================================
// Bundle parsing
// =============================================================================

describe('parseSearchParametersFromBundle', () => {
  const sp1 = {
    resourceType: 'SearchParameter',
    url: 'http://hl7.org/fhir/SearchParameter/Patient-name',
    name: 'name', status: 'active', code: 'name',
    base: ['Patient'], type: 'string',
  };

  const sp2 = {
    resourceType: 'SearchParameter',
    url: 'http://hl7.org/fhir/SearchParameter/Patient-gender',
    name: 'gender', status: 'active', code: 'gender',
    base: ['Patient'], type: 'token',
  };

  it('parses a valid Bundle with SearchParameters', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: sp1 },
        { resource: sp2 },
      ],
    };
    const result = parseSearchParametersFromBundle(bundle);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
      expect(result.data[0].code).toBe('name');
      expect(result.data[1].code).toBe('gender');
    }
  });

  it('skips non-SearchParameter entries', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [
        { resource: sp1 },
        { resource: { resourceType: 'Patient', id: '123' } },
        { resource: sp2 },
      ],
    };
    const result = parseSearchParametersFromBundle(bundle);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(2);
    }
  });

  it('handles empty Bundle', () => {
    const bundle = {
      resourceType: 'Bundle',
      type: 'collection',
      entry: [],
    };
    const result = parseSearchParametersFromBundle(bundle);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('handles Bundle with no entry field', () => {
    const bundle = { resourceType: 'Bundle', type: 'collection' };
    const result = parseSearchParametersFromBundle(bundle);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(0);
    }
  });

  it('rejects null input', () => {
    const result = parseSearchParametersFromBundle(null);
    expect(result.success).toBe(false);
  });

  it('rejects non-Bundle resourceType', () => {
    const result = parseSearchParametersFromBundle({ resourceType: 'Patient' });
    expect(result.success).toBe(false);
  });
});
