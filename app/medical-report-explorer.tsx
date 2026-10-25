import { useState, useRef, useEffect, useCallback, useMemo, type ChangeEvent, type FormEvent } from "react";
import {
  FileText,
  Upload,
  Volume2,
  VolumeX,
  Mic,
  Send,
  Eye,
  Layers,
  RotateCcw,
  AlertCircle,
  CheckCircle2,
  HelpCircle,
  X,
  ArrowRight,
  Sparkles,
  Bot,
  ListFilter,
} from "lucide-react";
import type { Atlas, SceneState } from "./anatomy.ts";
import { TRANSLATIONS } from "./medical-i18n.ts";
import { MedicalAudioController } from "./medical-audio.ts";
import { MedicalAnatomyController } from "./medical-anatomy-controller.ts";
import {
  SAMPLE_REPORTS,
  analyzeReport,
  isLocationRequest,
  sendChatMessage,
} from "./medical-report-service.ts";
import { ScopedChat } from "./medical-scoped-chat.tsx";
import {
  enrichFindingsWithAtlas,
  isVisualizableFinding,
} from "./medical-mapping.ts";
import {
  SUPPORTED_LANGUAGES,
  type ChatMessage,
  type IndianLanguageCode,
  type MedicalFinding,
  type ReportAnalysisState,
  type VerifiedAnatomyTarget,
} from "./medical-types.ts";
import "./medical-report-explorer.css";

interface Props {
  atlas: Atlas;
  sceneState: SceneState;
  onUpdateSceneState: (update: Partial<SceneState> | ((current: SceneState) => SceneState)) => void;
  onClose: () => void;
}

