/**
 * Tests for Report Generator
 *
 * Covers:
 * - Report structure correctness
 * - Summary fields
 * - Issues grouped by severity
 * - Issues grouped by path
 * - Issues grouped by step
 * - Empty results
 */

import { describe, it, expect } from 'vitest';
import { generateReport } from '../report/report-generator.js';
import type { PipelineResult } from '../types.js';
import { makePatient } from './helpers.js';

function makeResult(overrides?: Partial<PipelineResult>): PipelineResult {
  return {
    valid: true,
    resource: makePatient(),
    profileUrl: 'http://hl7.org/fhir/StructureDefinition/Patient',
    issues: [],
    stepResults: [],
    duration: 42,
    ...overrides,
  };
}

describe('Report Generator', () => {
  it('should produce a report with correct timestamp format', () => {
    const report = generateReport(makeResult());
    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('should produce correct summary for valid result', () => {
    const report = generateReport(makeResult());
    expect(report.summary.resourceType).toBe('Patient');
    expect(report.summary.profileUrl).toBe('http://hl7.org/fhir/StructureDefinition/Patient');
    expect(report.summary.valid).toBe(true);
    expect(report.summary.totalIssues).toBe(0);
    expect(report.summary.errors).toBe(0);
    expect(report.summary.warnings).toBe(0);
    expect(report.summary.information).toBe(0);
    expect(report.summary.duration).toBe(42);
  });

  it('should count issues by severity in summary', () => {
    const report = generateReport(makeResult({
      valid: false,
      issues: [
        { severity: 'error', code: 'TYPE_MISMATCH', message: 'e1' },
        { severity: 'error', code: 'TYPE_MISMATCH', message: 'e2' },
        { severity: 'warning', code: 'UNKNOWN_ELEMENT', message: 'w1' },
        { severity: 'information', code: 'INVARIANT_NOT_EVALUATED', message: 'i1' },
      ],
    }));
    expect(report.summary.errors).toBe(2);
    expect(report.summary.warnings).toBe(1);
    expect(report.summary.information).toBe(1);
    expect(report.summary.totalIssues).toBe(4);
  });

  it('should group issues by severity', () => {
    const report = generateReport(makeResult({
      issues: [
        { severity: 'error', code: 'TYPE_MISMATCH', message: 'e' },
        { severity: 'warning', code: 'UNKNOWN_ELEMENT', message: 'w' },
        { severity: 'error', code: 'REQUIRED_ELEMENT_MISSING', message: 'e2' },
      ],
    }));
    expect(report.issuesBySeverity['error']).toHaveLength(2);
    expect(report.issuesBySeverity['warning']).toHaveLength(1);
    expect(report.issuesBySeverity['information']).toBeUndefined();
  });

  it('should group issues by path', () => {
    const report = generateReport(makeResult({
      issues: [
        { severity: 'error', code: 'TYPE_MISMATCH', message: 'e1', path: 'Patient.name' },
        { severity: 'warning', code: 'UNKNOWN_ELEMENT', message: 'w1', path: 'Patient.name' },
        { severity: 'error', code: 'REQUIRED_ELEMENT_MISSING', message: 'e2', path: 'Patient.id' },
      ],
    }));
    expect(report.issuesByPath['Patient.name']).toHaveLength(2);
    expect(report.issuesByPath['Patient.id']).toHaveLength(1);
  });

  it('should use "(no path)" for issues without path', () => {
    const report = generateReport(makeResult({
      issues: [
        { severity: 'error', code: 'RESOURCE_TYPE_MISMATCH', message: 'e' },
      ],
    }));
    expect(report.issuesByPath['(no path)']).toHaveLength(1);
  });

  it('should group issues by step', () => {
    const report = generateReport(makeResult({
      stepResults: [
        { stepName: 'structural', issues: [{ severity: 'error', code: 'TYPE_MISMATCH', message: 'e' }], duration: 10, skipped: false },
        { stepName: 'terminology', issues: [], duration: 5, skipped: false },
        { stepName: 'invariant', issues: [{ severity: 'warning', code: 'INVARIANT_VIOLATION', message: 'w' }], duration: 3, skipped: false },
      ],
    }));
    expect(report.issuesByStep['structural']).toHaveLength(1);
    expect(report.issuesByStep['terminology']).toBeUndefined();
    expect(report.issuesByStep['invariant']).toHaveLength(1);
  });

  it('should count stepsRun excluding skipped steps', () => {
    const report = generateReport(makeResult({
      stepResults: [
        { stepName: 'a', issues: [], duration: 10, skipped: false },
        { stepName: 'b', issues: [], duration: 0, skipped: true },
        { stepName: 'c', issues: [], duration: 5, skipped: false },
      ],
    }));
    expect(report.summary.stepsRun).toBe(2);
  });

  it('should handle empty step results', () => {
    const report = generateReport(makeResult({ stepResults: [] }));
    expect(report.summary.stepsRun).toBe(0);
    expect(Object.keys(report.issuesByStep)).toHaveLength(0);
  });
});
