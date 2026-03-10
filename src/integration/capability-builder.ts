/**
 * CapabilityStatement Builder
 *
 * Generates CapabilityStatement REST fragments from registered profiles
 * and SearchParameter definitions.
 *
 * @module integration
 */

import type { CanonicalProfile } from '../model/index.js';
import type {
  SearchParameter,
  CapabilityRestResource,
  CapabilitySearchParam,
  CapabilityStatementRest,
} from './types.js';

/**
 * Build a CapabilityStatement REST section from profiles and search parameters.
 *
 * Groups profiles by resource type and attaches applicable search parameters
 * to each resource entry.
 *
 * @param profiles - Canonical profiles to include
 * @param searchParams - Optional search parameters to attach
 * @param mode - REST mode ('server' or 'client'), defaults to 'server'
 */
export function buildCapabilityFragment(
  profiles: CanonicalProfile[],
  searchParams?: SearchParameter[],
  mode: 'server' | 'client' = 'server',
): CapabilityStatementRest {
  // Group profiles by resource type
  const typeMap = new Map<string, {
    baseProfile?: string;
    supportedProfiles: string[];
  }>();

  for (const profile of profiles) {
    if (profile.kind !== 'resource') continue;
    if (profile.abstract) continue;

    const resourceType = profile.type;

    if (!typeMap.has(resourceType)) {
      typeMap.set(resourceType, { supportedProfiles: [] });
    }

    const entry = typeMap.get(resourceType)!;

    // If this is the base FHIR definition (no derivation = constraint), use as profile
    if (!profile.derivation || profile.derivation === 'specialization') {
      entry.baseProfile = profile.url;
    } else {
      // constraint profiles are "supportedProfile"
      entry.supportedProfiles.push(profile.url);
    }
  }

  // Build search parameter index by resource type
  const spByType = new Map<string, SearchParameter[]>();
  if (searchParams) {
    for (const sp of searchParams) {
      if (sp.status !== 'active' && sp.status !== 'draft') continue;
      for (const base of sp.base) {
        if (!spByType.has(base)) {
          spByType.set(base, []);
        }
        spByType.get(base)!.push(sp);
      }
    }
  }

  // Build resource entries
  const resources: CapabilityRestResource[] = [];

  for (const [resourceType, info] of typeMap) {
    const entry: CapabilityRestResource = {
      type: resourceType,
    };

    if (info.baseProfile) {
      entry.profile = info.baseProfile;
    }

    if (info.supportedProfiles.length > 0) {
      entry.supportedProfile = info.supportedProfiles.sort();
    }

    // Attach search parameters
    const typeParams = spByType.get(resourceType) ?? [];
    const resourceParams = spByType.get('Resource') ?? [];
    const allParams = [...typeParams, ...resourceParams];

    if (allParams.length > 0) {
      // Deduplicate by code
      const seen = new Set<string>();
      const capParams: CapabilitySearchParam[] = [];

      for (const sp of allParams) {
        if (seen.has(sp.code)) continue;
        seen.add(sp.code);

        const capParam: CapabilitySearchParam = {
          name: sp.code,
          type: sp.type,
        };
        if (sp.url) capParam.definition = sp.url;
        if (sp.description) capParam.documentation = sp.description;
        capParams.push(capParam);
      }

      if (capParams.length > 0) {
        entry.searchParam = capParams.sort((a, b) => a.name.localeCompare(b.name));
      }
    }

    resources.push(entry);
  }

  // Sort resources by type name
  resources.sort((a, b) => a.type.localeCompare(b.type));

  return {
    mode,
    resource: resources,
  };
}
