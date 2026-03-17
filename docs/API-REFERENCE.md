# FHIR Runtime API Reference

**Version:** v0.9.0  
**FHIR Version:** R4 (4.0.1)  
**Last Updated:** 2026-03-17  
**Module Format:** ESM + CJS

---

## Table of Contents

1. [Parser Module](#parser-module)
2. [Model Module](#model-module)
3. [Context Module](#context-module)
4. [Profile Module](#profile-module)
5. [Validator Module](#validator-module)
6. [FHIRPath Module](#fhirpath-module)
7. [Provider Module](#provider-module)
8. [Terminology Module](#terminology-module)
9. [Package Module](#package-module)
10. [Integration Module](#integration-module)
11. [Pipeline Module](#pipeline-module)
12. [Definition Module](#definition-module)

---

## Parser Module

### Functions

#### `parseFhirJson(json: string): ParseResult`

Parse a FHIR R4 JSON string into a typed resource.

**Parameters:**
- `json` — JSON string to parse

**Returns:** `ParseResult` with `success`, `data`, and `issues`

**Example:**
```typescript
const result = parseFhirJson('{"resourceType": "Patient", "id": "123"}');
if (result.success) {
  console.log(result.data.id); // "123"
}
```

---

#### `parseFhirObject(obj: any): ParseResult`

Parse a JavaScript object into a typed FHIR resource.

**Parameters:**
- `obj` — JavaScript object to parse

**Returns:** `ParseResult`

**Example:**
```typescript
const result = parseFhirObject({ resourceType: 'Patient', id: '123' });
```

---

#### `parseStructureDefinition(input: string | any): ParseResult<StructureDefinition>`

Parse a StructureDefinition resource.

**Parameters:**
- `input` — JSON string or object

**Returns:** `ParseResult<StructureDefinition>`

**Example:**
```typescript
const result = parseStructureDefinition(sdJson);
if (result.success) {
  console.log(result.data.name);
}
```

---

#### `serializeToFhirJson(resource: any): string`

Serialize a FHIR resource to JSON string.

**Parameters:**
- `resource` — FHIR resource object

**Returns:** JSON string

**Example:**
```typescript
const json = serializeToFhirJson(patient);
```

---

#### `serializeToFhirObject(resource: any): any`

Serialize a FHIR resource to plain JavaScript object.

**Parameters:**
- `resource` — FHIR resource object

**Returns:** Plain object

---

### Types

#### `ParseResult`

```typescript
interface ParseResult<T = any> {
  success: boolean;
  data?: T;
  issues: ParseIssue[];
}
```

#### `ParseIssue`

```typescript
interface ParseIssue {
  severity: ParseSeverity; // 'error' | 'warning' | 'information'
  code: ParseErrorCode;
  message: string;
  path?: string;
}
```

#### `ParseErrorCode`

```typescript
type ParseErrorCode =
  | 'invalid-json'
  | 'missing-resource-type'
  | 'invalid-resource-type'
  | 'invalid-primitive'
  | 'invalid-choice-type'
  | 'invalid-extension'
  | 'unknown-field';
```

---

## Model Module

### Primitive Types

All FHIR primitives are branded types for type safety:

```typescript
type FhirString = string & { readonly __brand: 'FhirString' };
type FhirInteger = number & { readonly __brand: 'FhirInteger' };
type FhirBoolean = boolean & { readonly __brand: 'FhirBoolean' };
type FhirDecimal = number & { readonly __brand: 'FhirDecimal' };
type FhirUri = string & { readonly __brand: 'FhirUri' };
type FhirUrl = string & { readonly __brand: 'FhirUrl' };
type FhirCanonical = string & { readonly __brand: 'FhirCanonical' };
type FhirDate = string & { readonly __brand: 'FhirDate' };
type FhirDateTime = string & { readonly __brand: 'FhirDateTime' };
type FhirTime = string & { readonly __brand: 'FhirTime' };
type FhirInstant = string & { readonly __brand: 'FhirInstant' };
type FhirCode = string & { readonly __brand: 'FhirCode' };
type FhirId = string & { readonly __brand: 'FhirId' };
type FhirOid = string & { readonly __brand: 'FhirOid' };
type FhirUuid = string & { readonly __brand: 'FhirUuid' };
type FhirMarkdown = string & { readonly __brand: 'FhirMarkdown' };
type FhirBase64Binary = string & { readonly __brand: 'FhirBase64Binary' };
type FhirXhtml = string & { readonly __brand: 'FhirXhtml' };
type FhirPositiveInt = number & { readonly __brand: 'FhirPositiveInt' };
type FhirUnsignedInt = number & { readonly __brand: 'FhirUnsignedInt' };
```

### Complex Types

#### `Element`

```typescript
interface Element {
  id?: FhirString;
  extension?: Extension[];
}
```

#### `Extension`

```typescript
interface Extension extends Element {
  url: FhirUri;
  valueString?: FhirString;
  valueInteger?: FhirInteger;
  valueBoolean?: FhirBoolean;
  // ... other value[x] types
}
```

#### `Coding`

```typescript
interface Coding extends Element {
  system?: FhirUri;
  version?: FhirString;
  code?: FhirCode;
  display?: FhirString;
  userSelected?: FhirBoolean;
}
```

#### `CodeableConcept`

```typescript
interface CodeableConcept extends Element {
  coding?: Coding[];
  text?: FhirString;
}
```

#### `Reference`

```typescript
interface Reference extends Element {
  reference?: FhirString;
  type?: FhirUri;
  identifier?: Identifier;
  display?: FhirString;
}
```

#### `StructureDefinition`

```typescript
interface StructureDefinition extends DomainResource {
  url: FhirUri;
  version?: FhirString;
  name: FhirString;
  status: PublicationStatus;
  kind: StructureDefinitionKind;
  abstract: FhirBoolean;
  type: FhirUri;
  baseDefinition?: FhirCanonical;
  derivation?: TypeDerivationRule;
  snapshot?: StructureDefinitionSnapshot;
  differential?: StructureDefinitionDifferential;
}
```

#### `ElementDefinition`

```typescript
interface ElementDefinition extends BackboneElement {
  path: FhirString;
  sliceName?: FhirString;
  min?: FhirUnsignedInt;
  max?: FhirString;
  type?: ElementDefinitionType[];
  binding?: ElementDefinitionBinding;
  constraint?: ElementDefinitionConstraint[];
  // ... many more fields
}
```

### Enums

```typescript
type PublicationStatus = 'draft' | 'active' | 'retired' | 'unknown';
type StructureDefinitionKind = 'primitive-type' | 'complex-type' | 'resource' | 'logical';
type TypeDerivationRule = 'specialization' | 'constraint';
type BindingStrength = 'required' | 'extensible' | 'preferred' | 'example';
type ConstraintSeverity = 'error' | 'warning';
type DiscriminatorType = 'value' | 'exists' | 'pattern' | 'type' | 'profile';
type SlicingRules = 'closed' | 'open' | 'openAtEnd';
```

---

## Context Module

### Classes

#### `FhirContextImpl`

Main context class for managing StructureDefinitions.

**Constructor:**
```typescript
constructor(options: FhirContextOptions)
```

**Methods:**

##### `preloadCoreDefinitions(): Promise<void>`

Load all 73 FHIR R4 core definitions.

```typescript
const ctx = new FhirContextImpl({ loaders: [] });
await ctx.preloadCoreDefinitions();
```

##### `resolveStructureDefinition(url: string): Promise<StructureDefinition | null>`

Resolve a StructureDefinition by canonical URL.

```typescript
const sd = await ctx.resolveStructureDefinition(
  'http://hl7.org/fhir/StructureDefinition/Patient'
);
```

##### `getBaseDefinition(url: string): Promise<StructureDefinition | null>`

Get the base definition for a profile.

```typescript
const base = await ctx.getBaseDefinition(profileUrl);
```

##### `loadBundle(bundle: any, options?: BundleLoadOptions): Promise<BundleLoadResult>`

Load a FHIR bundle containing StructureDefinitions.

```typescript
const result = await ctx.loadBundle(bundle);
console.log(`Loaded ${result.loaded} definitions`);
```

##### `getStatistics(): ContextStatistics`

Get context statistics.

```typescript
const stats = ctx.getStatistics();
console.log(`Total definitions: ${stats.totalDefinitions}`);
```

---

### Loaders

#### `MemoryLoader`

In-memory loader for StructureDefinitions.

**Constructor:**
```typescript
constructor(definitions: Map<string, StructureDefinition>)
```

**Example:**
```typescript
const loader = new MemoryLoader(new Map([
  ['http://example.org/SD/custom', customSD],
]));
```

---

#### `FileSystemLoader`

Load StructureDefinitions from filesystem.

**Constructor:**
```typescript
constructor(directory: string, options?: LoaderOptions)
```

**Example:**
```typescript
const loader = new FileSystemLoader('./profiles', {
  recursive: true,
  filePattern: '*.json',
});
```

---

#### `CompositeLoader`

Combine multiple loaders with fallback.

**Constructor:**
```typescript
constructor(loaders: StructureDefinitionLoader[])
```

**Example:**
```typescript
const composite = new CompositeLoader([memLoader, fsLoader]);
```

---

### Functions

#### `loadBundleFromFile(path: string): Promise<any>`

Load a FHIR bundle from file.

```typescript
const bundle = await loadBundleFromFile('./us-core-bundle.json');
```

#### `loadBundleFromObject(obj: any): any`

Load a FHIR bundle from object.

```typescript
const bundle = loadBundleFromObject(bundleObj);
```

#### `extractInnerTypes(sd: StructureDefinition): Map<string, CanonicalProfile>`

Extract BackboneElement inner types from a StructureDefinition.

```typescript
const innerTypes = extractInnerTypes(observationSD);
```

---

## Profile Module

### Classes

#### `SnapshotGenerator`

Generate snapshots from differential profiles.

**Constructor:**
```typescript
constructor(context: FhirContext, options?: SnapshotGeneratorOptions)
```

**Methods:**

##### `generate(profile: StructureDefinition): Promise<SnapshotResult>`

Generate snapshot for a profile.

```typescript
const generator = new SnapshotGenerator(ctx, {
  generateCanonical: true,
  validateConstraints: true,
});

const result = await generator.generate(myProfile);
if (result.success) {
  console.log(result.structureDefinition.snapshot.element.length);
}
```

---

### Functions

#### `buildCanonicalProfile(sd: StructureDefinition): CanonicalProfile`

Build a canonical profile from a StructureDefinition with snapshot.

**Parameters:**
- `sd` — StructureDefinition with snapshot

**Returns:** `CanonicalProfile`

**Example:**
```typescript
const profile = buildCanonicalProfile(patientSD);
```

---

#### `buildCanonicalElement(ed: ElementDefinition): CanonicalElement`

Build a canonical element from an ElementDefinition.

```typescript
const element = buildCanonicalElement(elementDef);
```

---

#### Path Utilities

```typescript
// Check if paths match
pathMatches(path1: string, path2: string): boolean

// Check if path is direct child
isDirectChild(parentPath: string, childPath: string): boolean

// Check if path is descendant
isDescendant(ancestorPath: string, descendantPath: string): boolean

// Get path depth
pathDepth(path: string): number

// Get parent path
parentPath(path: string): string | null

// Get tail segment
tailSegment(path: string): string

// Check if choice type path
isChoiceTypePath(path: string): boolean

// Extract choice type name
extractChoiceTypeName(path: string): string | null

// Check if has slice name
hasSliceName(path: string): boolean

// Extract slice name
extractSliceName(path: string): string | null
```

---

## Validator Module

### Classes

#### `StructureValidator`

Validate resources against profiles.

**Constructor:**
```typescript
constructor()
```

**Methods:**

##### `validate(resource: any, profile: CanonicalProfile, options?: ValidationOptions): ValidationResult`

Validate a resource against a profile.

```typescript
const validator = new StructureValidator();
const result = validator.validate(patient, profile, {
  checkRequired: true,
  checkCardinality: true,
  checkTypes: true,
  checkInvariants: true,
});

if (!result.valid) {
  result.issues.forEach(issue => {
    console.error(`${issue.severity}: ${issue.message}`);
  });
}
```

---

### Types

#### `ValidationOptions`

```typescript
interface ValidationOptions {
  checkRequired?: boolean;
  checkCardinality?: boolean;
  checkTypes?: boolean;
  checkInvariants?: boolean;
  checkBindings?: boolean;
  terminologyProvider?: TerminologyProvider;
  referenceResolver?: ReferenceResolver;
}
```

#### `ValidationResult`

```typescript
interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}
```

#### `ValidationIssue`

```typescript
interface ValidationIssue {
  severity: 'error' | 'warning' | 'information';
  code: ValidationIssueCode;
  message: string;
  path: string;
  expected?: any;
  actual?: any;
}
```

#### `ValidationIssueCode`

```typescript
type ValidationIssueCode =
  | 'required-missing'
  | 'cardinality-violation'
  | 'type-mismatch'
  | 'invariant-failed'
  | 'binding-failed'
  | 'reference-invalid'
  | 'value-invalid';
```

---

## FHIRPath Module

### Functions

#### `evalFhirPath(expression: string, context: any): any[]`

Evaluate a FHIRPath expression and return array result.

**Parameters:**
- `expression` — FHIRPath expression string
- `context` — Resource or element to evaluate against

**Returns:** Array of results

**Example:**
```typescript
const names = evalFhirPath('Patient.name.given', patient);
// → ['John', 'Jane']
```

---

#### `evalFhirPathBoolean(expression: string, context: any): boolean`

Evaluate a FHIRPath expression and return boolean result.

**Parameters:**
- `expression` — FHIRPath expression string
- `context` — Resource or element to evaluate against

**Returns:** Boolean result

**Example:**
```typescript
const hasOfficial = evalFhirPathBoolean(
  "name.where(use='official').exists()",
  patient
);
// → true
```

---

#### `evalFhirPathString(expression: string, context: any): string | null`

Evaluate a FHIRPath expression and return string result.

**Parameters:**
- `expression` — FHIRPath expression string
- `context` — Resource or element to evaluate against

**Returns:** String result or null

**Example:**
```typescript
const family = evalFhirPathString('name.first().family', patient);
// → 'Doe'
```

---

#### `evalFhirPathTyped(expression: string, context: any): FhirPathValue[]`

Evaluate a FHIRPath expression and return typed results.

**Parameters:**
- `expression` — FHIRPath expression string
- `context` — Resource or element to evaluate against

**Returns:** Array of typed FHIRPath values

---

### Supported Functions

**Collection Functions:** `empty()`, `exists()`, `all()`, `allTrue()`, `anyTrue()`, `allFalse()`, `anyFalse()`, `count()`, `distinct()`, `first()`, `last()`, `tail()`, `skip()`, `take()`, `single()`, `where()`, `select()`, `repeat()`

**String Functions:** `indexOf()`, `substring()`, `startsWith()`, `endsWith()`, `contains()`, `upper()`, `lower()`, `replace()`, `matches()`, `replaceMatches()`, `length()`, `toChars()`, `split()`, `join()`

**Math Functions:** `abs()`, `ceiling()`, `floor()`, `truncate()`, `round()`, `sqrt()`, `ln()`, `log()`, `exp()`, `power()`

**Type Functions:** `is()`, `as()`, `ofType()`, `convertsToBoolean()`, `convertsToInteger()`, `convertsToString()`, `convertsToDecimal()`, `convertsToDateTime()`, `convertsToDate()`, `convertsToTime()`, `toBoolean()`, `toInteger()`, `toString()`, `toDecimal()`, `toDateTime()`, `toDate()`, `toTime()`

**Date/Time Functions:** `now()`, `today()`, `timeOfDay()`

**Utility Functions:** `trace()`, `iif()`, `extension()`, `hasValue()`, `getValue()`, `ofType()`, `memberOf()`

---

## Provider Module

### Interfaces

#### `TerminologyProvider`

```typescript
interface TerminologyProvider {
  validateCode(params: ValidateCodeParams): Promise<ValidateCodeResult>;
  expandValueSet(params: ExpandValueSetParams): Promise<ValueSetExpansion>;
  lookupCode(params: LookupCodeParams): Promise<LookupCodeResult>;
}
```

#### `RemoteTerminologyProvider`

```typescript
interface RemoteTerminologyProvider {
  validateCode(params: RemoteValidateCodeParams): Promise<RemoteValidateCodeResult>;
  expand(params: RemoteExpandParams): Promise<any>;
  lookup(params: RemoteLookupParams): Promise<RemoteLookupResult>;
}
```

#### `ReferenceResolver`

```typescript
interface ReferenceResolver {
  resolve(reference: string): Promise<any | null>;
  resolveMany(references: string[]): Promise<Map<string, any>>;
}
```

---

### Classes

#### `NoOpTerminologyProvider`

No-operation terminology provider for development.

```typescript
const provider = new NoOpTerminologyProvider();
```

#### `NoOpReferenceResolver`

No-operation reference resolver for development.

```typescript
const resolver = new NoOpReferenceResolver();
```

---

### Functions

#### `buildOperationOutcome(issues: ValidationIssue[]): OperationOutcome`

Convert validation issues to FHIR OperationOutcome.

```typescript
const outcome = buildOperationOutcome(result.issues);
```

#### `buildOperationOutcomeFromParse(result: ParseResult): OperationOutcome`

Convert parse result to OperationOutcome.

```typescript
const outcome = buildOperationOutcomeFromParse(parseResult);
```

#### `buildOperationOutcomeFromSnapshot(result: SnapshotResult): OperationOutcome`

Convert snapshot result to OperationOutcome.

```typescript
const outcome = buildOperationOutcomeFromSnapshot(snapshotResult);
```

---

## Terminology Module

### Classes

#### `InMemoryTerminologyProvider`

In-memory terminology provider with ValueSet and CodeSystem support.

**Constructor:**
```typescript
constructor()
```

**Methods:**

##### `loadFromBundle(bundle: any): void`

Load CodeSystems and ValueSets from a bundle.

```typescript
const provider = new InMemoryTerminologyProvider();
provider.loadFromBundle(terminologyBundle);
```

##### `registerCodeSystem(cs: CodeSystemDefinition): void`

Register a CodeSystem.

```typescript
provider.registerCodeSystem(codeSystemDef);
```

##### `registerValueSet(vs: ValueSetDefinition): void`

Register a ValueSet.

```typescript
provider.registerValueSet(valueSetDef);
```

##### `validateCode(params: ValidateCodeParams): Promise<ValidateCodeResult>`

Validate a code against a ValueSet or CodeSystem.

```typescript
const result = await provider.validateCode({
  system: 'http://hl7.org/fhir/administrative-gender',
  code: 'male',
  display: 'Male',
});
```

---

#### `CodeSystemRegistry`

Registry for CodeSystems with hierarchical support.

**Methods:**

```typescript
register(cs: CodeSystemDefinition): void
get(url: string): CodeSystemDefinition | undefined
has(url: string): boolean
isCodeInSystem(system: string, code: string): boolean
```

---

#### `ValueSetRegistry`

Registry for ValueSets with expansion support.

**Methods:**

```typescript
register(vs: ValueSetDefinition): void
get(url: string): ValueSetDefinition | undefined
has(url: string): boolean
expand(url: string): ValueSetExpansionContainsDef[]
```

---

### Functions

#### `validateBinding(value: any, binding: BindingConstraintInput, provider: TerminologyProvider): Promise<BindingValidationResult>`

Validate a coded value against a binding.

```typescript
const result = await validateBinding(
  codeableConcept,
  { valueSet: vsUrl, strength: 'required' },
  provider
);
```

#### `extractCodedValues(element: any): Coding[]`

Extract Coding values from a CodeableConcept or Coding.

```typescript
const codings = extractCodedValues(codeableConcept);
```

---

## Package Module

### Classes

#### `NpmPackageLoader`

Load FHIR IG packages from NPM package directories.

**Constructor:**
```typescript
constructor(packagePath: string, options?: NpmPackageLoaderOptions)
```

**Methods:**

##### `loadManifest(): Promise<PackageManifest>`

Load package.json manifest.

```typescript
const loader = new NpmPackageLoader('./fhir-packages/hl7.fhir.us.core');
const manifest = await loader.loadManifest();
console.log(manifest.name, manifest.version);
```

##### `loadIndex(): Promise<PackageIndex>`

Load .index.json file.

```typescript
const index = await loader.loadIndex();
```

##### `loadResource(filename: string): Promise<any>`

Load a specific resource file.

```typescript
const resource = await loader.loadResource('StructureDefinition-us-core-patient.json');
```

##### `scanResources(filter?: (entry: PackageIndexEntry) => boolean): Promise<any[]>`

Scan and load resources with optional filter.

```typescript
const profiles = await loader.scanResources(
  entry => entry.resourceType === 'StructureDefinition'
);
```

---

#### `PackageManager`

Manage multiple IG packages with dependency resolution.

**Constructor:**
```typescript
constructor(context: FhirContext, options?: PackageManagerOptions)
```

**Methods:**

##### `registerPackage(loader: NpmPackageLoader): Promise<void>`

Register a package.

```typescript
const manager = new PackageManager(ctx);
await manager.registerPackage(usCoreLoader);
```

##### `resolveCanonical(url: string): CanonicalResolution | null`

Resolve a canonical URL across packages.

```typescript
const resolved = manager.resolveCanonical(
  'http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient|6.1.0'
);
```

##### `getPackageInfo(packageId: string): PackageInfo | undefined`

Get package information.

```typescript
const info = manager.getPackageInfo('hl7.fhir.us.core');
```

---

### Functions

#### `parsePackageManifest(json: string): PackageManifest`

Parse package.json manifest.

```typescript
const manifest = parsePackageManifest(jsonString);
```

#### `parsePackageIndex(json: string): PackageIndex`

Parse .index.json file.

```typescript
const index = parsePackageIndex(jsonString);
```

#### `buildDependencyGraph(packages: PackageInfo[]): DependencyGraph`

Build dependency graph from packages.

```typescript
const graph = buildDependencyGraph(packages);
```

#### `topologicalSort(graph: DependencyGraph): string[]`

Sort packages in dependency order.

```typescript
const sorted = topologicalSort(graph);
```

#### `parseCanonicalUrl(url: string): { url: string; version?: string }`

Parse canonical URL with optional version.

```typescript
const parsed = parseCanonicalUrl('http://example.org/SD/profile|1.0.0');
// → { url: 'http://example.org/SD/profile', version: '1.0.0' }
```

---

## Integration Module

### Functions

#### `parseSearchParameter(resource: any): SearchParameter`

Parse a SearchParameter resource.

```typescript
const sp = parseSearchParameter(searchParamResource);
console.log(sp.code, sp.type, sp.expression);
```

#### `parseSearchParametersFromBundle(bundle: any): SearchParameter[]`

Parse all SearchParameters from a bundle.

```typescript
const sps = parseSearchParametersFromBundle(bundle);
```

#### `extractSearchValues(resource: any, searchParam: SearchParameter, context: FhirContext): SearchIndexValue[]`

Extract search values from a resource.

```typescript
const values = extractSearchValues(patient, nameSearchParam, ctx);
```

#### `extractAllSearchValues(resource: any, searchParams: SearchParameter[], context: FhirContext): Map<string, SearchIndexValue[]>`

Extract all search values for a resource.

```typescript
const allValues = extractAllSearchValues(patient, patientSearchParams, ctx);
```

#### `extractReferences(resource: any): ReferenceInfo[]`

Extract all references from a resource.

```typescript
const refs = extractReferences(patient);
refs.forEach(ref => {
  console.log(ref.path, ref.reference, ref.type);
});
```

#### `extractReferencesFromBundle(bundle: any): Map<string, ReferenceInfo[]>`

Extract references from all resources in a bundle.

```typescript
const refMap = extractReferencesFromBundle(bundle);
```

#### `validateReferenceTargets(refs: ReferenceInfo[], profile: CanonicalProfile): ValidationIssue[]`

Validate reference target types against profile constraints.

```typescript
const issues = validateReferenceTargets(refs, profile);
```

#### `buildCapabilityFragment(options: { resourceType: string; profiles?: string[]; searchParams?: SearchParameter[] }): CapabilityRestResource`

Build a CapabilityStatement REST resource fragment.

```typescript
const fragment = buildCapabilityFragment({
  resourceType: 'Patient',
  profiles: ['http://hl7.org/fhir/us/core/StructureDefinition/us-core-patient'],
  searchParams: patientSearchParams,
});
```

---

### Classes

#### `ResourceTypeRegistry`

Registry of FHIR R4 resource types.

**Methods:**

```typescript
isResourceType(type: string): boolean
getResourceInfo(type: string): ResourceTypeInfo | undefined
getAllResourceTypes(): string[]
```

**Constants:**

```typescript
FHIR_R4_RESOURCE_TYPES: string[] // 148 resource types
```

---

## Pipeline Module

### Classes

#### `ValidationPipeline`

Composable validation pipeline with pluggable steps.

**Constructor:**
```typescript
constructor(options?: PipelineOptions)
```

**Methods:**

##### `addStep(step: ValidationStep): void`

Add a validation step.

```typescript
const pipeline = new ValidationPipeline({
  terminologyProvider: provider,
  failFast: false,
});

pipeline.addStep(new StructuralValidationStep());
pipeline.addStep(new TerminologyValidationStep());
pipeline.addStep(new InvariantValidationStep());
```

##### `validate(resource: any, profile: CanonicalProfile): Promise<PipelineResult>`

Validate a resource through the pipeline.

```typescript
const result = await pipeline.validate(resource, profile);
```

##### `validateBatch(entries: BatchEntry[]): Promise<BatchResult>`

Validate multiple resources in batch.

```typescript
const results = await pipeline.validateBatch([
  { resource: patient1, profile: patientProfile },
  { resource: patient2, profile: patientProfile },
]);
```

##### `on(event: string, handler: PipelineEventHandler): void`

Register event handler.

```typescript
pipeline.on('step:start', (data) => {
  console.log(`Starting step: ${data.stepName}`);
});

pipeline.on('step:complete', (data) => {
  console.log(`Completed step: ${data.stepName}`);
});
```

---

### Built-in Steps

#### `StructuralValidationStep`

Validates structural constraints (cardinality, types, required fields).

```typescript
pipeline.addStep(new StructuralValidationStep());
```

#### `TerminologyValidationStep`

Validates terminology bindings.

```typescript
pipeline.addStep(new TerminologyValidationStep());
```

#### `InvariantValidationStep`

Validates FHIRPath invariants.

```typescript
pipeline.addStep(new InvariantValidationStep());
```

---

### Functions

#### `generateReport(result: PipelineResult): ValidationReport`

Generate a structured validation report.

```typescript
const report = generateReport(result);
console.log(report.summary.totalIssues);
console.log(report.summary.errorCount);
```

#### `enhanceIssue(issue: ValidationIssue): EnhancedValidationIssue`

Enhance a validation issue with suggestions and documentation.

```typescript
const enhanced = enhanceIssue(issue);
console.log(enhanced.suggestion);
console.log(enhanced.documentationUrl);
```

---

## Definition Module

### Functions

#### `createRuntime(options?: RuntimeOptions): Promise<FhirRuntimeInstance>`

Create a complete FHIR runtime instance.

**Parameters:**
- `options.definitions` — DefinitionProvider or DefinitionRegistry from fhir-definition
- `options.terminologyProvider` — Optional TerminologyProvider
- `options.referenceResolver` — Optional ReferenceResolver

**Returns:** `FhirRuntimeInstance`

**Example:**
```typescript
// Pattern 1: With fhir-definition (recommended)
import { InMemoryDefinitionRegistry } from 'fhir-definition';
const registry = new InMemoryDefinitionRegistry();
const runtime = await createRuntime({ definitions: registry });

// Pattern 2: Bare minimum (auto-loads R4 core)
const runtime2 = await createRuntime();

// Pattern 3: With terminology provider
const runtime3 = await createRuntime({
  terminologyProvider: new InMemoryTerminologyProvider(),
});
```

---

### Classes

#### `DefinitionBridge`

Adapter between FhirContext and DefinitionProvider.

**Constructor:**
```typescript
constructor(
  context: FhirContext,
  options: DefinitionBridgeOptions
)
```

**Example:**
```typescript
const bridge = new DefinitionBridge(ctx, {
  valueSets: new Map(),
  codeSystems: new Map(),
  searchParameters: new Map(),
});
```

---

#### `DefinitionProviderLoader`

Adapter from DefinitionProvider to StructureDefinitionLoader.

**Constructor:**
```typescript
constructor(provider: DefinitionProvider)
```

**Example:**
```typescript
const loader = new DefinitionProviderLoader(definitionProvider);
const ctx = new FhirContextImpl({ loaders: [loader] });
```

---

#### `SnapshotCache`

LRU cache for generated snapshots with lazy loading.

**Constructor:**
```typescript
constructor(context: FhirContext, options?: { maxSize?: number; ttl?: number })
```

**Methods:**

##### `getOrGenerate(url: string): Promise<CanonicalProfile>`

Get cached snapshot or generate if not cached.

```typescript
const cache = new SnapshotCache(ctx, { maxSize: 100 });
const profile = await cache.getOrGenerate(profileUrl);
```

##### `warmupSnapshots(urls: string[]): Promise<void>`

Pre-generate and cache snapshots.

```typescript
await cache.warmupSnapshots([
  'http://hl7.org/fhir/StructureDefinition/Patient',
  'http://hl7.org/fhir/StructureDefinition/Observation',
]);
```

---

### Types

#### `FhirRuntimeInstance`

```typescript
interface FhirRuntimeInstance {
  context: FhirContext;
  validate(resource: any, profileUrl: string): Promise<ValidationResult>;
  validateMany(entries: BatchValidationOptions[]): Promise<BatchValidationResult[]>;
  getSearchParameters(resourceType: string): SearchParameter[];
  extractSearchValues(resource: any, searchParam: SearchParameter): SearchIndexValue[];
  extractReferences(resource: any): ReferenceInfo[];
}
```

#### `RuntimeOptions`

```typescript
interface RuntimeOptions {
  definitions?: DefinitionProvider | DefinitionRegistry;
  terminologyProvider?: TerminologyProvider;
  referenceResolver?: ReferenceResolver;
}
```

---

## Version Compatibility Matrix

| Module | v0.9.0 | v0.8.0 | v0.7.0 | v0.6.0 |
|--------|--------|--------|--------|--------|
| Parser | ✅ | ✅ | ✅ | ✅ |
| Model | ✅ | ✅ | ✅ | ✅ |
| Context | ✅ | ✅ | ✅ | ✅ |
| Profile | ✅ | ✅ | ✅ | ✅ |
| Validator | ✅ | ✅ | ✅ | ✅ |
| FHIRPath | ✅ | ✅ | ✅ | ✅ |
| Provider | ✅ | ✅ | ✅ | ❌ |
| Terminology | ✅ | ✅ | ✅ | ❌ |
| Package | ✅ | ✅ | ✅ | ✅ |
| Integration | ✅ | ✅ | ✅ | ❌ |
| Pipeline | ✅ | ✅ | ✅ | ❌ |
| Definition | ✅ | ✅ | ❌ | ❌ |

---

## Next Steps

- **[Integration Guide](./INTEGRATION-GUIDE.md)** — Setup and integration patterns
- **[Architecture Overview](./ARCHITECTURE-OVERVIEW.md)** — System design and internals
- **[Troubleshooting](./TROUBLESHOOTING.md)** — Common issues and solutions

---

**Need Help?**

- GitHub Issues: https://github.com/medxaidev/fhir-runtime/issues
- Documentation: https://github.com/medxaidev/fhir-runtime#readme
