import { useEffect, useRef, useState, type FormEvent } from "react";
import { Mic, Send, Volume2, VolumeX, Bot, ChevronDown } from "lucide-react";
import type { Atlas } from "./anatomy.ts";
import type { ChatMessage, IndianLanguageCode } from "./medical-types.ts";
import { SUPPORTED_LANGUAGES } from "./medical-types.ts";
import { TRANSLATIONS } from "./medical-i18n.ts";
import { MedicalAudioController } from "./medical-audio.ts";
import { sendChatMessage, type ScopedChatContext } from "./medical-report-service.ts";
import "./medical-report-explorer.css";

/**
 * Scoped contextual chat used by clinical finding cards and the
 * "Find a Structure" detail sheet. One component instance per scope — its
 * history is private to that finding/structure and never shared.
 *
 * Stale-response safety: each request carries a sequence number and the
 * component stops applying replies after unmount or context change, so a
 * reply never lands in the wrong card or structure panel.
 */
export interface ScopedChatProps {
  atlas: Atlas;
  /** Static context for this chat surface (finding or structure). */
  scoped: ScopedChatContext;
  /** Report text for grounding (empty for standalone structure chat without report). */
  reportContext: string;
  /** Selected UI language; comes from the parent when it owns a selector. */
  language?: IndianLanguageCode;
  /** When provided, the parent owns the language and no selector is rendered. */
  onLanguageChange?: (lang: IndianLanguageCode) => void;
  label?: string;
  placeholder?: string;
  className?: string;
  /** Optional parent-controlled open state (finding cards drive this). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function ScopedChat({
  atlas,
  scoped,
  reportContext,
  language: languageProp,
  onLanguageChange,
  label,
  placeholder,
  className,
  open: openProp,
  onOpenChange,
}: ScopedChatProps) {
  const [internalLanguage, setInternalLanguage] = useState<IndianLanguageCode>("en");
  const language = languageProp ?? internalLanguage;
  const [internalOpen, setInternalOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);

  const aliveRef = useRef(true);
  const streamSeqRef = useRef(0);
  const audioRef = useRef<MedicalAudioController | null>(null);
  if (!audioRef.current) audioRef.current = new MedicalAudioController();

  const t = TRANSLATIONS[language] ?? TRANSLATIONS.en;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      audioRef.current?.stopListening();
      audioRef.current?.stopSpeaking();
    };
  }, []);

  // Context switched (new structure loaded into the same panel): reset the
  // private history so replies for the previous scope never re-appear.
  const contextKey =
    scoped.contextType === "finding"
      ? `finding:${scoped.findingId ?? ""}`
      : `structure:${scoped.structureId ?? scoped.structureName ?? ""}`;
  const lastContextKey = useRef(contextKey);
  useEffect(() => {
    if (lastContextKey.current !== contextKey) {
      lastContextKey.current = contextKey;
      setMessages([]);
      setInput("");
      audioRef.current?.stopSpeaking();
      setSpeakingId(null);
    }
  }, [contextKey]);

  const open = openProp ?? internalOpen;
  const setOpen = (next: boolean) => {
    setInternalOpen(next);
    onOpenChange?.(next);
  };

  const handleSpeak = (msg: ChatMessage) => {
    if (speakingId === msg.id) {
      audioRef.current?.stopSpeaking();
      setSpeakingId(null);
      return;
    }
    setSpeakingId(msg.id);
    audioRef.current?.speak(msg.text, msg.language ?? language, {
      onEnd: () => {
        if (aliveRef.current) setSpeakingId(null);
      },
      onError: () => {
        if (aliveRef.current) setSpeakingId(null);
      },
    });
  };

  const send = async (text: string) => {
    const question = text.trim();
    if (!question || pending) return;

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: "user",
      text: question,
      timestamp: Date.now(),
    };
    const baseHistory = messages;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setPending(true);

    const seq = ++streamSeqRef.current;
    try {
      const reply = await sendChatMessage(
        question,
        reportContext,
        atlas,
        language,
        baseHistory,
        undefined,
        undefined,
        undefined,
        scoped,
      );
      if (!aliveRef.current || seq !== streamSeqRef.current) return; // stale
      setMessages((prev) => [...prev, reply]);
    } catch {
      if (!aliveRef.current || seq !== streamSeqRef.current) return; // stale
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          sender: "assistant",
          text: "AI assistant is temporarily unavailable. Please try again.",
          timestamp: Date.now(),
          language,
        },
      ]);
    } finally {
      setPending(false);
    }
  };

  const handleToggleVoice = () => {
    if (isListening) {
      audioRef.current?.stopListening();
      setIsListening(false);
      return;
    }
    const started = audioRef.current!.startListening(language, {
      onInterimResult: (interim) => setInput(interim),
      onFinalResult: (final) => {
        setIsListening(false);
        void send(final);
      },
      onError: () => setIsListening(false),
      onEnd: () => setIsListening(false),
    });
    if (!started) {
      setIsListening(false);
      alert(t.voiceUnavailable);
    } else {
      setIsListening(true);
    }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  if (!open) {
    return (
        <button
          type="button"
          className="sehatsetu-scoped-chat-launcher sehatsetu-focus-btn"
          onClick={() => setOpen(true)}
        >
          <Bot size={12} />
          <span>{label ?? t.askAi}</span>
        </button>
    );
  }

  return (
    <div className={`sehatsetu-scoped-chat ${className ?? ""}`} data-context={contextKey}>
      <div className="sehatsetu-scoped-chat-head">
        <span className="sehatsetu-scoped-chat-title">
          <Bot size={12} />
          <span>
            {scoped.contextType === "structure"
              ? `${t.askAi}: ${scoped.structureName ?? ""}`
              : t.askAi}
          </span>
        </span>
        <button
          type="button"
          className="sehatsetu-scoped-collapse"
          onClick={() => {
            audioRef.current?.stopListening();
            setOpen(false);
          }}
          aria-label="Close chat"
        >
          <ChevronDown size={13} />
        </button>
      </div>

      {onLanguageChange ? null : (
        <select
          className="sehatsetu-scoped-lang"
          value={language}
          onChange={(e) => {
            audioRef.current?.stopListening();
            setInternalLanguage(e.target.value as IndianLanguageCode);
          }}
          aria-label="Chat language"
        >
          {SUPPORTED_LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>
              {l.nativeName} ({l.name})
            </option>
          ))}
        </select>
      )}

      {messages.length > 0 && (
        <div className="sehatsetu-scoped-stream">
          {messages.map((m) => (
            <div key={m.id} className={`sehatsetu-scoped-msg ${m.sender}`}>
              <p className="sehatsetu-scoped-text">{m.text}</p>
              {m.sender === "assistant" && (
                <button
                  type="button"
                  className="sehatsetu-scoped-speak"
                  onClick={() => handleSpeak(m)}
                  title={t.speakResponse}
                  aria-label={speakingId === m.id ? t.stopSpeaking : t.speakResponse}
                >
                  {speakingId === m.id ? <VolumeX size={12} /> : <Volume2 size={12} />}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <form className="sehatsetu-scoped-input-row" onSubmit={handleSubmit}>
        <input
          type="text"
          className="sehatsetu-scoped-input"
          value={input}
          placeholder={placeholder ?? t.listening}
          onChange={(e) => setInput(e.target.value)}
          disabled={pending}
          aria-label={placeholder ?? t.chatPlaceholder}
        />
        <button
          type="button"
          className={`sehatsetu-scoped-mic ${isListening ? "listening" : ""}`}
          onClick={handleToggleVoice}
          title={t.voiceInput}
          aria-label={t.voiceInput}
          disabled={pending}
        >
          <Mic size={13} />
        </button>
        <button
          type="submit"
          className="sehatsetu-scoped-send"
          title={t.send}
          aria-label={t.send}
          disabled={pending || !input.trim()}
        >
          <Send size={13} />
        </button>
      </form>
    </div>
  );
}
