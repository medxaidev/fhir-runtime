# 1.4 updateFromDefinition() — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 1.4  
**Deliverable Reference:** [HAPI-updateFromDefinition-Study-Deliverable.md](../../HAPI-updateFromDefinition-Study-Deliverable.md)

## Overview

These 10 fixtures focus on **applying differential constraints to snapshot elements** — how `updateFromDefinition()` differs from `updateFromBase()`. While `updateFromBase()` merges inherited properties, `updateFromDefinition()` applies the profile author's explicit overrides.

Key distinction: some properties are **overwritten** (short, definition), while others are **merged** (constraint, mapping).

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-overwrite-short.json` | Override `short` text | Simple overwrite |
| 02 | `02-overwrite-definition.json` | Override `definition` text | Documentation override |
| 03 | `03-add-constraint.json` | Add new FHIRPath constraint | Constraint accumulation |
| 04 | `04-add-mapping.json` | Add new mapping entry | Mapping accumulation |
| 05 | `05-set-fixed-value.json` | Set fixedString on element | Fixed value application |
| 06 | `06-set-pattern-value.json` | Set patternCodeableConcept | Pattern value application |
| 07 | `07-set-default-value.json` | Set defaultValueString | Default value application |
| 08 | `08-add-example.json` | Add example value | Example accumulation |
| 09 | `09-set-max-length.json` | Set maxLength on string element | MaxLength constraint |
| 10 | `10-combined-overrides.json` | Multiple overrides on one element | Combined application |

## Key Concepts

### Overwrite vs Merge
- **Overwrite**: `short`, `definition`, `comment`, `requirements`, `label`, `meaningWhenMissing`
- **Merge/Accumulate**: `constraint[]`, `mapping[]`, `code[]`, `alias[]`
- **Apply if absent**: `fixed[x]`, `pattern[x]`, `defaultValue[x]`, `example[]`