export default function MedicalReportExplorer({
  atlas,
  sceneState,
  onUpdateSceneState,
  onClose,
}: Props) {
  const [sessionId, setSessionId] = useState<string>(() => `sess-${Date.now()}`);
  const [language, setLanguage] = useState<IndianLanguageCode>("en");
  const [activeTab, setActiveTab] = useState<"findings" | "chat" | "upload">("upload");
  const [reportState, setReportState] = useState<ReportAnalysisState>({ status: "idle" });
  const [activeFindingId, setActiveFindingId] = useState<string | null>(null);
  const [isolateMode, setIsolateMode] = useState(false);
  const [findingChatOpenId, setFindingChatOpenId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeSpeechId, setActiveSpeechId] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pastedText, setPastedText] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioCtrl = useRef(new MedicalAudioController());
  const anatomyCtrl = useRef(new MedicalAnatomyController());
  const chatStreamRef = useRef<HTMLDivElement>(null);
  const findingCardsRef = useRef<Map<string, HTMLElement>>(new Map());

  const t = TRANSLATIONS[language] || TRANSLATIONS.en;

  // Section 9: the finding-to-anatomy mapping is recomputed from the stored
  // extracted findings whenever the loaded atlas model changes, without
  // re-running LLM analysis. Findings that resolve against the CURRENT model
  // stay in the linked card list; the rest are preserved in data only.
  const activeReport = useMemo(() => {
    if (!reportState.result) return null;
    const findings = enrichFindingsWithAtlas(reportState.result.findings, atlas);
    return { ...reportState.result, findings };
  }, [reportState.result, atlas]);

  const visualizableFindings = useMemo(
    () => activeReport?.findings.filter(isVisualizableFinding) ?? [],
    [activeReport],
  );
  const notVisualizableFindings = useMemo(
    () => activeReport?.findings.filter((f) => !isVisualizableFinding(f)) ?? [],
    [activeReport],
  );

  // Cleanup on unmount: stop audio and restore baseline visual state
  useEffect(() => {
    const audio = audioCtrl.current;
    const anatomy = anatomyCtrl.current;

    return () => {
      audio.stopSpeaking();
      audio.stopListening();
      if (anatomy.hasBaseline()) {
        onUpdateSceneState((current) => ({
          ...current,
          ...anatomy.restoreBaseline(current),
          pinnedHighlight: [],
        }));
      }
    };
  }, [onUpdateSceneState]);

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    if (chatStreamRef.current) {
      chatStreamRef.current.scrollTop = chatStreamRef.current.scrollHeight;
    }
  }, [chatMessages]);

  // Scroll active finding card into view when selected
  useEffect(() => {
    if (!activeFindingId) return;
    const el = findingCardsRef.current.get(activeFindingId);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }, [activeFindingId]);

  // Synchronize 3D scene selection with medical findings
  useEffect(() => {
    if (!sceneState.selected || sceneState.selected.length === 0) return;
    if (!activeReport) return;

    const selectedSet = new Set(sceneState.selected);
    const matching = activeReport.findings.find((f) =>
      f.verifiedTargets.some((target) => target.partIds.some((pid) => selectedSet.has(pid))),
    );

    if (matching) {
      setActiveFindingId(matching.findingId);
    }
  }, [sceneState.selected, activeReport]);

  // Derive organ information for currently selected 3D piece
  const selectedOrganContext = useMemo(() => {
    if (!sceneState.selected || sceneState.selected.length === 0) return null;
    const firstPartId = sceneState.selected[0];
    const part = atlas.parts.find((p) => p.id === firstPartId);
    if (!part) return null;

    const matchingFinding = activeReport?.findings.find((f) =>
      f.verifiedTargets.some((t) => t.partIds.includes(firstPartId)),
    );

    return {
      partId: firstPartId,
      partName: part.name,
      system: part.system,
      finding: matchingFinding || null,
    };
  }, [sceneState.selected, atlas.parts, reportState.result]);

  const processReport = useCallback(
    async (content: { file?: File; text?: string; filename: string }) => {
      // Cleanly isolate this session: stop speech, clear previous chat, findings, and highlights
      const newSessionId = `sess-${Date.now()}`;
      setSessionId(newSessionId);
      audioCtrl.current.stopSpeaking();
      audioCtrl.current.stopListening();
      setIsListening(false);
      setIsSpeaking(false);
      setActiveSpeechId(null);
      setActiveFindingId(null);
      setChatMessages([]);

      // Clean prior highlights from scene immediately
      onUpdateSceneState((current) => ({
        ...current,
        pinnedHighlight: [],
        selected: [],
      }));

      anatomyCtrl.current.captureBaseline(sceneState);
      setReportState({
        status: "extracting",
        filename: content.filename,
        progressPercent: 20,
        progressMessage: t.extracting,
      });

      try {
        const result = await analyzeReport(content, atlas, language, (pct, msg) => {
          setReportState((prev) => ({
            ...prev,
            progressPercent: pct,
            progressMessage: msg,
          }));
        });

        setReportState({
          status: "ready",
          filename: content.filename,
          result,
          progressPercent: 100,
        });

        // Add welcome message in chat with report summary
        const initialGreeting: ChatMessage = {
          id: `init-${Date.now()}`,
          sender: "assistant",
          text: `${result.summary}\n\nYou can tap any finding to navigate to its 3D anatomy, or ask questions in ${SUPPORTED_LANGUAGES.find((l) => l.code === language)?.name}.`,
          timestamp: Date.now(),
        };
        setChatMessages([initialGreeting]);

        // Auto highlight all verified findings as soon as the report loads
        const allTargets = result.findings.flatMap((f) => f.verifiedTargets);
        if (allTargets.length > 0) {
          const update = anatomyCtrl.current.focusAllTargets(allTargets, sceneState);
          onUpdateSceneState((current) => ({
            ...current,
            ...update,
          }));
        }

        setActiveTab("findings");
      } catch (err) {
        setReportState({
          status: "failed",
          error: err instanceof Error ? err.message : "Failed to analyze medical report.",
        });
      }
    },
    [atlas, language, onUpdateSceneState, sceneState, t.extracting],
  );

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void processReport({ file, filename: file.name });
    }
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      void processReport({ file, filename: file.name });
    }
  };

  const handleLoadSample = (key: "abdomen" | "chest" | "brain") => {
    const sample = SAMPLE_REPORTS[key];
    void processReport({ text: sample.text, filename: sample.filename });
  };

  const handlePastedSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (pastedText.trim()) {
      void processReport({ text: pastedText.trim(), filename: "Pasted_Clinical_Report.txt" });
    }
  };

  // Clicking a finding card is the single highlight entry point: pick the
  // organ, fly the camera to it, and keep the yellow highlight on. Selecting
  // another card simply moves the highlight — nothing to lock or unlock.
  const handleSelectFinding = (finding: MedicalFinding) => {
    setActiveFindingId(finding.findingId);

    if (finding.verifiedTargets.length > 0) {
      const primaryTarget = finding.verifiedTargets[0];
      const update = isolateMode
        ? anatomyCtrl.current.isolateTarget(primaryTarget, sceneState)
        : anatomyCtrl.current.highlightTarget(primaryTarget, sceneState);
      onUpdateSceneState((current) => ({
        ...current,
        ...update,
      }));
    }
  };

  const handleFocusTarget = (target: VerifiedAnatomyTarget, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const update = isolateMode
      ? anatomyCtrl.current.isolateTarget(target, sceneState)
      : anatomyCtrl.current.highlightTarget(target, sceneState);
    onUpdateSceneState((current) => ({
      ...current,
      ...update,
    }));
  };

  const handleToggleIsolate = () => {
    setIsolateMode((prev) => {
      const next = !prev;
      // Re-apply the active finding under the new mode so the toggle has an
      // immediate effect instead of waiting for the next click.
      const activeFinding = activeReport?.findings.find((f) => f.findingId === activeFindingId);
      const target = activeFinding?.verifiedTargets[0];
      if (target) {
        const update = next
          ? anatomyCtrl.current.isolateTarget(target, sceneState)
          : anatomyCtrl.current.highlightTarget(target, sceneState);
        onUpdateSceneState((current) => ({
          ...current,
          ...update,
        }));
      } else if (!next) {
        onUpdateSceneState((current) => ({
          ...current,
          isolate: false,
        }));
      }
      return next;
    });
  };

  const handleHighlightAll = () => {
    // Only verified, renderable targets are highlighted; invalid IDs are
    // ignored. Never report success when zero valid targets resolve.
    if (!activeReport) return;
    const allTargets = visualizableFindings.flatMap((f) => f.verifiedTargets);
    const allPartIds = [
      ...new Set(allTargets.flatMap((t) => t.partIds).filter((pid) => atlas.parts.some((p) => p.id === pid))),
    ];
    if (allPartIds.length === 0) return;

    const update = anatomyCtrl.current.focusAllTargets(allTargets, sceneState);
    setIsolateMode(false);
    onUpdateSceneState((current) => ({
      ...current,
      ...update,
    }));
    setActiveFindingId(null);
  };

  const handleResetView = () => {
    const update = anatomyCtrl.current.restoreBaseline(sceneState);
    setIsolateMode(false);
    onUpdateSceneState((current) => ({
      ...current,
      ...update,
      pinnedHighlight: [],
    }));
    setActiveFindingId(null);
  };

  const handleClearReport = () => {
    audioCtrl.current.stopSpeaking();
    audioCtrl.current.stopListening();
    setIsSpeaking(false);
    setIsListening(false);
    setActiveSpeechId(null);
    setReportState({ status: "idle" });
    setChatMessages([]);
    setActiveFindingId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (anatomyCtrl.current.hasBaseline()) {
      onUpdateSceneState((current) => ({
        ...current,
        ...anatomyCtrl.current.restoreBaseline(current),
        pinnedHighlight: [],
      }));
    } else {
      onUpdateSceneState((current) => ({
        ...current,
        pinnedHighlight: [],
        selected: [],
      }));
    }
    setActiveTab("upload");
  };

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || chatInput;
    if (!textToSend.trim()) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: textToSend.trim(),
      timestamp: Date.now(),
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput("");

    const reportContext = activeReport?.extractedText || "";
    const assistantMsg = await sendChatMessage(
      textToSend,
      reportContext,
      atlas,
      language,
      chatMessages,
      selectedOrganContext?.partName || null,
      selectedOrganContext?.finding?.term || null,
      sessionId,
      {
        contextType: isLocationRequest(textToSend) ? "location" : "report",
        reportId: activeReport?.reportId,
        preferredLanguage: language,
      },
    );

    setChatMessages((prev) => [...prev, assistantMsg]);

    // If navigation intent is present, highlight the mentioned target and fly to it.
    if (assistantMsg.mentionedTargets?.length) {
      const target = assistantMsg.mentionedTargets[0];
      const update = isolateMode
        ? anatomyCtrl.current.isolateTarget(target, sceneState)
        : anatomyCtrl.current.highlightTarget(target, sceneState);
      onUpdateSceneState((current) => ({
        ...current,
        ...update,
      }));
    }
  };

  const handleToggleVoice = () => {
    if (isListening) {
      audioCtrl.current.stopListening();
      setIsListening(false);
      return;
    }

    const started = audioCtrl.current.startListening(language, {
      onInterimResult: (interim) => {
        setChatInput(interim);
      },
      onFinalResult: (final) => {
        setChatInput(final);
        setIsListening(false);
        void handleSendMessage(final);
      },
      onError: (err) => {
        setIsListening(false);
        if (err === "not-allowed") {
          alert(t.micDenied);
        }
      },
      onEnd: () => {
        setIsListening(false);
      },
    });

    if (started) {
      setIsListening(true);
    } else {
      alert(t.voiceUnavailable);
    }
  };

  // Speech follows the actual response language of the message,
  // not the currently selected UI language.
  const handleSpeak = (msg: ChatMessage) => {
    if (isSpeaking && activeSpeechId === msg.id) {
      audioCtrl.current.stopSpeaking();
      setIsSpeaking(false);
      setActiveSpeechId(null);
      return;
    }

    setActiveSpeechId(msg.id);
    setIsSpeaking(true);

    audioCtrl.current.speak(msg.text, msg.language ?? language, {
      onEnd: () => {
        setIsSpeaking(false);
        setActiveSpeechId(null);
      },
      onError: () => {
        setIsSpeaking(false);
        setActiveSpeechId(null);
      },
    });
  };

  const handleClose = () => {
    audioCtrl.current.stopSpeaking();
    audioCtrl.current.stopListening();
    if (anatomyCtrl.current.hasBaseline()) {
      onUpdateSceneState((current) => ({
        ...current,
        ...anatomyCtrl.current.restoreBaseline(current),
      }));
    }
    onClose();
  };

  return (
    <div className="sehatsetu-panel" role="region" aria-label="SehatSetu Medical Report Explorer">
      {/* Header */}
      <header className="sehatsetu-header">
        <div className="sehatsetu-header-title">
          <span className="sehatsetu-badge">SEHATSETU</span>
          <h2>Report Explorer</h2>
        </div>
        <div className="sehatsetu-header-controls">
          <select
            className="sehatsetu-lang-select"
            value={language}
            onChange={(e) => {
              audioCtrl.current.stopSpeaking();
              audioCtrl.current.stopListening();
              setIsSpeaking(false);
              setIsListening(false);
              setActiveSpeechId(null);
              setLanguage(e.target.value as IndianLanguageCode);
            }}
            aria-label="Select report language"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.nativeName} ({lang.name})
              </option>
            ))}
          </select>
          <button
            type="button"
            className="sehatsetu-icon-btn"
            onClick={handleClose}
            aria-label="Close report explorer"
            title="Exit report mode"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="sehatsetu-tabs" role="tablist">
        <button
          type="button"
          className={`sehatsetu-tab-btn ${activeTab === "findings" ? "active" : ""}`}
          onClick={() => setActiveTab("findings")}
          role="tab"
          aria-selected={activeTab === "findings"}
        >
          <ListFilter size={14} />
          <span>{t.findingsHeading}</span>
          {reportState.result?.findings.length ? (
            <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded-full font-bold">
              {reportState.result.findings.length}
            </span>
          ) : null}
        </button>
        <button
          type="button"
          className={`sehatsetu-tab-btn ${activeTab === "chat" ? "active" : ""}`}
          onClick={() => setActiveTab("chat")}
          role="tab"
          aria-selected={activeTab === "chat"}
        >
          <Bot size={14} />
          <span>{t.chatHeading}</span>
        </button>
        <button
          type="button"
          className={`sehatsetu-tab-btn ${activeTab === "upload" ? "active" : ""}`}
          onClick={() => setActiveTab("upload")}
          role="tab"
          aria-selected={activeTab === "upload"}
        >
          <Upload size={14} />
          <span>{t.uploadHeading}</span>
        </button>
      </div>

      {/* Body Area */}
      <div className="sehatsetu-body">
        {/* Active Report Header if report is loaded */}
        {activeReport && (
          <div className="sehatsetu-active-report-bar">
            <div className="sehatsetu-report-name" title={activeReport.filename}>
              <FileText size={14} />
              <span>{activeReport.filename}</span>
            </div>
            <button
              type="button"
              className="text-xs text-blue-700 hover:underline bg-transparent border-0 cursor-pointer p-0"
              onClick={handleClearReport}
              title="Clear current report and load or upload a new one"
            >
              {t.clearReport}
            </button>
          </div>
        )}

        {/* 3D Anatomy Viewport Toolbar (Visible when findings are present) */}
        {activeReport && visualizableFindings.length > 0 && (
          <div className="sehatsetu-viewer-toolbar" aria-label="Anatomical visualization controls">
            <button
              type="button"
              className={`sehatsetu-toolbar-btn ${isolateMode ? "active" : ""}`}
              onClick={handleToggleIsolate}
              title={isolateMode ? "Show all anatomy again" : "Hide surrounding anatomy and zoom in on the highlighted organ"}
              aria-pressed={isolateMode}
            >
              {isolateMode ? <Eye size={12} /> : <Layers size={12} />}
              <span>{isolateMode ? t.surroundings : t.isolate}</span>
            </button>
            <button
              type="button"
              className="sehatsetu-toolbar-btn"
              onClick={handleHighlightAll}
              title="Highlight all verified findings from report simultaneously"
            >
              <Sparkles size={12} />
              <span>{t.highlightAll}</span>
            </button>
            <button
              type="button"
              className="sehatsetu-toolbar-btn"
              onClick={handleResetView}
              title="Reset 3D view and restore original anatomy state"
            >
              <RotateCcw size={12} />
              <span>{t.resetView}</span>
            </button>
          </div>
        )}

        {/* TAB 1: FINDINGS */}
        {activeTab === "findings" && (
          <div className="flex flex-col gap-3">
            {reportState.status === "extracting" || reportState.status === "analyzing" ? (
              <div className="sehatsetu-progress-box">
                <div className="sehatsetu-progress-header">
                  <span>{reportState.progressMessage || t.analyzing}</span>
                  <span>{reportState.progressPercent || 40}%</span>
                </div>
                <div className="sehatsetu-progress-track">
                  <div
                    className="sehatsetu-progress-bar"
                    style={{ width: `${reportState.progressPercent || 40}%` }}
                  />
                </div>
              </div>
            ) : !reportState.result || reportState.result.findings.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs">
                <p>{t.noFindings}</p>
                <button
                  type="button"
                  className="mt-3 px-3 py-1.5 bg-blue-600 text-white rounded-md text-xs font-semibold cursor-pointer border-0"
                  onClick={() => setActiveTab("upload")}
                >
                  {t.uploadHeading}
                </button>
              </div>
            ) : (
              <div className="sehatsetu-findings-list">
                {/* 3D Clicked Organ Context Card Grounded in Report */}
                {selectedOrganContext && (
                  <div className={`sehatsetu-inspected-card ${selectedOrganContext.finding ? "has-finding" : "reference"}`}>
                    <div className="sehatsetu-inspected-header">
                      <div className="sehatsetu-inspected-title">
                        <Sparkles size={14} className={selectedOrganContext.finding ? "text-amber-500" : "text-blue-500"} />
                        <span>3D Inspected: {selectedOrganContext.partName}</span>
                      </div>
                      <span className={`sehatsetu-status-badge ${selectedOrganContext.finding ? (selectedOrganContext.finding.negation === "ruled_out" ? "ruled_out" : "confirmed") : "confirmed"}`}>
                        {selectedOrganContext.finding
                          ? selectedOrganContext.finding.negation === "ruled_out"
                            ? "Ruled Out in Report"
                            : `${selectedOrganContext.finding.term} (In Report)`
                          : "Reference Anatomy (Normal)"}
                      </span>
                    </div>

                    {selectedOrganContext.finding ? (
                      <div className="text-xs text-slate-700 flex flex-col gap-1">
                        <p className="m-0 font-medium">
                          {selectedOrganContext.finding.observation || selectedOrganContext.finding.explanation}
                        </p>
                        {selectedOrganContext.finding.measurement && (
                          <div className="text-[11px] font-semibold text-amber-900 bg-amber-100/80 inline-block px-1.5 py-0.5 rounded w-fit">
                            Measurement: {selectedOrganContext.finding.measurement.value} {selectedOrganContext.finding.measurement.unit}
                          </div>
                        )}
                        {selectedOrganContext.finding.condition && (
                          <div className="text-[11px] text-slate-500">
                            Diagnosis / Condition: <em>{selectedOrganContext.finding.condition}</em>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-600 m-0">
                        Normal reference anatomical structure in 3D atlas. No abnormalities or clinical findings identified for this organ in your uploaded medical report.
                      </p>
                    )}

                    <div className="sehatsetu-inspected-actions">
                      <button
                        type="button"
                        className="sehatsetu-focus-btn text-xs"
                        onClick={() => {
                          setActiveTab("chat");
                          void handleSendMessage(
                            selectedOrganContext.finding
                              ? `Explain what my medical report states about the ${selectedOrganContext.partName} and the finding: ${selectedOrganContext.finding.term}`
                              : `Explain the anatomical role of the ${selectedOrganContext.partName} and verify whether it was mentioned in my report`,
                          );
                        }}
                      >
                        <Bot size={13} />
                        <span>Ask AI about {selectedOrganContext.partName}</span>
                      </button>
                    </div>
                  </div>
                )}

                {visualizableFindings.map((f) => (
                  <article
                    key={f.findingId}
                    ref={(el) => {
                      if (el) findingCardsRef.current.set(f.findingId, el);
                      else findingCardsRef.current.delete(f.findingId);
                    }}
                    className={`sehatsetu-finding-card ${activeFindingId === f.findingId ? "active-target" : ""}`}
                    onClick={() => handleSelectFinding(f)}
                  >
                    <div className="sehatsetu-finding-header">
                      <div className="sehatsetu-finding-term">{f.term}</div>
                      <span
                        className={`sehatsetu-status-badge ${f.negation === "ruled_out" ? "ruled_out" : f.certainty === "suspected" ? "suspected" : "confirmed"}`}
                      >
                        {f.negation === "ruled_out"
                          ? t.negated
                          : f.certainty === "suspected"
                            ? t.suspected
                            : t.confirmed}
                      </span>
                    </div>

                    <p className="sehatsetu-finding-explanation">{f.explanation}</p>

                    {/* Targets row */}
                    <div className="sehatsetu-targets-row">
                      {f.verifiedTargets.map((target) => (
                        <span
                          key={target.targetId}
                          className={`sehatsetu-organ-pill ${target.relationshipType}`}
                        >
                          <CheckCircle2 size={11} />
                          <span>{target.name}</span>
                          <small className="opacity-75">
                            ({target.relationshipType === "direct" ? t.verifiedTag : t.conditionTag})
                          </small>
                        </span>
                      ))}

                      {f.verifiedTargets.length === 0 && (
                        <span className="sehatsetu-organ-pill unresolved">
                          <AlertCircle size={11} />
                          <span>{t.unresolvedTag}</span>
                        </span>
                      )}
                    </div>

                    {/* Evidence quote */}
                    <div className="sehatsetu-finding-evidence">
                      &ldquo;{f.source.evidenceText || f.reportPhrase}&rdquo;
                    </div>

                    {/* Actions */}
                    <div className="sehatsetu-finding-actions">
                      {f.verifiedTargets.length > 0 && (
                        <button
                          type="button"
                          className="sehatsetu-focus-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            // One action: isolate the organ in 3D AND open the
                            // chat already scoped to this finding's context.
                            const primaryTarget = f.verifiedTargets[0];
                            const update = anatomyCtrl.current.isolateTarget(primaryTarget, sceneState);
                            onUpdateSceneState((current) => ({
                              ...current,
                              ...update,
                            }));
                            setIsolateMode(true);
                            setActiveFindingId(f.findingId);
                            setFindingChatOpenId(f.findingId);
                          }}
                        >
                          <Layers size={12} />
                          <span>{t.locateIn3D}</span>
                        </button>
                      )}
                      {/* Per-finding contextual AI chat with voice (own history, own language) */}
                      <ScopedChat
                        className="sehatsetu-finding-ask"
                        atlas={atlas}
                        scoped={{
                          contextType: "finding",
                          reportId: activeReport?.reportId,
                          findingId: f.findingId,
                          findingTerm: f.term,
                          findingEvidence: f.source.evidenceText || f.reportPhrase,
                          findingExplanation: f.explanation,
                          findingCondition: f.condition,
                          findingCertainty: `${f.negation} / ${f.certainty}`,
                          findingMeasurement: f.measurement
                            ? `${f.measurement.value} ${f.measurement.unit}`
                            : undefined,
                          findingPage: f.source.page,
                          verifiedStructureIds: f.verifiedTargets.flatMap((t) => t.partIds).slice(0, 24),
                          preferredLanguage: language,
                        }}
                        reportContext={activeReport?.extractedText ?? ""}
                        language={language}
                        label={t.askAi}
                        placeholder={t.findingChatPlaceholder}
                        open={findingChatOpenId === f.findingId}
                        onOpenChange={(open) => setFindingChatOpenId(open ? f.findingId : null)}
                      />
                    </div>
                  </article>
                ))}

                {/* Section 9: findings without a verified 3D target in the loaded
                    model are kept in data, never assigned fake meshes, and are
                    surfaced only as this concise note. */}
                {notVisualizableFindings.length > 0 && (
                  <div className="sehatsetu-unavailable-note">
                    <AlertCircle size={12} className="shrink-0" />
                    <span>
                      {t.notVisualizable} ({notVisualizableFindings.length}):{" "}
                      {notVisualizableFindings.map((f) => f.reportPhrase?.trim() || f.term).join(" · ")}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: AI CHAT ASSISTANT */}
        {activeTab === "chat" && (
          <div className="flex flex-col gap-3 flex-1">
            <div className="sehatsetu-chat-stream" ref={chatStreamRef}>
              {chatMessages.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-xs">
                  <Bot size={28} className="mx-auto mb-2 text-blue-500 opacity-60" />
                  <p>Ask questions about your medical report, organs, or terminology in {SUPPORTED_LANGUAGES.find((l) => l.code === language)?.name}.</p>
                </div>
              ) : (
                chatMessages.map((msg) => (
                  <div key={msg.id} className={`sehatsetu-chat-msg ${msg.sender}`}>
                    <div className="sehatsetu-msg-bubble">
                      <p className="whitespace-pre-wrap m-0">{msg.text}</p>
                    </div>
                    {msg.sender === "assistant" && (
                      <div className="sehatsetu-msg-actions">
                        <button
                          type="button"
                          className="sehatsetu-audio-btn"
                          onClick={() => handleSpeak(msg)}
                          title={isSpeaking && activeSpeechId === msg.id ? t.stopSpeaking : t.speakResponse}
                          aria-label={isSpeaking && activeSpeechId === msg.id ? t.stopSpeaking : t.speakResponse}
                        >
                          {isSpeaking && activeSpeechId === msg.id ? (
                            <VolumeX size={13} className="text-red-500" />
                          ) : (
                            <Volume2 size={13} />
                          )}
                        </button>
                        {msg.mentionedTargets && msg.mentionedTargets.length > 0 && (
                          <button
                            type="button"
                            className="text-[11px] text-blue-600 font-semibold bg-transparent border-0 cursor-pointer hover:underline flex items-center gap-1 p-0"
                            onClick={() => handleFocusTarget(msg.mentionedTargets![0])}
                          >
                            <Eye size={11} />
                            <span>Locate {msg.mentionedTargets[0].name} in 3D</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Active Organ Context Banner */}
            {selectedOrganContext && (
              <div className="sehatsetu-organ-context-banner">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Sparkles size={13} className="text-amber-600 shrink-0" />
                  <span className="truncate">
                    Inspecting: <strong>{selectedOrganContext.partName}</strong>
                    {selectedOrganContext.finding ? ` (${selectedOrganContext.finding.term})` : " (Reference Anatomy)"}
                  </span>
                </div>
                <button
                  type="button"
                  className="sehatsetu-context-pill-btn"
                  onClick={() =>
                    void handleSendMessage(
                      selectedOrganContext.finding
                        ? `Tell me more about the ${selectedOrganContext.finding.term} in my ${selectedOrganContext.partName}`
                        : `Explain the role of the ${selectedOrganContext.partName} and verify if anything abnormal was found in my report`,
                    )
                  }
                >
                  Ask AI
                </button>
              </div>
            )}

            {/* Input Bar */}
            <div className="sehatsetu-chat-input-bar">
              <input
                type="text"
                className="sehatsetu-chat-input"
                placeholder={isListening ? t.listening : t.chatPlaceholder}
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleSendMessage();
                  }
                }}
              />
              <button
                type="button"
                className={`sehatsetu-icon-btn ${isListening ? "listening" : ""}`}
                onClick={handleToggleVoice}
                title={isListening ? "Stop listening" : t.voiceInput}
                aria-label={isListening ? "Stop listening" : t.voiceInput}
              >
                <Mic size={16} />
              </button>
              <button
                type="button"
                className="sehatsetu-icon-btn sehatsetu-send-btn"
                onClick={() => handleSendMessage()}
                title={t.send}
                aria-label={t.send}
              >
                <Send size={15} />
              </button>
            </div>
          </div>
        )}

        {/* TAB 3: UPLOAD & SAMPLES */}
        {activeTab === "upload" && (
          <div className="flex flex-col gap-4">
            {/* Drag & Drop Upload Zone */}
            <div
              className={`sehatsetu-dropzone ${isDragging ? "dragging" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,application/pdf"
                className="sr-only"
                onChange={handleFileUpload}
              />
              <div className="sehatsetu-dropzone-icon">
                <Upload size={20} />
              </div>
              <div className="sehatsetu-dropzone-text">{t.uploadPrompt}</div>
              <div className="sehatsetu-dropzone-sub">{t.uploadSubtext}</div>
            </div>

            {/* Instant Sample Reports */}
            <div className="sehatsetu-samples-section">
              <div className="sehatsetu-section-label">{t.sampleReports}</div>
              <button
                type="button"
                className="sehatsetu-sample-chip"
                onClick={() => handleLoadSample("abdomen")}
              >
                <span>{t.sampleAbdomen}</span>
                <ArrowRight size={13} />
              </button>
              <button
                type="button"
                className="sehatsetu-sample-chip"
                onClick={() => handleLoadSample("chest")}
              >
                <span>{t.sampleChest}</span>
                <ArrowRight size={13} />
              </button>
              <button
                type="button"
                className="sehatsetu-sample-chip"
                onClick={() => handleLoadSample("brain")}
              >
                <span>{t.sampleBrain}</span>
                <ArrowRight size={13} />
              </button>
            </div>

            {/* Paste Text Fallback */}
            <div>
              <button
                type="button"
                className="text-xs text-slate-600 hover:text-blue-600 font-semibold flex items-center gap-1 bg-transparent border-0 cursor-pointer p-0"
                onClick={() => setShowPaste(!showPaste)}
              >
                <span>{t.pasteFallback}</span>
              </button>

              {showPaste && (
                <form onSubmit={handlePastedSubmit} className="mt-2 flex flex-col gap-2">
                  <textarea
                    className="w-full h-24 p-2 text-xs border border-slate-300 rounded-md resize-none outline-none focus:border-blue-500 font-sans"
                    placeholder={t.pastePlaceholder}
                    value={pastedText}
                    onChange={(e) => setPastedText(e.target.value)}
                  />
                  <button
                    type="submit"
                    className="self-end px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-xs font-semibold cursor-pointer border-0"
                  >
                    {t.processPastedText}
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Educational Disclaimer */}
        <footer className="sehatsetu-disclaimer">
          <HelpCircle size={14} className="shrink-0 text-slate-400 mt-0.5" />
          <span>{t.disclaimer}</span>
        </footer>
      </div>
    </div>
  );
}
