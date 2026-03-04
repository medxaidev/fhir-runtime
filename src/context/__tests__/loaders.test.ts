/**
 * Unit & integration tests for StructureDefinitionLoader implementations
 *
 * Covers:
 * - MemoryLoader: in-memory map lookups
 * - FileSystemLoader: JSON file loading with fhir-parser
 * - CompositeLoader: chain-of-responsibility fallback
 * - Error handling across all loaders
 * - extractResourceName utility
 *
 * @module fhir-context
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { join } from 'node:path';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';

import type { StructureDefinition } from '../../model/index.js';
import type { StructureDefinitionLoader } from '../types.js';
import { MemoryLoader } from '../loaders/memory-loader.js';
import { FileSystemLoader, extractResourceName } from '../loaders/file-loader.js';
import { CompositeLoader } from '../loaders/composite-loader.js';
import { LoaderError } from '../errors.js';

// =============================================================================
// Helpers
// =============================================================================

const PATIENT_URL = 'http://hl7.org/fhir/StructureDefinition/Patient';
const OBSERVATION_URL = 'http://hl7.org/fhir/StructureDefinition/Observation';

function makeSD(url: string, name: string): StructureDefinition {
  return {
    resourceType: 'StructureDefinition',
    url: url as any,
    name: name as any,
    status: 'active' as any,
    kind: 'resource' as any,
    abstract: false as any,
    type: name as any,
  } as StructureDefinition;
}

/** Minimal valid StructureDefinition JSON string */
function makeSDJson(url: string, name: string): string {
  return JSON.stringify({
    resourceType: 'StructureDefinition',
    url,
    name,
    status: 'active',
    kind: 'resource',
    abstract: false,
    type: name,
  });
}

// =============================================================================
// Section 1: extractResourceName
// =============================================================================

describe('extractResourceName', () => {
  it('extracts name from standard FHIR URL', () => {
    expect(extractResourceName(PATIENT_URL)).toBe('Patient');
  });

  it('extracts name from custom profile URL', () => {
    expect(
      extractResourceName('http://example.org/fhir/StructureDefinition/ChinesePatient'),
    ).toBe('ChinesePatient');
  });

  it('returns full string if no slash present', () => {
    expect(extractResourceName('Patient')).toBe('Patient');
  });

  it('handles trailing slash', () => {
    expect(extractResourceName('http://example.org/')).toBe('');
  });
});

// =============================================================================
// Section 2: MemoryLoader
// =============================================================================

describe('MemoryLoader', () => {
  let definitions: Map<string, StructureDefinition>;
  let loader: MemoryLoader;

  beforeEach(() => {
    definitions = new Map();
    definitions.set(PATIENT_URL, makeSD(PATIENT_URL, 'Patient'));
    loader = new MemoryLoader(definitions);
  });

  it('returns definition for known URL', async () => {
    const result = await loader.load(PATIENT_URL);
    expect(result).toBeDefined();
    expect((result as any).name).toBe('Patient');
  });

  it('returns null for unknown URL', async () => {
    const result = await loader.load(OBSERVATION_URL);
    expect(result).toBeNull();
  });

  it('canLoad returns true for known URL', () => {
    expect(loader.canLoad(PATIENT_URL)).toBe(true);
  });

  it('canLoad returns false for unknown URL', () => {
    expect(loader.canLoad(OBSERVATION_URL)).toBe(false);
  });

  it('getSourceType returns "memory"', () => {
    expect(loader.getSourceType()).toBe('memory');
  });

  it('size reflects map size', () => {
    expect(loader.size).toBe(1);
  });

  it('sees mutations to the original map', async () => {
    definitions.set(OBSERVATION_URL, makeSD(OBSERVATION_URL, 'Observation'));
    const result = await loader.load(OBSERVATION_URL);
    expect(result).toBeDefined();
    expect(loader.size).toBe(2);
  });

  it('works with empty map', async () => {
    const emptyLoader = new MemoryLoader(new Map());
    expect(await emptyLoader.load(PATIENT_URL)).toBeNull();
    expect(emptyLoader.canLoad(PATIENT_URL)).toBe(false);
    expect(emptyLoader.size).toBe(0);
  });
});

