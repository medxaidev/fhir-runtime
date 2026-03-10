/**
 * Resource Type Registry Tests
 */
import { describe, it, expect } from 'vitest';
import { ResourceTypeRegistry, FHIR_R4_RESOURCE_TYPES } from '../resource-type-registry.js';
import type { ResourceTypeInfo } from '../types.js';

describe('ResourceTypeRegistry', () => {
  const patientInfo: ResourceTypeInfo = {
    type: 'Patient',
    url: 'http://hl7.org/fhir/StructureDefinition/Patient',
    kind: 'resource',
    abstract: false,
    baseDefinition: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
  };

  const domainResourceInfo: ResourceTypeInfo = {
    type: 'DomainResource',
    url: 'http://hl7.org/fhir/StructureDefinition/DomainResource',
    kind: 'resource',
    abstract: true,
    baseDefinition: 'http://hl7.org/fhir/StructureDefinition/Resource',
  };

  it('registers and retrieves a resource type', () => {
    const registry = new ResourceTypeRegistry();
    registry.register(patientInfo);
    expect(registry.get('Patient')).toEqual(patientInfo);
  });

  it('returns undefined for unknown types', () => {
    const registry = new ResourceTypeRegistry();
    expect(registry.get('Unknown')).toBeUndefined();
  });

  it('isKnown returns true for registered types', () => {
    const registry = new ResourceTypeRegistry();
    registry.register(patientInfo);
    expect(registry.isKnown('Patient')).toBe(true);
    expect(registry.isKnown('Observation')).toBe(false);
  });

  it('getAll returns all registered types', () => {
    const registry = new ResourceTypeRegistry();
    registry.register(patientInfo);
    registry.register(domainResourceInfo);
    expect(registry.getAll()).toHaveLength(2);
  });

  it('getConcreteTypes filters out abstract types', () => {
    const registry = new ResourceTypeRegistry();
    registry.register(patientInfo);
    registry.register(domainResourceInfo);
    const concrete = registry.getConcreteTypes();
    expect(concrete).toHaveLength(1);
    expect(concrete[0].type).toBe('Patient');
  });

  it('size returns count of registered types', () => {
    const registry = new ResourceTypeRegistry();
    expect(registry.size).toBe(0);
    registry.register(patientInfo);
    expect(registry.size).toBe(1);
  });

  it('remove deletes a registered type', () => {
    const registry = new ResourceTypeRegistry();
    registry.register(patientInfo);
    expect(registry.remove('Patient')).toBe(true);
    expect(registry.isKnown('Patient')).toBe(false);
    expect(registry.remove('Patient')).toBe(false);
  });

  it('clear removes all types', () => {
    const registry = new ResourceTypeRegistry();
    registry.register(patientInfo);
    registry.register(domainResourceInfo);
    registry.clear();
    expect(registry.size).toBe(0);
  });

  it('fromList builds registry from array', () => {
    const registry = ResourceTypeRegistry.fromList([patientInfo, domainResourceInfo]);
    expect(registry.size).toBe(2);
    expect(registry.isKnown('Patient')).toBe(true);
    expect(registry.isKnown('DomainResource')).toBe(true);
  });

  it('overwrites existing type on re-register', () => {
    const registry = new ResourceTypeRegistry();
    registry.register(patientInfo);
    const updated = { ...patientInfo, abstract: true };
    registry.register(updated);
    expect(registry.get('Patient')!.abstract).toBe(true);
  });
});

describe('FHIR_R4_RESOURCE_TYPES', () => {
  it('contains Patient', () => {
    expect(FHIR_R4_RESOURCE_TYPES).toContain('Patient');
  });

  it('contains Observation', () => {
    expect(FHIR_R4_RESOURCE_TYPES).toContain('Observation');
  });

  it('contains Resource (abstract base)', () => {
    expect(FHIR_R4_RESOURCE_TYPES).toContain('Resource');
  });

  it('contains Bundle', () => {
    expect(FHIR_R4_RESOURCE_TYPES).toContain('Bundle');
  });

  it('has more than 140 entries', () => {
    expect(FHIR_R4_RESOURCE_TYPES.length).toBeGreaterThan(140);
  });

  it('all entries start with uppercase', () => {
    for (const type of FHIR_R4_RESOURCE_TYPES) {
      expect(type[0]).toBe(type[0].toUpperCase());
    }
  });
});
