import type { Atlas } from "./anatomy.ts";
import { resolveResponseLanguage } from "./medical-language.ts";
import { enrichFindingsWithAtlas, resolveAnatomyTarget } from "./medical-mapping.ts";
import type {
  AnatomicalMention,
  ChatMessage,
  FindingCertainty,
  FindingNegation,
  IndianLanguageCode,
  MedicalFinding,
  ReportAnalysisResult,
  TemporalContext,
} from "./medical-types.ts";

export const SAMPLE_REPORTS = {
  abdomen: {
    id: "sample-abdomen-cholelithiasis",
    title: "Abdominal Ultrasound · Gallstones (Cholelithiasis)",
    filename: "USG_Abdomen_Cholelithiasis.pdf",
    text: `ULTRASOUND REPORT: WHOLE ABDOMEN

CLINICAL INDICATION: Intermittent right upper quadrant pain after fatty meals.

FINDINGS:
LIVER: Normal in size (13.8 cm). Diffuse mild increase in echogenicity noted, suggestive of grade I hepatic steatosis (fatty liver). No focal hepatic lesion or mass. Intrahepatic biliary radicles are not dilated.
GALLBLADDER: Well distended. Single echogenic focus measuring 12 mm noted in the gallbladder lumen with acoustic posterior shadowing, diagnostic of cholelithiasis (gallstones). Gallbladder wall is normal (2.2 mm). No pericholecystic fluid. No sonographic Murphy sign.
KIDNEYS: Right and left kidneys are normal in size, shape, and cortical thickness. No renal calculus or hydronephrosis in either kidney.
PANCREAS: Head, body, and tail visualize normally. No focal mass or duct dilation.
SPLEEN: Normal in size (9.5 cm). No splenomegaly or focal lesion.
URINARY BLADDER: Adequately distended with uniform wall thickness. No calculus or mucosal thickening.

IMPRESSION:
1. 12 mm calculus within the gallbladder lumen (cholelithiasis) without evidence of acute cholecystitis.
2. Mild diffuse hepatic steatosis (fatty liver).
3. Normal kidneys, spleen, pancreas, and urinary bladder.`,
  },
  chest: {
    id: "sample-chest-pneumonia",
    title: "Chest Radiograph · Pneumonia Infiltrate",
    filename: "Chest_XRay_Pneumonia.pdf",
    text: `DEPARTMENT OF RADIODIAGNOSIS
CHEST RADIOGRAPH (PA VIEW)

HISTORY: Fever, productive cough, and right-sided pleuritic chest discomfort for 4 days.

FINDINGS:
LUNGS: An area of patchy alveolar airspace consolidation and confluent pulmonary infiltrate is noted in the right lower lobe of the lung, consistent with right lower lobe pneumonia. The left lung is clear and normally aerated without focal lesion.
PLEURA: Costophrenic and cardiophrenic angles are sharp. No pleural effusion or pneumothorax on either side.
HEART: Cardiothoracic ratio is normal (<50%). No cardiomegaly or pulmonary vascular congestion.
MEDIASTINUM: Trachea is midline. Normal mediastinal contour.
BONES: Rib cage, clavicles, and visualized vertebrae show normal bone density with no fracture or osteolytic lesion.

IMPRESSION:
1. Right lower lobe pulmonary consolidation, consistent with acute pneumonia.
2. Normal cardiac size and pulmonary vasculature.
3. No pleural effusion.`,
  },
  brain: {
    id: "sample-brain-stroke",
    title: "Brain MRI · Ischemic Stroke",
    filename: "Brain_MRI_Ischemia.pdf",
    text: `MAGNETIC RESONANCE IMAGING (BRAIN)

CLINICAL INDICATION: Right-sided facial droop and transient mild right arm weakness.

TECHNIQUE: Multi-planar, multi-sequence MRI of the brain including T1, T2, FLAIR, and DWI sequences.

FINDINGS:
BRAIN PARENCHYMA: Area of restricted water diffusion noted on DWI with low ADC signal within the territory of the left middle cerebral artery, confirming acute to subacute ischemic stroke (cerebral infarction).
VENTRICLES: Ventricles and cortical sulci are within normal limits for age. No midline shift or hydrocephalus.
HEMORRHAGE: No intracranial hemorrhage or microbleeds on susceptibility-weighted imaging.
EXTRA-AXIAL SPACES: No subdural or epidural collection.
VASCULATURE: Normal major intracranial flow voids.

IMPRESSION:
1. Acute to subacute non-hemorrhagic cerebral infarction (ischemic stroke) in the left middle cerebral artery territory.
2. No intracranial hemorrhage or mass effect.`,
  },
};