// =============================================================================
// Section 3: FileSystemLoader
// =============================================================================

describe('FileSystemLoader', () => {
  // Use a unique temp directory per test run
  const testDir = join(tmpdir(), `fhir-context-test-${Date.now()}`);
  let loader: FileSystemLoader;

  beforeEach(async () => {
    // Ensure clean directory
    if (existsSync(testDir)) {
      await rm(testDir, { recursive: true });
    }
    await mkdir(testDir, { recursive: true });
    loader = new FileSystemLoader(testDir);
  });

  it('loads a valid StructureDefinition JSON file', async () => {
    await writeFile(join(testDir, 'Patient.json'), makeSDJson(PATIENT_URL, 'Patient'));

    const result = await loader.load(PATIENT_URL);
    expect(result).toBeDefined();
    expect((result as any).url).toBe(PATIENT_URL);
    expect((result as any).name).toBe('Patient');
  });

  it('returns null when file does not exist', async () => {
    const result = await loader.load(PATIENT_URL);
    expect(result).toBeNull();
  });

  it('canLoad returns true when file exists', async () => {
    await writeFile(join(testDir, 'Patient.json'), makeSDJson(PATIENT_URL, 'Patient'));
    expect(loader.canLoad(PATIENT_URL)).toBe(true);
  });

  it('canLoad returns false when file does not exist', () => {
    expect(loader.canLoad(PATIENT_URL)).toBe(false);
  });

  it('getSourceType returns "filesystem"', () => {
    expect(loader.getSourceType()).toBe('filesystem');
  });

  it('basePath returns the configured directory', () => {
    expect(loader.basePath).toBe(testDir);
  });

  it('throws LoaderError for invalid JSON content', async () => {
    await writeFile(join(testDir, 'Patient.json'), '{ invalid json !!!');

    await expect(loader.load(PATIENT_URL)).rejects.toThrow(LoaderError);
  });

  it('throws LoaderError with source type "filesystem"', async () => {
    await writeFile(join(testDir, 'Patient.json'), '{ invalid json !!!');

    try {
      await loader.load(PATIENT_URL);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LoaderError);
      expect((err as LoaderError).sourceType).toBe('filesystem');
      expect((err as LoaderError).url).toBe(PATIENT_URL);
    }
  });

  it('maps custom profile URL to filename correctly', async () => {
    const customUrl = 'http://example.org/fhir/StructureDefinition/ChinesePatient';
    await writeFile(
      join(testDir, 'ChinesePatient.json'),
      makeSDJson(customUrl, 'ChinesePatient'),
    );

    const result = await loader.load(customUrl);
    expect(result).toBeDefined();
    expect((result as any).name).toBe('ChinesePatient');
  });
});

// =============================================================================
// Section 4: CompositeLoader
// =============================================================================

