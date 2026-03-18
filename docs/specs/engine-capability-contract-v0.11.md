# Engine Capability Contract — v0.11.0

**Version**: 0.11.0
**Date**: 2026-03-18
**Scope**: IG Extraction API (REQ-13)

---

## Scope

This contract defines the capabilities guaranteed by fhir-runtime v0.11.0.

---

## Capability Matrix

### Core Capabilities (unchanged from v0.10.0)

| Capability | Status | Since |
|------------|--------|-------|
| FHIR R4 JSON parsing | ✅ | v0.1.0 |
| FHIR R4 JSON serialization | ✅ | v0.1.0 |
| StructureDefinition parsing | ✅ | v0.1.0 |
| Snapshot generation | ✅ | v0.1.0 |
| Structural validation | ✅ | v0.1.0 |
| FHIRPath evaluation | ✅ | v0.1.0 |
| Invariant execution | ✅ | v0.1.0 |
| CanonicalProfile building | ✅ | v0.1.0 |
| InnerType extraction | ✅ | v0.2.0 |
| Bundle loading | ✅ | v0.2.0 |
| Terminology provider abstraction | ✅ | v0.3.0 |
| Terminology binding validation | ✅ | v0.4.0 |
| IG package loading | ✅ | v0.5.0 |
| Validation pipeline | ✅ | v0.6.0 |
| Search parameter parsing | ✅ | v0.7.0 |
| Reference extraction | ✅ | v0.7.0 |
| fhir-definition integration | ✅ | v0.8.0 |
| Remote terminology provider | ✅ | v0.9.0 |
| Batch validation (validateMany) | ✅ | v0.9.0 |
| Snapshot cache | ✅ | v0.9.0 |
| Profile slicing preservation | ✅ | v0.10.0 |
| Slicing API | ✅ | v0.10.0 |
| Choice type utilities | ✅ | v0.10.0 |
| BackboneElement utilities | ✅ | v0.10.0 |
| inferComplexType improvement | ✅ | v0.10.0 |

### New Capabilities (v0.11.0)

| Capability | Status | Description |
|------------|--------|-------------|
| SD dependency extraction | ✅ | `extractSDDependencies()` — type/profile/targetProfile collection |
| Element index extraction | ✅ | `extractElementIndexRows()` — snapshot → index rows for DB |
| Concept hierarchy flattening | ✅ | `flattenConceptHierarchy()` — nested → flat parent-child rows |

---

## Behavioral Guarantees (v0.11.0)

### extractSDDependencies

1. MUST collect `type.code`, `type.profile[]`, and `type.targetProfile[]` from all snapshot elements.
2. MUST exclude FHIR primitive types by default.
3. MUST exclude the SD's own URL from results.
4. MUST return sorted, de-duplicated results.
5. MUST return empty array when snapshot is missing.

### extractElementIndexRows

1. MUST produce one `ElementIndexRow` per snapshot element.
2. `isSlice` MUST be `true` when `element.sliceName` is present.
3. `isExtension` MUST be `true` when `typeCodes` includes `'Extension'`.
4. `structureId` MUST fall back to `sd.url` when `sd.id` is missing.
5. MUST return empty array when snapshot is missing.

### flattenConceptHierarchy

1. MUST traverse concept tree in depth-first order.
2. Root concepts MUST have `parentCode: null` and `level: 0`.
3. Child concepts MUST have `parentCode` set to their parent's code and `level` incremented.
4. MUST accept both raw FHIR CodeSystem JSON (`concept[]`) and runtime `CodeSystemDefinition` (`concepts[]`/`children[]`).
5. MUST return empty array for empty or missing concept arrays.

---

## Version History

| Version | Stage | Key Addition |
|---------|-------|-------------|
| v0.1.0 | Initial | Parser, Validator, SnapshotGenerator, FHIRPath |
| v0.2.0 | — | InnerTypes, Bundle loading |
| v0.3.0 | STAGE-1 | Provider abstraction |
| v0.4.0 | STAGE-2 | Terminology binding |
| v0.5.0 | STAGE-3 | IG package loading |
| v0.6.0 | STAGE-4 | Validation pipeline |
| v0.7.0 | STAGE-5 | Server/persistence integration |
| v0.8.0 | STAGE-6 | fhir-definition integration |
| v0.9.0 | STAGE-B | Remote terminology, batch validation, snapshot cache |
| v0.10.0 | STAGE-7 | Profile slicing, choice type, backbone utilities |
| v0.11.0 | REQ-13 | IG extraction API (SD dependencies, element index, concept hierarchy) |
