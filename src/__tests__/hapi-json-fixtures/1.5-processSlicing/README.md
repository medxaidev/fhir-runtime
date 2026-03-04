# 1.5 processSlicing() — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 1.5  
**Deliverable Reference:** [HAPI-processSlicing-Study-Deliverable.md](../../HAPI-processSlicing-Study-Deliverable.md)

## Overview

These 15 fixtures cover the **slicing algorithm** — one of the most complex parts of FHIR profiling. Slicing allows a repeating element to be divided into named sub-groups (slices), each with its own constraints.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-discriminator-value.json` | Discriminator type=value | Most common discriminator |
| 02 | `02-discriminator-pattern.json` | Discriminator type=pattern | Pattern-based discrimination |
| 03 | `03-discriminator-type.json` | Discriminator type=type | Type-based discrimination |
| 04 | `04-discriminator-profile.json` | Discriminator type=profile | Profile-based discrimination |
| 05 | `05-discriminator-exists.json` | Discriminator type=exists | Existence-based discrimination |
| 06 | `06-multiple-discriminators.json` | Two discriminators on one slice | Compound discrimination |
| 07 | `07-rules-open.json` | rules=open | Additional unsliced elements allowed |
| 08 | `08-rules-closed.json` | rules=closed | Only defined slices allowed |
| 09 | `09-rules-open-at-end.json` | rules=openAtEnd | Unsliced elements only at end |
| 10 | `10-ordered-slicing.json` | ordered=true | Slices must appear in order |
| 11 | `11-nested-slicing.json` | Slice within a slice (reslicing) | Nested slicing |
| 12 | `12-extension-slicing-pattern.json` | Standard extension slicing by URL | Most common real-world pattern |
| 13 | `13-slice-with-children.json` | Slice with constrained child elements | Slice + child constraints |
| 14 | `14-error-slice-before-slicing.json` | Slice element before slicing declaration | Expected: error |
| 15 | `15-error-duplicate-slice-name.json` | Two slices with same sliceName | Expected: error |

## Key Concepts

### Discriminator Types
| Type | Meaning | Example |
|------|---------|---------|
| `value` | Fixed value at path | `identifier.system = "http://..."` |
| `pattern` | Pattern match at path | `code.coding.system = "http://loinc.org"` |
| `type` | Type of element | `value[x]` → Quantity vs string |
| `profile` | Profile of element | Extension profile URL |
| `exists` | Element exists or not | `value.exists()` |

### Slicing Rules
- **open**: Additional elements beyond defined slices are allowed
- **closed**: Only defined slices are allowed (strict)
- **openAtEnd**: Additional elements allowed but only after all defined slices
