# 2. StructureDefinition Model — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 2  
**Deliverable Reference:** [HAPI-StructureDefinition-Model-Study-Deliverable.md](../../HAPI-StructureDefinition-Model-Study-Deliverable.md)

## Overview

These 12 fixtures demonstrate the **StructureDefinition data model** — all the different `kind`, `derivation`, and structural variations that a StructureDefinition can take. Understanding these variations is essential for building a correct parser and profile engine.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-kind-resource.json` | kind=resource (Patient profile) | Most common kind |
| 02 | `02-kind-complex-type.json` | kind=complex-type (Extension) | Extension definition |
| 03 | `03-kind-primitive-type.json` | kind=primitive-type (string) | Primitive type definition |
| 04 | `04-kind-logical.json` | kind=logical (custom model) | Logical model |
| 05 | `05-derivation-constraint.json` | derivation=constraint (profile) | Profile (most common) |
| 06 | `06-derivation-specialization.json` | derivation=specialization | New resource type |
| 07 | `07-with-snapshot-and-differential.json` | Both snapshot and differential | Complete SD |
| 08 | `08-with-context.json` | Extension with context | Where extension can be used |
| 09 | `09-with-mapping.json` | SD-level mapping declarations | External system mappings |
| 10 | `10-with-keyword-and-jurisdiction.json` | useContext + jurisdiction | Metadata fields |
| 11 | `11-abstract-resource.json` | abstract=true | Abstract base type |
| 12 | `12-full-metadata.json` | All metadata fields populated | Complete metadata example |

## Key Concepts

### kind Values
| Value | Meaning | Example |
|-------|---------|---------|
| `resource` | FHIR resource type | Patient, Observation |
| `complex-type` | Complex data type | Extension, Quantity, HumanName |
| `primitive-type` | Primitive data type | string, boolean, integer |
| `logical` | Logical model (not a FHIR type) | Custom data models |

### derivation Values
| Value | Meaning |
|-------|---------|
| `constraint` | Profile (constrains existing type) |
| `specialization` | New type (extends base) |
