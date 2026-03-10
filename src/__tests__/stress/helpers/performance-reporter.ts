/**
 * Stress Test Helpers — Performance Reporter
 *
 * Utility to collect timing samples and compute P50/P95/P99 percentiles.
 */

export interface PerfStats {
  count: number;
  p50: number;
  p95: number;
  p99: number;
  min: number;
  max: number;
  mean: number;
  total: number;
}

/**
 * Collect timing samples and compute percentile statistics.
 */
export class PerfCollector {
  private readonly samples: number[] = [];
  readonly label: string;

  constructor(label: string) {
    this.label = label;
  }

  /**
   * Record a single timing sample (ms).
   */
  add(ms: number): void {
    this.samples.push(ms);
  }

  /**
   * Time a synchronous function and record the duration.
   */
  time<T>(fn: () => T): T {
    const start = performance.now();
    const result = fn();
    this.add(performance.now() - start);
    return result;
  }

  /**
   * Time an async function and record the duration.
   */
  async timeAsync<T>(fn: () => Promise<T>): Promise<T> {
    const start = performance.now();
    const result = await fn();
    this.add(performance.now() - start);
    return result;
  }

  /**
   * Compute statistics from collected samples.
   */
  stats(): PerfStats {
    if (this.samples.length === 0) {
      return { count: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0, mean: 0, total: 0 };
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const count = sorted.length;
    const total = sorted.reduce((a, b) => a + b, 0);

    return {
      count,
      p50: percentile(sorted, 50),
      p95: percentile(sorted, 95),
      p99: percentile(sorted, 99),
      min: sorted[0],
      max: sorted[count - 1],
      mean: total / count,
      total,
    };
  }

  /**
   * Format stats as a human-readable string.
   */
  report(): string {
    const s = this.stats();
    return (
      `[${this.label}] n=${s.count} ` +
      `P50=${s.p50.toFixed(2)}ms P95=${s.p95.toFixed(2)}ms P99=${s.p99.toFixed(2)}ms ` +
      `min=${s.min.toFixed(2)}ms max=${s.max.toFixed(2)}ms mean=${s.mean.toFixed(2)}ms ` +
      `total=${s.total.toFixed(0)}ms`
    );
  }
}

function percentile(sorted: number[], p: number): number {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/**
 * Measure memory delta (heap used) around an operation.
 */
export function measureMemory(fn: () => void): { heapDeltaMB: number } {
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  fn();
  if (global.gc) global.gc();
  const after = process.memoryUsage().heapUsed;
  return { heapDeltaMB: (after - before) / (1024 * 1024) };
}

/**
 * Measure memory delta for async operation.
 */
export async function measureMemoryAsync(fn: () => Promise<void>): Promise<{ heapDeltaMB: number }> {
  if (global.gc) global.gc();
  const before = process.memoryUsage().heapUsed;
  await fn();
  if (global.gc) global.gc();
  const after = process.memoryUsage().heapUsed;
  return { heapDeltaMB: (after - before) / (1024 * 1024) };
}
