import { SUPPORTED_LANGUAGES, type IndianLanguageCode } from "./medical-types.ts";

// Type definitions for browser Web Speech API
interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
      isFinal?: boolean;
    };
  };
}

interface SpeechRecognitionErrorEventLike {
  error: string;
  message?: string;
}

interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export class MedicalAudioController {
  private recognition: SpeechRecognitionLike | null = null;
  private isListening = false;
  private isSpeaking = false;
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private cachedVoices: SpeechSynthesisVoice[] = [];
  private speechKeepAlive: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      this.refreshVoices();
      try {
        window.speechSynthesis.onvoiceschanged = () => {
          this.refreshVoices();
        };
      } catch {
        /* Ignore */
      }
    }
  }

  private refreshVoices(): SpeechSynthesisVoice[] {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length > 0) {
        this.cachedVoices = v;
      }
    }
    return this.cachedVoices;
  }

  public isSpeechRecognitionSupported(): boolean {
    if (typeof window === "undefined") return false;
    const nav = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    return !!(nav.SpeechRecognition || nav.webkitSpeechRecognition);
  }

  public isSpeechSynthesisSupported(): boolean {
    return typeof window !== "undefined" && "speechSynthesis" in window;
  }

  /**
   * Starts listening to user microphone with the appropriate language tag.
   */
  public startListening(
    lang: IndianLanguageCode,
    callbacks: {
      onInterimResult: (text: string) => void;
      onFinalResult: (text: string) => void;
      onError: (errorType: string) => void;
      onEnd: () => void;
    },
  ): boolean {
    if (!this.isSpeechRecognitionSupported()) {
      callbacks.onError("not_supported");
      return false;
    }

    try {
      this.stopListening();

      const nav = window as unknown as {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      };
      const RecognitionClass = nav.SpeechRecognition || nav.webkitSpeechRecognition;
      if (!RecognitionClass) {
        callbacks.onError("not_supported");
        return false;
      }

      const rec = new RecognitionClass();
      this.recognition = rec;
      rec.continuous = false;
      rec.interimResults = true;

      const langOption = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
      rec.lang = langOption?.speechTag || "en-IN";

      let finalEmitted = false;

      rec.onstart = () => {
        this.isListening = true;
      };

      rec.onresult = (event: SpeechRecognitionEventLike) => {
        let interimText = "";
        let finalText = "";

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalText += res[0].transcript;
          } else {
            interimText += res[0].transcript;
          }
        }

        if (interimText && !finalEmitted) {
          callbacks.onInterimResult(interimText);
        }
        if (finalText && !finalEmitted) {
          finalEmitted = true;
          this.isListening = false;
          try {
            rec.stop();
          } catch {
            /* Ignore */
          }
          callbacks.onFinalResult(finalText.trim());
        }
      };

      rec.onerror = (event: SpeechRecognitionErrorEventLike) => {
        this.isListening = false;
        if (event.error !== "no-speech") {
          callbacks.onError(event.error || "recognition_error");
        }
      };

      rec.onend = () => {
        this.isListening = false;
        callbacks.onEnd();
      };

      rec.start();
      return true;
    } catch {
      callbacks.onError("start_failed");
      return false;
    }
  }

  public stopListening(): void {
    if (this.recognition && this.isListening) {
      try {
        this.recognition.stop();
      } catch {
        /* Ignore */
      }
    }
    this.isListening = false;
  }

  /**
   * Speaks the provided text using browser SpeechSynthesis in the target language.
   */
  public speak(
    text: string,
    lang: IndianLanguageCode,
    callbacks?: {
      onStart?: () => void;
      onEnd?: () => void;
      onError?: (err: unknown) => void;
    },
  ): void {
    if (!this.isSpeechSynthesisSupported()) {
      callbacks?.onError?.("Speech synthesis not supported");
      return;
    }

    this.stopSpeaking();

    // Clean text: strip markdown symbols, asterisks, brackets, raw json
    const clean = text
      .replace(/[*#_`~>]/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/\{[^}]+\}/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (!clean) {
      callbacks?.onEnd?.();
      return;
    }

    try {
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      const utterance = new SpeechSynthesisUtterance(clean);
      this.currentUtterance = utterance;

      const langOption = SUPPORTED_LANGUAGES.find((l) => l.code === lang);
      const tag = langOption?.speechTag || "en-IN";
      utterance.lang = tag;
      utterance.rate = 0.95;

      const voices = this.refreshVoices();
      const prefix = tag.split("-")[0].toLowerCase();

      // Best match strategy:
      // 1. Exact locale match (e.g. hi-IN)
      // 2. Language prefix match (e.g. hi)
      // 3. Indian English match (e.g. en-IN or name containing India)
      // 4. Default / system English voice
      const exactMatch = voices.find((v) => v.lang.toLowerCase() === tag.toLowerCase());
      const prefixMatch = voices.find((v) => v.lang.toLowerCase().startsWith(prefix));
      const indianEnglish = voices.find(
        (v) =>
          v.lang.toLowerCase() === "en-in" ||
          v.name.toLowerCase().includes("india") ||
          v.name.toLowerCase().includes("ravi") ||
          v.name.toLowerCase().includes("heera"),
      );
      const generalEnglish = voices.find((v) => v.lang.toLowerCase().startsWith("en"));

      const matchedVoice = exactMatch || prefixMatch || indianEnglish || generalEnglish || voices[0];
      if (matchedVoice) {
        utterance.voice = matchedVoice;
      }

      utterance.onstart = () => {
        this.isSpeaking = true;
        callbacks?.onStart?.();
      };

      const cleanup = () => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        if (this.speechKeepAlive) {
          clearInterval(this.speechKeepAlive);
          this.speechKeepAlive = null;
        }
      };

      utterance.onend = () => {
        cleanup();
        callbacks?.onEnd?.();
      };

      utterance.onerror = (e) => {
        cleanup();
        callbacks?.onError?.(e);
      };

      // Workaround Chrome 15s pause bug
      this.speechKeepAlive = setInterval(() => {
        if (this.isSpeaking && typeof window !== "undefined" && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 5000);

      window.speechSynthesis.speak(utterance);
    } catch (e) {
      this.isSpeaking = false;
      this.currentUtterance = null;
      callbacks?.onError?.(e);
    }
  }

  public stopSpeaking(): void {
    if (this.speechKeepAlive) {
      clearInterval(this.speechKeepAlive);
      this.speechKeepAlive = null;
    }
    if (this.isSpeechSynthesisSupported()) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        /* Ignore */
      }
    }
    this.isSpeaking = false;
    this.currentUtterance = null;
  }

  public getSpeakingState(): boolean {
    return this.isSpeaking;
  }

  public getListeningState(): boolean {
    return this.isListening;
  }
}
