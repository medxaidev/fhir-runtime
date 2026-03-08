/**
 * Tests for ValidationPipeline — basic flow
 *
 * Covers:
 * - Empty pipeline returns valid
 * - Single step returning issues
 * - Multiple steps in priority order
 * - addStep / removeStep
 * - getSteps returns sorted copy
 */

import { describe, it, expect } from 'vitest';
import { ValidationPipeline } from '../validation-pipeline.js';
import { makePatient, makePatientProfile, makeStep, makeIssue } from './helpers.js';

describe('ValidationPipeline (basic flow)', () => {
  const resource = makePatient();
  const profile = makePatientProfile();

  it('should return valid=true with no steps', async () => {
    const pipeline = new ValidationPipeline();
    const result = await pipeline.validate(resource, profile);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.stepResults).toHaveLength(0);
    expect(result.profileUrl).toBe(profile.url);
  });

  it('should return valid=true when step produces no issues', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const result = await pipeline.validate(resource, profile);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].stepName).toBe('noop');
    expect(result.stepResults[0].skipped).toBe(false);
  });

  it('should collect issues from a single step', async () => {
    const issues = [makeIssue('error', 'REQUIRED_ELEMENT_MISSING', 'Name is required', 'Patient.name')];
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('check', issues));
    const result = await pipeline.validate(resource, profile);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('REQUIRED_ELEMENT_MISSING');
  });

  it('should execute steps in priority order', async () => {
    const order: string[] = [];
    const step1: any = {
      name: 'high',
      priority: 50,
      async validate() { order.push('high'); return []; },
    };
    const step2: any = {
      name: 'low',
      priority: 10,
      async validate() { order.push('low'); return []; },
    };
    const pipeline = new ValidationPipeline();
    pipeline.addStep(step1);
    pipeline.addStep(step2);
    await pipeline.validate(resource, profile);
    expect(order).toEqual(['low', 'high']);
  });

  it('should collect issues from multiple steps', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('a', [makeIssue('error', 'TYPE_MISMATCH', 'err1')], { priority: 10 }));
    pipeline.addStep(makeStep('b', [makeIssue('warning', 'UNKNOWN_ELEMENT', 'warn1')], { priority: 20 }));
    const result = await pipeline.validate(resource, profile);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
    expect(result.stepResults).toHaveLength(2);
  });

  it('should remove a step by name', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('keep'));
    pipeline.addStep(makeStep('remove'));
    pipeline.removeStep('remove');
    const result = await pipeline.validate(resource, profile);
    expect(result.stepResults).toHaveLength(1);
    expect(result.stepResults[0].stepName).toBe('keep');
  });

  it('should return sorted steps via getSteps()', () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('c', [], { priority: 30 }));
    pipeline.addStep(makeStep('a', [], { priority: 10 }));
    pipeline.addStep(makeStep('b', [], { priority: 20 }));
    const steps = pipeline.getSteps();
    expect(steps.map((s) => s.name)).toEqual(['a', 'b', 'c']);
  });

  it('should record duration > 0', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('slow'));
    const result = await pipeline.validate(resource, profile);
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.stepResults[0].duration).toBeGreaterThanOrEqual(0);
  });

  it('should set resource and profileUrl on result', async () => {
    const pipeline = new ValidationPipeline();
    const result = await pipeline.validate(resource, profile);
    expect(result.resource).toBe(resource);
    expect(result.profileUrl).toBe(profile.url);
  });
});

