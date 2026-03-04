# 6. BaseValidator — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 6  
**Deliverable Reference:** [HAPI-BaseValidator-Validation-Patterns-Notes-Deliverable.md](../../HAPI-BaseValidator-Validation-Patterns-Notes-Deliverable.md)

## Overview

These 10 fixtures demonstrate **validation error patterns** — resource instances that trigger specific validation errors. Understanding these patterns helps build a correct validator that produces the same errors as HAPI.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-valid-patient.json` | Fully valid Patient instance | Baseline — no errors |
| 02 | `02-missing-required-field.json` | Missing required `status` on Observation | Required field validation |
| 03 | `03-wrong-type.json` | String where boolean expected | Type mismatch |
| 04 | `04-cardinality-violation-max.json` | Too many values for max=1 field | Max cardinality violation |
| 05 | `05-invalid-code.json` | Code not in required ValueSet | Terminology validation |
| 06 | `06-invalid-reference-type.json` | Reference to wrong resource type | Reference target validation |
| 07 | `07-unknown-property.json` | Extra property not in SD | Unknown property warning |
| 08 | `08-invalid-primitive-format.json` | Malformed date, uri, etc. | Primitive format validation |
| 09 | `09-constraint-violation.json` | FHIRPath constraint fails | Invariant validation |
| 10 | `10-nested-errors.json` | Errors in nested elements | Error path reporting |
