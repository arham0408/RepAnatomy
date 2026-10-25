import type { Atlas, Concept, SystemId } from "./anatomy.ts";
import type {
  AnatomicalMention,
  MappingConfidence,
  MappingRelationship,
  MedicalFinding,
  VerifiedAnatomyTarget,
} from "./medical-types.ts";

/**
 * Curated registry mapping verified medical conditions and clinical terms
 * to canonical anatomical concepts and known aliases.
 */
interface ConditionRegistryEntry {
  canonicalTerm: string;
  associatedOrgan: string;
  lateralitySupport: boolean;
  system: SystemId;
  description: string;
  rationale: string;
}

export const CONDITION_REGISTRY: Record<string, ConditionRegistryEntry> = {
  // Gallbladder & Biliary
  cholelithiasis: {
    canonicalTerm: "gallbladder",
    associatedOrgan: "gallbladder",
    lateralitySupport: false,
    system: "digestive",
    description: "Formation of gallstones inside the gallbladder.",
    rationale: "Cholelithiasis is pathology of the gallbladder lumen and wall.",
  },
  gallstones: {
    canonicalTerm: "gallbladder",
    associatedOrgan: "gallbladder",
    lateralitySupport: false,
    system: "digestive",
    description: "Hardened deposits of digestive fluid inside the gallbladder.",
    rationale: "Calculi located within the gallbladder.",
  },
  cholecystitis: {
    canonicalTerm: "gallbladder",
    associatedOrgan: "gallbladder",
    lateralitySupport: false,
    system: "digestive",
    description: "Inflammation of the gallbladder wall, typically following cystic duct obstruction.",
    rationale: "Inflammatory condition of the gallbladder.",
  },
  "biliary colic": {
    canonicalTerm: "gallbladder",
    associatedOrgan: "gallbladder",
    lateralitySupport: false,
    system: "digestive",
    description: "Abdominal pain resulting from temporary gallbladder duct obstruction.",
    rationale: "Pain referred from gallbladder contractility against obstruction.",
  },

  // Kidneys & Urinary
  nephrolithiasis: {
    canonicalTerm: "kidney",
    associatedOrgan: "kidney",
    lateralitySupport: true,
    system: "urinary",
    description: "Kidney stones (renal calculi) formed in the renal parenchyma or collecting system.",
    rationale: "Mineral calculi forming within renal calyces and pelvis.",
  },
  "renal calculus": {
    canonicalTerm: "kidney",
    associatedOrgan: "kidney",
    lateralitySupport: true,
    system: "urinary",
    description: "Kidney stone located in the renal tissue or collecting system.",
    rationale: "Direct renal calculus finding.",
  },
  "kidney stone": {
    canonicalTerm: "kidney",
    associatedOrgan: "kidney",
    lateralitySupport: true,
    system: "urinary",
    description: "Concretion formed in the kidneys from mineral deposits.",
    rationale: "Direct renal calculus finding.",
  },
  hydronephrosis: {
    canonicalTerm: "kidney",
    associatedOrgan: "kidney",
    lateralitySupport: true,
    system: "urinary",
    description: "Dilation of the renal pelvis and calyces due to obstruction of urine flow.",
    rationale: "Distension of the kidney collecting system.",
  },
  "renal cyst": {
    canonicalTerm: "kidney",
    associatedOrgan: "kidney",
    lateralitySupport: true,
    system: "urinary",
    description: "Fluid-filled sac originating in renal cortex or medulla.",
    rationale: "Structural lesion of the kidney.",
  },
  cystitis: {
    canonicalTerm: "urinary bladder",
    associatedOrgan: "urinary bladder",
    lateralitySupport: false,
    system: "urinary",
    description: "Inflammation of the urinary bladder.",
    rationale: "Inflammatory condition of the urinary bladder mucosa.",
  },

  // Liver
  hepatomegaly: {
    canonicalTerm: "liver",
    associatedOrgan: "liver",
    lateralitySupport: false,
    system: "digestive",
    description: "Enlargement of the liver beyond normal anatomical dimensions.",
    rationale: "Direct morphological alteration of the liver.",
  },
  "hepatic steatosis": {
    canonicalTerm: "liver",
    associatedOrgan: "liver",
    lateralitySupport: false,
    system: "digestive",
    description: "Fat accumulation within hepatocytes (fatty liver).",
    rationale: "Parenchymal condition of the liver.",
  },
  "fatty liver": {
    canonicalTerm: "liver",
    associatedOrgan: "liver",
    lateralitySupport: false,
    system: "digestive",
    description: "Accumulation of triglycerides in liver cells.",
    rationale: "Parenchymal condition of the liver.",
  },
  cirrhosis: {
    canonicalTerm: "liver",
    associatedOrgan: "liver",
    lateralitySupport: false,
    system: "digestive",
    description: "Fibrotic remodeling and architectural distortion of liver parenchyma.",
    rationale: "Chronic progressive condition of the liver.",
  },

  // Appendix
  appendicitis: {
    canonicalTerm: "appendix",
    associatedOrgan: "appendix",
    lateralitySupport: false,
    system: "digestive",
    description: "Acute inflammation of the vermiform appendix.",
    rationale: "Inflammatory disorder of the vermiform appendix.",
  },
  appendicolith: {
    canonicalTerm: "appendix",
    associatedOrgan: "appendix",
    lateralitySupport: false,
    system: "digestive",
    description: "Calcified fecal deposit inside the appendiceal lumen.",
    rationale: "Calculus inside the appendix.",
  },

  // Stomach
  gastritis: {
    canonicalTerm: "stomach",
    associatedOrgan: "stomach",
    lateralitySupport: false,
    system: "digestive",
    description: "Inflammation, irritation, or erosion of the stomach lining.",
    rationale: "Mucosal inflammation of the stomach.",
  },
  "peptic ulcer": {
    canonicalTerm: "stomach",
    associatedOrgan: "stomach",
    lateralitySupport: false,
    system: "digestive",
    description: "Sore that develops on the mucosal lining of the stomach or proximal duodenum.",
    rationale: "Ulcerative lesion of the stomach or duodenum.",
  },

  // Spleen
  splenomegaly: {
    canonicalTerm: "spleen",
    associatedOrgan: "spleen",
    lateralitySupport: false,
    system: "lymphatic",
    description: "Enlargement of the spleen.",
    rationale: "Direct morphological enlargement of the spleen.",
  },

  // Pancreas
  pancreatitis: {
    canonicalTerm: "pancreas",
    associatedOrgan: "pancreas",
    lateralitySupport: false,
    system: "digestive",
    description: "Inflammation of the pancreas with acinar cell injury.",
    rationale: "Inflammatory condition of the pancreas.",
  },

  // Lungs & Respiratory
  pneumonia: {
    canonicalTerm: "lung",
    associatedOrgan: "lung",
    lateralitySupport: true,
    system: "respiratory",
    description: "Infection that inflames air sacs in one or both lungs, filling them with fluid or pus.",
    rationale: "Parenchymal alveolar consolidation in the lung.",
  },
  "pulmonary consolidation": {
    canonicalTerm: "lung",
    associatedOrgan: "lung",
    lateralitySupport: true,
    system: "respiratory",
    description: "Region of lung tissue that has filled with liquid instead of air.",
    rationale: "Alveolar airspace filling of the lung.",
  },
  "pulmonary infiltrate": {
    canonicalTerm: "lung",
    associatedOrgan: "lung",
    lateralitySupport: true,
    system: "respiratory",
    description: "Substance denser than air, such as pus, blood, or protein, lingering within the parenchyma of the lungs.",
    rationale: "Radiographic opacity within lung parenchyma.",
  },
  "pleural effusion": {
    canonicalTerm: "lung",
    associatedOrgan: "lung",
    lateralitySupport: true,
    system: "respiratory",
    description: "Excess fluid accumulation between the layers of the pleura outside the lungs.",
    rationale: "Fluid collection adjacent to the visceral and parietal pleura.",
  },

  // Heart & Cardiovascular
  cardiomegaly: {
    canonicalTerm: "heart",
    associatedOrgan: "heart",
    lateralitySupport: false,
    system: "cardiac",
    description: "Enlargement of the cardiac silhouette or chambers.",
    rationale: "Direct enlargement of cardiac muscle or cavity volume.",
  },
  "myocardial infarction": {
    canonicalTerm: "heart",
    associatedOrgan: "heart",
    lateralitySupport: false,
    system: "cardiac",
    description: "Ischemia and necrosis of heart muscle tissue due to compromised coronary blood supply.",
    rationale: "Ischemic pathology of the myocardium.",
  },
  "pericardial effusion": {
    canonicalTerm: "heart",
    associatedOrgan: "heart",
    lateralitySupport: false,
    system: "cardiac",
    description: "Accumulation of excess fluid in the pericardial cavity surrounding the heart.",
    rationale: "Fluid collection around the heart.",
  },

  // Brain & Nervous
  "ischemic stroke": {
    canonicalTerm: "brain",
    associatedOrgan: "brain",
    lateralitySupport: false,
    system: "nervous",
    description: "Loss of blood supply to part of the brain leading to tissue damage.",
    rationale: "Vascular territory infarct in brain tissue.",
  },
  "cerebral infarction": {
    canonicalTerm: "brain",
    associatedOrgan: "brain",
    lateralitySupport: false,
    system: "nervous",
    description: "Ischemic necrosis of brain tissue.",
    rationale: "Ischemic necrosis of cerebral parenchyma.",
  },
  "intracranial hemorrhage": {
    canonicalTerm: "brain",
    associatedOrgan: "brain",
    lateralitySupport: false,
    system: "nervous",
    description: "Bleeding inside the skull or brain tissue.",
    rationale: "Hemorrhagic lesion within the cranial vault.",
  },

  // Reproductive / Pelvis
  prostatomegaly: {
    canonicalTerm: "prostate",
    associatedOrgan: "prostate",
    lateralitySupport: false,
    system: "reproductive",
    description: "Enlargement of the prostate gland.",
    rationale: "Glandular hypertrophy of the prostate.",
  },
  "uterine fibroid": {
    canonicalTerm: "uterus",
    associatedOrgan: "uterus",
    lateralitySupport: false,
    system: "reproductive",
    description: "Benign smooth muscle neoplasm (leiomyoma) in the uterine myometrium.",
    rationale: "Myometrial lesion of the uterus.",
  },
  "ovarian cyst": {
    canonicalTerm: "ovary",
    associatedOrgan: "ovary",
    lateralitySupport: true,
    system: "reproductive",
    description: "Fluid-filled sac within or on the surface of an ovary.",
    rationale: "Adnexal cystic lesion of the ovary.",
  },

  // Musculoskeletal
  "femur fracture": {
    canonicalTerm: "femur",
    associatedOrgan: "femur",
    lateralitySupport: true,
    system: "skeletal",
    description: "Structural break in the femur bone.",
    rationale: "Disruption of bony continuity of the femur.",
  },
};

