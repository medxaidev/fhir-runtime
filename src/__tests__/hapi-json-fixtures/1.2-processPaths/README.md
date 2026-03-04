# 1.2 processPaths() — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 1.2  
**Deliverable Reference:** [1.2-Path-matching-algorithm-pseudocode.md](../../1.2-Path-matching-algorithm-pseudocode.md)

## Overview

These 15 fixtures focus on **path matching** — how HAPI's `processPaths()` matches each differential element to the correct base snapshot element and determines where to insert/replace in the snapshot.

Key questions these fixtures help answer:
- How are exact paths matched?
- How are nested (child) paths handled?
- How are choice type paths (`[x]`) matched to concrete types?
- How are sliced paths (`:sliceName`) matched?
- What happens with out-of-order differential elements?

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-exact-path-match.json` | Single element exact match | Simplest path matching |
| 02 | `02-child-path-expansion.json` | Constrain child of complex type | Path prefix matching |
| 03 | `03-deep-nested-path.json` | 3-level deep path | `Patient.contact.name.family` |
| 04 | `04-choice-path-wildcard.json` | `value[x]` in differential | Wildcard choice matching |
| 05 | `05-choice-path-concrete.json` | `valueQuantity` in differential | Concrete choice path |
| 06 | `06-slice-path-matching.json` | Slice element path matching | `:sliceName` suffix handling |
| 07 | `07-slice-child-path.json` | Child of sliced element | `identifier:mrn.system` |
| 08 | `08-multiple-paths-ordered.json` | Multiple paths in correct order | Order-sensitive processing |
| 09 | `09-paths-out-of-order.json` | Differential paths not in snapshot order | Order mismatch handling |
| 10 | `10-content-reference-path.json` | Element using contentReference | Path redirect via `#` reference |
| 11 | `11-backbone-element-path.json` | BackboneElement child paths | `Patient.contact.relationship` |
| 12 | `12-extension-child-path.json` | Extension sub-element paths | `extension.url`, `extension.value[x]` |
| 13 | `13-modifier-extension-path.json` | modifierExtension path | Special handling for modifiers |
| 14 | `14-error-invalid-path.json` | Non-existent path in differential | Expected: error |
| 15 | `15-error-path-outside-type.json` | Path from wrong resource type | Expected: error |

## Key Concepts

### Path Matching Rules
1. **Exact match**: `Patient.name` → finds `Patient.name` in base
2. **Prefix match**: `Patient.name.family` → finds `Patient.name` first, then expands children
3. **Choice match**: `Patient.deceased[x]` matches `Patient.deceasedBoolean` and `Patient.deceasedDateTime`
4. **Slice match**: `Patient.name:official` → matches the slicing root `Patient.name`

### Insertion Position
When a new element is added to the snapshot, its position is determined by the base element order, not the differential order.
