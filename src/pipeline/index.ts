/**
 * fhir-pipeline — Barrel Exports
 *
 * Re-exports all public types, classes, and functions from the
 * composable validation pipeline module.
 *
 * Public surface:
 * - Types: ValidationStep, PipelineContext, PipelineOptions, PipelineResult, etc.
 * - Classes: ValidationPipeline, StructuralValidationStep, TerminologyValidationStep, InvariantValidationStep
 * - Functions: generateReport, enhanceIssue, enhanceIssues
 *
 * @module fhir-pipeline
 */

// ─── Types & Interfaces ───
export type {
  ValidationStep,
  PipelineContext,
  PipelineOptions,
  PipelineResult,
  StepResult,
  BatchEntry,
  BatchResult,
  BatchEntryResult,
  PipelineEvent,
  PipelineEventHandler,
  PipelineEventData,
  EnhancedValidationIssue,
  ValidationReport,
  ReportSummary,
} from './types.js';

// ─── ValidationPipeline ───
export { ValidationPipeline } from './validation-pipeline.js';

// ─── Built-in Steps ───
export { StructuralValidationStep } from './steps/structural-step.js';
export { TerminologyValidationStep } from './steps/terminology-step.js';
export { InvariantValidationStep } from './steps/invariant-step.js';

// ─── Report Generator ───
export { generateReport } from './report/report-generator.js';

// ─── Enhanced Messages ───
export { enhanceIssue, enhanceIssues } from './report/enhanced-messages.js';

// ─── Hook Manager ───
export { HookManager } from './hooks/hook-manager.js';