/** Synonyms mapping colloquial / clinical variations to canonical anatomical structures */
export const SYNONYM_MAP: Record<string, string> = {
  "gall bladder": "gallbladder",
  "urinary bladder": "urinary bladder",
  bladder: "urinary bladder",
  kidneys: "kidney",
  renal: "kidney",
  hepatic: "liver",
  pulmonary: "lung",
  lungs: "lung",
  cardiac: "heart",
  cerebral: "brain",
  cerebrum: "brain",
  splenic: "spleen",
  gastric: "stomach",
  vermiform: "appendix",
  thighbone: "femur",
  adrenal: "adrenal gland",
  "suprarenal gland": "adrenal gland",
};

/**
 * Normalizes an anatomical term or condition string.
 */
export function normalizeMedicalTerm(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves an anatomical term or condition against the loaded 3D Atlas.
 * Implements the 5-tier verification hierarchy:
 * 1. Curated exact condition registry match.
 * 2. Exact concept name match in loaded Atlas.
 * 3. Verified synonym / anatomical alias match.
 * 4. Clinically reviewed condition-to-structure mapping.
 * 5. Unresolved / structure unavailable in model.
 */
export function resolveAnatomyTarget(
  rawTerm: string,
  atlas: Atlas,
  options?: {
    laterality?: "left" | "right" | "bilateral" | "unspecified";
    isCondition?: boolean;
    relationshipTypeOverride?: MappingRelationship;
  },
): VerifiedAnatomyTarget | null {
  const norm = normalizeMedicalTerm(rawTerm);
  if (!norm) return null;

  const lat = options?.laterality ?? "unspecified";

  // Check 1: Curated Condition Registry
  const conditionMatch = CONDITION_REGISTRY[norm];
  if (conditionMatch) {
    const organTerm = conditionMatch.associatedOrgan;
    const target = resolveOrganConcept(organTerm, atlas, lat, "condition_associated", "curated_condition_registry");
    if (target) return target;
  }

  // Check 2: Direct concept lookup (with laterality if applicable)
  const directTarget = resolveOrganConcept(norm, atlas, lat, options?.relationshipTypeOverride ?? "direct", "exact_concept_match");
  if (directTarget) return directTarget;

  // Check 3: Check synonym dictionary
  const synonym = SYNONYM_MAP[norm];
  if (synonym) {
    const synTarget = resolveOrganConcept(synonym, atlas, lat, options?.relationshipTypeOverride ?? "direct", "synonym_alias");
    if (synTarget) return synTarget;
  }

  // Check 4: Check if any condition key is a substring or vice versa
  for (const [condKey, entry] of Object.entries(CONDITION_REGISTRY)) {
    if (norm.includes(condKey) || condKey.includes(norm)) {
      const subTarget = resolveOrganConcept(entry.associatedOrgan, atlas, lat, "condition_associated", "condition_keyword_match");
      if (subTarget) return subTarget;
    }
  }

  // Check 5: Partial match against loaded concepts
  const partial = findBestConceptMatch(norm, atlas, lat);
  if (partial) return partial;

  // Unresolved structure - determine if it is known to medicine but unavailable in current model
  return createUnavailableTarget(rawTerm, lat);
}

/**
 * Searches for a concept representing the organ in the loaded atlas.
 */
function resolveOrganConcept(
  organName: string,
  atlas: Atlas,
  laterality: "left" | "right" | "bilateral" | "unspecified",
  relationship: MappingRelationship,
  source: string,
): VerifiedAnatomyTarget | null {
  const normOrgan = organName.toLowerCase();
  const concepts = atlas.concepts;

  // If laterality is specified and organ supports it, try resolving lateral concept first
  if (laterality === "left" || laterality === "right") {
    const lateralName = `${laterality} ${normOrgan}`;
    const latConcept = concepts.find((c) => c.name.toLowerCase() === lateralName);
    if (latConcept && hasValidParts(latConcept, atlas)) {
      return buildVerifiedTarget(latConcept, atlas, relationship, "verified", source, laterality);
    }
  }

  // Try exact concept name
  const exactConcept = concepts.find((c) => c.name.toLowerCase() === normOrgan);
  if (exactConcept && hasValidParts(exactConcept, atlas)) {
    return buildVerifiedTarget(exactConcept, atlas, relationship, "verified", source, laterality);
  }

  // Check HRA female prefixed concepts e.g. "HRA:VH_F_uterus" or "HRA:VH_F_ovary"
  const hraConcept = concepts.find(
    (c) =>
      c.id.toLowerCase().includes(normOrgan) ||
      c.name.toLowerCase() === normOrgan,
  );
  if (hraConcept && hasValidParts(hraConcept, atlas)) {
    return buildVerifiedTarget(hraConcept, atlas, relationship, "verified", `${source}_hra`, laterality);
  }

  // Fallback: search parts directly if concept not found
  const matchingParts = atlas.parts.filter(
    (p) => p.name.toLowerCase() === normOrgan || p.name.toLowerCase().startsWith(normOrgan),
  );
  if (matchingParts.length > 0) {
    const first = matchingParts[0];
    return {
      targetId: first.conceptId || first.id,
      conceptId: first.conceptId,
      name: first.name,
      system: first.system,
      partIds: matchingParts.map((p) => p.id),
      relationshipType: relationship,
      confidence: "probable",
      laterality,
      source: `${source}_part_fallback`,
      availableInModel: true,
    };
  }

  return null;
}

/**
 * Checks if a concept has at least one part currently present in the atlas.
 */
function hasValidParts(concept: Concept, atlas: Atlas): boolean {
  if (!concept.elements || concept.elements.length === 0) return false;
  const partIds = new Set(atlas.parts.map((p) => p.id));
  return concept.elements.some((id) => partIds.has(id));
}

/**
 * Finds the best partial match concept in the atlas.
 */
function findBestConceptMatch(
  norm: string,
  atlas: Atlas,
  laterality: "left" | "right" | "bilateral" | "unspecified",
): VerifiedAnatomyTarget | null {
  // Look for exact word boundary match
  const regex = new RegExp(`\\b${norm}\\b`, "i");
  const candidates = atlas.concepts.filter((c) => regex.test(c.name) && hasValidParts(c, atlas));

  if (candidates.length > 0) {
    // Sort by shortest name (closest match to primary structure)
    candidates.sort((a, b) => a.name.length - b.name.length);
    const best = candidates[0];
    return buildVerifiedTarget(best, atlas, "direct", "probable", "word_boundary_match", laterality);
  }

  return null;
}

/**
 * Constructs a VerifiedAnatomyTarget from a Concept and Atlas.
 */
function buildVerifiedTarget(
  concept: Concept,
  atlas: Atlas,
  relationshipType: MappingRelationship,
  confidence: MappingConfidence,
  source: string,
  laterality: "left" | "right" | "bilateral" | "unspecified",
): VerifiedAnatomyTarget {
  // Find system from the first matching part
  const partMap = new Map(atlas.parts.map((p) => [p.id, p]));
  const validPartIds = concept.elements.filter((id) => partMap.has(id));
  const firstPart = partMap.get(validPartIds[0]);
  const system: SystemId = firstPart?.system ?? "digestive";

  return {
    targetId: concept.id,
    conceptId: concept.id,
    name: concept.name,
    system,
    partIds: validPartIds,
    relationshipType,
    confidence,
    laterality,
    source,
    availableInModel: validPartIds.length > 0,
  };
}

/**
 * Creates an unresolved/unavailable target record for structures not present in the current model.
 */
function createUnavailableTarget(
  rawTerm: string,
  laterality: "left" | "right" | "bilateral" | "unspecified",
): VerifiedAnatomyTarget {
  return {
    targetId: `unresolved_${normalizeMedicalTerm(rawTerm)}`,
    name: rawTerm,
    system: "connective",
    partIds: [],
    relationshipType: "unresolved",
    confidence: "unresolved",
    laterality,
    source: "unmapped_or_absent_from_model",
    availableInModel: false,
  };
}

/**
 * Deduplicates findings so that each verified target organ is represented cleanly,
 * prioritizing confirmed/abnormal findings and merging duplicate references.
 */
export function deduplicateFindingsByTarget(findings: MedicalFinding[]): MedicalFinding[] {
  const organMap = new Map<string, MedicalFinding[]>();
  const unmapped: MedicalFinding[] = [];

  for (const f of findings) {
    if (f.verifiedTargets.length > 0) {
      // Group by the primary target's ID
      const primaryTargetId = f.verifiedTargets[0].targetId;
      const group = organMap.get(primaryTargetId) || [];
      group.push(f);
      organMap.set(primaryTargetId, group);
    } else {
      unmapped.push(f);
    }
  }

  const result: MedicalFinding[] = [];

  for (const group of organMap.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }

    // Rank: abnormal findings (present + condition) > measurement > present > ruled out
    group.sort((a, b) => {
      const aScore =
        (a.negation === "present" && a.condition ? 4 : 0) +
        (a.measurement ? 2 : 0) +
        (a.negation === "present" ? 1 : 0);
      const bScore =
        (b.negation === "present" && b.condition ? 4 : 0) +
        (b.measurement ? 2 : 0) +
        (b.negation === "present" ? 1 : 0);
      return bScore - aScore;
    });

    const primary = { ...group[0] };
    const extraDetails = group
      .slice(1)
      .map((g) => g.observation || g.reportPhrase)
      .filter((obs) => obs && !primary.observation.toLowerCase().includes(obs.toLowerCase().slice(0, 15)));

    if (extraDetails.length > 0) {
      primary.observation = `${primary.observation} (Also noted: ${extraDetails.join("; ")})`;
    }

    // Merge complementary explanations
    for (const g of group.slice(1)) {
      if (g.explanation && !primary.explanation.toLowerCase().includes(g.term.toLowerCase())) {
        primary.explanation = `${primary.explanation} Note: ${g.explanation}`;
      }
    }

    // Combine all verified targets across the group
    const allTargetsMap = new Map<string, VerifiedAnatomyTarget>();
    for (const item of group) {
      for (const t of item.verifiedTargets) {
        allTargetsMap.set(t.targetId, t);
      }
    }
    primary.verifiedTargets = Array.from(allTargetsMap.values());

    result.push(primary);
  }

  // Deduplicate unmapped findings by normalized term
  const seenTerms = new Set<string>();
  for (const u of unmapped) {
    const termKey = u.term.toLowerCase().trim();
    if (!seenTerms.has(termKey)) {
      seenTerms.add(termKey);
      result.push(u);
    }
  }

  return result;
}

