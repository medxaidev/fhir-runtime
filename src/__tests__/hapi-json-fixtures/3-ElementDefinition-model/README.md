# 3. ElementDefinition Model — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 3  
**Deliverable Reference:** [HAPI-ElementDefinition-Model-Study-Deliverable.md](../../HAPI-ElementDefinition-Model-Study-Deliverable.md)

## Overview

These 15 fixtures demonstrate **ElementDefinition field coverage** — the most complex data type in FHIR with ~37 fields. Each fixture focuses on a specific group of ED fields to help understand their structure and semantics.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-path-and-id.json` | path, id, sliceName | Core identity fields |
| 02 | `02-cardinality.json` | min, max variations | Cardinality representation |
| 03 | `03-type-simple.json` | Single type | Basic type definition |
| 04 | `04-type-multiple.json` | Multiple types (choice) | Choice type representation |
| 05 | `05-type-with-profile.json` | Type with profile/targetProfile | Profiled types |
| 06 | `06-binding.json` | Binding with all strengths | ValueSet binding |
| 07 | `07-constraint-fhirpath.json` | FHIRPath constraints | Invariant definitions |
| 08 | `08-slicing-definition.json` | Slicing with discriminators | Slicing structure |
| 09 | `09-fixed-and-pattern.json` | fixed[x] and pattern[x] | Value constraints |
| 10 | `10-default-and-example.json` | defaultValue[x] and example | Default/example values |
| 11 | `11-documentation-fields.json` | short, definition, comment, etc. | Documentation fields |
| 12 | `12-flags.json` | mustSupport, isModifier, isSummary | Boolean flags |
| 13 | `13-min-max-value.json` | minValue[x], maxValue[x], maxLength | Range constraints |
| 14 | `14-representation.json` | representation, alias, code | Metadata fields |
| 15 | `15-base-and-content-ref.json` | base, contentReference | Structural references |

## Key Concepts

### ElementDefinition is the heart of FHIR profiling
Every constraint, every type restriction, every binding — all expressed through ElementDefinition fields. Understanding this type thoroughly is prerequisite for implementing snapshot generation.
