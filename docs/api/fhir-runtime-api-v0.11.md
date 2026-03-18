# fhir-runtime API Reference — v0.11.0

**Version**: 0.11.0
**Date**: 2026-03-18
**Scope**: IG Extraction API (REQ-13)

---

## New APIs (v0.11.0)

### extractSDDependencies

```typescript
function extractSDDependencies(
  sd: StructureDefinition,
  options?: { includePrimitives?: boolean },
): string[]
```

Extract all direct type dependencies from a StructureDefinition's snapshot.

**Parameters**:
- `sd` — A StructureDefinition with snapshot
- `options.includePrimitives` — If `true`, include primitive types (default: `false`)

**Returns**: Sorted, de-duplicated array of dependency type names / profile URLs.

**Extraction rules**:
1. Scans `snapshot.element[].type[]`
2. Collects `type.code` (excluding primitives by default)
3. Collects `type.profile[]` (extension/profile URLs)
4. Collects `type.targetProfile[]` (Reference target URLs)
5. Excludes self URL (`sd.url`)
6. De-duplicates and sorts

---

### extractElementIndexRows

```typescript
function extractElementIndexRows(sd: StructureDefinition): ElementIndexRow[]
```

Extract element index rows from a StructureDefinition snapshot for database population.

**Parameters**:
- `sd` — A StructureDefinition with snapshot

**Returns**: Array of `ElementIndexRow`, one per snapshot element.

**Row mapping**:
- `id` = `{sd.id}:{element.id}` (falls back to `{sd.url}:{element.path}`)
- `structureId` = `sd.id` (falls back to `sd.url`)
- `typeCodes` = `element.type[].code`
- `isSlice` = `!!element.sliceName`
- `isExtension` = `typeCodes.includes('Extension')`
- `bindingValueSet` = `element.binding?.valueSet`
- `mustSupport` = `element.mustSupport ?? false`

---

### flattenConceptHierarchy

```typescript
function flattenConceptHierarchy(
  codeSystem: CodeSystemDefinition | RawCodeSystem,
): ConceptRow[]
```

Flatten a CodeSystem's nested concept hierarchy into parent-child rows.

**Parameters**:
- `codeSystem` — A raw FHIR CodeSystem JSON (with `concept[]`) or a runtime `CodeSystemDefinition` (with `concepts[]`/`children[]`)

**Returns**: Flat array of `ConceptRow` with parent-child relationships and level depth.

**Traversal**:
- Recursively walks concept tree in depth-first order
- Root concepts have `parentCode: null`, `level: 0`
- Each child increments `level` and records `parentCode`
- ID generated as `{url}:{code}`

---

## New Types (v0.11.0)

### ElementIndexRow

```typescript
interface ElementIndexRow {
  /** Unique ID: `{sd.id}:{element.id}` */
  id: string;
  /** The SD's id */
  structureId: string;
  /** element.path */
  path: string;
  /** element.min */
  min?: number;
  /** element.max */
  max?: string;
  /** element.type[].code array */
  typeCodes: string[];
  /** Whether this is a slice */
  isSlice: boolean;
  /** element.sliceName */
  sliceName?: string;
  /** Whether type is Extension */
  isExtension: boolean;
  /** element.binding.valueSet */
  bindingValueSet?: string;
  /** element.mustSupport */
  mustSupport: boolean;
}
```

### ConceptRow

```typescript
interface ConceptRow {
  /** Unique ID: `{codeSystemUrl}:{code}` */
  id: string;
  /** CodeSystem canonical URL */
  codeSystemUrl: string;
  /** CodeSystem version */
  codeSystemVersion?: string;
  /** concept.code */
  code: string;
  /** concept.display */
  display?: string;
  /** Parent concept code (null for root) */
  parentCode: string | null;
  /** Hierarchy depth (root = 0) */
  level: number;
}
```

---

## Compatibility Notes

- All new APIs are additive — no breaking changes
- Previous API: `docs/api/fhir-runtime-api-v0.10.md`
