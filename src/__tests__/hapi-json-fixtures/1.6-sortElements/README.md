# 1.6 sortElements() — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 1.6  
**Deliverable Reference:** [HAPI-sortElements-Study-Deliverable.md](../../HAPI-sortElements-Study-Deliverable.md)

## Overview

These 10 fixtures focus on **element sorting** — how HAPI orders elements in the snapshot after all merging is complete. Correct ordering is critical for tooling that processes StructureDefinitions sequentially.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-simple-flat-order.json` | Flat elements in base order | Baseline ordering |
| 02 | `02-nested-depth-first.json` | Nested elements (depth-first) | Parent before children |
| 03 | `03-sliced-element-order.json` | Slicing root + slices | Slice insertion position |
| 04 | `04-slice-children-order.json` | Slice with child elements | Children follow their slice |
| 05 | `05-choice-type-order.json` | Choice type expansion order | `[x]` → concrete type ordering |
| 06 | `06-multiple-slices-order.json` | 3 slices in defined order | Slice sequence preservation |
| 07 | `07-extension-before-elements.json` | Extension elements position | Extensions sorted early |
| 08 | `08-modifier-extension-order.json` | modifierExtension position | After extension, before others |
| 09 | `09-mixed-depth-and-slicing.json` | Complex: nested + sliced | Combined ordering rules |
| 10 | `10-backbone-children-order.json` | BackboneElement children | Inline type children ordering |

## Key Concepts

### Sorting Rules
1. Elements are ordered by **path** (lexicographic within each level)
2. **Children** immediately follow their parent (depth-first)
3. **Slices** are inserted after the slicing root element
4. **Slice children** follow their slice, before the next slice
5. `id`, `extension`, `modifierExtension` come before other children
