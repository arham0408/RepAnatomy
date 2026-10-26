"""Frame-based coaching with OpenCV 5, bounded ephemeral sessions and auditable actions.

Pose estimation runs in the browser. Landmarks are observations supplied by that
client, not independent proof of correct form. No model weights from other apps.
"""
import base64
import binascii
import json
import math
import os
import secrets
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

if cv2.__version__.split(".")[0] != "5":
    raise RuntimeError("Gym Studio requires OpenCV 5. Install backend/requirements.txt.")

EXERCISES = json.loads((Path(__file__).resolve().parents[1] / "data/fitness/exercises.json").read_text())
CATALOG = {e["id"]: e for e in EXERCISES}
router = APIRouter(prefix="/api/fitness", tags=["Gym Studio"])
ExerciseId = Literal["squat", "pushup", "curl", "press", "lunge"]
JOINTS = {"left_shoulder": 11, "right_shoulder": 12, "left_elbow": 13, "right_elbow": 14,
          "left_wrist": 15, "right_wrist": 16, "left_hip": 23, "right_hip": 24,
          "left_knee": 25, "right_knee": 26, "left_ankle": 27, "right_ankle": 28}
BODY25 = {11: 5, 12: 2, 13: 6, 14: 3, 15: 7, 16: 4, 23: 12, 24: 9, 25: 13, 26: 10, 27: 14, 28: 11}
TTL = 30 * 60
MAX_SESSIONS = 64


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


class Landmark(Input):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)
    visibility: float = Field(default=1, ge=0, le=1)


class SessionRequest(Input):
    exercise: ExerciseId
    source: Literal["camera", "video", "synthetic", "body25"]


class FrameRequest(Input):
    image: str = Field(max_length=1_400_000)
    timestamp_ms: float = Field(ge=0, le=1e12)
    landmarks: list[Landmark] = Field(default_factory=list, max_length=33)
    body25: list[float] | None = Field(default=None, min_length=75, max_length=75)
    pain: bool = False


class PlanRequest(Input):
    days: int = Field(default=3, ge=2, le=4)
    diet: Literal["vegetarian", "vegan", "omnivore"] = "vegetarian"
    goal: Literal["build_consistency", "strength", "general_fitness"] = "build_consistency"
    restricted_foods: list[Literal["dairy", "soy", "gluten", "nuts", "eggs", "legumes", "fish"]] = Field(default_factory=list, max_length=7)
    needs_clinical_review: bool = False


@dataclass
class Workout:
    exercise: str
    source: str
    created: float = field(default_factory=time.monotonic)
    last_timestamp: float = -1
    last_received: float = 0
    phase: str = "seek_start"
    cycle_start: float = 0
    cycle_bad: bool = False
    reps: int = 0
    accepted: int = 0
    rejected: int = 0
    frames: int = 0
    faults: int = 0
    stopped: bool = False
    previous_gray: object = None
    previous_points: object = None
    events: list = field(default_factory=list)
    last_action: str = ""
    vision_action: str = "reframe"


workouts: dict[str, Workout] = {}
lock = threading.RLock()


def prune_workouts():
    for key in [key for key, value in workouts.items() if time.monotonic() - value.created > TTL]:
        del workouts[key]


def get_workout(token):
    prune_workouts()
    session = workouts.get(token)
    if session is None:
        raise HTTPException(404, "Workout expired or was deleted. Start a new session.")
    return session


def event(s, action, reason, timestamp):
    # Record state transitions, keeping a bounded useful trace rather than frames.
    if s.last_action != action:
        s.events.append({"step": s.frames, "timestamp_ms": timestamp, "tool": "opencv.frame_analysis",
                         "decision": action, "reason": reason})
        s.events = s.events[-100:]
        s.last_action = action


