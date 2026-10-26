"""Deterministic regression tests with real OpenCV operations on synthetic frames."""
import base64
import copy
import math
import time
import unittest
from unittest.mock import patch

import cv2
import numpy as np
from fastapi.testclient import TestClient

from backend.main import app
from backend import fitness as f


def pose(exercise="squat", degrees=170):
    points = [{"x": .5, "y": .3, "visibility": .98} for _ in range(33)]
    def put(i, x, y):
        points[i] = {"x": x / 640, "y": y / 480, "visibility": .98}
    theta = math.radians(degrees)
    for offset in (0, 1):
        dx = offset * 7
        for i, x, y in [(11, 280, 125), (13, 283, 200), (15, 290, 275), (23, 290, 235), (25, 290, 325), (27, 300, 420)]:
            put(i + offset, x + dx, y)
        if exercise in ("squat", "lunge"):
            put(27 + offset, 290 + dx + math.sin(theta) * 90, 325 - math.cos(theta) * 90)
        elif exercise == "curl":
            put(15 + offset, 283 + dx + math.sin(theta) * 75, 200 - math.cos(theta) * 75)
        elif exercise == "press":
            put(13 + offset, 290 + dx, 100)
            a = math.atan2(25, -10) + theta
            put(15 + offset, 290 + dx + math.cos(a) * 70, 100 + math.sin(a) * 70)
        elif exercise == "pushup":
            for i, x, y in [(11, 170, 190), (23, 330, 205), (25, 435, 215), (27, 535, 225), (13, 180, 270)]:
                put(i + offset, x + dx, y)
            a = math.atan2(-80, -10) + theta
            put(15 + offset, 180 + dx + math.cos(a) * 75, 270 + math.sin(a) * 75)
    return points


def jpeg(points=None, brightness=None):
    image = np.full((480, 640, 3), 75 if brightness is None else brightness, np.uint8)
    if brightness is None:
        for x in range(0, 640, 32):
            cv2.line(image, (x, 0), (x, 479), (110, 110, 110), 1)
        for y in range(0, 480, 32):
            cv2.line(image, (0, y), (639, y), (110, 110, 110), 1)
        for p in points or []:
            cv2.circle(image, (int(p["x"] * 640), int(p["y"] * 480)), 5, (200, 230, 160), -1)
    ok, encoded = cv2.imencode(".jpg", image)
    assert ok
    return "data:image/jpeg;base64," + base64.b64encode(encoded).decode()


