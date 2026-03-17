# fhir-runtime API Reference — v0.10.0

**Version**: 0.10.0
**Date**: 2026-03-18
**Stage**: STAGE-7 — Profile Slicing & UI Utility API

---

## New Types (STAGE-7)

### SlicedElement

Profile-level slicing information for a sliced element path.

```typescript
interface SlicedElement {
  basePath: string;
  discriminators: SlicingDiscriminatorDef[];
  rules: SlicingRules;       // 'open' | 'closed' | 'openAtEnd'
  ordered: boolean;
  description?: string;
  slices: SliceDefinition[];
}
```

### SliceDefinition

A single named slice within a sliced element.

```typescript
interface SliceDefinition {
  id: string;                // e.g. "Observation.category:VSCat"
  sliceName: string;         // e.g. "VSCat"
  basePath: string;          // e.g. "Observation.category"
  min: number;
  max: number | 'unbounded';
  fixedValues: Record<string, unknown>;
  mustSupport: boolean;
  extensionUrl?: string;
  extensionProfile?: string;
}
```

### ChoiceTypeResolution

Result of resolving a choice type against a resource.

```typescript
interface ChoiceTypeResolution {
  baseName: string;
  availableTypes: string[];
  activeType: string | null;
  activeJsonKey: string | null;
}
```

---

## New on CanonicalProfile

### slicing

```typescript
interface CanonicalProfile {
  // ... existing fields ...
  slicing?: Map<string, SlicedElement>;
}
```

Populated by `buildCanonicalProfile()`. Keyed by base element path (e.g. `"Observation.category"`).

---

## Slicing Utilities

### matchSlice

```typescript
function matchSlice(
  instance: Record<string, unknown>,
  slicedElement: SlicedElement,
): string | null;
```

Match an instance to a slice definition using discriminator matching. Returns the matching `sliceName` or `null`.

**Supported discriminator types**: `value`, `pattern`, `exists`.

### countSliceInstances

```typescript
function countSliceInstances(
  items: ReadonlyArray<Record<string, unknown>>,
  slicedElement: SlicedElement,
): Map<string, number>;
```

Count how many items match each slice definition. Returns a Map from slice name to count.

### generateSliceSkeleton

```typescript
function generateSliceSkeleton(
  slice: SliceDefinition,
): Record<string, unknown>;
```

Generate a skeleton object pre-filled with discriminator values. For extension slices, returns `{ url: "<extensionUrl>" }`.

### isExtensionSlicing

```typescript
function isExtensionSlicing(basePath: string): boolean;
```

Returns `true` if the path ends with `.extension` or `.modifierExtension`.

---

## Choice Type Utilities

### isChoiceType

```typescript
function isChoiceType(element: CanonicalElement): boolean;
```

Returns `true` if the element path ends with `[x]` and has more than one type.

### getChoiceBaseName

```typescript
function getChoiceBaseName(elementPath: string): string;
```

Extract the base name: `"Observation.value[x]"` → `"value"`.

### buildChoiceJsonKey

```typescript
function buildChoiceJsonKey(baseName: string, typeCode: string): string;
```

Build the JSON key: `("value", "Quantity")` → `"valueQuantity"`.

### parseChoiceJsonKey

```typescript
function parseChoiceJsonKey(jsonKey: string, baseName: string): string | null;
```

Parse a JSON key to extract the type code: `("valueQuantity", "value")` → `"Quantity"`.

### resolveActiveChoiceType

```typescript
function resolveActiveChoiceType(
  element: CanonicalElement,
  resource: Record<string, unknown>,
): ChoiceTypeResolution;
```

Scan a resource to find which choice variant is active.

### resolveChoiceFromJsonKey

```typescript
function resolveChoiceFromJsonKey(
  jsonKey: string,
  elements: Map<string, CanonicalElement>,
): { element: CanonicalElement; typeCode: string } | null;
```

Reverse-resolve a JSON key to find its choice element and type code.

---

## BackboneElement Utilities

### isBackboneElement

```typescript
function isBackboneElement(element: CanonicalElement): boolean;
```

Returns `true` if the element has no types or has `BackboneElement` type.

### isArrayElement

```typescript
function isArrayElement(element: CanonicalElement): boolean;
```

Returns `true` if `max > 1` or `max === 'unbounded'`.

### getBackboneChildren

```typescript
function getBackboneChildren(
  parentPath: string,
  profile: CanonicalProfile,
): CanonicalElement[];
```

Get direct children of a backbone element, filtering out `id`, `extension`, `modifierExtension`.

---

## Bug Fixes

### inferComplexType improvement

Improved ContactPoint vs Identifier disambiguation in `inferComplexType()`:
- Identifier-specific fields (`type`, `assigner`) checked first
- `mobile` use value is ContactPoint-only
- URI-format `system` with overlapping `use` values resolves to Identifier

---

## Compatibility Notes

- All new APIs are additive — no breaking changes
- `CanonicalProfile.slicing` is optional
- `buildCanonicalProfile()` no longer lets slice elements overwrite base elements
- Previous API: `docs/api/fhir-runtime-api-v0.9.md`
