/**
 * fhir-pipeline — Hook Manager
 *
 * Manages registration and invocation of pipeline lifecycle event handlers.
 * Supports async handlers and multiple handlers per event.
 *
 * @module fhir-pipeline
 */

import type { PipelineEvent, PipelineEventHandler, PipelineEventData } from '../types.js';

// =============================================================================
// HookManager
// =============================================================================

/**
 * Manages pipeline lifecycle hooks.
 *
 * Allows registration of multiple handlers per event type and
 * invokes them in registration order.
 */
export class HookManager {
  private readonly handlers = new Map<PipelineEvent, PipelineEventHandler[]>();

  /**
   * Register a handler for a pipeline event.
   *
   * @param event - The event type to listen for.
   * @param handler - The handler function to invoke.
   */
  on(event: PipelineEvent, handler: PipelineEventHandler): void {
    const existing = this.handlers.get(event) ?? [];
    existing.push(handler);
    this.handlers.set(event, existing);
  }

  /**
   * Remove a handler for a pipeline event.
   *
   * @param event - The event type.
   * @param handler - The handler function to remove.
   */
  off(event: PipelineEvent, handler: PipelineEventHandler): void {
    const existing = this.handlers.get(event);
    if (!existing) return;
    const index = existing.indexOf(handler);
    if (index !== -1) {
      existing.splice(index, 1);
    }
  }

  /**
   * Emit an event, invoking all registered handlers in order.
   *
   * @param data - The event data to pass to handlers.
   */
  async emit(data: PipelineEventData): Promise<void> {
    const handlers = this.handlers.get(data.event);
    if (!handlers || handlers.length === 0) return;

    for (const handler of handlers) {
      await handler(data);
    }
  }

  /**
   * Check if any handlers are registered for an event.
   */
  hasHandlers(event: PipelineEvent): boolean {
    const handlers = this.handlers.get(event);
    return handlers !== undefined && handlers.length > 0;
  }

  /**
   * Remove all handlers.
   */
  clear(): void {
    this.handlers.clear();
  }
}