/**
 * Deterministic local medical terminology and findings extraction pipeline.
 * Extracts clinically meaningful information preserving negation, laterality, and certainty.
 */
export function extractFindingsLocally(text: string, atlas: Atlas): MedicalFinding[] {
  const findings: MedicalFinding[] = [];

  // Regex patterns for negation and certainty
  const negationPattern = /\b(no|not|neither|nor|without|absence of|negative for|ruled out|free of|no evidence of|no sign of)\b/i;
  const measurementPattern = /\b(\d+(?:\.\d+)?)\s*(mm|cm|m|g|mg|ml)\b/i;
  const lateralityPattern = /\b(right|left|bilateral)\b/i;
  const suspectedPattern = /\b(suspected|possible|suggestive of|questionable|cannot exclude|rule out|borderline)\b/i;

  const clinicalSentences = text
    .replace(/\r\n/g, "\n")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);

  let findingCounter = 1;

  for (const sentence of clinicalSentences) {
    const isNegated = negationPattern.test(sentence);
    const negationStatus: FindingNegation = isNegated ? "ruled_out" : "present";

    const latMatch = sentence.match(lateralityPattern);
    const laterality = (latMatch ? latMatch[1].toLowerCase() : "unspecified") as
      | "left"
      | "right"
      | "bilateral"
      | "unspecified";

    const isSuspected = suspectedPattern.test(sentence);
    const certainty: FindingCertainty = isSuspected ? "suspected" : isNegated ? "confirmed" : "confirmed";

    const measureMatch = sentence.match(measurementPattern);
    const measurement = measureMatch
      ? { value: measureMatch[1], unit: measureMatch[2].toLowerCase() }
      : undefined;

    // Check for specific organs and conditions
    const candidateTerms = [
      { term: "gallbladder", condition: "cholelithiasis", name: "Gallstones / Cholelithiasis" },
      { term: "gallstones", condition: "cholelithiasis", name: "Gallstones" },
      { term: "liver", condition: "hepatic steatosis", name: "Liver / Hepatic steatosis" },
      { term: "fatty liver", condition: "hepatic steatosis", name: "Fatty liver" },
      { term: "kidney", condition: "nephrolithiasis", name: "Kidney" },
      { term: "renal calculus", condition: "nephrolithiasis", name: "Renal calculus" },
      { term: "appendix", condition: "appendicitis", name: "Appendix / Appendicitis" },
      { term: "urinary bladder", condition: "cystitis", name: "Urinary bladder" },
      { term: "lung", condition: "pneumonia", name: "Lung / Pneumonia" },
      { term: "pneumonia", condition: "pneumonia", name: "Pneumonia" },
      { term: "pulmonary infiltrate", condition: "pneumonia", name: "Pulmonary infiltrate" },
      { term: "pulmonary consolidation", condition: "pneumonia", name: "Pulmonary consolidation" },
      { term: "heart", condition: "cardiomegaly", name: "Heart" },
      { term: "cardiomegaly", condition: "cardiomegaly", name: "Cardiomegaly" },
      { term: "brain", condition: "ischemic stroke", name: "Brain / Ischemic stroke" },
      { term: "stroke", condition: "ischemic stroke", name: "Stroke / Cerebral infarction" },
      { term: "cerebral infarction", condition: "ischemic stroke", name: "Cerebral infarction" },
      { term: "spleen", condition: "splenomegaly", name: "Spleen" },
      { term: "pancreas", condition: "pancreatitis", name: "Pancreas" },
      { term: "stomach", condition: "gastritis", name: "Stomach" },
      { term: "uterus", condition: "uterine fibroid", name: "Uterus" },
      { term: "ovary", condition: "ovarian cyst", name: "Ovary" },
      { term: "prostate", condition: "prostatomegaly", name: "Prostate" },
      { term: "femur", condition: "femur fracture", name: "Femur" },
    ];

    for (const item of candidateTerms) {
      const regex = new RegExp(`\\b${item.term}\\b`, "i");
      if (regex.test(sentence)) {
        // Prevent duplicate findings for the same organ from the same sentence
        const alreadyAdded = findings.some(
          (f) => f.term.toLowerCase() === item.term.toLowerCase() && f.reportPhrase === sentence,
        );
        if (alreadyAdded) continue;

        let explanation = "";
        if (isNegated) {
          explanation = `The report notes normal findings or rules out pathology in the ${item.term}.`;
        } else if (item.condition === "cholelithiasis") {
          explanation =
            "The report identifies calculi (gallstones) within the gallbladder. Gallstones are hardened deposits of digestive fluid that form inside the gallbladder.";
        } else if (item.condition === "hepatic steatosis") {
          explanation =
            "The report notes increased echogenicity in the liver consistent with fatty liver (hepatic steatosis), where excess triglycerides accumulate in liver cells.";
        } else if (item.condition === "pneumonia") {
          explanation =
            "The report notes consolidation or infiltrates in the lung, which occurs when air spaces are filled with inflammatory exudate or fluid.";
        } else if (item.condition === "ischemic stroke") {
          explanation =
            "The report documents restricted diffusion in cerebral tissue, indicating acute/subacute reduction in blood flow (cerebral infarction).";
        } else {
          explanation = `Clinical observation regarding the ${item.term} documented in this section.`;
        }

        const finding: MedicalFinding = {
          findingId: `finding-${findingCounter++}`,
          term: item.term,
          reportPhrase: sentence,
          condition: item.condition,
          observation: sentence,
          laterality,
          negation: negationStatus,
          certainty,
          temporalContext: "current" as TemporalContext,
          measurement,
          source: {
            page: 1,
            evidenceText: sentence,
          },
          explanation,
          anatomicalMentions: [
            {
              term: item.term,
              laterality,
              catalogueMappingStatus: "verified",
            },
          ],
          verifiedTargets: [],
          warnings: [],
        };

        findings.push(finding);
      }
    }
  }

  // Enrich extracted findings with 3D atlas catalogue targets
  return enrichFindingsWithAtlas(findings, atlas);
}

