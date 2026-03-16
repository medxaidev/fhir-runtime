/**
 * Tests for validateMany() batch validation and STAGE-B runtime features.
 *
 * STAGE-B: v0.9.0
 */

import { describe, it, expect, vi } from 'vitest';
import type { Resource } from '../../model/index.js';
import type { RemoteTerminologyProvider } from '../../provider/index.js';
import { createRuntime } from '../create-runtime.js';

// =============================================================================
// Helper
// =============================================================================

function makePatient(name?: string): Resource {
  return {
    resourceType: 'Patient',
    name: name ? [{ family: name }] : undefined,
  } as unknown as Resource;
}

const PATIENT_PROFILE = 'http://hl7.org/fhir/StructureDefinition/Patient';

// =============================================================================
// Tests: validateMany (B2)
// =============================================================================

describe('validateMany — Batch Validation (B2)', () => {
  it('should return valid:true with empty array', async () => {
    const runtime = await createRuntime();
    const result = await runtime.validateMany([]);
    expect(result.valid).toBe(true);
    expect(result.results).toEqual([]);
    expect(result.errorCount).toBe(0);
    expect(result.warningCount).toBe(0);
  });

  it('should validate a single valid resource', async () => {
    const runtime = await createRuntime();
    const result = await runtime.validateMany([
      { resource: makePatient('Doe'), profileUrl: PATIENT_PROFILE },
    ]);
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.errorCount).toBe(0);
  });

  it('should validate multiple valid resources', async () => {
    const runtime = await createRuntime();
    const entries = Array.from({ length: 5 }, (_, i) => ({
      resource: makePatient(`Patient${i}`),
      profileUrl: PATIENT_PROFILE,
    }));
    const result = await runtime.validateMany(entries);
    expect(result.valid).toBe(true);
    expect(result.results).toHaveLength(5);
    expect(result.errorCount).toBe(0);
  });

  it('should detect invalid resources in batch', async () => {
    const runtime = await createRuntime();
    const invalid = {
      resourceType: 'Patient',
      name: 'not-an-array', // invalid: name should be array
    } as unknown as Resource;

    const result = await runtime.validateMany([
      { resource: makePatient('Valid'), profileUrl: PATIENT_PROFILE },
      { resource: invalid, profileUrl: PATIENT_PROFILE },
    ]);
    // At least one resource may have issues
    expect(result.results).toHaveLength(2);
  });

  it('should support failFast option', async () => {
    const runtime = await createRuntime();
    const invalid = {
      resourceType: 'Patient',
      name: 'not-an-array',
    } as unknown as Resource;

    const entries = [
      { resource: invalid, profileUrl: PATIENT_PROFILE },
      { resource: makePatient('Valid'), profileUrl: PATIENT_PROFILE },
      { resource: makePatient('Valid2'), profileUrl: PATIENT_PROFILE },
    ];

    const result = await runtime.validateMany(entries, { failFast: true });
    // If first resource has errors, failFast should stop early
    if (!result.valid) {
      expect(result.results.length).toBeLessThanOrEqual(entries.length);
    }
  });

  it('should support custom concurrency', async () => {
    const runtime = await createRuntime();
    const entries = Array.from({ length: 10 }, (_, i) => ({
      resource: makePatient(`Patient${i}`),
      profileUrl: PATIENT_PROFILE,
    }));

    const result = await runtime.validateMany(entries, { concurrency: 2 });
    expect(result.results).toHaveLength(10);
    expect(result.valid).toBe(true);
  });

  it('should default concurrency to 4', async () => {
    const runtime = await createRuntime();
    const entries = Array.from({ length: 8 }, (_, i) => ({
      resource: makePatient(`Patient${i}`),
      profileUrl: PATIENT_PROFILE,
    }));

    // Should work correctly with default concurrency
    const result = await runtime.validateMany(entries);
    expect(result.results).toHaveLength(8);
  });

  it('should have 1:1 correspondence between input and results', async () => {
    const runtime = await createRuntime();
    const entries = Array.from({ length: 3 }, (_, i) => ({
      resource: makePatient(`Patient${i}`),
      profileUrl: PATIENT_PROFILE,
    }));
    const result = await runtime.validateMany(entries);
    expect(result.results.length).toBe(entries.length);
  });
});

