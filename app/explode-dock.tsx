import { useEffect, useRef, useState, type ReactNode } from "react";
import { Boxes } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ExplodeDock({ value, children }: { value: number; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  const dock = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const dragging = useRef(false);
  const keyboardMode = useRef(false);
  const keyboardInside = () => keyboardMode.current && dock.current?.contains(document.activeElement);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      keyboardMode.current = false;
      if (event.target instanceof Node && !dock.current?.contains(event.target)) setExpanded(false);
    };
    const keyboard = () => { keyboardMode.current = true; };
    const finishDrag = (event: PointerEvent) => {
      if (!dragging.current) return;
      dragging.current = false;
      if (event.pointerType === "mouse" && !dock.current?.matches(":hover") && !keyboardInside()) setExpanded(false);
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", keyboard, true);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, []);

  return (
    <div ref={dock} className="bottom-dock glass" data-expanded={expanded}
      onPointerEnter={(event) => { if (event.pointerType === "mouse") setExpanded(true); }}
      onPointerLeave={(event) => { if (event.pointerType === "mouse" && !dragging.current && !keyboardInside()) setExpanded(false); }}
      onPointerDownCapture={(event) => {
        if (event.target instanceof Element && event.target.closest('[data-slot="slider"]')) dragging.current = true;
      }}
      onFocusCapture={() => { if (keyboardMode.current) setExpanded(true); }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !event.currentTarget.matches(":hover") && !dragging.current) setExpanded(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          trigger.current?.focus();
          setExpanded(false);
        }
      }}>
      <Button ref={trigger} variant="ghost" className="explode-trigger"
        aria-label="Explode anatomy controls" aria-expanded={expanded} aria-controls="explode-dock-controls"
        title={expanded ? "Collapse anatomy controls" : "Expand anatomy controls"}
        onClick={() => setExpanded((open) => !open)}>
        <Boxes size={18} aria-hidden="true" />
        <span id="explode-label">Explode anatomy</span>
        {(expanded || value > 0) && <output aria-hidden="true">{Math.round(value)}%</output>}
      </Button>
      <div id="explode-dock-controls" className="dock-controls" aria-hidden={!expanded} inert={!expanded}>
        {children}
      </div>
    </div>
  );
}