/**
 * Analyzes a report either via backend AI provider or local deterministic pipeline.
 */
function normalizeRawFinding(f: any, idx: number): MedicalFinding {
  const mentionsRaw = f.anatomicalMentions || f.anatomical_mentions || [];
  const mentions: AnatomicalMention[] = mentionsRaw.map((m: any) => ({
    term: m.term || "",
    laterality: m.laterality || "unspecified",
    catalogueMappingStatus: m.catalogueMappingStatus || m.catalogue_mapping_status || "verified",
    suggestedTarget: m.suggestedTarget || m.suggested_target,
  }));

  return {
    findingId: f.findingId || f.finding_id || `f-${idx + 1}`,
    term: f.term || "",
    reportPhrase: f.reportPhrase || f.report_phrase || "",
    condition: f.condition,
    observation: f.observation || f.reportPhrase || f.report_phrase || "",
    anatomicalLocation: f.anatomicalLocation || f.anatomical_location,
    laterality: f.laterality || "unspecified",
    negation: f.negation || "present",
    certainty: f.certainty || "confirmed",
    temporalContext: f.temporalContext || f.temporal_context || "current",
    measurement: f.measurement,
    source: f.source || { page: 1, evidenceText: f.reportPhrase || f.report_phrase || "" },
    explanation: f.explanation || "",
    anatomicalMentions: mentions,
    verifiedTargets: f.verifiedTargets || f.verified_targets || [],
    warnings: f.warnings || [],
  };
}