describe('CompositeLoader', () => {
  it('throws if constructed with empty array', () => {
    expect(() => new CompositeLoader([])).toThrow(
      'CompositeLoader requires at least one child loader',
    );
  });

  it('returns result from first loader that succeeds', async () => {
    const map1 = new Map<string, StructureDefinition>();
    map1.set(PATIENT_URL, makeSD(PATIENT_URL, 'Patient'));
    const map2 = new Map<string, StructureDefinition>();
    map2.set(PATIENT_URL, makeSD(PATIENT_URL, 'PatientFromLoader2'));

    const composite = new CompositeLoader([
      new MemoryLoader(map1),
      new MemoryLoader(map2),
    ]);

    const result = await composite.load(PATIENT_URL);
    expect(result).toBeDefined();
    // Should come from first loader
    expect((result as any).name).toBe('Patient');
  });

  it('falls back to second loader when first returns null', async () => {
    const map1 = new Map<string, StructureDefinition>();
    const map2 = new Map<string, StructureDefinition>();
    map2.set(OBSERVATION_URL, makeSD(OBSERVATION_URL, 'Observation'));

    const composite = new CompositeLoader([
      new MemoryLoader(map1),
      new MemoryLoader(map2),
    ]);

    const result = await composite.load(OBSERVATION_URL);
    expect(result).toBeDefined();
    expect((result as any).name).toBe('Observation');
  });

  it('returns null when no loader can resolve', async () => {
    const composite = new CompositeLoader([
      new MemoryLoader(new Map()),
      new MemoryLoader(new Map()),
    ]);

    const result = await composite.load(PATIENT_URL);
    expect(result).toBeNull();
  });

  it('canLoad returns true if any child can load', () => {
    const map = new Map<string, StructureDefinition>();
    map.set(PATIENT_URL, makeSD(PATIENT_URL, 'Patient'));

    const composite = new CompositeLoader([
      new MemoryLoader(new Map()),
      new MemoryLoader(map),
    ]);

    expect(composite.canLoad(PATIENT_URL)).toBe(true);
  });

  it('canLoad returns false if no child can load', () => {
    const composite = new CompositeLoader([
      new MemoryLoader(new Map()),
    ]);

    expect(composite.canLoad(PATIENT_URL)).toBe(false);
  });

  it('getSourceType shows composite structure', () => {
    const composite = new CompositeLoader([
      new MemoryLoader(new Map()),
      new MemoryLoader(new Map()),
    ]);

    expect(composite.getSourceType()).toBe('composite(memory, memory)');
  });

  it('loaderCount returns number of child loaders', () => {
    const composite = new CompositeLoader([
      new MemoryLoader(new Map()),
      new MemoryLoader(new Map()),
      new MemoryLoader(new Map()),
    ]);

    expect(composite.loaderCount).toBe(3);
  });

  it('propagates LoaderError from child loader', async () => {
    const failingLoader: StructureDefinitionLoader = {
      load: async () => {
        throw new LoaderError(PATIENT_URL, 'failing', new Error('disk error'));
      },
      canLoad: () => true,
      getSourceType: () => 'failing',
    };

    const composite = new CompositeLoader([failingLoader]);

    await expect(composite.load(PATIENT_URL)).rejects.toThrow(LoaderError);
  });

  it('wraps unexpected errors in LoaderError', async () => {
    const badLoader: StructureDefinitionLoader = {
      load: async () => {
        throw new TypeError('unexpected');
      },
      canLoad: () => true,
      getSourceType: () => 'bad',
    };

    const composite = new CompositeLoader([badLoader]);

    try {
      await composite.load(PATIENT_URL);
      expect.fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(LoaderError);
      expect((err as LoaderError).sourceType).toBe('bad');
    }
  });

  // ===========================================================================
  // Integration: CompositeLoader with memory + file loaders
  // ===========================================================================

  it('integration: memory + file composite loader', async () => {
    const testDir = join(tmpdir(), `fhir-composite-test-${Date.now()}`);
    await mkdir(testDir, { recursive: true });
    await writeFile(
      join(testDir, 'Observation.json'),
      makeSDJson(OBSERVATION_URL, 'Observation'),
    );

    const memoryMap = new Map<string, StructureDefinition>();
    memoryMap.set(PATIENT_URL, makeSD(PATIENT_URL, 'Patient'));

    const composite = new CompositeLoader([
      new MemoryLoader(memoryMap),
      new FileSystemLoader(testDir),
    ]);

    // Patient from memory
    const patient = await composite.load(PATIENT_URL);
    expect(patient).toBeDefined();
    expect((patient as any).name).toBe('Patient');

    // Observation from file
    const observation = await composite.load(OBSERVATION_URL);
    expect(observation).toBeDefined();
    expect((observation as any).name).toBe('Observation');

    // Unknown returns null
    const unknown = await composite.load('http://example.org/Unknown');
    expect(unknown).toBeNull();

    // Cleanup
    await rm(testDir, { recursive: true });
  });
});