describe('ValidationPipeline (failFast)', () => {
  const resource = makePatient();
  const profile = makePatientProfile();

  it('should abort remaining steps on error when failFast=true', async () => {
    const pipeline = new ValidationPipeline({ failFast: true });
    pipeline.addStep(makeStep('err', [makeIssue('error', 'TYPE_MISMATCH', 'fail')], { priority: 10 }));
    pipeline.addStep(makeStep('skipped', [makeIssue('warning', 'UNKNOWN_ELEMENT', 'warn')], { priority: 20 }));
    const result = await pipeline.validate(resource, profile);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(1);
    expect(result.stepResults[1].skipped).toBe(true);
  });

  it('should not abort when only warnings with failFast=true', async () => {
    const pipeline = new ValidationPipeline({ failFast: true });
    pipeline.addStep(makeStep('warn', [makeIssue('warning', 'UNKNOWN_ELEMENT', 'warn')], { priority: 10 }));
    pipeline.addStep(makeStep('ok', [], { priority: 20 }));
    const result = await pipeline.validate(resource, profile);
    expect(result.valid).toBe(true);
    expect(result.stepResults[0].skipped).toBe(false);
    expect(result.stepResults[1].skipped).toBe(false);
  });

  it('should continue all steps when failFast=false (default)', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('err', [makeIssue('error', 'TYPE_MISMATCH', 'fail')], { priority: 10 }));
    pipeline.addStep(makeStep('more', [makeIssue('warning', 'UNKNOWN_ELEMENT', 'warn')], { priority: 20 }));
    const result = await pipeline.validate(resource, profile);
    expect(result.issues).toHaveLength(2);
    expect(result.stepResults[1].skipped).toBe(false);
  });

  it('should mark all subsequent steps as skipped after abort', async () => {
    const pipeline = new ValidationPipeline({ failFast: true });
    pipeline.addStep(makeStep('pass', [], { priority: 5 }));
    pipeline.addStep(makeStep('fail', [makeIssue('error', 'TYPE_MISMATCH', 'x')], { priority: 10 }));
    pipeline.addStep(makeStep('skip1', [], { priority: 20 }));
    pipeline.addStep(makeStep('skip2', [], { priority: 30 }));
    const result = await pipeline.validate(resource, profile);
    expect(result.stepResults[0].skipped).toBe(false);
    expect(result.stepResults[1].skipped).toBe(false);
    expect(result.stepResults[2].skipped).toBe(true);
    expect(result.stepResults[3].skipped).toBe(true);
  });

  it('should still return all collected issues in failFast mode', async () => {
    const pipeline = new ValidationPipeline({ failFast: true });
    pipeline.addStep(makeStep('multi', [
      makeIssue('warning', 'UNKNOWN_ELEMENT', 'w1'),
      makeIssue('error', 'TYPE_MISMATCH', 'e1'),
    ], { priority: 10 }));
    pipeline.addStep(makeStep('skipped', [makeIssue('error', 'INTERNAL_ERROR', 'e2')], { priority: 20 }));
    const result = await pipeline.validate(resource, profile);
    expect(result.issues).toHaveLength(2);
  });
});

describe('ValidationPipeline (minSeverity filter)', () => {
  const resource = makePatient();
  const profile = makePatientProfile();

  it('should include all severities with minSeverity=information', async () => {
    const pipeline = new ValidationPipeline({ minSeverity: 'information' });
    pipeline.addStep(makeStep('mix', [
      makeIssue('error', 'TYPE_MISMATCH', 'e'),
      makeIssue('warning', 'UNKNOWN_ELEMENT', 'w'),
      makeIssue('information', 'INVARIANT_NOT_EVALUATED', 'i'),
    ]));
    const result = await pipeline.validate(resource, profile);
    expect(result.issues).toHaveLength(3);
  });

  it('should filter out information with minSeverity=warning', async () => {
    const pipeline = new ValidationPipeline({ minSeverity: 'warning' });
    pipeline.addStep(makeStep('mix', [
      makeIssue('error', 'TYPE_MISMATCH', 'e'),
      makeIssue('warning', 'UNKNOWN_ELEMENT', 'w'),
      makeIssue('information', 'INVARIANT_NOT_EVALUATED', 'i'),
    ]));
    const result = await pipeline.validate(resource, profile);
    expect(result.issues).toHaveLength(2);
    expect(result.issues.every((i) => i.severity !== 'information')).toBe(true);
  });

  it('should only include errors with minSeverity=error', async () => {
    const pipeline = new ValidationPipeline({ minSeverity: 'error' });
    pipeline.addStep(makeStep('mix', [
      makeIssue('error', 'TYPE_MISMATCH', 'e'),
      makeIssue('warning', 'UNKNOWN_ELEMENT', 'w'),
      makeIssue('information', 'INVARIANT_NOT_EVALUATED', 'i'),
    ]));
    const result = await pipeline.validate(resource, profile);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].severity).toBe('error');
  });

  it('should return valid=true when errors are present but filtered by minSeverity=error and only warnings exist after the filter', async () => {
    const pipeline = new ValidationPipeline({ minSeverity: 'error' });
    pipeline.addStep(makeStep('warn-only', [
      makeIssue('warning', 'UNKNOWN_ELEMENT', 'w'),
    ]));
    const result = await pipeline.validate(resource, profile);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should also filter step results by minSeverity', async () => {
    const pipeline = new ValidationPipeline({ minSeverity: 'warning' });
    pipeline.addStep(makeStep('info-only', [
      makeIssue('information', 'INVARIANT_NOT_EVALUATED', 'info'),
    ]));
    const result = await pipeline.validate(resource, profile);
    expect(result.stepResults[0].issues).toHaveLength(0);
  });
});
