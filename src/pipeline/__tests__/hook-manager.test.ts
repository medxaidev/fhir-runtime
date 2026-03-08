/**
 * Tests for HookManager
 *
 * Covers:
 * - Register and emit hooks
 * - Multiple handlers per event
 * - Remove handler
 * - Async handlers
 * - hasHandlers check
 * - clear all handlers
 */

import { describe, it, expect, vi } from 'vitest';
import { HookManager } from '../hooks/hook-manager.js';
import { MutablePipelineContext } from '../pipeline-context.js';
import type { PipelineEventData } from '../types.js';

function makeEventData(event: PipelineEventData['event']): PipelineEventData {
  return { event, context: new MutablePipelineContext({}) };
}

describe('HookManager', () => {
  it('should invoke a registered handler on emit', async () => {
    const manager = new HookManager();
    const handler = vi.fn();
    manager.on('beforeValidation', handler);
    await manager.emit(makeEventData('beforeValidation'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should pass event data to handler', async () => {
    const manager = new HookManager();
    let received: PipelineEventData | undefined;
    manager.on('afterStep', (data) => { received = data; });
    const data = makeEventData('afterStep');
    await manager.emit(data);
    expect(received).toBe(data);
  });

  it('should support multiple handlers per event', async () => {
    const manager = new HookManager();
    const order: number[] = [];
    manager.on('beforeStep', () => { order.push(1); });
    manager.on('beforeStep', () => { order.push(2); });
    manager.on('beforeStep', () => { order.push(3); });
    await manager.emit(makeEventData('beforeStep'));
    expect(order).toEqual([1, 2, 3]);
  });

  it('should not invoke handlers for other events', async () => {
    const manager = new HookManager();
    const handler = vi.fn();
    manager.on('beforeValidation', handler);
    await manager.emit(makeEventData('afterValidation'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('should remove a handler with off()', async () => {
    const manager = new HookManager();
    const handler = vi.fn();
    manager.on('onIssue', handler);
    manager.off('onIssue', handler);
    await manager.emit(makeEventData('onIssue'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('should handle async handlers', async () => {
    const manager = new HookManager();
    const order: number[] = [];
    manager.on('beforeStep', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push(1);
    });
    manager.on('beforeStep', async () => {
      order.push(2);
    });
    await manager.emit(makeEventData('beforeStep'));
    expect(order).toEqual([1, 2]);
  });

  it('should report hasHandlers correctly', () => {
    const manager = new HookManager();
    expect(manager.hasHandlers('beforeValidation')).toBe(false);
    manager.on('beforeValidation', () => {});
    expect(manager.hasHandlers('beforeValidation')).toBe(true);
    expect(manager.hasHandlers('afterValidation')).toBe(false);
  });

  it('should clear all handlers', async () => {
    const manager = new HookManager();
    const handler = vi.fn();
    manager.on('beforeStep', handler);
    manager.on('afterStep', handler);
    manager.clear();
    await manager.emit(makeEventData('beforeStep'));
    await manager.emit(makeEventData('afterStep'));
    expect(handler).not.toHaveBeenCalled();
  });

  it('should not throw when emitting with no handlers', async () => {
    const manager = new HookManager();
    await expect(manager.emit(makeEventData('onError'))).resolves.toBeUndefined();
  });

  it('should support all event types', async () => {
    const manager = new HookManager();
    const events: PipelineEventData['event'][] = [
      'beforeValidation', 'afterValidation', 'beforeStep',
      'afterStep', 'onIssue', 'onError',
    ];
    for (const event of events) {
      const handler = vi.fn();
      manager.on(event, handler);
      await manager.emit(makeEventData(event));
      expect(handler).toHaveBeenCalledTimes(1);
    }
  });
});
