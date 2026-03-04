# HAPI Algorithm Study — JSON Fixture Library

## Purpose

This library contains **FHIR R4 StructureDefinition JSON fixtures** organized by the chapters of the [HAPI Algorithm Study Guide](../HAPI-Algorithm-Study-Guide.md). Each fixture is designed to:

1. **Illustrate a specific algorithm behavior** — helps understand how HAPI processes each case
2. **Serve as future test data** — these JSONs will be used in MedXAI's parser/profile/validator tests
3. **Cover edge cases** — each chapter includes both normal and boundary cases

## Directory Structure

```
hapi-json-fixtures/
├── README.md                          ← This file
├── 1.1-generateSnapshot/             ← Snapshot generation scenarios (20 files)
├── 1.2-processPaths/                 ← Path matching & element insertion (15 files)
├── 1.3-updateFromBase/               ← Constraint merging from base (12 files)
├── 1.4-updateFromDefinition/         ← Differential constraint application (10 files)
├── 1.5-processSlicing/               ← Slicing algorithm scenarios (15 files)
├── 1.6-sortElements/                 ← Element sorting rules (10 files)
├── 2-StructureDefinition-model/      ← SD model variations (12 files)
├── 3-ElementDefinition-model/        ← ED field coverage (15 files)
├── 4-FhirContext/                    ← Context & resolution scenarios (10 files)
├── 5-IValidationSupport/            ← Validation support patterns (10 files)
├── 6-BaseValidator/                  ← Validation error patterns (10 files)
├── 7-FHIRPathEngine/                ← FHIRPath constraint examples (10 files)
└── 8-InstanceValidator/             ← Instance validation scenarios (10 files)
```

## Naming Convention

Each JSON file follows: `{nn}-{short-description}.json`

- `nn` = two-digit sequence number (01, 02, ...)
- `short-description` = kebab-case description of the scenario

## How to Use

### For Learning
Read the `README.md` in each chapter folder. It explains:
- What each fixture tests
- Expected HAPI behavior
- Key fields to focus on
- Edge cases highlighted

### For Testing
These fixtures are designed to be consumed by:
- `fhir-parser` (Phase 2) — JSON parsing correctness
- `fhir-profile` (Phase 4) — snapshot generation correctness
- `fhir-validator` (Phase 5) — validation rule correctness

### Cross-reference
Each chapter README links back to the corresponding study deliverable in `devdocs/research/`.

## Total Fixture Count

| Chapter | Topic | Files |
|---------|-------|-------|
| 1.1 | generateSnapshot | 20 |
| 1.2 | processPaths | 15 |
| 1.3 | updateFromBase | 12 |
| 1.4 | updateFromDefinition | 10 |
| 1.5 | processSlicing | 15 |
| 1.6 | sortElements | 10 |
| 2 | StructureDefinition model | 12 |
| 3 | ElementDefinition model | 15 |
| 4 | FhirContext | 10 |
| 5 | IValidationSupport | 10 |
| 6 | BaseValidator | 10 |
| 7 | FHIRPathEngine | 10 |
| 8 | InstanceValidator | 10 |
| **Total** | | **159** |