class FitnessTests(unittest.TestCase):
    def setUp(self):
        f.workouts.clear()
        self.client = TestClient(app)

    def create(self, exercise="squat", source="synthetic"):
        response = self.client.post("/api/fitness/sessions", json={"exercise": exercise, "source": source})
        self.assertEqual(response.status_code, 201, response.text)
        return response.json()["session_id"]

    def send(self, token, points=None, timestamp=0, image=None, expected=200, **extra):
        f.workouts[token].last_received = 0  # Bypass pacing only in deterministic geometry tests.
        body = {"landmarks": points if points is not None else pose(), "image": image or jpeg(points), "timestamp_ms": timestamp, **extra}
        response = self.client.post(f"/api/fitness/sessions/{token}/frames", json=body)
        self.assertEqual(response.status_code, expected, response.text)
        return response.json()

    def cycle(self, exercise="squat", fault=False):
        token = self.create(exercise)
        for i, degrees in enumerate((170, 140, 90, 55, 90, 140, 170)):
            points = pose(exercise, degrees)
            if fault and i in (2, 3):
                for hip in (23, 24):
                    points[hip]["x"] += .13
            result = self.send(token, points, i * 250)
        return token, result

    def test_capabilities_and_catalog(self):
        result = self.client.get("/api/fitness/capabilities").json()
        self.assertEqual(result["opencv_version"].split(".")[0], "5")
        self.assertFalse(result["aws_execution_verified"])
        exercises = self.client.get("/api/fitness/exercises").json()
        self.assertEqual(len(exercises), 5)
        self.assertTrue(all(e["source"].startswith("https://www.acefitness.org/") for e in exercises))

    def test_all_five_movements_complete_cycles(self):
        for exercise in f.CATALOG:
            with self.subTest(exercise=exercise):
                _, result = self.cycle(exercise)
                self.assertEqual(result["reps"], 1, result)
                self.assertEqual(result["accepted_reps"], 1, result)

    def test_static_and_partial_movements_not_counted(self):
        token = self.create()
        for i, degrees in enumerate((170, 170, 130, 120, 150, 170)):
            result = self.send(token, pose(degrees=degrees), i * 250)
        self.assertEqual(result["reps"], 0)

    def test_form_fault_contaminates_cycle(self):
        _, result = self.cycle("curl", fault=True)
        self.assertEqual(result["review_reps"], 1, result)
        self.assertEqual(result["accepted_reps"], 0)

    def test_dark_bright_and_blurry_change_actions(self):
        for brightness, action in ((5, "adjust_lighting"), (250, "adjust_lighting"), (100, "steady_camera")):
            token = self.create()
            result = self.send(token, timestamp=0, image=jpeg(brightness=brightness))
            self.assertEqual(result["action"], action)
            self.assertEqual(result["next_capture_ms"], 500)
            self.assertEqual(result["phase"], "seek_start")

    def test_missing_occluded_frontal_and_clipped_pose(self):
        cases = [(lambda p: [], "reframe"),
                 (lambda p: [{**v, "visibility": .1} for v in p], "reframe")]
        frontal = pose()
        frontal[11]["x"], frontal[12]["x"] = .25, .75
        clipped = pose()
        clipped[27]["y"], clipped[28]["y"] = .99, .99
        cases.extend([(lambda p: frontal, "turn_sideways"), (lambda p: clipped, "step_back")])
        for transform, expected in cases:
            token = self.create()
            self.assertEqual(self.send(token, transform(pose()))["action"], expected)

    def test_lost_pose_cannot_bridge_rep(self):
        token = self.create()
        self.send(token, pose(), 0)
        self.send(token, pose(degrees=55), 500)
        self.send(token, [], 750)
        result = self.send(token, pose(), 1000)
        self.assertEqual(result["reps"], 0)

    def test_video_gap_and_impossible_tempo(self):
        token = self.create()
        self.send(token, pose(), 0)
        self.send(token, pose(degrees=55), 100)
        result = self.send(token, pose(), 200)
        self.assertEqual(result["reps"], 0)
        self.assertEqual(result["action"], "reset_tempo")
        result = self.send(token, pose(), 4000)
        self.assertEqual(result["action"], "reacquire")

    def test_pain_latches_stop_and_blocks_plans(self):
        token, _ = self.cycle()
        stopped = self.client.post(f"/api/fitness/sessions/{token}/stop").json()
        self.assertTrue(stopped["stopped"])
        result = self.send(token, pose(), 3000)
        self.assertEqual(result["action"], "stop")
        plan = self.client.post(f"/api/fitness/sessions/{token}/plan", json={}).json()
        self.assertEqual(plan["status"], "human_review")
        self.assertEqual(plan["schedule"], [])

    def test_visual_evidence_changes_schedule(self):
        good, _ = self.cycle()
        poor, _ = self.cycle("curl", fault=True)
        plans = [self.client.post(f"/api/fitness/sessions/{t}/plan", json={}).json() for t in (good, poor)]
        self.assertNotEqual(plans[0]["schedule"][0]["focus"], plans[1]["schedule"][0]["focus"])
        self.assertIn("Technique review", plans[1]["schedule"][0]["focus"])
        self.assertTrue(all(p["requires_approval"] for p in plans))
        self.send(good, pose(), 3000, image=jpeg(brightness=5))
        for _ in range(2):
            plan = self.client.post(f"/api/fitness/sessions/{good}/plan", json={}).json()
            self.assertEqual(plan["basis"]["latest_vision_action"], "adjust_lighting")
            self.assertIn("Technique review", plan["schedule"][0]["focus"])

    def test_food_preferences_restrictions_and_medical_gate(self):
        token, _ = self.cycle()
        for diet in ("vegan", "vegetarian", "omnivore"):
            plan = self.client.post(f"/api/fitness/sessions/{token}/plan", json={"diet": diet, "restricted_foods": ["soy", "dairy", "gluten", "legumes"]}).json()
            self.assertTrue(plan["meals"])
            self.assertNotIn("tofu", str(plan["meals"]))
            self.assertNotIn("yogurt", str(plan["meals"]))
            if diet != "omnivore":
                self.assertNotIn("chicken", str(plan["meals"]))
        result = self.client.post(f"/api/fitness/sessions/{token}/plan", json={"needs_clinical_review": True}).json()
        self.assertEqual(result["status"], "human_review")

    def test_four_days_split_and_recovery(self):
        token, _ = self.cycle()
        plan = self.client.post(f"/api/fitness/sessions/{token}/plan", json={"days": 4}).json()
        self.assertEqual(len(plan["rest_days"]), 3)
        self.assertNotEqual(plan["schedule"][0]["exercises"], plan["schedule"][1]["exercises"])

    def test_body25_adapter_matches_geometry(self):
        token = self.create(source="body25")
        points = pose()
        body = [0.] * 75
        for destination, source in f.BODY25.items():
            p = points[destination]
            body[source * 3:source * 3 + 3] = [p["x"] * 640, p["y"] * 480, p["visibility"]]
        result = self.send(token, [], body25=body)
        self.assertGreater(result["metrics"]["angle"], 160)
        self.send(token, points, timestamp=250, body25=body, expected=422)

    def test_validation_and_replay(self):
        token = self.create()
        self.send(token, timestamp=100)
        self.send(token, timestamp=100, expected=409)
        self.send(token, timestamp=200, image="not base64", expected=422)
        self.send(token, pose()[:5], timestamp=300, expected=422)
        invalid = pose(); invalid[0]["x"] = -1
        self.send(token, invalid, timestamp=400, expected=422)
        response = self.client.post("/api/fitness/sessions", json={"exercise": "unknown", "source": "camera"})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.client.post(f"/api/fitness/sessions/{token}/plan", json={"days": 7}).status_code, 422)

    def test_session_isolation_expiry_and_deletion(self):
        first, _ = self.cycle()
        second = self.create()
        self.assertEqual(self.client.get(f"/api/fitness/sessions/{second}").json()["reps"], 0)
        self.client.delete(f"/api/fitness/sessions/{first}")
        self.assertEqual(self.client.get(f"/api/fitness/sessions/{first}").status_code, 404)
        f.workouts[second].created = time.monotonic() - f.TTL - 1
        self.assertEqual(self.client.get(f"/api/fitness/sessions/{second}").status_code, 404)

    def test_session_capacity_and_frame_pacing(self):
        token = self.create()
        self.send(token)
        with patch.object(f.time, "monotonic", return_value=f.workouts[token].last_received):
            response = self.client.post(f"/api/fitness/sessions/{token}/frames", json={"image": jpeg(), "landmarks": pose(), "timestamp_ms": 200})
        self.assertEqual(response.status_code, 429)
        with patch.object(f, "MAX_SESSIONS", 1):
            self.assertEqual(self.client.post("/api/fitness/sessions", json={"exercise": "curl", "source": "camera"}).status_code, 429)

    def test_origin_host_and_image_bomb_guards(self):
        self.assertEqual(self.client.get("/api/fitness/capabilities", headers={"Origin": "https://untrusted.example"}).status_code, 403)
        self.assertEqual(self.client.get("/api/fitness/capabilities", headers={"Host": "untrusted.example"}).status_code, 400)
        raw = bytearray(base64.b64decode(jpeg().split(",")[1]))
        marker = raw.find(b"\xff\xc0")
        self.assertGreater(marker, 0)
        raw[marker + 5:marker + 7] = (65000).to_bytes(2, "big")
        token = self.create()
        self.send(token, image=base64.b64encode(raw).decode(), expected=422)

    def test_degenerate_joints_do_not_count(self):
        points = pose()
        for index in (23, 24, 25, 26, 27, 28):
            points[index] = copy.copy(points[23])
        result = self.send(self.create(), points)
        self.assertEqual(result["action"], "reframe")


if __name__ == "__main__":
    unittest.main()
