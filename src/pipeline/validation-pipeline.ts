/**
 * fhir-pipeline — ValidationPipeline
 *
 * Core composable validation pipeline that orchestrates multiple
 * {@link ValidationStep} instances in priority order, with hook
 * support, failFast, severity filtering, and batch validation.
 *
 * @module fhir-pipeline
 */

import type { CanonicalProfile, Resource } from '../model/index.js';
import type { ValidationIssue } from '../validator/types.js';
import type {
  ValidationStep,
  PipelineOptions,
  PipelineResult,
  StepResult,
  BatchEntry,
  BatchResult,
  PipelineEvent,
  PipelineEventHandler,
} from './types.js';
import { MutablePipelineContext } from './pipeline-context.js';
import { HookManager } from './hooks/hook-manager.js';
import { validateBatch } from './batch/batch-validator.js';

// =============================================================================
// Severity ordering
// =============================================================================

const SEVERITY_ORDER: Record<string, number> = {
  error: 3,
  warning: 2,
  information: 1,
};

function severityValue(s: string): number {
  return SEVERITY_ORDER[s] ?? 0;
}

// =============================================================================
// ValidationPipeline
// =============================================================================

/**
 * Composable validation pipeline.
 *
 * Orchestrates multiple validation steps in priority order, supports
 * hooks for lifecycle events, failFast mode, severity filtering,
 * and batch validation.
 *
 * @example
 * ```typescript
 * const pipeline = new ValidationPipeline({ minSeverity: 'warning' });
 * pipeline.addStep(new StructuralValidationStep());
 * pipeline.addStep(new InvariantValidationStep());
 *
 * const result = await pipeline.validate(resource, profile);
 * if (!result.valid) {
 *   for (const issue of result.issues) {
 *     console.error(issue.message);
 *   }
 * }
 * ```
 */
export class ValidationPipeline {
  private readonly steps: ValidationStep[] = [];
  private readonly options: PipelineOptions;
  private readonly hooks = new HookManager();

  constructor(options?: PipelineOptions) {
    this.options = options ?? {};
  }

  /**
   * Add a validation step.
   */
  addStep(step: ValidationStep): this {
    this.steps.push(step);
    return this;
  }

  /**
   * Remove a validation step by name.
   */
  removeStep(name: string): this {
    const index = this.steps.findIndex((s) => s.name === name);
    if (index !== -1) {
      this.steps.splice(index, 1);
    }
    return this;
  }

  /**
   * Register a hook handler.
   */
  on(event: PipelineEvent, handler: PipelineEventHandler): this {
    this.hooks.on(event, handler);
    return this;
  }

  /**
   * Validate a single resource.
   */
  async validate(
    resource: Resource,
    profile: CanonicalProfile,
  ): Promise<PipelineResult> {
    return runPipeline(resource, profile, this.steps, this.options, this.hooks);
  }

  /**
   * Validate a batch of resources.
   */
  async validateBatch(entries: BatchEntry[]): Promise<BatchResult> {
    return validateBatch(entries, this.steps, this.options, this.hooks);
  }

  /**
   * Get the current list of steps (sorted by priority).
   */
  getSteps(): readonly ValidationStep[] {
    return sortSteps(this.steps);
  }
}

// =============================================================================
// runPipeline (exported for batch-validator reuse)
// =============================================================================

/**
 * Execute the pipeline for a single resource.
 *
 * @internal Exported for reuse by batch-validator.
 */
export async function runPipeline(
  resource: Resource,
  profile: CanonicalProfile,
  steps: ValidationStep[],
  options: PipelineOptions,
  hooks: HookManager,
): Promise<PipelineResult> {
  const startTime = performance.now();
  const context = new MutablePipelineContext(options);
  const sorted = sortSteps(steps);
  const stepResults: StepResult[] = [];
  const minSev = severityValue(options.minSeverity ?? 'information');

  // beforeValidation hook
  await hooks.emit({
    event: 'beforeValidation',
    resource,
    profile,
    context,
  });

  for (const step of sorted) {
    if (context.aborted) {
      stepResults.push({
        stepName: step.name,
        issues: [],
        duration: 0,
        skipped: true,
      });
      continue;
    }

    // Check shouldRun
    if (step.shouldRun && !step.shouldRun(resource, profile)) {
      stepResults.push({
        stepName: step.name,
        issues: [],
        duration: 0,
        skipped: true,
      });
      continue;
    }

    // beforeStep hook
    await hooks.emit({
      event: 'beforeStep',
      resource,
      profile,
      step,
      context,
    });

    const stepStart = performance.now();
    let stepIssues: ValidationIssue[] = [];

    try {
      stepIssues = await step.validate(resource, profile, context);
    } catch (error: unknown) {
      // onError hook
      await hooks.emit({
        event: 'onError',
        resource,
        profile,
        step,
        context,
      });

      // Record internal error as an issue
      const message = error instanceof Error ? error.message : String(error);
      stepIssues = [{
        severity: 'error',
        code: 'INTERNAL_ERROR',
        message: `Step '${step.name}' threw an error: ${message}`,
      }];
    }

    const stepDuration = performance.now() - stepStart;

    // Filter by minSeverity
    const filtered = stepIssues.filter(
      (i) => severityValue(i.severity) >= minSev,
    );

    // Emit onIssue hooks
    for (const issue of filtered) {
      await hooks.emit({
        event: 'onIssue',
        resource,
        profile,
        step,
        issue,
        context,
      });
    }

    context.addIssues(filtered);

    stepResults.push({
      stepName: step.name,
      issues: filtered,
      duration: stepDuration,
      skipped: false,
    });

    // afterStep hook
    await hooks.emit({
      event: 'afterStep',
      resource,
      profile,
      step,
      context,
    });

    // failFast check
    if (options.failFast && filtered.some((i) => i.severity === 'error')) {
      context.abort();
    }
  }

  const result: PipelineResult = {
    valid: !context.issues.some((i) => i.severity === 'error'),
    resource,
    profileUrl: profile.url,
    issues: context.issues,
    stepResults,
    duration: performance.now() - startTime,
  };

  // afterValidation hook
  await hooks.emit({
    event: 'afterValidation',
    resource,
    profile,
    result,
    context,
  });

  return result;
}

// =============================================================================
// Helpers
// =============================================================================

function sortSteps(steps: ValidationStep[]): ValidationStep[] {
  return [...steps].sort(
    (a, b) => (a.priority ?? 100) - (b.priority ?? 100),
  );
}
