/**
 * Pipeline Integration Tests — ≥15 end-to-end tests
 *
 * Tests the full pipeline with real built-in steps (structural, terminology,
 * invariant) running together, verifying complete validation flows.
 */

import { describe, it, expect, vi } from 'vitest';
import { ValidationPipeline } from '../validation-pipeline.js';
import { StructuralValidationStep } from '../steps/structural-step.js';
import { TerminologyValidationStep } from '../steps/terminology-step.js';
import { InvariantValidationStep } from '../steps/invariant-step.js';
import { generateReport } from '../report/report-generator.js';
import { enhanceIssues } from '../report/enhanced-messages.js';
import type { TerminologyProvider } from '../../provider/types.js';
import type { ValidationStep, PipelineContext, PipelineEventData } from '../types.js';
import type { ValidationIssue } from '../../validator/types.js';
import {
  makeResource,
  makePatient,
  makeElement,
  makeProfile,
  makePatientProfile,
  makeObservationProfile,
  makeStep,
  makeIssue,
} from './helpers.js';

function makeAlwaysValidProvider(): TerminologyProvider {
  return {
    async validateCode() { return { result: true }; },
    async expandValueSet() { return { contains: [] }; },
    async lookupCode() { return { found: false }; },
  };
}

function makeRejectingProvider(): TerminologyProvider {
  return {
    async validateCode() { return { result: false, message: 'Code not in ValueSet' }; },
    async expandValueSet() { return { contains: [] }; },
    async lookupCode() { return { found: false }; },
  };
}

