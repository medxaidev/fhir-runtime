/**
 * fhir-pipeline — Public Interfaces & Types
 *
 * Defines the core abstractions for the composable validation pipeline:
 * - {@link ValidationStep} — pluggable validation step interface
 * - {@link PipelineContext} — shared state across steps
 * - {@link PipelineOptions} — pipeline configuration
 * - {@link PipelineResult} — single-resource validation result
 * - {@link BatchEntry} / {@link BatchResult} — batch validation
 * - {@link PipelineEvent} / {@link PipelineEventHandler} — hook system
 * - {@link EnhancedValidationIssue} — enriched error messages
 * - {@link ValidationReport} / {@link ReportSummary} — structured reports
 *
 * @module fhir-pipeline
 */

import type { CanonicalProfile, Resource } from '../model/index.js';
import type { ValidationIssue } from '../validator/types.js';
import type { TerminologyProvider, ReferenceResolver } from '../provider/types.js';
import type { FhirContext } from '../context/types.js';

// =============================================================================
// Section 1: ValidationStep
// =============================================================================

/**
 * A pluggable validation step that can be added to a {@link ValidationPipeline}.
 *
 * Each step performs a specific category of validation (e.g., structural,
 * terminology, invariant) and returns any issues it discovers.
 *
 * Steps are executed in priority order (lower numbers first).
 */
export interface ValidationStep {
  /**
   * Step name (used for logging and reports).
   */
  readonly name: string;

  /**
   * Step priority (lower executes first, default 100).
   */
  readonly priority?: number;

  /**
   * Execute validation, returning discovered issues.
   */
  validate(
    resource: Resource,
    profile: CanonicalProfile,
    context: PipelineContext,
  ): Promise<ValidationIssue[]>;

  /**
   * Whether this step should run (optional filter).
   */
  shouldRun?(resource: Resource, profile: CanonicalProfile): boolean;
}

// =============================================================================
// Section 2: PipelineContext
// =============================================================================

/**
 * Shared state passed through the pipeline across steps.
 *
 * Provides access to accumulated issues, shared data storage,
 * abort status, and optional providers.
 */
export interface PipelineContext {
  /** Pipeline options. */
  readonly options: PipelineOptions;

  /** Issues accumulated up to the current step. */
  readonly issues: readonly ValidationIssue[];

  /** Shared data storage for inter-step communication. */
  readonly shared: Map<string, unknown>;

  /** Whether the pipeline has been aborted (failFast mode). */
  readonly aborted: boolean;

  /** Terminology provider (if available). */
  readonly terminologyProvider?: TerminologyProvider;

  /** Reference resolver (if available). */
  readonly referenceResolver?: ReferenceResolver;

  /** FhirContext (if available). */
  readonly fhirContext?: FhirContext;
}

// =============================================================================
// Section 3: PipelineOptions
// =============================================================================

/**
 * Configuration options for the validation pipeline.
 */
export interface PipelineOptions {
  /**
   * Stop on first error-severity issue. Default false.
   */
  failFast?: boolean;

  /**
   * Maximum validation depth. Default 50.
   */
  maxDepth?: number;

  /**
   * Minimum severity to report. Default 'information' (report all).
   */
  minSeverity?: 'error' | 'warning' | 'information';

  /**
   * Terminology provider.
   */
  terminologyProvider?: TerminologyProvider;

  /**
   * Reference resolver.
   */
  referenceResolver?: ReferenceResolver;

  /**
   * FhirContext.
   */
  fhirContext?: FhirContext;
}

// =============================================================================
// Section 4: PipelineResult & StepResult
// =============================================================================

/**
 * Result of validating a single resource through the pipeline.
 */
export interface PipelineResult {
  /** Whether validation passed (no error-severity issues). */
  valid: boolean;

  /** The validated resource. */
  resource: Resource;

  /** The profile URL used for validation. */
  profileUrl: string;

  /** All issues (filtered by minSeverity). */
  issues: readonly ValidationIssue[];

  /** Per-step execution results. */
  stepResults: readonly StepResult[];

  /** Total validation duration in milliseconds. */
  duration: number;
}

