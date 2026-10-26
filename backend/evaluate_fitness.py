"""Reproducible synthetic engineering evaluation; never a human accuracy claim."""
import json
import logging
import platform
import statistics
import sys
from datetime import datetime, timezone
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app
from backend import fitness as f
from backend.test_fitness import pose, jpeg


def main():
    logging.getLogger("httpx").setLevel(logging.WARNING)
    root = Path(__file__).resolve().parents[1]
    cases, timings = [], []
    with TestClient(app) as client:
        for exercise in f.CATALOG:
            token = client.post("/api/fitness/sessions", json={"exercise": exercise, "source": "synthetic"}).json()["session_id"]
            trace = []
            for index, degrees in enumerate([170, 140, 90, 55, 90, 140, 170] * 3):
                points = pose(exercise, degrees)
                f.workouts[token].last_received = 0
                response = client.post(f"/api/fitness/sessions/{token}/frames", json={"image": jpeg(points), "landmarks": points, "timestamp_ms": index * 250})
                response.raise_for_status()
                result = response.json()
                timings.append(result["latency_ms"])
                trace.append(result["action"])
            assert result["reps"] == result["accepted_reps"] == 3, result
            cases.append({"exercise": exercise, "frames": 21, "expected_reps": 3, "observed_reps": result["reps"], "accepted_reps": result["accepted_reps"], "rep_absolute_error": abs(result["reps"] - 3), "actions": trace})
            client.delete(f"/api/fitness/sessions/{token}")
        token = client.post("/api/fitness/sessions", json={"exercise": "squat", "source": "synthetic"}).json()["session_id"]
        for index in range(20):
            f.workouts[token].last_received = 0
            result = client.post(f"/api/fitness/sessions/{token}/frames", json={"image": jpeg(pose()), "landmarks": pose(), "timestamp_ms": index * 250}).json()
        static_false_counts = result["reps"]
        assert static_false_counts == 0
        f.workouts[token].last_received = 0
        low_light = client.post(f"/api/fitness/sessions/{token}/frames", json={"image": jpeg(brightness=5), "landmarks": pose(), "timestamp_ms": 6000}).json()
        draft = client.post(f"/api/fitness/sessions/{token}/plan", json={}).json()
        assert low_light["action"] == "adjust_lighting"
        assert draft["basis"]["latest_vision_action"] == "adjust_lighting"
        assert draft["schedule"][0]["focus"] == "Technique review with a trainer"
        evidence = {"recorded_at_utc": datetime.now(timezone.utc).isoformat(), "source": "original synthetic JPEGs and geometric landmarks", "human_validation": False, "aws_execution": False,
                    "opencv_version": f.cv2.__version__, "python": sys.version.split()[0], "platform": platform.platform(),
                    "pose_model": json.loads((root / "data/fitness/pose-model.json").read_text()),
                    "method": "In-process HTTP TestClient; actual OpenCV operations; HTTP pacing bypassed only for deterministic fixtures. Latency excludes browser inference/network and is not camera FPS.",
                    "exercise_cases": cases, "stationary_frames": 20, "stationary_false_counts": static_false_counts,
                    "latency_ms": {"samples": len(timings), "median": round(statistics.median(timings), 3), "p95": sorted(timings)[int(.95 * (len(timings) - 1))], "max": max(timings)},
                    "agentic_failure_trace": {"vision_action": low_light["action"], "next_capture_ms": low_light["next_capture_ms"], "plan_basis": draft["basis"], "next_plan_focus": draft["schedule"][0]["focus"]}}
        output = root / "docs/opencv/evidence/synthetic-evaluation.json"
        output.parent.mkdir(parents=True, exist_ok=True)
        output.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
        print(json.dumps({"output": str(output), "exercise_cases": len(cases), "total_expected_reps": 15, "total_observed_reps": sum(c["observed_reps"] for c in cases), "stationary_false_counts": static_false_counts, "latency_ms": evidence["latency_ms"]}, indent=2))


if __name__ == "__main__":
    main()
