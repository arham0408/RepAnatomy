import {
  ArrowUpRight, Bookmark, Brain, ChevronRight, PanelLeft,
  FileHeart, HeartPulse, Home, MousePointer2, Ruler, ShieldCheck,
  ScanLine, Layers3, Wind, Globe2, Dumbbell,
} from "lucide-react";
import { APP_VERSION } from "./version";
import type { ReactNode } from "react";

interface Props {
  pieces: number;
  systems: number;
  ready: boolean;
  online: boolean;
  reportOpen: boolean;
  savedOpen: boolean;
  hideGuide: boolean;
  sidebarContent: ReactNode;
  sidebarExpanded: boolean;
  onSidebarExpandedChange: (expanded: boolean) => void;
  onHome: () => void;
  onReport: () => void;
  onSaved: () => void;
  onAbout: () => void;
  onExplore: (name: string) => void;
}

export default function StudioDashboard({
  pieces, systems, ready, online, reportOpen, savedOpen, hideGuide,
  onHome, onReport, onSaved, onAbout, onExplore,
  sidebarContent, sidebarExpanded, onSidebarExpandedChange,
}: Props) {
  return (
    <>
      <aside className="workspace-sidebar" aria-label="Workspace sidebar" data-expanded={sidebarExpanded}
        onPointerEnter={(event) => { if (event.pointerType === "mouse") onSidebarExpandedChange(true); }}
        onPointerLeave={(event) => { if (event.pointerType === "mouse") onSidebarExpandedChange(false); }}
        onFocusCapture={(event) => { if (event.target.matches(":focus-visible")) onSidebarExpandedChange(true); }}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover")) onSidebarExpandedChange(false); }}
        onKeyDown={(event) => { if (event.key === "Escape") { event.currentTarget.querySelector<HTMLButtonElement>(".sidebar-brand")?.focus(); onSidebarExpandedChange(false); } }}>
      <button className="sidebar-brand" aria-label={sidebarExpanded ? "Collapse navigation" : "Expand navigation"} aria-expanded={sidebarExpanded} onClick={() => onSidebarExpandedChange(!sidebarExpanded)} title="Hover to explore navigation">
        <span className="sidebar-monogram" aria-hidden="true">R</span>
        <span className="sidebar-label sidebar-wordmark">RepAnatomy<small>Your body, better understood.</small></span>
        <PanelLeft size={16} className="sidebar-label sidebar-fold" />
      </button>
      <nav className="workspace-nav" aria-label="Workspace navigation">
        <span className="nav-caption sidebar-label">YOUR WORKSPACE</span>
        <a href="?gym=1" className="nav-item" aria-label="Gym Studio" title="Gym Studio"><Dumbbell size={19}/><span className="sidebar-label">Gym Studio<small>Movement, understood</small></span></a>
        <button aria-label="Anatomy atlas" title="Anatomy atlas" className={`nav-item ${!reportOpen && !savedOpen ? "selected" : ""}`} onClick={onHome} aria-current={!reportOpen && !savedOpen ? "page" : undefined}>
          <Home size={19} /><span className="sidebar-label">Anatomy atlas<small>Explore the human body</small></span>
        </button>
        <button aria-label="Report explorer" title="Report explorer" className={`nav-item ${reportOpen ? "selected" : ""}`} onClick={onReport} aria-current={reportOpen ? "page" : undefined}>
          <FileHeart size={19} /><span className="sidebar-label">Report explorer<small>Make the connections</small></span>
        </button>
        <button aria-label="Saved views" title="Saved views" className={`nav-item ${savedOpen ? "selected" : ""}`} onClick={onSaved} aria-current={savedOpen ? "page" : undefined}>
          <Bookmark size={19} /><span className="sidebar-label">Saved views<small>Your personal collection</small></span>
        </button>
      </nav>
      <div className="sidebar-systems">{sidebarContent}</div>
      <div className="sidebar-bottom">
        <button className="sidebar-about" aria-label="Sources and credits" title="Sources and credits" onClick={onAbout}><ShieldCheck size={18} /><span className="sidebar-label">Sources & credits</span><ArrowUpRight size={13} className="sidebar-label" /></button>
        <div className="workspace-status"><span className={online ? "connection-dot" : "connection-dot offline"} /><span className="sidebar-label">{online ? "Ready to explore" : "Exploring offline"}</span><span className="sidebar-label">v{APP_VERSION}</span></div>
      </div>
      </aside>
      <div className="canvas-heading"><ScanLine size={15} /><span>{ready ? "THE INTERACTIVE ANATOMY ATLAS" : "PREPARING YOUR ATLAS"}</span></div>
      <div className="canvas-hint"><MousePointer2 size={14} />Drag to turn · scroll to zoom</div>
      {!hideGuide && (
        <aside className="discovery-rail" aria-label="Discover more">
          <article className="atlas-guide">
            <span className="intro-eyebrow">HUMAN ANATOMY</span>
            <h2>The human<br /> <em>body.</em></h2>
            <div className="guide-tags"><span>Connected</span><span>Complex</span><span>Remarkable</span></div>
            <p className="guide-description">An extraordinary world, beneath the surface. Explore the structures that move you, sustain you, and make you who you are — one discovery at a time.</p>
            <h3>At a glance</h3>
            <dl className="guide-traits">
              <div><Layers3 size={17} /><dt>Systems</dt><dd>{systems} to explore</dd></div>
              <div><Ruler size={17} /><dt>Structures</dt><dd>{pieces.toLocaleString()} modeled pieces</dd></div>
              <div><Globe2 size={17} /><dt>Languages</dt><dd>8 Indian languages</dd></div>
              <div><ScanLine size={17} /><dt>Perspective</dt><dd>Every angle, in 3D</dd></div>
            </dl>
            <h3>Follow your curiosity</h3>
            <div className="quick-discover">
              {[
                { name: "Heart", query: "heart", description: "The rhythm within", Icon: HeartPulse, tone: "rose" },
                { name: "Brain", query: "brain", description: "A world of connections", Icon: Brain, tone: "ochre" },
                { name: "Lungs", query: "lung", description: "Room for every breath", Icon: Wind, tone: "teal" },
              ].map(({ name, query, description, Icon, tone }) => (
                <button className="discover-structure" key={name} onClick={() => onExplore(query)} disabled={!ready}>
                  <span className={`discovery-icon ${tone}`}><Icon size={21} strokeWidth={1.5} /></span>
                  <span><strong>{name}</strong><small>{description}</small></span><ArrowUpRight size={16} />
                </button>
              ))}
            </div>
            <button className="report-invitation" onClick={onReport}>
              <span className="report-card-icon"><FileHeart size={27} strokeWidth={1.3} /></span>
              <span><strong>Your report, made clearer.</strong><small>Connect findings to your anatomy.</small></span><ChevronRight size={17} />
            </button>
            <p className="guide-footnote">Made for learning. Always keep your clinician in the conversation.</p>
          </article>
        </aside>
      )}
    </>
  );
}
