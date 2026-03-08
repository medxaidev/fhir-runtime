/**
 * Tests for TerminologyValidationStep
 *
 * Covers:
 * - No provider → returns empty issues
 * - Valid code with provider → no issues
 * - Invalid code with required binding → error
 * - Invalid code with extensible binding → warning
 * - Invalid code with preferred/example binding → information
 * - Provider error handling
 */

import { describe, it, expect } from 'vitest';
import { TerminologyValidationStep } from '../steps/terminology-step.js';
import { MutablePipelineContext } from '../pipeline-context.js';
import type { TerminologyProvider } from '../../provider/types.js';
import { makeResource, makeElement, makeProfile } from './helpers.js';

function makeTermProvider(valid: boolean, message?: string): TerminologyProvider {
  return {
    async validateCode() {
      return { result: valid, message };
    },
    async expandValueSet() {
      return { contains: [] };
    },
    async lookupCode() {
      return { found: false };
    },
  };
}

function makeFailingProvider(): TerminologyProvider {
  return {
    async validateCode() {
      throw new Error('Provider unavailable');
    },
    async expandValueSet() {
      return { contains: [] };
    },
    async lookupCode() {
      return { found: false };
    },
  };
}

const obsProfile = makeProfile('Observation', [
  makeElement('Observation', { min: 0, max: 'unbounded' }),
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
  makeElement('Observation.category', {
    min: 0, max: 'unbounded',
    types: [{ code: 'CodeableConcept' }],
    binding: {
      strength: 'extensible',
      valueSetUrl: 'http://hl7.org/fhir/ValueSet/observation-category',
    },
  }),
  makeElement('Observation.interpretation', {
    min: 0, max: 'unbounded',
    types: [{ code: 'CodeableConcept' }],
    binding: {
      strength: 'preferred',
      valueSetUrl: 'http://hl7.org/fhir/ValueSet/observation-interpretation',
    },
  }),
]);

describe('TerminologyValidationStep', () => {
  const step = new TerminologyValidationStep();

  it('should have name "terminology" and priority 20', () => {
    expect(step.name).toBe('terminology');
    expect(step.priority).toBe(20);
  });

  it('should return empty issues when no provider is available', async () => {
    const resource = makeResource('Observation', { status: 'final' });
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, obsProfile, context);
    expect(issues).toHaveLength(0);
  });

  it('should return no issues when provider validates all codes', async () => {
    const resource = makeResource('Observation', {
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '12345-6' }] },
    });
    const context = new MutablePipelineContext({
      terminologyProvider: makeTermProvider(true),
    });
    const issues = await step.validate(resource, obsProfile, context);
    expect(issues).toHaveLength(0);
  });

  it('should return error for invalid required binding code', async () => {
    const resource = makeResource('Observation', { status: 'invalid-status' });
    const context = new MutablePipelineContext({
      terminologyProvider: makeTermProvider(false, 'Code not found'),
    });
    const issues = await step.validate(resource, obsProfile, context);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should return warning for invalid extensible binding code', async () => {
    const resource = makeResource('Observation', {
      status: 'final',
      category: [{ coding: [{ system: 'http://example.org', code: 'bad' }] }],
    });
    const context = new MutablePipelineContext({
      terminologyProvider: makeTermProvider(false),
    });
    const issues = await step.validate(resource, obsProfile, context);
    const warnings = issues.filter(
      (i) => i.severity === 'warning' && i.path === 'Observation.category',
    );
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('should return information for invalid preferred/example binding', async () => {
    const resource = makeResource('Observation', {
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: 'bad' }] },
    });
    const context = new MutablePipelineContext({
      terminologyProvider: makeTermProvider(false),
    });
    const issues = await step.validate(resource, obsProfile, context);
    const infos = issues.filter(
      (i) => i.severity === 'information' && i.path === 'Observation.code',
    );
    expect(infos.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle provider errors gracefully', async () => {
    const resource = makeResource('Observation', { status: 'final' });
    const context = new MutablePipelineContext({
      terminologyProvider: makeFailingProvider(),
    });
    const issues = await step.validate(resource, obsProfile, context);
    const warnings = issues.filter((i) => i.severity === 'warning');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
  });

  it('should skip elements without binding', async () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', { min: 0, max: 'unbounded' }),
      makeElement('Patient.name', { min: 0, max: 'unbounded', types: [{ code: 'HumanName' }] }),
    ]);
    const resource = makeResource('Patient', { name: [{ family: 'Test' }] });
    const context = new MutablePipelineContext({
      terminologyProvider: makeTermProvider(false),
    });
    const issues = await step.validate(resource, profile, context);
    expect(issues).toHaveLength(0);
  });
});
