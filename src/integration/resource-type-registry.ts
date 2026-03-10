/**
 * Resource Type Registry
 *
 * Maintains a registry of known FHIR resource types with metadata.
 * Can be populated manually or auto-built from a FhirContext.
 *
 * @module integration
 */

import type { FhirContext } from '../context/types.js';
import type { ResourceTypeInfo } from './types.js';

/**
 * Registry of known FHIR resource types.
 */
export class ResourceTypeRegistry {
  private readonly registry = new Map<string, ResourceTypeInfo>();

  /**
   * Register a resource type.
   */
  register(info: ResourceTypeInfo): void {
    this.registry.set(info.type, info);
  }

  /**
   * Get resource type info by type name.
   */
  get(type: string): ResourceTypeInfo | undefined {
    return this.registry.get(type);
  }

  /**
   * Check if a resource type is known.
   */
  isKnown(type: string): boolean {
    return this.registry.has(type);
  }

  /**
   * Get all registered resource types.
   */
  getAll(): ResourceTypeInfo[] {
    return Array.from(this.registry.values());
  }

  /**
   * Get all non-abstract resource types.
   */
  getConcreteTypes(): ResourceTypeInfo[] {
    return Array.from(this.registry.values()).filter(info => !info.abstract);
  }

  /**
   * Get the count of registered resource types.
   */
  get size(): number {
    return this.registry.size;
  }

  /**
   * Remove a resource type from the registry.
   */
  remove(type: string): boolean {
    return this.registry.delete(type);
  }

  /**
   * Clear all registered resource types.
   */
  clear(): void {
    this.registry.clear();
  }

  /**
   * Build a ResourceTypeRegistry from a FhirContext.
   *
   * Iterates over all StructureDefinitions in the context that have
   * kind 'resource' and creates ResourceTypeInfo entries.
   */
  static fromContext(context: FhirContext): ResourceTypeRegistry {
    const registry = new ResourceTypeRegistry();

    // The FhirContext exposes getStructureDefinition for known URLs.
    // We use the known core resource list to populate the registry.
    const coreResourceTypes = FHIR_R4_RESOURCE_TYPES;

    for (const type of coreResourceTypes) {
      const url = `http://hl7.org/fhir/StructureDefinition/${type}`;
      const sd = context.getStructureDefinition(url);

      if (sd) {
        registry.register({
          type: sd.type ?? type,
          url: sd.url ?? url,
          kind: sd.kind ?? 'resource',
          abstract: sd.abstract ?? false,
          baseDefinition: sd.baseDefinition,
        });
      }
    }

    return registry;
  }

  /**
   * Build a ResourceTypeRegistry from a static list (no context needed).
   */
  static fromList(types: ResourceTypeInfo[]): ResourceTypeRegistry {
    const registry = new ResourceTypeRegistry();
    for (const info of types) {
      registry.register(info);
    }
    return registry;
  }
}

/**
 * Complete list of FHIR R4 resource types.
 * @see https://hl7.org/fhir/R4/resourcelist.html
 */
export const FHIR_R4_RESOURCE_TYPES: readonly string[] = [
  'Account', 'ActivityDefinition', 'AdverseEvent', 'AllergyIntolerance',
  'Appointment', 'AppointmentResponse', 'AuditEvent', 'Basic',
  'Binary', 'BiologicallyDerivedProduct', 'BodyStructure', 'Bundle',
  'CapabilityStatement', 'CarePlan', 'CareTeam', 'CatalogEntry',
  'ChargeItem', 'ChargeItemDefinition', 'Claim', 'ClaimResponse',
  'ClinicalImpression', 'CodeSystem', 'Communication', 'CommunicationRequest',
  'CompartmentDefinition', 'Composition', 'ConceptMap', 'Condition',
  'Consent', 'Contract', 'Coverage', 'CoverageEligibilityRequest',
  'CoverageEligibilityResponse', 'DetectedIssue', 'Device', 'DeviceDefinition',
  'DeviceMetric', 'DeviceRequest', 'DeviceUseStatement', 'DiagnosticReport',
  'DocumentManifest', 'DocumentReference', 'DomainResource', 'EffectEvidenceSynthesis',
  'Encounter', 'Endpoint', 'EnrollmentRequest', 'EnrollmentResponse',
  'EpisodeOfCare', 'EventDefinition', 'Evidence', 'EvidenceVariable',
  'ExampleScenario', 'ExplanationOfBenefit', 'FamilyMemberHistory', 'Flag',
  'Goal', 'GraphDefinition', 'Group', 'GuidanceResponse',
  'HealthcareService', 'ImagingStudy', 'Immunization', 'ImmunizationEvaluation',
  'ImmunizationRecommendation', 'ImplementationGuide', 'InsurancePlan', 'Invoice',
  'Library', 'Linkage', 'List', 'Location',
  'Measure', 'MeasureReport', 'Media', 'Medication',
  'MedicationAdministration', 'MedicationDispense', 'MedicationKnowledge', 'MedicationRequest',
  'MedicationStatement', 'MedicinalProduct', 'MedicinalProductAuthorization',
  'MedicinalProductContraindication', 'MedicinalProductIndication', 'MedicinalProductIngredient',
  'MedicinalProductInteraction', 'MedicinalProductManufactured', 'MedicinalProductPackaged',
  'MedicinalProductPharmaceutical', 'MedicinalProductUndesirableEffect', 'MessageDefinition',
  'MessageHeader', 'MolecularSequence', 'NamingSystem', 'NutritionOrder',
  'Observation', 'ObservationDefinition', 'OperationDefinition', 'OperationOutcome',
  'Organization', 'OrganizationAffiliation', 'Parameters', 'Patient',
  'PaymentNotice', 'PaymentReconciliation', 'Person', 'PlanDefinition',
  'Practitioner', 'PractitionerRole', 'Procedure', 'Provenance',
  'Questionnaire', 'QuestionnaireResponse', 'RelatedPerson', 'RequestGroup',
  'ResearchDefinition', 'ResearchElementDefinition', 'ResearchStudy', 'ResearchSubject',
  'Resource', 'RiskAssessment', 'RiskEvidenceSynthesis', 'Schedule',
  'SearchParameter', 'ServiceRequest', 'Slot', 'Specimen',
  'SpecimenDefinition', 'StructureDefinition', 'StructureMap', 'Subscription',
  'Substance', 'SubstanceNucleicAcid', 'SubstancePolymer', 'SubstanceProtein',
  'SubstanceReferenceInformation', 'SubstanceSourceMaterial', 'SubstanceSpecification',
  'SupplyDelivery', 'SupplyRequest', 'Task', 'TerminologyCapabilities',
  'TestReport', 'TestScript', 'ValueSet', 'VerificationResult', 'VisionPrescription',
];