def jpeg_dimensions(raw):
    """Check the JPEG header before allocating a decoded image (pixel-bomb guard)."""
    if not raw.startswith(b"\xff\xd8"):
        raise ValueError("Only JPEG frames are accepted.")
    pos = 2
    while pos + 4 <= len(raw):
        if raw[pos] != 255:
            raise ValueError("Invalid JPEG header.")
        while pos < len(raw) and raw[pos] == 255:
            pos += 1
        marker = raw[pos]
        pos += 1
        if marker in (0xD8, 0xD9, 0xDA):
            break
        size = int.from_bytes(raw[pos:pos + 2], "big")
        if size < 2 or pos + size > len(raw):
            break
        if marker in (0xC0, 0xC1, 0xC2):
            height = int.from_bytes(raw[pos + 3:pos + 5], "big")
            width = int.from_bytes(raw[pos + 5:pos + 7], "big")
            if not 32 <= width <= 1280 or not 32 <= height <= 1280 or width * height > 921600:
                raise ValueError("Frame must be 32–1280 pixels per side and at most 921600 pixels.")
            return width, height
        pos += size
    raise ValueError("Could not read JPEG dimensions.")


def decode_frame(value):
    try:
        raw = base64.b64decode(value.removeprefix("data:image/jpeg;base64,"), validate=True)
        expected = jpeg_dimensions(raw)
        image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if image is None or (image.shape[1], image.shape[0]) != expected:
            raise ValueError("Invalid JPEG image.")
        return image
    except (ValueError, IndexError, binascii.Error, cv2.error) as exc:
        raise HTTPException(422, str(exc)) from exc


def observations(frame, width, height):
    if frame.body25 is not None:
        if frame.landmarks:
            raise HTTPException(422, "Supply either 33 landmarks or BODY_25, not both.")
        values = np.asarray(frame.body25).reshape(25, 3)
        if not np.isfinite(values).all() or (values[:, :2] < 0).any() or (values[:, 2] < 0).any() or (values[:, 2] > 1).any():
            raise HTTPException(422, "Invalid BODY_25 observations.")
        points = [Landmark(x=0, y=0, visibility=0) for _ in range(33)]
        for destination, source in BODY25.items():
            x, y, confidence = values[source]
            if x > width or y > height:
                raise HTTPException(422, "BODY_25 must use source-frame pixel coordinates.")
            points[destination] = Landmark(x=x / width, y=y / height, visibility=confidence)
        return points
    if len(frame.landmarks) not in (0, 33):
        raise HTTPException(422, "Expected 33 landmarks or an empty list when no person is detected.")
    return frame.landmarks


def angle(a, b, c):
    first, second = a - b, c - b
    norm = cv2.norm(first) * cv2.norm(second)
    if norm < 1e-6:
        return None
    return math.degrees(math.acos(float(np.clip(np.dot(first, second) / norm, -1, 1))))


def measure(points, width, height, exercise):
    # Convert normalized detector observations to image geometry with OpenCV;
    # normalized-coordinate angles alone distort non-square video frames.
    xy = np.array([[p.x, p.y] for p in points], np.float32)
    pixels = cv2.transform(xy.reshape(-1, 1, 2), np.array([[width, 0, 0], [0, height, 0]], np.float32)).reshape(-1, 2)
    chains = {side: [JOINTS[f"{side}_{joint}"] for joint in ("shoulder", "elbow", "wrist", "hip", "knee", "ankle")]
              for side in ("left", "right")}
    side = max(chains, key=lambda name: min(points[i].visibility for i in chains[name]))
    sh, el, wr, hip, knee, ankle = chains[side]
    required = [sh, el, wr, hip] if exercise in ("curl", "press") else [sh, el, wr, hip, knee, ankle] if exercise == "pushup" else [sh, hip, knee, ankle]
    confidence = min(points[i].visibility for i in required)
    clipped = any(not .025 < points[i].x < .975 or not .025 < points[i].y < .975 for i in required)
    joint = angle(pixels[hip], pixels[knee], pixels[ankle]) if CATALOG[exercise]["joint"] == "knee" else angle(pixels[sh], pixels[el], pixels[wr])
    torso = angle(pixels[sh], pixels[hip], pixels[knee])
    lean = math.degrees(math.atan2(abs(float(pixels[sh, 0] - pixels[hip, 0])), abs(float(pixels[sh, 1] - pixels[hip, 1])) + 1e-6))
    horizontal = abs(float(pixels[sh, 0] - pixels[hip, 0])) > abs(float(pixels[sh, 1] - pixels[hip, 1])) * 1.2
    # Side view is needed for sagittal angles. Do not grade a frontal projection.
    shoulder_width = cv2.norm(pixels[11] - pixels[12])
    torso_length = cv2.norm(pixels[sh] - pixels[hip])
    front_view = min(points[11].visibility, points[12].visibility) > .6 and shoulder_width > max(torso_length * .7, 1)
    suggestion = "pushup" if horizontal else "press" if pixels[wr, 1] < pixels[sh, 1] else "squat" if joint and CATALOG[exercise]["joint"] == "knee" and joint < 120 else None
    faults = []
    if exercise == "pushup" and torso is not None and torso < 155:
        faults.append("Align your shoulders, hips and ankles; consider an incline push-up.")
    if exercise in ("curl", "press") and lean > 25:
        faults.append("Steady your trunk and reduce the load if needed.")
    if exercise == "curl" and cv2.norm(pixels[el] - pixels[sh]) > 1 and abs(float(pixels[el, 0] - pixels[sh, 0])) > torso_length * .4:
        faults.append("Keep the upper arm closer to your torso.")
    mismatch = (exercise == "pushup" and not horizontal) or (exercise != "pushup" and horizontal) or (exercise == "press" and pixels[wr, 1] > pixels[sh, 1] + torso_length * .4)
    return {"angle": round(joint, 1) if joint is not None else None, "torso_angle": round(torso, 1) if torso is not None else None,
            "confidence": round(confidence, 3), "side": side, "clipped": bool(clipped), "front_view": bool(front_view),
            "faults": faults, "suggestion": suggestion, "mismatch": bool(mismatch)}, pixels[required].astype(np.float32).reshape(-1, 1, 2)


