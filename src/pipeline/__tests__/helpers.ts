/**
 * Test helpers for pipeline tests.
 *
 * Provides factory functions for creating minimal test resources,
 * profiles, and validation steps.
 */

import type { CanonicalProfile, CanonicalElement, Resource } from '../../model/index.js';
import type { ValidationStep, PipelineContext } from '../types.js';
import type { ValidationIssue } from '../../validator/types.js';

// =============================================================================
// Minimal Resource Factories
// =============================================================================

export function makeResource(
  resourceType: string,
  overrides?: Record<string, unknown>,
): Resource {
  return { resourceType, ...overrides } as Resource;
}

export function makePatient(overrides?: Record<string, unknown>): Resource {
  return makeResource('Patient', {
    id: 'test-patient-1',
    name: [{ family: 'Test', given: ['John'] }],
    ...overrides,
  });
}

export function makeObservation(overrides?: Record<string, unknown>): Resource {
  return makeResource('Observation', {
    id: 'test-obs-1',
    status: 'final',
    code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
    ...overrides,
  });
}

// =============================================================================
// Minimal Profile Factories
// =============================================================================

export function makeElement(path: string, overrides?: Partial<CanonicalElement>): CanonicalElement {
  return {
    path,
    id: path,
    min: 0,
    max: 'unbounded' as const,
    types: [],
    constraints: [],
    mustSupport: false,
    isModifier: false,
    isSummary: false,
    ...overrides,
  };
}

export function makeProfile(
  type: string,
  elements: CanonicalElement[],
  overrides?: Partial<CanonicalProfile>,
): CanonicalProfile {
  const elementMap = new Map<string, CanonicalElement>();
  for (const el of elements) {
    elementMap.set(el.sliceName ? `${el.path}:${el.sliceName}` : el.path, el);
  }
  return {
    url: `http://hl7.org/fhir/StructureDefinition/${type}`,
    name: type,
    kind: 'resource',
    type,
    abstract: false,
    elements: elementMap,
    ...overrides,
  };
}

export function makePatientProfile(extraElements?: CanonicalElement[]): CanonicalProfile {
  return makeProfile('Patient', [
    makeElement('Patient', { min: 0, max: 'unbounded' }),
    makeElement('Patient.id', { min: 0, max: 1, types: [{ code: 'id' }] }),
    makeElement('Patient.name', { min: 0, max: 'unbounded', types: [{ code: 'HumanName' }] }),
    makeElement('Patient.name.family', { min: 0, max: 1, types: [{ code: 'string' }] }),
    makeElement('Patient.name.given', { min: 0, max: 'unbounded', types: [{ code: 'string' }] }),
    ...(extraElements ?? []),
  ]);
}

export function makeObservationProfile(extraElements?: CanonicalElement[]): CanonicalProfile {
  return makeProfile('Observation', [
    makeElement('Observation', { min: 0, max: 'unbounded' }),
    makeElement('Observation.id', { min: 0, max: 1, types: [{ code: 'id' }] }),
    makeElement('Observation.status', {
      min: 1, max: 1,
      types: [{ code: 'code' }],
      binding: {
        strength: 'required',
        valueSetUrl: 'http://hl7.org/fhir/ValueSet/observation-status',
      },
    }),
    makeElement('Observation.code', {
      min: 1, max: 1,
      types: [{ code: 'CodeableConcept' }],
      binding: {
        strength: 'example',
        valueSetUrl: 'http://hl7.org/fhir/ValueSet/observation-codes',
      },
    }),
    ...(extraElements ?? []),
  ]);
}

// =============================================================================
// Mock Steps
// =============================================================================

export function makeStep(
  name: string,
  issues: ValidationIssue[] = [],
  opts?: { priority?: number; shouldRun?: boolean; throws?: Error },
): ValidationStep {
  return {
    name,
    priority: opts?.priority ?? 100,
    async validate(): Promise<ValidationIssue[]> {
      if (opts?.throws) throw opts.throws;
      return issues;
    },
    shouldRun: opts?.shouldRun !== undefined
      ? () => opts.shouldRun!
      : undefined,
  };
}

export function makeIssue(
  severity: 'error' | 'warning' | 'information',
  code: ValidationIssue['code'],
  message: string,
  path?: string,
): ValidationIssue {
  return { severity, code, message, path };
}
