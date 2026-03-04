# 1.3 updateFromBase() — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 1.3  
**Deliverable Reference:** [HAPI-updateFromBase-Study-Deliverable.md](../../HAPI-updateFromBase-Study-Deliverable.md)

## Overview

These 12 fixtures focus on **constraint merging from base** — how HAPI's `updateFromBase()` merges base element properties into derived elements, enforcing the rule that derived profiles can only **tighten** (never loosen) constraints.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-cardinality-tighten-min.json` | min: 0→1 | Valid tightening |
| 02 | `02-cardinality-tighten-max.json` | max: *→5 | Valid max restriction |
| 03 | `03-cardinality-tighten-both.json` | 0..*→1..3 | Both min and max tightened |
| 04 | `04-error-cardinality-loosen-min.json` | min: 1→0 | Invalid loosening |
| 05 | `05-error-cardinality-loosen-max.json` | max: 1→* | Invalid max expansion |
| 06 | `06-type-restriction.json` | Restrict types from 2→1 | Type intersection |
| 07 | `07-type-profile-addition.json` | Add profile to Reference type | targetProfile narrowing |
| 08 | `08-error-type-expansion.json` | Add new type not in base | Invalid type expansion |
| 09 | `09-binding-tighten-extensible-to-required.json` | extensible→required | Valid binding tightening |
| 10 | `10-binding-same-strength-new-vs.json` | Same strength, different VS | ValueSet replacement |
| 11 | `11-error-binding-loosen.json` | required→extensible | Invalid binding loosening |
| 12 | `12-short-definition-override.json` | Override short/definition text | Documentation merge rules |

## Key Concepts

### Constraint Tightening Rules
- **Cardinality**: `derived.min >= base.min` AND `derived.max <= base.max`
- **Types**: Derived types must be a subset of base types
- **Binding**: Strength can only increase: example < preferred < extensible < required
- **Documentation**: `short`, `definition`, `comment` can be freely overridden

### Binding Strength Hierarchy
```
example < preferred < extensible < required
```
A derived profile can move UP this hierarchy but never DOWN.