def summary(s):
    emphasized = CATALOG[s.exercise]["primary"] + CATALOG[s.exercise]["secondary"]
    all_muscles = sorted({muscle for exercise in EXERCISES for muscle in exercise["primary"]})
    return {"exercise": s.exercise, "source": s.source, "reps": s.reps, "accepted_reps": s.accepted,
            "review_reps": s.rejected, "phase": s.phase, "frames": s.frames, "stopped": s.stopped,
            "expected_targets": CATALOG[s.exercise]["primary"],
            "not_primary_targets": [m for m in all_muscles if m not in emphasized],
            "muscle_note": "Expected anatomical roles, not measured activation. A camera cannot establish which muscle is working or inactive.",
            "trace": s.events, "opencv_version": cv2.__version__}


@router.get("/capabilities")
def capabilities():
    return {"opencv_version": cv2.__version__, "opencv5": True, "pose_provider": "browser_mediapipe_or_body25",
            "operations": ["JPEG decode", "grayscale", "Laplacian sharpness", "exposure", "affine landmark projection", "pyramidal Lucas-Kanade optical flow"],
            "retention_seconds": TTL, "aws_execution_verified": False,
            "deployment_environment": "ecs_metadata_present" if os.getenv("ECS_CONTAINER_METADATA_URI_V4") else "local_or_unverified",
            "cool_enabled": False}


@router.get("/exercises")
def exercises():
    return EXERCISES


@router.post("/sessions", status_code=201)
def create_session(body: SessionRequest):
    with lock:
        prune_workouts()
        if len(workouts) >= MAX_SESSIONS:
            raise HTTPException(429, "Demo capacity reached. Delete an old session or retry later.")
        token = secrets.token_urlsafe(24)
        workouts[token] = Workout(body.exercise, body.source)
    return {"session_id": token, "expires_in": TTL}


@router.get("/sessions/{token}")
def read_session(token: str):
    with lock:
        return summary(get_workout(token))


@router.delete("/sessions/{token}", status_code=204)
def delete_session(token: str):
    with lock:
        workouts.pop(token, None)


@router.post("/sessions/{token}/stop")
def stop_session(token: str):
    with lock:
        s = get_workout(token)
        s.stopped, s.phase = True, "seek_start"
        event(s, "stop", "User reported pain or dizziness. Human review is required.", max(0, s.last_timestamp))
        return {**summary(s), "action": "stop", "message": "Session stopped. Seek appropriate human advice before continuing."}


