# 4. FhirContext — JSON Fixtures

**Study Guide Reference:** [HAPI-Algorithm-Study-Guide.md](../../HAPI-Algorithm-Study-Guide.md) § 4  

## Overview

These 10 fixtures demonstrate **context and resolution scenarios** — how a FHIR context registry resolves StructureDefinitions by URL, handles versioned references, and manages dependency chains. These are critical for understanding how profiles reference each other.

## Fixture Index

| # | File | Scenario | Key Learning Point |
|---|------|----------|--------------------|
| 01 | `01-resolve-by-url.json` | SD with canonical URL | Basic URL resolution |
| 02 | `02-resolve-versioned.json` | SD with version in URL | Versioned canonical reference |
| 03 | `03-base-definition-chain.json` | Profile → Profile → Base | Dependency chain resolution |
| 04 | `04-extension-reference.json` | Profile referencing extension SD | Cross-SD reference |
| 05 | `05-valueset-reference.json` | Binding referencing ValueSet | ValueSet resolution |
| 06 | `06-target-profile-reference.json` | Reference with targetProfile | Profile-constrained reference |
| 07 | `07-multiple-profiles-bundle.json` | Bundle with interdependent SDs | Batch loading |
| 08 | `08-circular-dependency.json` | Two SDs referencing each other | Circular dependency detection |
| 09 | `09-missing-dependency.json` | SD referencing non-existent base | Missing dependency handling |
| 10 | `10-fhir-version-mismatch.json` | SD with wrong fhirVersion | Version compatibility |
