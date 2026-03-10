/**
 * Integration Module — Type Definitions
 *
 * Defines types for SearchParameter parsing, search value extraction,
 * reference extraction, CapabilityStatement generation, and resource
 * type registry.
 *
 * @module integration
 */

// =============================================================================
// SearchParameter Types
// =============================================================================

/**
 * FHIR SearchParameter type codes.
 * @see https://hl7.org/fhir/R4/valueset-search-param-type.html
 */
export type SearchParamType =
  | 'number'
  | 'date'
  | 'string'
  | 'token'
  | 'reference'
  | 'composite'
  | 'quantity'
  | 'uri'
  | 'special';

/**
 * Parsed FHIR SearchParameter resource.
 * @see https://hl7.org/fhir/R4/searchparameter.html
 */
export interface SearchParameter {
  resourceType: 'SearchParameter';
  id?: string;
  url: string;
  name: string;
  status: 'draft' | 'active' | 'retired' | 'unknown';
  description?: string;
  code: string;
  base: string[];
  type: SearchParamType;
  expression?: string;
  target?: string[];
  multipleOr?: boolean;
  multipleAnd?: boolean;
  modifier?: string[];
  chain?: string[];
  version?: string;
}

// =============================================================================
// Search Value Extraction Types
// =============================================================================

/**
 * A single extracted search index value.
 */
export type SearchIndexValue =
  | { type: 'string'; value: string }
  | { type: 'token'; system?: string; code: string; display?: string }
  | { type: 'reference'; reference: string; resourceType?: string; id?: string }
  | { type: 'date'; value: string }
  | { type: 'number'; value: number }
  | { type: 'quantity'; value: number; unit?: string; system?: string; code?: string }
  | { type: 'uri'; value: string };

/**
 * Search index entry for a single SearchParameter applied to a resource.
 */
export interface SearchIndexEntry {
  /** SearchParameter code (e.g., 'name', 'birthdate'). */
  code: string;
  /** SearchParameter type. */
  type: SearchParamType;
  /** Extracted values. */
  values: SearchIndexValue[];
}

// =============================================================================
// Reference Extraction Types
// =============================================================================

/**
 * Classification of a FHIR Reference.
 */
export type ReferenceType = 'literal' | 'logical' | 'contained' | 'absolute';

/**
 * Information about a single Reference found in a resource.
 */
export interface ReferenceInfo {
  /** Element path containing the Reference (e.g., 'Patient.managingOrganization'). */
  path: string;
  /** Reference value (e.g., 'Organization/123'). */
  reference: string;
  /** Target resource type, if inferrable. */
  targetType?: string;
  /** Reference classification. */
  referenceType: ReferenceType;
  /** Target resource ID, if inferrable. */
  targetId?: string;
  /** Display value. */
  display?: string;
}

// =============================================================================
// CapabilityStatement Types
// =============================================================================

/**
 * A search parameter entry in a CapabilityStatement REST resource.
 */
export interface CapabilitySearchParam {
  name: string;
  type: SearchParamType;
  definition?: string;
  documentation?: string;
}

/**
 * A resource entry in a CapabilityStatement REST section.
 */
export interface CapabilityRestResource {
  type: string;
  profile?: string;
  supportedProfile?: string[];
  searchParam?: CapabilitySearchParam[];
}

/**
 * A REST section of a CapabilityStatement.
 */
export interface CapabilityStatementRest {
  mode: 'server' | 'client';
  resource: CapabilityRestResource[];
}

// =============================================================================
// Resource Type Registry Types
// =============================================================================

/**
 * Information about a registered FHIR resource type.
 */
export interface ResourceTypeInfo {
  /** Resource type name (e.g., 'Patient'). */
  type: string;
  /** Canonical URL (e.g., 'http://hl7.org/fhir/StructureDefinition/Patient'). */
  url: string;
  /** StructureDefinition kind. */
  kind: string;
  /** Whether the resource type is abstract. */
  abstract: boolean;
  /** Base definition URL, if any. */
  baseDefinition?: string;
}
