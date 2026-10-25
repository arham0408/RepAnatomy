import type { SceneState } from "./anatomy.ts";
import type { VerifiedAnatomyTarget } from "./medical-types.ts";

export interface BaselineViewerState {
  selected: string[];
  isolate: boolean;
  visible: SceneState["visible"];
  partVisibility: Record<string, boolean>;
  opacity: Partial<Record<string, number>>;
  focus: number;
}

export class MedicalAnatomyController {
  private baseline: BaselineViewerState | null = null;
  private activeTargetIds: string[] = [];

  /**
   * Captures the initial state of the 3D viewer when entering SehatSetu report explorer.
   */
  public captureBaseline(state: SceneState): void {
    if (!this.baseline) {
      this.baseline = {
        selected: [...state.selected],
        isolate: state.isolate,
        visible: [...state.visible],
        partVisibility: { ...state.partVisibility },
        opacity: { ...state.opacity },
        focus: state.focus ?? 0,
      };
    }
  }

  /**
   * Returns whether a baseline snapshot has been captured.
   */
  public hasBaseline(): boolean {
    return this.baseline !== null;
  }

  /**
   * Highlights a verified anatomical target and flies the camera to it, keeping
   * surrounding anatomy visible.
   */
  public highlightTarget(
    target: VerifiedAnatomyTarget,
    currentState: SceneState,
  ): Partial<SceneState> {
    this.captureBaseline(currentState);
    this.activeTargetIds = [...target.partIds];

    return {
      selected: [...target.partIds],
      pinnedHighlight: [...target.partIds],
      isolate: false,
      focus: (currentState.focus ?? 0) + 1,
      rotate: false,
    };
  }

  /**
   * Isolates a verified anatomical target: hides unrelated structures, keeps
   * the target highlighted, and flies the camera in close.
   */
  public isolateTarget(
    target: VerifiedAnatomyTarget,
    currentState: SceneState,
  ): Partial<SceneState> {
    this.captureBaseline(currentState);
    this.activeTargetIds = [...target.partIds];

    return {
      selected: [...target.partIds],
      pinnedHighlight: [...target.partIds],
      isolate: true,
      focus: (currentState.focus ?? 0) + 1,
      rotate: false,
    };
  }

  /**
   * Highlights all verified targets extracted from the report at once.
   */
  public focusAllTargets(
    targets: VerifiedAnatomyTarget[],
    currentState: SceneState,
  ): Partial<SceneState> {
    this.captureBaseline(currentState);
    const allPartIds = [
      ...new Set(targets.flatMap((t) => t.partIds)),
    ];
    this.activeTargetIds = allPartIds;

    return {
      selected: allPartIds,
      pinnedHighlight: allPartIds,
      isolate: false,
      focus: (currentState.focus ?? 0) + 1,
      rotate: false,
    };
  }

  /**
   * Restores the exact visualization state that existed prior to entering report mode.
   */
  public restoreBaseline(currentState: SceneState): Partial<SceneState> {
    if (!this.baseline) {
      return {
        selected: [],
        isolate: false,
        focus: (currentState.focus ?? 0) + 1,
        reset: (currentState.reset ?? 0) + 1,
      };
    }

    const restored: Partial<SceneState> = {
      selected: [...this.baseline.selected],
      isolate: this.baseline.isolate,
      visible: [...this.baseline.visible],
      partVisibility: { ...this.baseline.partVisibility },
      opacity: { ...this.baseline.opacity },
      focus: (currentState.focus ?? 0) + 1,
      reset: (currentState.reset ?? 0) + 1,
    };

    this.baseline = null;
    this.activeTargetIds = [];
    return restored;
  }
}