@router.post("/sessions/{token}/frames")
def analyze_frame(token: str, frame: FrameRequest):
    started = time.perf_counter()
    # The server is intentionally a single-worker, bounded demo service.
    with lock:
        s = get_workout(token)
        if frame.timestamp_ms <= s.last_timestamp:
            raise HTTPException(409, "Frame timestamps must increase. Restart after seeking video.")
        if s.last_received and time.monotonic() - s.last_received < .08:
            raise HTTPException(429, "Send at most 10 frames per second.")
        image = decode_frame(frame.image)
        h, w = image.shape[:2]
        landmarks = observations(frame, w, h)
        gray = cv2.cvtColor(cv2.resize(image, (320, 240)), cv2.COLOR_BGR2GRAY)
        sharpness = float(cv2.Laplacian(gray, cv2.CV_64F).var())
        exposure = float(cv2.mean(gray)[0])
        metrics, points = (measure(landmarks, w, h, s.exercise) if landmarks else ({}, None))
        motion_error = None
        if points is not None and s.previous_points is not None and points.shape == s.previous_points.shape:
            small = points * np.array([320 / w, 240 / h], np.float32)
            tracked, status, _ = cv2.calcOpticalFlowPyrLK(s.previous_gray, gray, s.previous_points, None)
            if tracked is not None and status is not None and np.count_nonzero(status) >= 2:
                valid = status.ravel().astype(bool)
                motion_error = float(np.median(np.linalg.norm(tracked[valid] - small[valid], axis=2)))
        s.previous_gray = gray
        s.previous_points = points * np.array([320 / w, 240 / h], np.float32) if points is not None else None
        gap = s.last_timestamp >= 0 and frame.timestamp_ms - s.last_timestamp > 2000
        s.last_timestamp = frame.timestamp_ms
        s.last_received = time.monotonic()
        s.frames += 1
        action, reason = "coach", "Continue with a controlled, comfortable movement."
        if frame.pain or s.stopped:
            s.stopped = True
            action, reason = "stop", "Stop the session. Pain or dizziness needs human review before exercising again."
        elif exposure < 35 or exposure > 235:
            action, reason = "adjust_lighting", "Improve lighting before form assessment can resume."
        elif sharpness < 8:
            action, reason = "steady_camera", "The frame is too blurred. Stabilize the camera and refocus."
        elif not landmarks or metrics["confidence"] < .6 or metrics["angle"] is None:
            action, reason = "reframe", "Keep one person and the required joints clearly visible."
        elif metrics["clipped"]:
            action, reason = "step_back", "Move back until all required joints fit inside the frame."
        elif metrics["front_view"]:
            action, reason = "turn_sideways", "Use a side view so joint angles can be assessed."
        elif motion_error is not None and motion_error > 45:
            action, reason = "reacquire", "Tracking changed abruptly. Hold still to reacquire your pose."
        elif gap:
            action, reason = "reacquire", "The video stream paused. Return to the start position."
        elif metrics["mismatch"]:
            action, reason = "confirm_exercise", "Pose differs from the selected movement. Check your exercise selection."
        elif metrics["faults"]:
            action, reason = "correct_form", metrics["faults"][0]
            s.faults += 1
        if action not in ("coach", "correct_form"):
            s.phase, s.cycle_bad = "seek_start", False
        else:
            # Require extended -> flexed -> extended, hysteresis, elapsed time,
            # no invisible interval, and contamination of the entire cycle.
            value = metrics["angle"]
            low, high = CATALOG[s.exercise]["low"], CATALOG[s.exercise]["high"]
            s.cycle_bad |= bool(metrics["faults"])
            if s.phase == "seek_start" and value >= high:
                s.phase, s.cycle_start, s.cycle_bad = "ready", frame.timestamp_ms, bool(metrics["faults"])
            elif s.phase == "ready" and value <= low:
                s.phase = "lowered"
            elif s.phase == "lowered" and value >= high:
                duration = (frame.timestamp_ms - s.cycle_start) / 1000
                if .7 <= duration <= 12:
                    s.reps += 1
                    if s.cycle_bad:
                        s.rejected += 1
                        action, reason = "review_rep", "Movement completed with a form cue. Review before repeating."
                    else:
                        s.accepted += 1
                        action, reason = "count_rep", "Complete range cycle observed. This is not a certification of safe technique."
                else:
                    action, reason = "reset_tempo", "Cycle duration was outside the tracking window; move slowly and restart."
                s.phase, s.cycle_start, s.cycle_bad = "ready", frame.timestamp_ms, False
            if frame.timestamp_ms - s.cycle_start > 12000:
                s.phase = "seek_start"
        event(s, action, reason, frame.timestamp_ms)
        s.vision_action = action
        return {**summary(s), "action": action, "message": reason, "metrics": metrics,
                "quality": {"sharpness": round(sharpness, 2), "exposure": round(exposure, 2),
                            "tracking_error_px": round(motion_error, 2) if motion_error is not None else None},
                "latency_ms": round((time.perf_counter() - started) * 1000, 2),
                "next_capture_ms": 500 if action in ("adjust_lighting", "steady_camera", "reframe") else 200}


