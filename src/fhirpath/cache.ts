/**
 * LRU (Least Recently Used) Cache for parsed FHIRPath expressions.
 *
 * Caches parsed AST nodes so that repeated evaluation of the same
 * expression string avoids re-parsing.
 *
 * @module fhirpath
 */

// =============================================================================
// LRU Cache
// =============================================================================

/**
 * A generic LRU cache with O(1) get/set via a Map (insertion-ordered).
 *
 * When the cache exceeds `maxSize`, the least-recently-used entry is evicted.
 *
 * @typeParam K - Key type.
 * @typeParam V - Value type.
 */
export class LRUCache<K, V> {
  private readonly map = new Map<K, V>();
  private readonly _maxSize: number;

  /** Total number of `get` calls. */
  private _gets = 0;
  /** Number of `get` calls that returned a cached value. */
  private _hits = 0;

  constructor(maxSize: number) {
    if (maxSize < 1) {
      throw new RangeError('LRUCache maxSize must be >= 1');
    }
    this._maxSize = maxSize;
  }

  /** Maximum number of entries before eviction. */
  get maxSize(): number {
    return this._maxSize;
  }

  /** Current number of cached entries. */
  get size(): number {
    return this.map.size;
  }

  /** Total `get` calls since creation or last `resetStats()`. */
  get gets(): number {
    return this._gets;
  }

  /** Cache hits since creation or last `resetStats()`. */
  get hits(): number {
    return this._hits;
  }

  /**
   * Cache hit rate as a number between 0 and 1.
   * Returns 0 if no `get` calls have been made.
   */
  get hitRate(): number {
    return this._gets === 0 ? 0 : this._hits / this._gets;
  }

  /**
   * Retrieve a value by key.
   *
   * If found, the entry is promoted to most-recently-used.
   */
  get(key: K): V | undefined {
    this._gets++;
    const value = this.map.get(key);
    if (value === undefined) {
      return undefined;
    }
    // Promote to most-recently-used by re-inserting
    this.map.delete(key);
    this.map.set(key, value);
    this._hits++;
    return value;
  }

  /**
   * Insert or update a key-value pair.
   *
   * If the key already exists it is updated and promoted.
   * If the cache is full the least-recently-used entry is evicted.
   */
  set(key: K, value: V): void {
    if (this.map.has(key)) {
      this.map.delete(key);
    } else if (this.map.size >= this._maxSize) {
      // Evict the least-recently-used (first key in Map iteration order)
      const firstKey = this.map.keys().next().value as K;
      this.map.delete(firstKey);
    }
    this.map.set(key, value);
  }

  /** Check whether a key exists without affecting LRU order or stats. */
  has(key: K): boolean {
    return this.map.has(key);
  }

  /** Remove a specific key. Returns `true` if the key existed. */
  delete(key: K): boolean {
    return this.map.delete(key);
  }

  /** Remove all entries. Does not reset stats. */
  clear(): void {
    this.map.clear();
  }

  /** Reset hit/get counters to zero. */
  resetStats(): void {
    this._gets = 0;
    this._hits = 0;
  }

  /** Iterate over entries in LRU order (least-recent first). */
  *entries(): IterableIterator<[K, V]> {
    yield* this.map.entries();
  }

  /** Iterate over keys in LRU order (least-recent first). */
  *keys(): IterableIterator<K> {
    yield* this.map.keys();
  }
}

// =============================================================================
// Default expression cache singleton
// =============================================================================

/** Default cache size for parsed FHIRPath expressions. */
export const DEFAULT_CACHE_SIZE = 1000;

/** Singleton expression cache used by the high-level API. */
let expressionCache = new LRUCache<string, unknown>(DEFAULT_CACHE_SIZE);

/**
 * Get the global expression cache instance.
 * The cache stores parsed FHIRPath AST nodes keyed by expression string.
 */
export function getExpressionCache(): LRUCache<string, unknown> {
  return expressionCache;
}

/**
 * Replace the global expression cache (e.g. to change max size).
 */
export function setExpressionCache(cache: LRUCache<string, unknown>): void {
  expressionCache = cache;
}

/**
 * Clear the global expression cache.
 */
export function clearExpressionCache(): void {
  expressionCache.clear();
  expressionCache.resetStats();
}