/**
 * Result of a single validation step execution.
 */
export interface StepResult {
  /** Step name. */
  stepName: string;

  /** Issues found by this step. */
  issues: readonly ValidationIssue[];

  /** Step execution duration in milliseconds. */
  duration: number;

  /** Whether the step was skipped. */
  skipped: boolean;
}

// =============================================================================
// Section 5: Batch Validation
// =============================================================================

/**
 * A single entry for batch validation.
 */
export interface BatchEntry {
  /** The resource to validate. */
  resource: Resource;

  /** The profile to validate against. */
  profile: CanonicalProfile;

  /** Optional label for identification in results. */
  label?: string;
}

/**
 * Result of batch validation across multiple resources.
 */
export interface BatchResult {
  /** Total number of entries validated. */
  total: number;

  /** Number of entries that passed validation. */
  passed: number;

  /** Number of entries that failed validation. */
  failed: number;

  /** Individual results for each entry. */
  results: readonly BatchEntryResult[];

  /** Total batch duration in milliseconds. */
  duration: number;
}

/**
 * Result of a single entry within a batch validation.
 */
export interface BatchEntryResult {
  /** Optional label from the batch entry. */
  label?: string;

  /** The pipeline result for this entry. */
  result: PipelineResult;
}

// =============================================================================
// Section 6: Hook System
// =============================================================================

/**
 * Pipeline lifecycle events.
 */
export type PipelineEvent =
  | 'beforeValidation'
  | 'afterValidation'
  | 'beforeStep'
  | 'afterStep'
  | 'onIssue'
  | 'onError';

/**
 * Handler function for pipeline events.
 */
export type PipelineEventHandler = (event: PipelineEventData) => void | Promise<void>;

/**
 * Data provided to pipeline event handlers.
 */
export interface PipelineEventData {
  /** The event type. */
  event: PipelineEvent;

  /** The resource being validated (if applicable). */
  resource?: Resource;

  /** The profile being validated against (if applicable). */
  profile?: CanonicalProfile;

  /** The current step (if applicable). */
  step?: ValidationStep;

  /** The current issue (for 'onIssue' events). */
  issue?: ValidationIssue;

  /** The pipeline result (for 'afterValidation' events). */
  result?: PipelineResult;

  /** The pipeline context. */
  context: PipelineContext;
}

// =============================================================================
// Section 7: Enhanced Validation Issue
// =============================================================================

/**
 * An enriched validation issue with additional DX information.
 *
 * Extends {@link ValidationIssue} with fix suggestions, documentation
 * links, and expected/actual values for developer-friendly error messages.
 */
export interface EnhancedValidationIssue extends ValidationIssue {
  /** Human-readable fix suggestion. */
  suggestion?: string;

  /** Relevant documentation URL. */
  documentationUrl?: string;

  /** Expected value (if applicable). */
  expected?: string;

  /** Actual value (if applicable). */
  actual?: string;
}

// =============================================================================
// Section 8: Validation Report
// =============================================================================

/**
 * A structured validation report generated from a {@link PipelineResult}.
 */
export interface ValidationReport {
  /** Report generation timestamp (ISO 8601). */
  timestamp: string;

  /** Validation summary. */
  summary: ReportSummary;

  /** Issues grouped by severity. */
  issuesBySeverity: Record<string, ValidationIssue[]>;

  /** Issues grouped by path. */
  issuesByPath: Record<string, ValidationIssue[]>;

  /** Issues grouped by step name. */
  issuesByStep: Record<string, ValidationIssue[]>;
}

/**
 * Summary section of a validation report.
 */
export interface ReportSummary {
  /** The resource type that was validated. */
  resourceType: string;

  /** The profile URL used for validation. */
  profileUrl: string;

  /** Whether the resource is valid. */
  valid: boolean;

  /** Total number of issues. */
  totalIssues: number;

  /** Number of error-severity issues. */
  errors: number;

  /** Number of warning-severity issues. */
  warnings: number;

  /** Number of information-severity issues. */
  information: number;

  /** Number of steps that were executed. */
  stepsRun: number;

  /** Total validation duration in milliseconds. */
  duration: number;
}
