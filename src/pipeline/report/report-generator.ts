/**
 * fhir-pipeline — Report Generator
 *
 * Generates structured {@link ValidationReport} instances from
 * {@link PipelineResult} data, grouping issues by severity, path, and step.
 *
 * @module fhir-pipeline
 */

import type { ValidationIssue } from '../../validator/types.js';
import type { PipelineResult, ValidationReport, ReportSummary } from '../types.js';

// =============================================================================
// Public API
// =============================================================================

/**
 * Generate a structured validation report from a pipeline result.
 *
 * @param result - The pipeline result to generate a report from.
 * @returns A structured validation report.
 */
export function generateReport(result: PipelineResult): ValidationReport {
  const issues = result.issues;

  return {
    timestamp: new Date().toISOString(),
    summary: buildSummary(result),
    issuesBySeverity: groupBy(issues, (i) => i.severity),
    issuesByPath: groupBy(issues, (i) => i.path ?? '(no path)'),
    issuesByStep: groupByStep(result),
  };
}

// =============================================================================
// Helpers
// =============================================================================

function buildSummary(result: PipelineResult): ReportSummary {
  const issues = result.issues;
  return {
    resourceType: result.resource.resourceType ?? 'Unknown',
    profileUrl: result.profileUrl,
    valid: result.valid,
    totalIssues: issues.length,
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warning').length,
    information: issues.filter((i) => i.severity === 'information').length,
    stepsRun: result.stepResults.filter((s) => !s.skipped).length,
    duration: result.duration,
  };
}

function groupBy(
  issues: readonly ValidationIssue[],
  keyFn: (issue: ValidationIssue) => string,
): Record<string, ValidationIssue[]> {
  const groups: Record<string, ValidationIssue[]> = {};
  for (const issue of issues) {
    const key = keyFn(issue);
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(issue);
  }
  return groups;
}

function groupByStep(result: PipelineResult): Record<string, ValidationIssue[]> {
  const groups: Record<string, ValidationIssue[]> = {};
  for (const stepResult of result.stepResults) {
    if (stepResult.issues.length > 0) {
      groups[stepResult.stepName] = [...stepResult.issues];
    }
  }
  return groups;
}