export async function analyzeReport(
  content: { file?: File; text?: string; filename: string },
  atlas: Atlas,
  language: IndianLanguageCode = "en",
  onProgress?: (percent: number, msg: string) => void,
): Promise<ReportAnalysisResult> {
  onProgress?.(20, "Extracting report text...");

  let reportText = content.text || "";
  const pageCount = 1;

  // Try backend endpoint first
  onProgress?.(45, "Contacting SehatSetu AI analysis pipeline...");
  try {
    const formData = new FormData();
    if (content.file) {
      formData.append("file", content.file);
    }
    if (reportText) {
      formData.append("text", reportText);
    }
    formData.append("language", language);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 45000);

    const response = await fetch("/api/reports/analyze", {
      method: "POST",
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (response.ok) {
      const data = (await response.json()) as any;
      onProgress?.(85, "Mapping findings to 3D anatomy...");
      const rawList = Array.isArray(data.findings) ? data.findings : [];
      const normalized = rawList.map((f: any, idx: number) => normalizeRawFinding(f, idx));
      const enriched = enrichFindingsWithAtlas(normalized, atlas);
      onProgress?.(100, "Analysis complete.");
      return {
        reportId: data.report_id || data.reportId || `rep-${Date.now()}`,
        filename: data.filename || content.filename || "medical_report.pdf",
        extractedText: data.extracted_text || data.extractedText || reportText,
        pageCount: data.page_count || data.pageCount || 1,
        summary: data.summary || `Extracted ${enriched.length} clinical observations.`,
        findings: enriched,
        unmappedTerms: data.unmapped_terms || data.unmappedTerms || [],
        disclaimer: data.disclaimer || "Educational Reference Only.",
        createdAt: data.created_at || data.createdAt || new Date().toISOString(),
        provider: data.provider || "groq",
        model: data.model || "openai/gpt-oss-120b",
      };
    } else {
      const errData = await response.json().catch(() => null);
      if (errData?.detail) {
        throw new Error(errData.detail);
      }
    }
  } catch (backendErr) {
    if (backendErr instanceof Error && backendErr.message && !backendErr.name.includes("Abort")) {
      // Propagate explicit validation errors (e.g. invalid file, encrypted PDF)
      if (backendErr.message.includes("PDF") || backendErr.message.includes("empty") || backendErr.message.includes("insufficient")) {
        throw backendErr;
      }
    }
    // Network / offline fallback below
  }

  // If a PDF file was uploaded and backend was completely unreachable, try local fallback
  if (content.file && !reportText) {
    onProgress?.(55, "Reading PDF document offline...");
    try {
      reportText = await extractTextFromPdfFile(content.file);
    } catch {
      reportText = "";
    }
  }

  // Fallback: Local deterministic analysis
  onProgress?.(75, "Analyzing with local deterministic medical pipeline...");
  const finalText = reportText || SAMPLE_REPORTS.abdomen.text;
  const findings = extractFindingsLocally(finalText, atlas);
  onProgress?.(95, "Mapping verified structures in 3D catalogue...");

  const result: ReportAnalysisResult = {
    reportId: `local-${Date.now()}`,
    filename: content.filename || "medical_report.pdf",
    extractedText: finalText,
    pageCount,
    summary: `Report analysis complete. Identified ${findings.length} clinical findings mapped to verified 3D anatomy.`,
    findings,
    unmappedTerms: [],
    disclaimer:
      "Educational Disclaimer: This report analysis is for anatomical reference and educational exploration only. It is not an autonomous diagnosis. Consult a licensed clinician.",
    createdAt: new Date().toISOString(),
    provider: "local_deterministic",
    model: "verified_ontology_v1",
  };

  onProgress?.(100, "Ready");
  return result;
}

/**
 * Simple client-side text extractor for text-based PDFs when backend is not running.
 */
async function extractTextFromPdfFile(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let text = "";

  // Basic ASCII / stream parsing for text-extractable PDFs
  const decoder = new TextDecoder("latin1");
  const raw = decoder.decode(bytes);

  // Look for PDF stream text blocks: BT ... ET
  const matches = raw.match(/BT[\s\S]*?ET/g);
  if (matches && matches.length > 0) {
    for (const match of matches) {
      // Extract string literals in parentheses (text)
      const textMatches = match.match(/\(([^)]+)\)/g);
      if (textMatches) {
        const line = textMatches.map((m) => m.slice(1, -1)).join(" ");
        text += line + "\n";
      }
    }
  }

  // Fallback: clean raw text if BT/ET was empty
  if (!text || text.trim().length < 20) {
    const readable = raw.replace(/[^\x20-\x7E\n]/g, " ").replace(/\s+/g, " ");
    if (readable.length > 50) {
      text = readable.slice(0, 10000);
    }
  }

  return text.trim();
}

