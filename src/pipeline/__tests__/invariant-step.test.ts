/**
 * Tests for InvariantValidationStep
 *
 * Covers:
 * - No constraints → no issues
 * - Passing invariant → no issues
 * - Failing invariant → issue
 * - Evaluation error → warning
 * - Step name and priority
 */

import { describe, it, expect } from 'vitest';
import { InvariantValidationStep } from '../steps/invariant-step.js';
import { MutablePipelineContext } from '../pipeline-context.js';
import { makeResource, makeElement, makeProfile } from './helpers.js';

describe('InvariantValidationStep', () => {
  const step = new InvariantValidationStep();

  it('should have name "invariant" and priority 30', () => {
    expect(step.name).toBe('invariant');
    expect(step.priority).toBe(30);
  });

  it('should return empty issues when no constraints exist', async () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', { min: 0, max: 'unbounded' }),
      makeElement('Patient.id', { min: 0, max: 1, types: [{ code: 'id' }] }),
    ]);
    const resource = makeResource('Patient', { id: 'p1' });
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, profile, context);
    expect(issues).toHaveLength(0);
  });

  it('should return no issue when invariant passes (true expression)', async () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', { min: 0, max: 'unbounded' }),
      makeElement('Patient.name', {
        min: 0, max: 'unbounded',
        types: [{ code: 'HumanName' }],
        constraints: [{
          key: 'test-1',
          severity: 'error',
          human: 'Must be true',
          expression: 'true',
        }],
      }),
    ]);
    const resource = makeResource('Patient', { name: [{ family: 'Test' }] });
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, profile, context);
    const violations = issues.filter((i) => i.code === 'INVARIANT_VIOLATION');
    expect(violations).toHaveLength(0);
  });

  it('should return issue when invariant fails (false expression)', async () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', { min: 0, max: 'unbounded' }),
      makeElement('Patient.name', {
        min: 0, max: 'unbounded',
        types: [{ code: 'HumanName' }],
        constraints: [{
          key: 'test-fail',
          severity: 'error',
          human: 'Always fails',
          expression: 'false',
        }],
      }),
    ]);
    const resource = makeResource('Patient', { name: [{ family: 'Test' }] });
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, profile, context);
    const violations = issues.filter((i) => i.code === 'INVARIANT_VIOLATION');
    expect(violations.length).toBeGreaterThanOrEqual(1);
  });

  it('should return warning for evaluation errors', async () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', { min: 0, max: 'unbounded' }),
      makeElement('Patient.name', {
        min: 0, max: 'unbounded',
        types: [{ code: 'HumanName' }],
        constraints: [{
          key: 'test-bad',
          severity: 'error',
          human: 'Bad expression',
          expression: 'this.nonExistentFunction()',
        }],
      }),
    ]);
    const resource = makeResource('Patient', { name: [{ family: 'Test' }] });
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, profile, context);
    const evalErrors = issues.filter((i) => i.code === 'INVARIANT_EVALUATION_ERROR');
    expect(evalErrors.length).toBeGreaterThanOrEqual(1);
    expect(evalErrors[0].severity).toBe('warning');
  });

  it('should skip elements with empty constraints array', async () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', { min: 0, max: 'unbounded' }),
      makeElement('Patient.name', {
        min: 0, max: 'unbounded',
        types: [{ code: 'HumanName' }],
        constraints: [],
      }),
    ]);
    const resource = makeResource('Patient', { name: [{ family: 'Test' }] });
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, profile, context);
    expect(issues).toHaveLength(0);
  });

  it('should skip constraints without expression', async () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', { min: 0, max: 'unbounded' }),
      makeElement('Patient.name', {
        min: 0, max: 'unbounded',
        types: [{ code: 'HumanName' }],
        constraints: [{
          key: 'human-only',
          severity: 'warning',
          human: 'Human readable only, no expression',
        }],
      }),
    ]);
    const resource = makeResource('Patient', { name: [{ family: 'Test' }] });
    const context = new MutablePipelineContext({});
    const issues = await step.validate(resource, profile, context);
    expect(issues).toHaveLength(0);
  });
});
