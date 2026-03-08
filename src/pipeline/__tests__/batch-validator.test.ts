/**
 * Tests for batch validation — ≥15 JSON fixture tests
 *
 * Uses JSON fixture resources to test batch validation through the pipeline.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationPipeline } from '../validation-pipeline.js';
import type { BatchEntry, BatchResult } from '../types.js';
import type { Resource } from '../../model/index.js';
import {
  makeStep,
  makeIssue,
  makePatientProfile,
  makeObservationProfile,
  makeProfile,
  makeElement,
} from './helpers.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

function loadFixture(name: string): Resource {
  const raw = readFileSync(join(__dirname, 'fixtures', 'resources', name), 'utf-8');
  return JSON.parse(raw) as Resource;
}

const patientProfile = makePatientProfile();
const obsProfile = makeObservationProfile();
const conditionProfile = makeProfile('Condition', [
  makeElement('Condition', { min: 0, max: 'unbounded' }),
  makeElement('Condition.id', { min: 0, max: 1, types: [{ code: 'id' }] }),
  makeElement('Condition.subject', { min: 0, max: 1, types: [{ code: 'Reference' }] }),
]);

describe('Batch Validation (JSON fixtures)', () => {
  // Fixture 1: Single valid patient
  it('fixture: single valid patient batch', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile, label: 'valid-patient' },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.results[0].label).toBe('valid-patient');
  });

  // Fixture 2: Mixed valid/invalid patients
  it('fixture: mixed patient batch with error step', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('check', [makeIssue('error', 'REQUIRED_ELEMENT_MISSING', 'fail')]));
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile },
      { resource: loadFixture('patient-no-name.json'), profile: patientProfile },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.total).toBe(2);
    expect(result.failed).toBe(2);
  });

  // Fixture 3: All valid batch
  it('fixture: all-valid batch returns passed=total', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile },
      { resource: loadFixture('patient-minimal.json'), profile: patientProfile },
      { resource: loadFixture('patient-no-name.json'), profile: patientProfile },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.total).toBe(3);
    expect(result.passed).toBe(3);
    expect(result.failed).toBe(0);
  });

  // Fixture 4: Empty batch
  it('fixture: empty batch returns zero totals', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const result = await pipeline.validateBatch([]);
    expect(result.total).toBe(0);
    expect(result.passed).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.results).toHaveLength(0);
  });

  // Fixture 5: Observation complete batch
  it('fixture: valid observation batch', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const entries: BatchEntry[] = [
      { resource: loadFixture('observation-complete.json'), profile: obsProfile, label: 'obs-complete' },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.total).toBe(1);
    expect(result.passed).toBe(1);
    expect(result.results[0].label).toBe('obs-complete');
  });

  // Fixture 6: Mixed resource types in batch
  it('fixture: mixed resource types batch', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile, label: 'patient' },
      { resource: loadFixture('observation-complete.json'), profile: obsProfile, label: 'obs' },
      { resource: loadFixture('condition-valid.json'), profile: conditionProfile, label: 'cond' },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.total).toBe(3);
    expect(result.passed).toBe(3);
  });

  // Fixture 7: Batch duration is recorded
  it('fixture: batch records duration', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.duration).toBeGreaterThanOrEqual(0);
  });

  // Fixture 8: Batch preserves labels
  it('fixture: batch preserves entry labels', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile, label: 'first' },
      { resource: loadFixture('patient-no-name.json'), profile: patientProfile, label: 'second' },
      { resource: loadFixture('patient-minimal.json'), profile: patientProfile },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.results[0].label).toBe('first');
    expect(result.results[1].label).toBe('second');
    expect(result.results[2].label).toBeUndefined();
  });

  // Fixture 9: Wrong resource type detected in batch
  it('fixture: wrong resource type in batch entry', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('type-check', [
      makeIssue('error', 'RESOURCE_TYPE_MISMATCH', 'Type mismatch'),
    ]));
    const entries: BatchEntry[] = [
      { resource: loadFixture('observation-wrong-type.json'), profile: obsProfile, label: 'wrong-type' },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.failed).toBe(1);
    expect(result.results[0].result.valid).toBe(false);
  });

  // Fixture 10: Batch with failFast pipeline
  it('fixture: batch with failFast still validates all entries', async () => {
    const pipeline = new ValidationPipeline({ failFast: true });
    pipeline.addStep(makeStep('err', [makeIssue('error', 'INTERNAL_ERROR', 'e')]));
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile },
      { resource: loadFixture('patient-no-name.json'), profile: patientProfile },
      { resource: loadFixture('patient-minimal.json'), profile: patientProfile },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.total).toBe(3);
    expect(result.results).toHaveLength(3);
  });

  // Fixture 11: Large batch with 5 entries
  it('fixture: batch with 5 entries', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile },
      { resource: loadFixture('patient-no-name.json'), profile: patientProfile },
      { resource: loadFixture('patient-minimal.json'), profile: patientProfile },
      { resource: loadFixture('observation-complete.json'), profile: obsProfile },
      { resource: loadFixture('condition-valid.json'), profile: conditionProfile },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.total).toBe(5);
    expect(result.results).toHaveLength(5);
  });

  // Fixture 12: Batch per-entry results contain issues
  it('fixture: batch entry results contain per-entry issues', async () => {
    let callCount = 0;
    const alternatingStep: any = {
      name: 'alternate',
      priority: 10,
      async validate() {
        callCount++;
        return callCount % 2 === 0
          ? [makeIssue('error', 'TYPE_MISMATCH', 'err')]
          : [];
      },
    };
    const pipeline = new ValidationPipeline();
    pipeline.addStep(alternatingStep);
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile },
      { resource: loadFixture('patient-no-name.json'), profile: patientProfile },
      { resource: loadFixture('patient-minimal.json'), profile: patientProfile },
      { resource: loadFixture('observation-complete.json'), profile: obsProfile },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.passed).toBe(2);
    expect(result.failed).toBe(2);
  });

  // Fixture 13: Batch result structure check
  it('fixture: batch result has correct structure', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const entries: BatchEntry[] = [
      { resource: loadFixture('observation-no-status.json'), profile: obsProfile },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('failed');
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('duration');
    expect(result.results[0]).toHaveProperty('result');
    expect(result.results[0].result).toHaveProperty('valid');
    expect(result.results[0].result).toHaveProperty('issues');
    expect(result.results[0].result).toHaveProperty('stepResults');
  });

  // Fixture 14: Observation without code in batch
  it('fixture: observation-no-code in batch', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('noop'));
    const entries: BatchEntry[] = [
      { resource: loadFixture('observation-no-code.json'), profile: obsProfile, label: 'no-code' },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.total).toBe(1);
    expect(result.results[0].label).toBe('no-code');
  });

  // Fixture 15: Batch with minSeverity filter
  it('fixture: batch with minSeverity=error filters warnings', async () => {
    const pipeline = new ValidationPipeline({ minSeverity: 'error' });
    pipeline.addStep(makeStep('warn-only', [
      makeIssue('warning', 'UNKNOWN_ELEMENT', 'warn'),
    ]));
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile },
      { resource: loadFixture('patient-no-name.json'), profile: patientProfile },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.passed).toBe(2);
    for (const entry of result.results) {
      expect(entry.result.issues).toHaveLength(0);
    }
  });

  // Fixture 16: Batch with multiple steps
  it('fixture: batch with multiple steps collects all issues per entry', async () => {
    const pipeline = new ValidationPipeline();
    pipeline.addStep(makeStep('a', [makeIssue('warning', 'UNKNOWN_ELEMENT', 'w1')], { priority: 10 }));
    pipeline.addStep(makeStep('b', [makeIssue('error', 'TYPE_MISMATCH', 'e1')], { priority: 20 }));
    const entries: BatchEntry[] = [
      { resource: loadFixture('patient-valid.json'), profile: patientProfile },
    ];
    const result = await pipeline.validateBatch(entries);
    expect(result.results[0].result.issues).toHaveLength(2);
    expect(result.results[0].result.stepResults).toHaveLength(2);
  });
});
