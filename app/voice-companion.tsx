import { useEffect, useRef, useState } from "react";
import { ReportMcpClient, type McpActivity } from "./report-mcp-client";
import { MedicalAudioController } from "./medical-audio";
import { explicitLanguageRequest } from "./medical-language";
import { SUPPORTED_LANGUAGES, type IndianLanguageCode, type ReportAnalysisResult } from "./medical-types";
import "./voice-companion.css";

interface Finding {
  finding_id: string; term: string; report_phrase: string; negation: string; certainty: string;
}
interface ConnectedReport {
  session_key: string; filename: string; summary: string; findings: Finding[]; provider: string;
}
interface Answer {
  answer: string; provider: string; response_language?: IndianLanguageCode; warnings?: string[];
  evidence: { finding_id: string; term: string; quote: string; page: number }[];
}
interface Props {
  report?: ReportAnalysisResult | null;
  language?: IndianLanguageCode;
  companion?: boolean;
  visible?: boolean;
  onNavigate?: (terms: string[]) => boolean;
}

export default function VoiceCompanion({ report, language = "en", companion = false, visible = true, onNavigate }: Props) {
  const [activity, setActivity] = useState<McpActivity[]>([]);
  const [client] = useState(() => new ReportMcpClient(entry => setActivity(previous =>
    previous.length < 18 ? [...previous, entry] : [...previous.slice(0, 3), ...previous.slice(-14), entry])));
  const [connected, setConnected] = useState<ConnectedReport | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState(language);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [input, setInput] = useState("");
  const [pairCode, setPairCode] = useState(() => {
    if (!companion) return "";
    const code = new URLSearchParams(location.hash.slice(1)).get("pair") || "";
    if (code) history.replaceState(null, "", location.pathname + location.search);
    return code;
  });
  const [pairUrl, setPairUrl] = useState("");
  const [messages, setMessages] = useState<{ role: string; text: string; language: IndianLanguageCode; provider?: string }[]>([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [listening, setListening] = useState(false);
  const [autoRead, setAutoRead] = useState(false);
  const [viewerStatus, setViewerStatus] = useState("");
  const [peers, setPeers] = useState(0);
  const [seconds, setSeconds] = useState(1800);
  const [audio] = useState(() => new MedicalAudioController());
  const keyRef = useRef("");
  const alive = useRef(true);
  const navigation = useRef(onNavigate);
  navigation.current = onNavigate;

  useEffect(() => { setSelectedLanguage(language); audio.stopSpeaking(); audio.stopListening(); setListening(false); }, [language, audio]);
  useEffect(() => { if (!visible) { audio.stopSpeaking(); audio.stopListening(); setListening(false); } }, [visible, audio]);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      audio.stopSpeaking(); audio.stopListening();
      if (keyRef.current) void client.call("disconnect", { session_key: keyRef.current }).catch(() => {});
      keyRef.current = "";
    };
  }, [client, audio]);

  useEffect(() => {
    if (!connected) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    let revision = 0;
    const poll = async () => {
      try {
        const state = await client.call<{ revision: number; anatomy_terms: string[]; companions: number; expires_in_seconds: number }>(
          "get_viewer_state", { session_key: connected.session_key });
        if (stopped) return;
        setPeers(state.companions); setSeconds(state.expires_in_seconds);
        if (state.revision > revision) {
          revision = state.revision;
          if (navigation.current) {
            const found = navigation.current(state.anatomy_terms);
            setViewerStatus(found ? "Verified anatomy highlighted in the 3D viewer." : "Requested anatomy is unavailable in the loaded model.");
          } else setViewerStatus("Location sent. Keep the paired 3D viewer open to see the highlight.");
        }
      } catch (failure) {
        if (!stopped) { setError(String(failure)); setConnected(null); keyRef.current = ""; }
        return;
      }
      if (!stopped) timer = setTimeout(poll, 1800);
    };
    void poll();
    return () => { stopped = true; clearTimeout(timer); };
  }, [connected, client]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setError("");
    try { await action(); } catch (failure) { if (alive.current) setError(failure instanceof Error ? failure.message : String(failure)); }
    finally { if (alive.current) setBusy(false); }
  }

  async function connect() {
    await run(async () => {
      const result = companion
        ? await client.call<ConnectedReport>("join_pairing", { pairing_code: pairCode.trim() })
        : await client.call<ConnectedReport>("create_report", {
          text: report?.extractedText, filename: report?.filename, language: selectedLanguage });
      if (!alive.current) { await client.call("disconnect", { session_key: result.session_key }); return; }
      keyRef.current = result.session_key;
      setPairCode(""); setConnected(result); setMessages([]); setAnswer(null);
    });
  }

  async function ask(question: string) {
    if (!connected || !question.trim() || busy) return;
    audio.stopSpeaking(); audio.stopListening(); setListening(false);
    setInput("");
    const requestedLanguage = explicitLanguageRequest(question) || selectedLanguage;
    setSelectedLanguage(requestedLanguage);
    setMessages(previous => [...previous.slice(-15), { role: "You", text: question, language: requestedLanguage }]);
    await run(async () => {
      const result = await client.call<Answer>("ask_report", {
        session_key: connected.session_key, question, language: requestedLanguage });
      if (!alive.current) return;
      const responseLanguage = result.response_language || requestedLanguage;
      setAnswer(result);
      setMessages(previous => [...previous.slice(-15), { role: "RepAnatomy", text: result.answer, language: responseLanguage, provider: result.provider }]);
      if (autoRead) audio.speak(result.answer, responseLanguage);
    });
  }

  function mic() {
    if (listening) { audio.stopListening(); setListening(false); return; }
    audio.stopSpeaking(); setError("");
    const started = audio.startListening(selectedLanguage, {
      onInterimResult: setInput,
      onFinalResult: text => { setListening(false); setInput(text); },
      onEnd: () => setListening(false),
      onError: reason => { setListening(false); setError(`Microphone: ${reason}. You can type your question instead.`); },
    });
    setListening(started);
  }

  return <section className={`voice-companion ${companion ? "companion-page" : ""}`} aria-label="Alexa+ experience simulator">
    <span className="voice-eyebrow">ALEXA+ TRACK · WEB SIMULATION</span>
    <h2>Your report. A conversation.</h2>
    <p className="voice-intro">Understand the words, hear an explanation, and explore the anatomy. This is a RepAnatomy simulation, with no live Alexa device connection.</p>
    {!connected ? <div className="voice-card">
      {companion ? <>
        <label htmlFor="pair-code">Invitation from the report owner</label>
        <input id="pair-code" value={pairCode} onChange={event => setPairCode(event.target.value)} placeholder="Paste the single-use invitation code" autoComplete="off" />
        <p>Joining grants this browser access to that report until expiry or revocation.</p>
      </> : <p>{report ? `Connect “${report.filename}” to begin. Report text will be held in backend memory for up to 30 minutes and sent to Groq if configured.` : "Start in Upload: choose a synthetic sample, paste text, or upload a text-based PDF. Then return here."}</p>}
      <button className="voice-primary" disabled={busy || (companion ? !pairCode.trim() : !report)} onClick={() => void connect()}>{busy ? "Connecting…" : companion ? "Join report session" : "Connect report to assistant"}</button>
    </div> : <>
      <div className="voice-card">
        <div className="voice-row"><strong>{connected.filename}</strong><span className="voice-status">Connected · {Math.ceil(seconds / 60)} min left</span></div>
        <p>{connected.summary}</p>
        <small>Extraction: {connected.provider === "groq" ? "Groq AI" : "Limited rule-based mode"}. Answers show their own provider below.</small>
        <div className="voice-row">
          <label>Answer language <select value={selectedLanguage} onChange={event => { setSelectedLanguage(event.target.value as IndianLanguageCode); audio.stopSpeaking(); audio.stopListening(); setListening(false); }}>
            {SUPPORTED_LANGUAGES.map(lang => <option key={lang.code} value={lang.code}>{lang.nativeName}</option>)}
          </select></label>
          <label><input type="checkbox" checked={autoRead} onChange={event => setAutoRead(event.target.checked)} /> Read replies aloud</label>
        </div>
      </div>
      <div className="voice-prompts">
        {["Explain my report simply", "Show me the gallbladder", "What does my report say about the kidneys?"].map(prompt => <button disabled={busy} key={prompt} onClick={() => void ask(prompt)}>{prompt}</button>)}
      </div>
      <div className="voice-messages" role="log" aria-live="polite" aria-label="Report conversation">
        {messages.map((message, index) => <article key={index} className={message.role === "You" ? "voice-user" : "voice-answer"}>
          <strong>{message.role}</strong>{message.provider && <small>{message.provider === "groq" ? " · Groq AI" : " · Limited rule-based mode (English)"}</small>}
          <p lang={message.language}>{message.text}</p>
          {message.role !== "You" && <button onClick={() => audio.speak(message.text, message.language)}>Read aloud</button>}
        </article>)}
      </div>
      {busy && <p role="status">Working on your request…</p>}
      <form onSubmit={event => { event.preventDefault(); void ask(input); }} className="voice-question">
        <label htmlFor="voice-question">Ask about this report</label>
        <textarea id="voice-question" value={input} maxLength={2000} onChange={event => setInput(event.target.value)} placeholder="Type, or use the microphone then send…" disabled={busy} />
        <div className="voice-row">
          <button type="button" disabled={busy} aria-pressed={listening} onClick={mic}>{listening ? "Stop microphone" : "Use microphone"}</button>
          <button type="button" onClick={() => audio.stopSpeaking()}>Stop audio</button>
          <button className="voice-primary" disabled={busy || !input.trim()}>Send question</button>
        </div>
      </form>
      {!!answer?.warnings?.length && <p className="voice-notice">{answer.warnings.join(" ")}</p>}
      {answer && <details className="voice-card"><summary>Compare with report excerpts</summary>
        <p>These are report excerpts for checking the answer, not sentence-level AI citations. MCP text analysis does not retain original PDF page positions.</p>
        {answer.evidence.map(item => <blockquote key={item.finding_id}><strong>{item.term}</strong><p>{item.quote}</p></blockquote>)}
      </details>}
      <details className="voice-card"><summary>Findings and anatomy</summary>
        {connected.findings.map(finding => <article key={finding.finding_id}><strong>{finding.term}</strong>
          <small> · {finding.negation} · {finding.certainty}</small><p>{finding.report_phrase}</p>
          <button disabled={busy} onClick={() => void run(async () => { await client.call("focus_anatomy", { session_key: connected.session_key, finding_id: finding.finding_id }); })}>Show anatomy</button>
        </article>)}
      </details>
      {viewerStatus && <p role="status" className="voice-notice">{viewerStatus}</p>}
      <button disabled={busy} onClick={() => void run(async () => {
        const result = await client.call<{ questions: { question: string }[] }>("prepare_questions", { session_key: connected.session_key });
        setMessages(previous => [...previous.slice(-15), { role: "RepAnatomy", language: "en", text: result.questions.length ? result.questions.map(item => item.question).join("\n\n") : "No structured findings extracted. Ask your clinician to review the original report." }]);
      })}>Prepare questions for my doctor (English)</button>
      {!companion && <details className="voice-card"><summary>Use another browser as the voice companion · {peers} paired</summary>
        <p>Create an invitation only for a device you trust. It grants access to this report. The invitation expires after two minutes and works once.</p>
        <button disabled={busy} onClick={() => void run(async () => {
          const result = await client.call<{ pairing_code: string }>("create_pairing", { session_key: connected.session_key });
          const url = new URL(location.href); url.search = "?companion=1"; url.hash = `pair=${result.pairing_code}`;
          setPairUrl(url.toString());
        })}>Create companion invitation</button>
        {pairUrl && <label>Private invitation link<input aria-label="Private invitation link" readOnly value={pairUrl} onFocus={event => event.target.select()} /></label>}
        <p>For another physical device, use the same reachable HTTPS site on both browsers. A localhost link only works on this computer.</p>
        <button disabled={busy} onClick={() => void run(async () => {
          await client.call("disconnect", { session_key: connected.session_key, mode: "revoke_companions" }); setPairUrl(""); setPeers(0);
        })}>Revoke all companions and invitations</button>
      </details>}
      <button disabled={busy} onClick={() => void run(async () => {
        await client.call("disconnect", { session_key: connected.session_key });
        keyRef.current = ""; audio.stopSpeaking(); audio.stopListening(); setListening(false);
        setConnected(null); setMessages([]); setAnswer(null); setPairUrl(""); setViewerStatus("");
      })}>{companion ? "Leave report session" : "Disconnect and delete report session"}</button>
    </>}
    {error && <p role="alert" className="voice-error">{error}</p>}
    <details className="voice-card voice-activity"><summary>MCP activity · reviewer view</summary>
      <p>Real MCP 2025-11-25 requests over Streamable HTTP. Report text and access keys are omitted from this log.</p>
      <ol>{activity.map((entry, index) => <li key={index}><time>{entry.at}</time> <code>{entry.method}</code> · {entry.status}</li>)}</ol>
    </details>
    <p className="voice-footnote">Educational prototype. No diagnosis or treatment advice. Voice support depends on your browser and installed voices; speech recognition may use your browser vendor’s service.</p>
  </section>;
}
