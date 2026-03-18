import { describe, it, expect } from 'vitest';
import { flattenConceptHierarchy } from '../concept-hierarchy-extractor.js';
import type { CodeSystemDefinition } from '../types.js';

// ── Tests with raw FHIR CodeSystem JSON ───────────────────────────────────

describe('flattenConceptHierarchy — raw FHIR CodeSystem', () => {
  it('flattens a flat concept list', () => {
    const cs = {
      url: 'http://test/cs',
      version: '1.0',
      concept: [
        { code: 'A', display: 'Alpha' },
        { code: 'B', display: 'Beta' },
        { code: 'C', display: 'Gamma' },
      ],
    };
    const rows = flattenConceptHierarchy(cs);
    expect(rows.length).toBe(3);
    expect(rows[0]).toEqual({
      id: 'http://test/cs:A',
      codeSystemUrl: 'http://test/cs',
      codeSystemVersion: '1.0',
      code: 'A',
      display: 'Alpha',
      parentCode: null,
      level: 0,
    });
    expect(rows[1].code).toBe('B');
    expect(rows[2].code).toBe('C');
  });

  it('flattens nested hierarchy (2 levels)', () => {
    const cs = {
      url: 'http://test/cs',
      concept: [
        {
          code: 'parent',
          display: 'Parent',
          concept: [
            { code: 'child1', display: 'Child 1' },
            { code: 'child2', display: 'Child 2' },
          ],
        },
      ],
    };
    const rows = flattenConceptHierarchy(cs);
    expect(rows.length).toBe(3);

    expect(rows[0].code).toBe('parent');
    expect(rows[0].parentCode).toBeNull();
    expect(rows[0].level).toBe(0);

    expect(rows[1].code).toBe('child1');
    expect(rows[1].parentCode).toBe('parent');
    expect(rows[1].level).toBe(1);

    expect(rows[2].code).toBe('child2');
    expect(rows[2].parentCode).toBe('parent');
    expect(rows[2].level).toBe(1);
  });

  it('flattens deep hierarchy (3 levels)', () => {
    const cs = {
      url: 'http://test/deep',
      concept: [
        {
          code: 'L0',
          concept: [
            {
              code: 'L1',
              concept: [
                { code: 'L2' },
              ],
            },
          ],
        },
      ],
    };
    const rows = flattenConceptHierarchy(cs);
    expect(rows.length).toBe(3);
    expect(rows[0]).toMatchObject({ code: 'L0', parentCode: null, level: 0 });
    expect(rows[1]).toMatchObject({ code: 'L1', parentCode: 'L0', level: 1 });
    expect(rows[2]).toMatchObject({ code: 'L2', parentCode: 'L1', level: 2 });
  });

  it('returns empty for CodeSystem without concepts', () => {
    const cs = { url: 'http://test/empty' };
    expect(flattenConceptHierarchy(cs)).toEqual([]);
  });

  it('returns empty for empty concept array', () => {
    const cs = { url: 'http://test/empty', concept: [] };
    expect(flattenConceptHierarchy(cs)).toEqual([]);
  });

  it('preserves version in rows', () => {
    const cs = {
      url: 'http://test/cs',
      version: '2.1.0',
      concept: [{ code: 'X' }],
    };
    const rows = flattenConceptHierarchy(cs);
    expect(rows[0].codeSystemVersion).toBe('2.1.0');
  });

  it('handles missing display', () => {
    const cs = {
      url: 'http://test/cs',
      concept: [{ code: 'nodisplay' }],
    };
    const rows = flattenConceptHierarchy(cs);
    expect(rows[0].display).toBeUndefined();
  });

  it('handles multiple root concepts with children', () => {
    const cs = {
      url: 'http://test/multi',
      concept: [
        {
          code: 'R1',
          concept: [{ code: 'R1C1' }],
        },
        {
          code: 'R2',
          concept: [{ code: 'R2C1' }, { code: 'R2C2' }],
        },
      ],
    };
    const rows = flattenConceptHierarchy(cs);
    expect(rows.length).toBe(5);
    expect(rows.map(r => r.code)).toEqual(['R1', 'R1C1', 'R2', 'R2C1', 'R2C2']);
  });
});

// ── Tests with runtime CodeSystemDefinition ───────────────────────────────

describe('flattenConceptHierarchy — runtime CodeSystemDefinition', () => {
  it('flattens runtime format with concepts/children', () => {
    const cs: CodeSystemDefinition = {
      url: 'http://test/runtime',
      version: '1.0',
      concepts: [
        {
          code: 'parent',
          display: 'Parent',
          children: [
            { code: 'child1', display: 'Child 1' },
            { code: 'child2', display: 'Child 2' },
          ],
        },
        { code: 'standalone', display: 'Standalone' },
      ],
    };
    const rows = flattenConceptHierarchy(cs);
    expect(rows.length).toBe(4);
    expect(rows[0]).toMatchObject({ code: 'parent', parentCode: null, level: 0 });
    expect(rows[1]).toMatchObject({ code: 'child1', parentCode: 'parent', level: 1 });
    expect(rows[2]).toMatchObject({ code: 'child2', parentCode: 'parent', level: 1 });
    expect(rows[3]).toMatchObject({ code: 'standalone', parentCode: null, level: 0 });
  });

  it('handles empty concepts array', () => {
    const cs: CodeSystemDefinition = {
      url: 'http://test/empty',
      concepts: [],
    };
    expect(flattenConceptHierarchy(cs)).toEqual([]);
  });
});
