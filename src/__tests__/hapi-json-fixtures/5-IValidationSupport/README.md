# 5. IValidationSupport — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 5  
**Deliverable Reference:** [HAPI-IValidationSupport-Interface-Notes-Deliverable.md](../../HAPI-IValidationSupport-Interface-Notes-Deliverable.md)

## Overview

These 10 fixtures demonstrate **validation support patterns** — the different types of FHIR conformance resources that a validation support implementation must be able to load and serve. This maps to the `IValidationSupport` interface in HAPI.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-base-patient-sd.json` | Base Patient StructureDefinition (minimal snapshot) | Core resource SD |
| 02 | `02-base-observation-sd.json` | Base Observation SD | Another core resource |
| 03 | `03-datatype-humanname-sd.json` | HumanName data type SD | Complex type SD |
| 04 | `04-extension-sd.json` | Extension StructureDefinition | Extension type SD |
| 05 | `05-valueset-gender.json` | ValueSet resource | Code validation support |
| 06 | `06-codesystem-gender.json` | CodeSystem resource | Terminology support |
| 07 | `07-search-parameter.json` | SearchParameter resource | Search support |
| 08 | `08-capability-statement.json` | CapabilityStatement (minimal) | Server capabilities |
| 09 | `09-implementation-guide.json` | ImplementationGuide resource | IG package loading |
| 10 | `10-conformance-bundle.json` | Bundle of conformance resources | Batch loading pattern |
