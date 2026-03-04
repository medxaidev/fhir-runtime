# 7. FHIRPathEngine — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 7  
**Deliverable Reference:** [HAPI-FHIRPathEngine-Syntax-Basics-Notes-Deliverable.md](../../HAPI-FHIRPathEngine-Syntax-Basics-Notes-Deliverable.md)

## Overview

These 10 fixtures demonstrate **FHIRPath constraint examples** — profiles with FHIRPath expressions in their constraints. While Stage-1 does NOT evaluate FHIRPath, understanding the syntax and common patterns is essential for future phases.

Each fixture includes a profile with constraints AND a sample resource instance that either passes or fails the constraint.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-exists-constraint.json` | `name.exists()` | Basic existence check |
| 02 | `02-where-constraint.json` | `telecom.where(system='phone').exists()` | Filtered existence |
| 03 | `03-all-constraint.json` | `identifier.all(system.exists())` | Universal quantifier |
| 04 | `04-count-constraint.json` | `name.count() >= 1` | Count comparison |
| 05 | `05-matches-constraint.json` | `value.matches('^[0-9]+$')` | Regex matching |
| 06 | `06-resolve-constraint.json` | `subject.resolve().is(Patient)` | Reference resolution |
| 07 | `07-combined-or.json` | `family.exists() or given.exists()` | Logical OR |
| 08 | `08-combined-and.json` | `system.exists() and value.exists()` | Logical AND |
| 09 | `09-implies-constraint.json` | `gender.exists() implies birthDate.exists()` | Implication |
| 10 | `10-nested-path-constraint.json` | `contact.name.family.exists()` | Deep path navigation |
