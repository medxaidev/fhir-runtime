/**
 * fhir-pipeline — PipelineContext Implementation
 *
 * Manages shared state across validation steps including accumulated
 * issues, shared data storage, abort status, and optional providers.
 *
 * @module fhir-pipeline
 */

import type { ValidationIssue } from '../validator/types.js';
import type { PipelineContext, PipelineOptions } from './types.js';

// =============================================================================
// MutablePipelineContext
// =============================================================================

/**
 * Mutable implementation of {@link PipelineContext}.
 *
 * Used internally by the pipeline to manage state during validation.
 * The public interface exposes readonly properties.
 *
 * @internal
 */
export class MutablePipelineContext implements PipelineContext {
  readonly options: PipelineOptions;
  private _issues: ValidationIssue[] = [];
  readonly shared: Map<string, unknown> = new Map();
  private _aborted = false;

  constructor(options: PipelineOptions) {
    this.options = options;
  }

  get issues(): readonly ValidationIssue[] {
    return this._issues;
  }

  get aborted(): boolean {
    return this._aborted;
  }

  get terminologyProvider() {
    return this.options.terminologyProvider;
  }

  get referenceResolver() {
    return this.options.referenceResolver;
  }

  get fhirContext() {
    return this.options.fhirContext;
  }

  /**
   * Add issues from a step to the accumulated list.
   */
  addIssues(issues: readonly ValidationIssue[]): void {
    this._issues.push(...issues);
  }

  /**
   * Abort the pipeline (failFast mode).
   */
  abort(): void {
    this._aborted = true;
  }

  /**
   * Reset context for reuse (e.g., batch validation).
   */
  reset(): void {
    this._issues = [];
    this._aborted = false;
    this.shared.clear();
  }
}