describe('Pipeline Integration (end-to-end)', () => {
  // 1. Full pipeline with all 3 steps on valid resource
  it('should validate a valid Patient with all 3 steps', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(new StructuralValidationStep());
    pipeline.addStep(new TerminologyValidationStep());
    pipeline.addStep(new InvariantValidationStep());
    const resource = makePatient();
    const profile = makePatientProfile();
    const result = await pipeline.validate(resource, profile);
    expect(result.stepResults).toHaveLength(3);
    expect(result.stepResults[0].stepName).toBe('structural');
    expect(result.stepResults[1].stepName).toBe('terminology');
    expect(result.stepResults[2].stepName).toBe('invariant');
  });

  // 2. Steps execute in priority order
  it('should execute steps in priority order (10, 20, 30)', async () => {
    const order: string[] = [];
    const pipeline = new ValidationPipeline();
    const wrap = (step: ValidationStep): ValidationStep => ({
      ...step,
      async validate(r, p, c) {
        order.push(step.name);
        return step.validate(r, p, c);
      },
    });
    pipeline.addStep(wrap(new InvariantValidationStep()));
    pipeline.addStep(wrap(new StructuralValidationStep()));
    pipeline.addStep(wrap(new TerminologyValidationStep()));
    await pipeline.validate(makePatient(), makePatientProfile());
    expect(order).toEqual(['structural', 'terminology', 'invariant']);
  });

  // 3. Structural step detects type mismatch
  it('should detect resource type mismatch via structural step', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(new StructuralValidationStep());
    const resource = makePatient();
    const obsProfile = makeObservationProfile();
    const result = await pipeline.validate(resource, obsProfile);
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'RESOURCE_TYPE_MISMATCH')).toBe(true);
  });

  // 4. Structural step detects missing required element
  it('should detect missing required element', async () => {
    const profile = makeProfile('Patient', [
      makeElement('Patient', { min: 0, max: 'unbounded' }),
      makeElement('Patient.name', { min: 1, max: 'unbounded', types: [{ code: 'HumanName' }] }),
    ]);
    const resource = makeResource('Patient', {});
    const pipeline = new ValidationPipeline();
    pipeline.addStep(new StructuralValidationStep());
    const result = await pipeline.validate(resource, profile);
    const errors = result.issues.filter((i) => i.severity === 'error');
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  // 5. Terminology step with provider that rejects code
  it('should report terminology error for invalid required binding', async () => {
    const pipeline = new ValidationPipeline({
      terminologyProvider: makeRejectingProvider(),
    });
    pipeline.addStep(new TerminologyValidationStep());
    const resource = makeResource('Observation', { status: 'invalid' });
    const obsProfile = makeObservationProfile();
    const result = await pipeline.validate(resource, obsProfile);
    const termIssues = result.stepResults.find((s) => s.stepName === 'terminology');
    expect(termIssues).toBeDefined();
    expect(termIssues!.issues.length).toBeGreaterThanOrEqual(1);
  });

  // 6. Terminology step skipped when no provider
  it('should skip terminology validation when no provider', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(new TerminologyValidationStep());
    const resource = makeResource('Observation', { status: 'final' });
    const result = await pipeline.validate(resource, makeObservationProfile());
    const termResult = result.stepResults.find((s) => s.stepName === 'terminology');
    expect(termResult!.issues).toHaveLength(0);
  });

  // 7. Invariant step with failing constraint
  it('should detect invariant violation', async () => {
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
    const resource = makePatient();
    const pipeline = new ValidationPipeline();
    pipeline.addStep(new InvariantValidationStep());
    const result = await pipeline.validate(resource, profile);
    expect(result.issues.some((i) => i.code === 'INVARIANT_VIOLATION')).toBe(true);
  });

  // 8. Hook integration: beforeValidation and afterValidation
  it('should fire beforeValidation and afterValidation hooks', async () => {
    const events: string[] = [];
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    pipeline.on('beforeValidation', () => { events.push('before'); });
    pipeline.on('afterValidation', () => { events.push('after'); });
    await pipeline.validate(makePatient(), makePatientProfile());
    expect(events).toEqual(['before', 'after']);
  });

  // 9. Hook integration: beforeStep and afterStep per step
  it('should fire beforeStep and afterStep for each step', async () => {
    const stepNames: string[] = [];
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('a', [], { priority: 10 }));
    pipeline.addStep(makeStep('b', [], { priority: 20 }));
    pipeline.on('beforeStep', (data) => { stepNames.push(`before:${data.step?.name}`); });
    pipeline.on('afterStep', (data) => { stepNames.push(`after:${data.step?.name}`); });
    await pipeline.validate(makePatient(), makePatientProfile());
    expect(stepNames).toEqual(['before:a', 'after:a', 'before:b', 'after:b']);
  });

  // 10. Hook integration: onIssue fires per issue
  it('should fire onIssue for each issue', async () => {
    const captured: ValidationIssue[] = [];
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('multi', [
      makeIssue('error', 'TYPE_MISMATCH', 'e1'),
      makeIssue('warning', 'UNKNOWN_ELEMENT', 'w1'),
    ]));
    pipeline.on('onIssue', (data) => { if (data.issue) captured.push(data.issue); });
    await pipeline.validate(makePatient(), makePatientProfile());
    expect(captured).toHaveLength(2);
  });

  // 11. Custom step injection
  it('should support custom step injection', async () => {
    const customStep: ValidationStep = {
      name: 'custom-audit',
      priority: 50,
      async validate(resource) {
        const issues: ValidationIssue[] = [];
        if (!(resource as any).id) {
          issues.push({
            severity: 'warning',
            code: 'UNKNOWN_ELEMENT',
            message: 'Resource is missing id (custom audit)',
          });
        }
        return issues;
      },
    };
    const pipeline = new ValidationPipeline();
    pipeline.addStep(new StructuralValidationStep());
    pipeline.addStep(customStep);
    const resource = makeResource('Patient', {});
    const result = await pipeline.validate(resource, makePatientProfile());
    expect(result.stepResults.some((s) => s.stepName === 'custom-audit')).toBe(true);
  });

  // 12. Report generation from pipeline result
  it('should generate a valid report from pipeline result', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('check', [
      makeIssue('error', 'TYPE_MISMATCH', 'e1', 'Patient.name'),
      makeIssue('warning', 'UNKNOWN_ELEMENT', 'w1', 'Patient.foo'),
    ]));
    const result = await pipeline.validate(makePatient(), makePatientProfile());
    const report = generateReport(result);
    expect(report.summary.valid).toBe(false);
    expect(report.summary.errors).toBe(1);
    expect(report.summary.warnings).toBe(1);
    expect(report.issuesBySeverity['error']).toHaveLength(1);
    expect(report.issuesByPath['Patient.name']).toHaveLength(1);
  });

  // 13. Enhanced messages from pipeline issues
  it('should enhance pipeline issues with suggestions', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('check', [
      makeIssue('error', 'CARDINALITY_MIN_VIOLATION', "Element 'Patient.name' requires at least 1 value(s), but found 0", 'Patient.name'),
    ]));
    const result = await pipeline.validate(makePatient(), makePatientProfile());
    const enhanced = enhanceIssues(result.issues);
    expect(enhanced[0].suggestion).toBeDefined();
    expect(enhanced[0].expected).toBe('min=1');
  });

  // 14. Pipeline with error-throwing step
  it('should handle step errors gracefully', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('boom', [], { throws: new Error('Step crashed') }));
    const result = await pipeline.validate(makePatient(), makePatientProfile());
    expect(result.valid).toBe(false);
    expect(result.issues.some((i) => i.code === 'INTERNAL_ERROR')).toBe(true);
  });

  // 15. Pipeline with shouldRun filter
  it('should skip step when shouldRun returns false', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('always', [makeIssue('warning', 'UNKNOWN_ELEMENT', 'w')]));
    pipeline.addStep(makeStep('never', [makeIssue('error', 'TYPE_MISMATCH', 'e')], { shouldRun: false }));
    const result = await pipeline.validate(makePatient(), makePatientProfile());
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(1);
    expect(result.stepResults.find((s) => s.stepName === 'never')?.skipped).toBe(true);
  });

  // 16. Batch + full pipeline
  it('should batch validate with all steps', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(new StructuralValidationStep());
    pipeline.addStep(new InvariantValidationStep());
    const entries = [
      { resource: makePatient(), profile: makePatientProfile(), label: 'p1' },
      { resource: makePatient(), profile: makePatientProfile(), label: 'p2' },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.total).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0].label).toBe('p1');
  });

  // 17. Pipeline result duration tracking
  it('should track duration for pipeline and individual steps', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(new StructuralValidationStep());
    const result = await pipeline.validate(makePatient(), makePatientProfile());
    expect(result.duration).toBeGreaterThanOrEqual(0);
    expect(result.stepResults[0].duration).toBeGreaterThanOrEqual(0);
  });
});
