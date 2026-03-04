# 8. InstanceValidator — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 8  
**Deliverable Reference:** [HAPI-InstanceValidator-Full-Validation-Flow-Deliverable.md](../../HAPI-InstanceValidator-Full-Validation-Flow-Deliverable.md)

## Overview

These 10 fixtures demonstrate **instance validation scenarios** — resource instances validated against specific profiles. Each fixture is a Bundle containing both the profile (StructureDefinition) and a sample resource instance, showing how the InstanceValidator processes them end-to-end.

Stage-1 only does structural validation, but understanding the full validation flow helps design the right abstractions.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-valid-against-profile.json` | Instance passes all profile constraints | Happy path |
| 02 | `02-missing-must-support.json` | Missing mustSupport element | MS validation |
| 03 | `03-slice-validation.json` | Instance with sliced elements | Slice matching |
| 04 | `04-extension-validation.json` | Instance with profiled extensions | Extension validation |
| 05 | `05-choice-type-validation.json` | Instance with choice type value | Choice type checking |
| 06 | `06-binding-validation.json` | Code against required binding | Terminology validation |
| 07 | `07-reference-validation.json` | Reference target type checking | Reference validation |
| 08 | `08-nested-profile-validation.json` | Nested complex type validation | Deep validation |
| 09 | `09-multiple-errors.json` | Instance with many violations | Error aggregation |
| 10 | `10-meta-profile-declaration.json` | Instance declaring meta.profile | Profile-aware validation |