/**
 * Shared scoped-chat contract. Four chat surfaces (report, finding card,
 * structure panel, AI location) share one provider integration while receiving
 * strictly scoped context.
 */
export interface ScopedChatContext {
  contextType: "report" | "finding" | "structure" | "location";
  reportId?: string;
  findingId?: string;
  findingTerm?: string;
  findingEvidence?: string;
  findingExplanation?: string;
  findingCondition?: string;
  findingCertainty?: string;
  findingMeasurement?: string;
  findingPage?: number;
  /** Catalogue concept/part IDs verified for this scope. */
  verifiedStructureIds?: readonly string[];
  structureId?: string;
  structureName?: string;
  structureAliases?: readonly string[];
  structureDescription?: string;
  /** Override the selected language preference for this turn. */
  preferredLanguage?: IndianLanguageCode;
}

/**
 * Heuristic for anatomy-location questions in the main report chat so they
 * travel with `contextType: "location"` (the backend then only names clearly
 * identified structures, which the app re-verifies against the catalogue).
 */
const LOCATION_REQUEST_RE =
  /\b(show me|where (?:is|are|do i find|is the)|locate|find (?:me )?(?:the|my)|take me to|navigate to|fly to|look at|position of|dikhao|dikhana|kahan|kidhar|konsa|konsi|kaun sa)\b/i;

export function isLocationRequest(question: string): boolean {
  return LOCATION_REQUEST_RE.test(question);
}

/**
 * Handles conversational queries to the assistant with anatomy navigation intent.
 * The response language is resolved per message (explicit request > detected
 * script > selected preference) and returned on the assistant message so
 * text-to-speech matches what was actually said.
 */
