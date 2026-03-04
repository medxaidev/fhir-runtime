# StructureDefinition Parser Test Fixtures

Test JSON files for `structure-definition-parser.ts` (Task 2.5).

## Directory Structure

```
structure-definition/
├── 01-complete-sd/          # Complete StructureDefinition parsing (5 files)
├── 02-element-fields/       # ElementDefinition all 37 fields (5 files)
├── 03-element-subtypes/     # ElementDefinition 8 sub-types (5 files)
├── 04-snapshot-differential/ # snapshot.element[] & differential.element[] (5 files)
├── 05-choice-types/         # ElementDefinition 5 choice type fields (5 files)
└── 06-base-resources/       # FHIR R4 base resource StructureDefinitions (20 files)
```

## Coverage

| Category | Files | Description |
|----------|-------|-------------|
| Complete SD | 5 | Minimal, full metadata, extension-def, logical-model, datatype-def |
| Element Fields | 5 | Identity fields, cardinality+docs, flags+conditions, all-documentation, all-37-fields |
| Element Sub-types | 5 | Slicing+discriminator, base+type, constraint, binding+example, mapping |
| Snapshot/Differential | 5 | Snapshot-only, differential-only, both, deep-nesting, empty-snapshot-error |
| Choice Types | 5 | fixed[x], pattern[x], defaultValue[x], minValue+maxValue[x], multiple-choice-fields |
| Base Resources | 20 | Patient, Observation, Condition, ... (real FHIR R4 base definitions) |

Total: **45 JSON fixture files**
