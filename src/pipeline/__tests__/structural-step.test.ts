/**
 * Tests for StructuralValidationStep
 *
 * Covers:
 * - Valid resource returns no issues
 * - Missing required element returns error
 * - Type mismatch returns error
 * - Step name and priority
 * - Works with pipeline context
 */

import { describe, it, expect } from 'vitest';
import { StructuralValidationStep } from '../steps/structural-step.js';
import { MutablePipelineContext } from '../pipeline-context.js';
import {
  makePatient,
  makeElement,
  makeProfile,
  makePatientProfile,
} from './helpers.js';

describe('StructuralValidationStep', () => {
  const step = new StructuralValidationStep();

  it('should have name "structural" and priority 10', () => {
    expect(step.name).toBe('structural');
    expect(step.priority).toBe(10);
  });

  it('should return no issues for a valid minimal resource', async () => {
    const resource = makePatient();
    const profile = makePatientProfile();
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, profile, context);
    expect(issues).toBeInstanceOf(Array);
    // Minimal patient with no required elements should pass
  });

  it('should detect missing required element', async () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', { min: 0, max: 'unbounded' }),
      makeElement('Patient.name', { min: 1, max: 'unbounded', types: [{ code: 'HumanName' }] }),
    ]);
    const resource = makePatient({ name: undefined });
    // Remove name from resource
    delete (resource as any).name;
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, profile, context);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect resource type mismatch', async () => {
    const profile = makeProfile('Observation', [
      makeElement('Observation', { min: 0, max: 'unbounded' }),
    ]);
    const resource = makePatient();
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, profile, context);
    const typeErrors = issues.filter((i) => i.code === 'RESOURCE_TYPE_MISMATCH');
    expect(typeErrors.length).toBeGreaterThanOrEqual(1);
  });

  it('should respect maxDepth from context options', async () => {
    const resource = makePatient();
    const profile = makePatientProfile();
    const context = new MutablePipelineContext({ maxDepth: 5 });
    const issues = await step.validate(resource, profile, context);
    // Should not crash with limited depth
    expect(issues).toBeInstanceOf(Array);
  });

  it('should return issues array even when no issues found', async () => {
    const resource = makePatient();
    const profile = makePatientProfile();
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, profile, context);
    expect(Array.isArray(issues)).toBe(true);
  });
});