@router.post("/sessions/{token}/plan")
def plan(token: str, body: PlanRequest):
    with lock:
        s = get_workout(token)
        if s.stopped or body.needs_clinical_review:
            return {"status": "human_review", "reason": "Ask a qualified clinician or dietitian for an appropriate plan before continuing.",
                    "schedule": [], "meals": [], "requires_approval": True}
        if s.frames < 3:
            raise HTTPException(409, "Analyze at least three frames before creating an evidence-based draft.")
        last = s.vision_action
        blocked = last in ("adjust_lighting", "steady_camera", "reframe", "step_back", "turn_sideways", "reacquire", "confirm_exercise")
        needs_review = s.rejected > 0 or s.faults >= 3 or blocked or s.accepted == 0
        days = {2: ["Monday", "Thursday"], 3: ["Monday", "Wednesday", "Friday"], 4: ["Monday", "Tuesday", "Thursday", "Saturday"]}[body.days]
        schedule = [{"day": day,
                     "focus": "Technique review with a trainer" if needs_review else "Upper body practice" if body.days == 4 and i % 2 else "Full body practice" if body.days < 4 else "Lower body practice",
                     "exercises": [s.exercise] if needs_review else ["curl", "pushup", "press"] if body.days == 4 and i % 2 else ["squat", "lunge"] if body.days == 4 else ["squat", "pushup", "curl"],
                     "dose": "Choose a comfortable range together; no automatic load increase." if needs_review else "Start with 1–2 comfortable sets; stop well before strain. Review load with a trainer.",
                     "minutes": 15 if needs_review else 25 if body.goal == "build_consistency" else 30}
                    for i, day in enumerate(days)]
        foods = [
            ("Oats, fruit and plain yogurt", {"vegetarian", "omnivore"}, {"dairy", "gluten"}),
            ("Brown rice, chickpeas and mixed vegetables", {"vegan", "vegetarian", "omnivore"}, {"legumes"}),
            ("Whole-wheat roti, dal and seasonal vegetables", {"vegan", "vegetarian", "omnivore"}, {"gluten", "legumes"}),
            ("Rice, tofu and vegetables", {"vegan", "vegetarian", "omnivore"}, {"soy"}),
            ("Brown rice, chicken and vegetables", {"omnivore"}, set()),
            ("Fruit, quinoa and vegetables", {"vegan", "vegetarian", "omnivore"}, set()),
        ]
        meals = [name for name, diets, allergens in foods if body.diet in diets and not allergens.intersection(body.restricted_foods)][:3]
        event(s, "draft_plan_review", "Visual evidence selected a technique review draft." if needs_review else "Observed complete cycles selected a conservative practice draft.", s.last_timestamp)
        return {"status": "draft", "goal": body.goal, "basis": {"accepted_reps": s.accepted, "review_reps": s.rejected, "form_cue_frames": s.faults, "latest_vision_action": last},
                "reason": "Review technique and tracking with a trainer before progressing." if needs_review else "Observed cycles support a conservative practice schedule; no automatic progression.",
                "schedule": schedule, "rest_days": [day for day in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday") if day not in days],
                "meals": meals, "requires_approval": True,
                "nutrition_note": "Meal ideas only. No calorie prescription or guarantee of allergen safety. Check labels and cross-contact; use a dietitian for medical needs.",
                "nutrition_source": "https://nutritionsource.hsph.harvard.edu/healthy-eating-plate/"}