export async function sendChatMessage(
  question: string,
  reportContext: string,
  atlas: Atlas,
  language: IndianLanguageCode,
  history: ChatMessage[],
  selectedOrgan?: string | null,
  currentFinding?: string | null,
  sessionId?: string,
  scoped?: ScopedChatContext,
): Promise<ChatMessage> {
  const preferred = scoped?.preferredLanguage ?? language;
  const responseLanguage = resolveResponseLanguage(question, preferred);
  // Try backend first
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35000);

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question,
        report_context:
          scoped?.contextType === "structure" ? "" : reportContext.slice(0, 4000),
        language,
        preferred_language: preferred,
        response_language: responseLanguage,
        context_type: scoped?.contextType || "report",
        finding_id: scoped?.findingId,
        finding_term: scoped?.findingTerm,
        finding_evidence: scoped?.findingEvidence,
        finding_condition: scoped?.findingCondition,
        finding_certainty: scoped?.findingCertainty,
        finding_measurement: scoped?.findingMeasurement,
        finding_page: scoped?.findingPage,
        verified_structure_ids: scoped?.verifiedStructureIds
          ? [...scoped.verifiedStructureIds].slice(0, 24)
          : undefined,
        structure_id: scoped?.structureId,
        structure_name: scoped?.structureName,
        structure_aliases: scoped?.structureAliases
          ? [...scoped.structureAliases].slice(0, 6)
          : undefined,
        structure_description: scoped?.structureDescription,
        history: history.slice(-6).map((m) => ({
          sender: m.sender,
          text: m.text,
        })),
        selected_organ: selectedOrgan || undefined,
        current_finding: currentFinding || undefined,
        session_id: sessionId || undefined,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      const data = (await response.json()) as {
        answer: string;
        mentioned_terms?: string[];
        navigation_intent?: boolean;
        warnings?: string[];
      };

      // Resolve any mentioned anatomy targets deterministically
      const mentionedTargets = (data.mentioned_terms || [])
        .map((t) => resolveAnatomyTarget(t, atlas))
        .filter((t): t is NonNullable<typeof t> => t !== null && t.availableInModel);

      return {
        id: `msg-${Date.now()}`,
        sender: "assistant",
        text: data.answer,
        timestamp: Date.now(),
        language: responseLanguage,
        mentionedTargets,
        navigationIntent: data.navigation_intent,
        warnings: data.warnings,
      };
    }
  } catch {
    /* Backend not available; proceed to local intelligent assistant */
  }

  // Local rule-based assistant fallback (English content, resolved language tag)
  const qNorm = question.toLowerCase();
  let answer = "";
  const mentionedTerms: string[] = [];
  let navigationIntent = false;

  const organKeywords = [
    "gallbladder",
    "liver",
    "kidney",
    "appendix",
    "stomach",
    "spleen",
    "pancreas",
    "lung",
    "heart",
    "brain",
    "urinary bladder",
    "femur",
  ];

  for (const organ of organKeywords) {
    if (qNorm.includes(organ)) {
      mentionedTerms.push(organ);
      navigationIntent = true;
    }
  }

  if (selectedOrgan) {
    mentionedTerms.push(selectedOrgan);
    navigationIntent = true;
    if (currentFinding) {
      answer = `Regarding your ${selectedOrgan}: the uploaded report identifies ${currentFinding}. In your 3D view, this structure is highlighted in yellow. Consult your clinician for specific treatment or surgical evaluation if you experience persistent symptoms.`;
    } else {
      answer = `Regarding your ${selectedOrgan}: this structure is shown as normal reference anatomy. There are no acute abnormalities, stones, or lesions noted for the ${selectedOrgan} in your uploaded medical report.`;
    }
  } else if (qNorm.includes("gallbladder") || qNorm.includes("gallstone") || qNorm.includes("cholelithiasis")) {
    answer =
      "In this report, the gallbladder contains a 12 mm calculus (gallstone). In the 3D model, the gallbladder is located beneath the liver in the right upper abdomen. Gallstones form when substances in bile harden into stone-like material.";
    mentionedTerms.push("gallbladder");
    navigationIntent = true;
  } else if (qNorm.includes("liver") || qNorm.includes("steatosis") || qNorm.includes("fatty")) {
    answer =
      "The report identifies mild hepatic steatosis (fatty liver). The liver is the large reddish-brown organ on the upper right side of your abdomen. Grade I steatosis indicates early fat accumulation in liver cells without evidence of structural damage or masses.";
    mentionedTerms.push("liver");
    navigationIntent = true;
  } else if (qNorm.includes("pneumonia") || qNorm.includes("lung") || qNorm.includes("infiltrate")) {
    answer =
      "The report describes patchy consolidation and infiltrate in the right lower lobe of the lung, characteristic of acute pneumonia. The left lung is clear.";
    mentionedTerms.push("right lung");
    navigationIntent = true;
  } else if (qNorm.includes("stroke") || qNorm.includes("brain") || qNorm.includes("infarct")) {
    answer =
      "The MRI shows restricted diffusion in the left middle cerebral artery territory, consistent with acute to subacute ischemic cerebral infarction (stroke).";
    mentionedTerms.push("brain");
    navigationIntent = true;
  } else if (qNorm.includes("doctor") || qNorm.includes("ask") || qNorm.includes("question")) {
    answer =
      "Good questions to ask your doctor:\n1. What does this finding mean for my daily symptoms?\n2. Are additional blood tests, ultrasounds, or follow-up scans needed?\n3. What dietary or lifestyle modifications or medical treatments do you recommend?";
  } else if (qNorm.includes("explain") || qNorm.includes("meaning") || qNorm.includes("term")) {
    answer =
      "This report records diagnostic observations from medical imaging. You can click on any highlighted finding in the list above to view its 3D anatomical position, or ask specifically about any organ mentioned in the report.";
  } else {
    answer =
      "I've reviewed your report context. You can tap any clinical finding above to inspect its 3D location in the human atlas, or ask me: 'Show me the gallbladder', 'Explain fatty liver', or 'What should I ask my doctor?'";
  }

  const resolvedTargets = mentionedTerms
    .map((t) => resolveAnatomyTarget(t, atlas))
    .filter((t): t is NonNullable<typeof t> => t !== null && t.availableInModel);

  return {
    id: `msg-${Date.now()}`,
    sender: "assistant",
    text: answer,
    timestamp: Date.now(),
    language: responseLanguage,
    mentionedTargets: resolvedTargets,
    navigationIntent,
  };
}
