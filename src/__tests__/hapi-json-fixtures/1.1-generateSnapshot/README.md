# 1.1 generateSnapshot() — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 1.1  
**Deliverable Reference:** [1.1-Flowchart-of-generateSnapshot.md](../../1.1-Flowchart-of-generateSnapshot.md)

## Overview

These 20 fixtures cover the full spectrum of `generateSnapshot()` behavior — from the simplest "no differential changes" case to complex multi-level inheritance, choice type expansion, and error conditions.

All fixtures are **StructureDefinition resources** with `derivation: "constraint"` (profiles), containing only a `differential`. The expected behavior is that HAPI's `generateSnapshot()` would produce a complete `snapshot` by merging with the base.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-minimal-no-diff.json` | Empty differential (identity profile) | Snapshot = clone of base snapshot |
| 02 | `02-single-cardinality-tighten.json` | Tighten one element's min from 0→1 | Simplest constraint merge |
| 03 | `03-multiple-element-constraints.json` | Constrain 3 different elements | Multiple elements in one differential |
| 04 | `04-nested-element-constraint.json` | Constrain `Patient.name.given` | Nested path handling |
| 05 | `05-choice-type-restrict.json` | Restrict `deceased[x]` to boolean only | Choice type expansion/restriction |
| 06 | `06-choice-type-rename.json` | Constrain `value[x]` → `valueQuantity` | Choice type path renaming |
| 07 | `07-simple-slicing-open.json` | Slice `Patient.name` with open rules | Basic slicing declaration |
| 08 | `08-slicing-closed.json` | Slice with `rules: "closed"` | Closed slicing (no unsliced allowed) |
| 09 | `09-slicing-multiple-slices.json` | 3 slices on `identifier` | Multiple slices on same element |
| 10 | `10-extension-slicing.json` | Slice extensions by URL | Extension-specific slicing pattern |
| 11 | `11-must-support-flags.json` | Set mustSupport on several elements | Flag propagation in snapshot |
| 12 | `12-binding-strength-tighten.json` | Tighten binding from extensible→required | Binding strength hierarchy |
| 13 | `13-type-profile-constraint.json` | Constrain Reference target to Patient | Type profile narrowing |
| 14 | `14-fixed-value.json` | Set fixedCode on `Observation.status` | Fixed value in snapshot |
| 15 | `15-pattern-value.json` | Set patternCodeableConcept on code | Pattern value (less strict than fixed) |
| 16 | `16-two-level-inheritance.json` | Profile → Profile → Base (3 levels) | Recursive snapshot generation |
| 17 | `17-three-level-inheritance.json` | 4-level chain | Deep recursive resolution |
| 18 | `18-abstract-base.json` | Profile on abstract type (DomainResource) | Abstract base handling |
| 19 | `19-error-no-differential.json` | Missing differential entirely | Expected: DefinitionException |
| 20 | `20-error-unresolvable-base.json` | baseDefinition points to non-existent URL | Expected: DefinitionException |

## Key Concepts Illustrated

### Snapshot = Base + Differential
Every element in the base snapshot is cloned. Then differential elements are merged on top, tightening constraints but never loosening them.

### Recursive Base Resolution (files 16-17)
If the base profile itself lacks a snapshot, `generateSnapshot()` recurses to build it first.

### Error Conditions (files 19-20)
HAPI throws `DefinitionException` for structural problems detected before merging begins.

### Choice Type Handling (files 05-06)
When a differential constrains `value[x]` to a single type, HAPI may rename the path (e.g., `Observation.value[x]` → `Observation.valueQuantity`) and remove other type options from the snapshot.

## Usage Notes

- Files 01-18 are **valid** profiles that HAPI should process successfully
- Files 19-20 are **invalid** profiles that should trigger errors
- All files use `Patient` or `Observation` as base types (well-known, easy to reason about)
