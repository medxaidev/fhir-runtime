# Engine Capability Contract — v0.10.0

**Version**: 0.10.0
**Date**: 2026-03-18
**Stage**: STAGE-7 — Profile Slicing & UI Utility API

---

## Scope

This contract defines the capabilities guaranteed by fhir-runtime v0.10.0.

---

## Capability Matrix

### Core Capabilities (unchanged from v0.9.0)

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

### New Capabilities (v0.10.0)

| Capability | Status | Description |
|------------|--------|-------------|
| Profile slicing preservation | ✅ | `buildCanonicalProfile()` preserves slice definitions |
| Slicing API | ✅ | `matchSlice()`, `countSliceInstances()`, `generateSliceSkeleton()` |
| Extension slicing support | ✅ | Extension URL extraction and matching |
| Choice type utilities | ✅ | `isChoiceType()`, `resolveActiveChoiceType()`, etc. |
| BackboneElement utilities | ✅ | `isBackboneElement()`, `getBackboneChildren()`, etc. |
| inferComplexType improvement | ✅ | Better ContactPoint/Identifier disambiguation |

---

## Behavioral Guarantees (v0.10.0)

### Slicing

1. `buildCanonicalProfile()` MUST NOT let slice elements overwrite base elements in the `elements` Map.
2. `profile.slicing` MUST contain all sliced element paths with their discriminators and slice definitions.
3. `matchSlice()` MUST support `value`, `pattern`, and `exists` discriminator types.
4. `generateSliceSkeleton()` MUST return `{ url: "<extensionUrl>" }` for extension slices.
5. Extension slices MUST have `extensionUrl` and `extensionProfile` populated from `type[0].profile[0]`.

### Choice Type

1. `isChoiceType()` returns `true` only for elements with path ending in `[x]` AND more than one type.
2. `buildChoiceJsonKey()` capitalizes the first letter of the type code.
3. `resolveChoiceFromJsonKey()` MUST handle primitive type codes (lowercase) correctly.

### BackboneElement

1. `getBackboneChildren()` MUST filter out `id`, `extension`, `modifierExtension`.
2. `getBackboneChildren()` MUST return only direct children (one level deep).

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
