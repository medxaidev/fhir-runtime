/**
 * Tests for CodeSystemRegistry
 *
 * Testing policy: ≥5 unit tests for registry operations.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CodeSystemRegistry } from '../codesystem-registry.js';
import type { CodeSystemDefinition } from '../types.js';

import adminGenderCS from './fixtures/codesystems/administrative-gender.json';
import hierarchicalCS from './fixtures/codesystems/hierarchical-condition.json';

describe('CodeSystemRegistry', () => {
  let registry: CodeSystemRegistry;

  beforeEach(() => {
    registry = new CodeSystemRegistry();
  });

  it('should start empty', () => {
    expect(registry.size).toBe(0);
    expect(registry.urls()).toEqual([]);
  });

  it('should register and retrieve a CodeSystem', () => {
    const cs: CodeSystemDefinition = {
      url: 'http://example.org/cs',
      name: 'Test',
      concepts: [{ code: 'a', display: 'A' }],
    };
    registry.register(cs);
    expect(registry.size).toBe(1);
    expect(registry.has('http://example.org/cs')).toBe(true);
    expect(registry.get('http://example.org/cs')).toBe(cs);
  });

  it('should replace a CodeSystem with the same URL', () => {
    const cs1: CodeSystemDefinition = { url: 'http://example.org/cs', concepts: [{ code: 'a' }] };
    const cs2: CodeSystemDefinition = { url: 'http://example.org/cs', concepts: [{ code: 'b' }] };
    registry.register(cs1);
    registry.register(cs2);
    expect(registry.size).toBe(1);
    expect(registry.get('http://example.org/cs')?.concepts[0].code).toBe('b');
  });

  it('should remove a CodeSystem', () => {
    registry.register({ url: 'http://example.org/cs', concepts: [] });
    expect(registry.remove('http://example.org/cs')).toBe(true);
    expect(registry.size).toBe(0);
    expect(registry.remove('http://example.org/cs')).toBe(false);
  });

  it('should clear all CodeSystems', () => {
    registry.register({ url: 'http://example.org/a', concepts: [] });
    registry.register({ url: 'http://example.org/b', concepts: [] });
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('should look up a code in a flat CodeSystem', () => {
    registry.register(adminGenderCS as unknown as CodeSystemDefinition);
    const concept = registry.lookupCode('http://hl7.org/fhir/administrative-gender', 'male');
    expect(concept).toBeDefined();
    expect(concept?.display).toBe('Male');
  });

  it('should return undefined for unknown code', () => {
    registry.register(adminGenderCS as unknown as CodeSystemDefinition);
    expect(registry.lookupCode('http://hl7.org/fhir/administrative-gender', 'xyz')).toBeUndefined();
  });

  it('should return undefined for unknown system', () => {
    expect(registry.lookupCode('http://unknown.org', 'male')).toBeUndefined();
  });

  it('should look up a code in a hierarchical CodeSystem', () => {
    registry.register(hierarchicalCS as unknown as CodeSystemDefinition);
    const concept = registry.lookupCode('http://example.org/fhir/CodeSystem/condition-category', 'bacterial');
    expect(concept).toBeDefined();
    expect(concept?.display).toBe('Bacterial Infection');
  });

  it('should check is-a relationships in hierarchical CodeSystem', () => {
    registry.register(hierarchicalCS as unknown as CodeSystemDefinition);
    const url = 'http://example.org/fhir/CodeSystem/condition-category';
    expect(registry.isDescendantOf(url, 'bacterial', 'infectious')).toBe(true);
    expect(registry.isDescendantOf(url, 'viral', 'infectious')).toBe(true);
    expect(registry.isDescendantOf(url, 'infectious', 'disease')).toBe(true);
    expect(registry.isDescendantOf(url, 'bacterial', 'finding')).toBe(false);
    expect(registry.isDescendantOf(url, 'disease', 'bacterial')).toBe(false);
  });

  it('should hasCode correctly', () => {
    registry.register(adminGenderCS as unknown as CodeSystemDefinition);
    expect(registry.hasCode('http://hl7.org/fhir/administrative-gender', 'male')).toBe(true);
    expect(registry.hasCode('http://hl7.org/fhir/administrative-gender', 'xyz')).toBe(false);
  });

  it('should collect all codes', () => {
    registry.register(adminGenderCS as unknown as CodeSystemDefinition);
    const codes = registry.allCodes('http://hl7.org/fhir/administrative-gender');
    expect(codes).toContain('male');
    expect(codes).toContain('female');
    expect(codes).toContain('other');
    expect(codes).toContain('unknown');
    expect(codes.length).toBe(4);
  });

  it('should collect all codes from hierarchical CodeSystem', () => {
    registry.register(hierarchicalCS as unknown as CodeSystemDefinition);
    const codes = registry.allCodes('http://example.org/fhir/CodeSystem/condition-category');
    expect(codes).toContain('disease');
    expect(codes).toContain('infectious');
    expect(codes).toContain('bacterial');
    expect(codes).toContain('viral');
    expect(codes).toContain('chronic');
    expect(codes).toContain('finding');
    expect(codes).toContain('symptom');
    expect(codes).toContain('sign');
    expect(codes.length).toBe(8);
  });
});
