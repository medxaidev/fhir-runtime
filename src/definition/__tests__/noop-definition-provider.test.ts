/**
 * Tests for NoOpDefinitionProvider
 *
 * Testing policy: ≥5 unit tests.
 */

import { describe, it, expect } from 'vitest';
import { NoOpDefinitionProvider } from '../noop-definition-provider.js';

describe('NoOpDefinitionProvider', () => {
  const provider = new NoOpDefinitionProvider();

  it('should return undefined for getStructureDefinition', () => {
    expect(provider.getStructureDefinition('http://hl7.org/fhir/StructureDefinition/Patient')).toBeUndefined();
  });

  it('should return undefined for getValueSet', () => {
    expect(provider.getValueSet('http://hl7.org/fhir/ValueSet/administrative-gender')).toBeUndefined();
  });

  it('should return undefined for getCodeSystem', () => {
    expect(provider.getCodeSystem('http://terminology.hl7.org/CodeSystem/v3-ActCode')).toBeUndefined();
  });

  it('should return empty array for getSearchParameters', () => {
    const result = provider.getSearchParameters('Patient');
    expect(result).toEqual([]);
    expect(Array.isArray(result)).toBe(true);
  });

  it('should return empty array for unknown resource type', () => {
    expect(provider.getSearchParameters('UnknownType')).toEqual([]);
  });

  it('should return undefined for any arbitrary URL', () => {
    expect(provider.getStructureDefinition('urn:custom:profile')).toBeUndefined();
    expect(provider.getValueSet('urn:custom:valueset')).toBeUndefined();
    expect(provider.getCodeSystem('urn:custom:codesystem')).toBeUndefined();
  });

  it('should be instantiable without arguments', () => {
    const p = new NoOpDefinitionProvider();
    expect(p).toBeDefined();
    expect(typeof p.getStructureDefinition).toBe('function');
    expect(typeof p.getValueSet).toBe('function');
    expect(typeof p.getCodeSystem).toBe('function');
    expect(typeof p.getSearchParameters).toBe('function');
  });
});