/**
 * Section 9 (availability filter): a finding is anatomy-linked / visualizable only
 * when it has at least one verified target that is present in the loaded model
 * and maps to real, renderable mesh IDs. Findings without such a target never
 * get a fake mesh — they are excluded from the linked card list but preserved
 * in the full report data.
 */
export function isVisualizableFinding(finding: MedicalFinding): boolean {
  return finding.verifiedTargets.some(
    (t) => t.availableInModel && t.partIds.length > 0,
  );
}

/**
 * Splits findings into anatomy-linked (visualizable) and not-visualizable lists.
 */
export function splitFindingsByAvailability(findings: MedicalFinding[]): {
  visualizable: MedicalFinding[];
  notVisualizable: MedicalFinding[];
} {
  const visualizable = findings.filter(isVisualizableFinding);
  const notVisualizable = findings.filter((f) => !isVisualizableFinding(f));
  return { visualizable, notVisualizable };
}

/**
 * Maps an array of raw findings from report analysis to verified targets in the loaded atlas.
 */
export function enrichFindingsWithAtlas(findings: MedicalFinding[], atlas: Atlas): MedicalFinding[] {
  const enriched = findings.map((finding) => {
    const verifiedTargets: VerifiedAnatomyTarget[] = [];
    const warnings: string[] = [...(finding.warnings || [])];

    // 1. Process explicit anatomical mentions (support both camelCase and snake_case)
    const rawMentions: AnatomicalMention[] =
      finding.anatomicalMentions ||
      (finding as unknown as { anatomical_mentions?: AnatomicalMention[] }).anatomical_mentions ||
      [];

    const enrichedMentions: AnatomicalMention[] = rawMentions.map((mention) => {
      const target = resolveAnatomyTarget(mention.term, atlas, {
        laterality: mention.laterality || finding.laterality,
        relationshipTypeOverride: "direct",
      });

      if (target && target.availableInModel) {
        verifiedTargets.push(target);
        return {
          ...mention,
          catalogueMappingStatus: "verified",
          suggestedTarget: target.name,
        };
      } else if (target && !target.availableInModel) {
        warnings.push(`Structure "${mention.term}" is not present in the loaded anatomy model (${atlas.sex || "current"} atlas).`);
        return {
          ...mention,
          catalogueMappingStatus: "unresolved",
        };
      } else {
        warnings.push(`Could not verify anatomy catalogue entry for "${mention.term}".`);
        return {
          ...mention,
          catalogueMappingStatus: "unresolved",
        };
      }
    });

    // 2. If no direct anatomical mentions yielded verified targets, try the condition itself
    if (verifiedTargets.length === 0 && finding.condition) {
      const condTarget = resolveAnatomyTarget(finding.condition, atlas, {
        laterality: finding.laterality,
        isCondition: true,
        relationshipTypeOverride: "condition_associated",
      });

      if (condTarget && condTarget.availableInModel) {
        verifiedTargets.push(condTarget);
      } else if (condTarget && !condTarget.availableInModel) {
        warnings.push(`Associated structure for condition "${finding.condition}" is not modeled in the current reference atlas.`);
      }
    }

    // 3. If still no target, try finding.term
    if (verifiedTargets.length === 0 && finding.term) {
      const termTarget = resolveAnatomyTarget(finding.term, atlas, {
        laterality: finding.laterality,
      });
      if (termTarget && termTarget.availableInModel) {
        verifiedTargets.push(termTarget);
      }
    }

    // Deduplicate verified targets by targetId
    const uniqueTargets = [
      ...new Map(verifiedTargets.map((t) => [t.targetId, t])).values(),
    ];

    return {
      ...finding,
      anatomicalMentions: enrichedMentions,
      verifiedTargets: uniqueTargets,
      warnings: [...new Set(warnings)],
    };
  });

  return deduplicateFindingsByTarget(enriched);
}
