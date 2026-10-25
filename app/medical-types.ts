import type { SystemId } from "./anatomy.ts";

export type IndianLanguageCode = "en" | "hi" | "bn" | "te" | "mr" | "ta" | "gu" | "kn";

export interface LanguageOption {
  code: IndianLanguageCode;
  name: string;
  nativeName: string;
  speechTag: string;
}

export const SUPPORTED_LANGUAGES: readonly LanguageOption[] = [
  { code: "en", name: "English", nativeName: "English", speechTag: "en-IN" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी", speechTag: "hi-IN" },
  { code: "bn", name: "Bengali", nativeName: "বাংলা", speechTag: "bn-IN" },
  { code: "te", name: "Telugu", nativeName: "తెలుగు", speechTag: "te-IN" },
  { code: "mr", name: "Marathi", nativeName: "मराठी", speechTag: "mr-IN" },
  { code: "ta", name: "Tamil", nativeName: "தமிழ்", speechTag: "ta-IN" },
  { code: "gu", name: "Gujarati", nativeName: "ગુજરાતી", speechTag: "gu-IN" },
  { code: "kn", name: "Kannada", nativeName: "ಕನ್ನಡ", speechTag: "kn-IN" },
] as const;

export type MappingRelationship = "direct" | "condition_associated" | "context" | "unresolved";
export type MappingConfidence = "verified" | "probable" | "candidate" | "unresolved";

export interface VerifiedAnatomyTarget {
  targetId: string; // Concept ID (e.g., FMA7202) or Part ID (e.g., FJ2817)
  conceptId?: string;
  name: string;
  system: SystemId;
  partIds: string[]; // Specific mesh elements to highlight/isolate
  relationshipType: MappingRelationship;
  confidence: MappingConfidence;
  laterality?: "left" | "right" | "bilateral" | "unspecified";
  source: string; // Provenance: e.g. "curated_condition_registry", "exact_concept_match", "synonym_alias"
  availableInModel: boolean;
}

export interface AnatomicalMention {
  term: string;
  laterality: "left" | "right" | "bilateral" | "unspecified";
  catalogueMappingStatus: "verified" | "condition_associated" | "unresolved";
  suggestedTarget?: string;
}

export type FindingCertainty = "confirmed" | "suspected" | "possible" | "indeterminate" | "not_stated";
export type FindingNegation = "present" | "absent" | "ruled_out";
export type TemporalContext = "current" | "historical" | "comparison";

export interface MedicalFinding {
  findingId: string;
  term: string;
  reportPhrase: string;
  condition?: string;
  observation: string;
  anatomicalLocation?: string;
  laterality: "left" | "right" | "bilateral" | "unspecified";
  negation: FindingNegation;
  certainty: FindingCertainty;
  temporalContext: TemporalContext;
  measurement?: {
    value: number | string;
    unit: string;
  };
  source: {
    page: number;
    evidenceText: string;
  };
  explanation: string;
  anatomicalMentions: AnatomicalMention[];
  verifiedTargets: VerifiedAnatomyTarget[];
  warnings: string[];
}

export interface ReportAnalysisResult {
  reportId: string;
  filename: string;
  extractedText: string;
  pageCount: number;
  summary: string;
  findings: MedicalFinding[];
  unmappedTerms: string[];
  disclaimer: string;
  createdAt: string;
  provider: string;
  model: string;
}

export interface ChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
  timestamp: number;
  // Language of this assistant response (resolved per message). Used for TTS.
  language?: IndianLanguageCode;
  mentionedTargets?: VerifiedAnatomyTarget[];
  navigationIntent?: boolean;
  warnings?: string[];
}

export interface ReportAnalysisState {
  status: "idle" | "selected" | "extracting" | "analyzing" | "mapping" | "ready" | "partial" | "failed";
  filename?: string;
  fileSize?: number;
  progressPercent?: number;
  progressMessage?: string;
  error?: string;
  result?: ReportAnalysisResult;
}
