import type { IndianLanguageCode } from "./medical-types.ts";

/**
 * Lightweight per-message language resolution for the SehatSetu chat.
 *
 * Priority (per product spec):
 * 1. An explicit language request inside the current message wins.
 * 2. Otherwise detect the dominant script of the current message.
 * 3. Short/ambiguous messages (single words, organ names, transliterated
 *    text) fall back to the user's selected language.
 * 4. Code-switched input resolves to the dominant script; useful English
 *    medical terms stay in output (handled by the LLM prompt).
 */

const EXPLICIT_LANGUAGE_WORDS: Record<string, IndianLanguageCode> = {
  hindi: "hi",
  "हिंदी": "hi",
  "हिन्दी": "hi",
  english: "en",
  "अंग्रेज़ी": "en",
  "अंग्रेजी": "en",
  bengali: "bn",
  bangla: "bn",
  "বাংলা": "bn",
  telugu: "te",
  "తెలుగు": "te",
  marathi: "mr",
  "मराठी": "mr",
  tamil: "ta",
  "தமிழ்": "ta",
  gujarati: "gu",
  "ગુજરાતી": "gu",
  kannada: "kn",
  "ಕನ್ನಡ": "kn",
};

// "answer in Hindi", "reply in English", "Tell me in Tamil please"...
const EXPLICIT_REQUEST_RE =
  /\b(?:answer|reply|respond|speak|tell|explain|write|say)(?:[a-z\s]{0,20})?\s+in\s+([a-z\u0900-\u097F]+)\b/i;

interface ScriptProbe {
  code: IndianLanguageCode;
  test: RegExp;
}

// Devanagari covers Hindi and Marathi; disambiguate with the selected language.
const SCRIPT_PROBES: ScriptProbe[] = [
  { code: "hi", test: /[\u0900-\u097F]/ },
  { code: "bn", test: /[\u0980-\u09FF]/ },
  { code: "gu", test: /[\u0A80-\u0AFF]/ },
  { code: "te", test: /[\u0C00-\u0C7F]/ },
  { code: "ta", test: /[\u0B80-\u0BFF]/ },
  { code: "kn", test: /[\u0D80-\u0DFF]/ },
];

/**
 * Detects an explicit per-message language instruction.
 * Returns the requested language code, or null when none is present.
 */
export function explicitLanguageRequest(text: string): IndianLanguageCode | null {
  if (!text) return null;
  const match = text.match(EXPLICIT_REQUEST_RE);
  if (match?.[1]) {
    const word = match[1].toLowerCase().trim();
    if (word in EXPLICIT_LANGUAGE_WORDS) return EXPLICIT_LANGUAGE_WORDS[word];
  }
  // Standalone native language name without the "in X" pattern,
  // e.g. "हिंदी में बताओ", "தமிழ் சொல்லுங்கள்".
  const lowered = text.toLowerCase();
  for (const [word, code] of Object.entries(EXPLICIT_LANGUAGE_WORDS)) {
    if (!/[a-z]/.test(word) && lowered.includes(word)) return code;
  }
  return null;
}

/**
 * Counts code points per indicator script and returns the dominant
 * language, or null when the message has no detectable Indic script.
 * Latin text is NOT proof of English: Hindi users often transliterate.
 */
export function detectScriptLanguage(text: string): IndianLanguageCode | null {
  for (const probe of SCRIPT_PROBES) {
    const count = (text.match(new RegExp(probe.test, "gu")) ?? []).length;
    if (count >= 2) {
      return probe.code;
    }
    if (count > 0) {
      // Single characters can be stray glyphs; require a short word to confirm.
      const words = text.split(/\s+/).some((w) => probe.test.test(w));
      if (words) return probe.code;
    }
  }
  // Devanagari overlap: Marathi users writing Marathi (not Hindi) still appear
  // as "hi". The caller resolves the scratch pad with the selected language.
  const devanagari = (text.match(/[\u0900-\u097F]/gu) ?? []).length;
  return devanagari >= 2 ? "hi" : null;
}

/**
 * Resolves the language of the assistant response for one user message.
 * A reference to the dominant language of the *previous* message lets
 * code-switched follow-ups stay consistent without locking the user out.
 */
export function resolveResponseLanguage(
  message: string,
  preferred: IndianLanguageCode,
): IndianLanguageCode {
  const explicit = explicitLanguageRequest(message);
  if (explicit) return explicit;

  const script = detectScriptLanguage(message);
  if (script) {
    // Devanagari message from a Marathi-preferred user stays Marathi.
    if (script === "hi" && preferred === "mr") return "mr";
    return script;
  }

  // Scene: no script evidence — words are short/ambiguous/transliterated names.
  // The selected language remains the preference for these messages.
  return preferred;
}