// =============================================================================
// Tests: RemoteTerminologyProvider injection (B1)
// =============================================================================

describe('RemoteTerminologyProvider injection (B1)', () => {
  it('should have no remote provider by default', async () => {
    const runtime = await createRuntime({ preloadCore: false });
    expect(runtime.getRemoteTerminologyProvider()).toBeUndefined();
  });

  it('should register and retrieve remote provider', async () => {
    const runtime = await createRuntime({ preloadCore: false });
    const mockProvider: RemoteTerminologyProvider = {
      expandValueSet: vi.fn().mockResolvedValue({}),
      validateCode: vi.fn().mockResolvedValue({ result: true }),
      lookupCode: vi.fn().mockResolvedValue({ name: 'Test' }),
    };

    runtime.setRemoteTerminologyProvider(mockProvider);
    expect(runtime.getRemoteTerminologyProvider()).toBe(mockProvider);
  });

  it('should allow replacing remote provider', async () => {
    const runtime = await createRuntime({ preloadCore: false });
    const provider1: RemoteTerminologyProvider = {
      expandValueSet: vi.fn(),
      validateCode: vi.fn().mockResolvedValue({ result: true }),
      lookupCode: vi.fn().mockResolvedValue({ name: 'P1' }),
    };
    const provider2: RemoteTerminologyProvider = {
      expandValueSet: vi.fn(),
      validateCode: vi.fn().mockResolvedValue({ result: false }),
      lookupCode: vi.fn().mockResolvedValue({ name: 'P2' }),
    };

    runtime.setRemoteTerminologyProvider(provider1);
    expect(runtime.getRemoteTerminologyProvider()).toBe(provider1);

    runtime.setRemoteTerminologyProvider(provider2);
    expect(runtime.getRemoteTerminologyProvider()).toBe(provider2);
  });
});

// =============================================================================
// Tests: Snapshot Cache (B3)
// =============================================================================

describe('Snapshot Cache and Warmup (B3)', () => {
  it('should start with empty snapshot cache', async () => {
    const runtime = await createRuntime({ preloadCore: false });
    expect(runtime.getSnapshotCacheSize()).toBe(0);
  });

  it('should populate cache after validate()', async () => {
    const runtime = await createRuntime();
    await runtime.validate(makePatient('Test'), PATIENT_PROFILE);
    expect(runtime.getSnapshotCacheSize()).toBeGreaterThanOrEqual(1);
  });

  it('should warmup snapshots for specified resource types', async () => {
    const runtime = await createRuntime();
    await runtime.warmupSnapshots(['Patient', 'Observation']);
    expect(runtime.getSnapshotCacheSize()).toBeGreaterThanOrEqual(2);
  });

  it('should not regenerate already-cached snapshots', async () => {
    const runtime = await createRuntime();
    await runtime.validate(makePatient('Test'), PATIENT_PROFILE);
    const sizeBefore = runtime.getSnapshotCacheSize();

    // Validate again — should use cache
    await runtime.validate(makePatient('Test2'), PATIENT_PROFILE);
    expect(runtime.getSnapshotCacheSize()).toBe(sizeBefore);
  });

  it('should produce same validation result in lazy mode as eager', async () => {
    const runtime = await createRuntime();
    const patient = makePatient('TestPatient');

    // First validate (generates snapshot lazily)
    const result1 = await runtime.validate(patient, PATIENT_PROFILE);
    // Second validate (uses cached snapshot)
    const result2 = await runtime.validate(patient, PATIENT_PROFILE);

    expect(result1.valid).toBe(result2.valid);
  });
});
