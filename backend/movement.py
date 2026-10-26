"""Observable 2D geometry and conservative temporal movement recognition.

Scores express rule agreement, not calibrated classifier probabilities.
"""
import math
import numpy as np


def joint_angles(points, width, height):
    values = {}
    for side, offset in (("left", 0), ("right", 1)):
        for joint, chain in {"elbow": (11, 13, 15), "shoulder": (13, 11, 23),
                             "hip": (11, 23, 25), "knee": (23, 25, 27)}.items():
            ids = [i + offset for i in chain]
            if not points or min(points[i].visibility for i in ids) < .6:
                values[f"{side}_{joint}"] = None
                continue
            a, b, c = [np.array([points[i].x * width, points[i].y * height]) for i in ids]
            u, v = a - b, c - b
            norm = np.linalg.norm(u) * np.linalg.norm(v)
            values[f"{side}_{joint}"] = round(math.degrees(math.acos(float(np.clip(np.dot(u, v) / norm, -1, 1)))), 1) if norm > 1e-6 else None
    return values


def recognition_usable(points, width, height):
    if not points:
        return False
    side = max((0, 1), key=lambda o: min(points[i + o].visibility for i in (11, 13, 15, 23, 25, 27)))
    ids = [i + side for i in (11, 13, 15, 23, 25, 27)]
    if min(points[i].visibility for i in ids) < .65:
        return False
    if any(not .025 < points[i].x < .975 or not .025 < points[i].y < .975 for i in ids):
        return False
    sh, el, wr, hip, knee, ankle = [np.array([points[i].x * width, points[i].y * height]) for i in ids]
    torso = float(np.linalg.norm(sh - hip))
    if torso < 15:
        return False
    shoulder_width = abs(points[11].x - points[12].x) * width
    if min(points[11].visibility, points[12].visibility) > .6 and shoulder_width > torso * .7:
        return False
    return True


def recognize(points, angles, width, height):
    if not recognition_usable(points, width, height):
        return None
    side = max((0, 1), key=lambda o: min(points[i + o].visibility for i in (11, 13, 15, 23, 25, 27)))
    sh, el, wr, hip = [np.array([points[i + side].x * width, points[i + side].y * height]) for i in (11, 13, 15, 23)]
    torso = float(np.linalg.norm(sh - hip))
    prefix = "left" if side == 0 else "right"
    elbow, knee_angle = angles[prefix + "_elbow"], angles[prefix + "_knee"]
    if abs(sh[0] - hip[0]) > abs(sh[1] - hip[1]) * 1.2:
        return "pushup" if elbow is not None and elbow < 145 else None
    if wr[1] < sh[1] and el[1] < sh[1] + torso * .25:
        return "press"
    if knee_angle is not None and knee_angle < 125:
        # Distinguish a split stance only when both ankles can be observed.
        if min(points[27].visibility, points[28].visibility) < .65:
            return None
        split = abs(points[27].x - points[28].x) * width / torso
        return "lunge" if split > .65 else "squat" if split < .35 else None
    if elbow is not None and elbow < 125 and abs(el[0] - sh[0]) < torso * .4:
        return "curl"
    return None


def update_recognition(s, candidate, angles, timestamp):
    s.recognition_window.append({"candidate": candidate, "angles": angles, "time": timestamp})
    s.recognition_window = s.recognition_window[-30:]
    votes = [x["candidate"] for x in s.recognition_window if x["candidate"]]
    if not votes:
        return
    best = max(set(votes), key=votes.count)
    joint = "knee" if best in ("squat", "lunge") else "elbow"
    ranges = []
    for side in ("left", "right"):
        values = [x["angles"].get(f"{side}_{joint}") for x in s.recognition_window]
        values = [v for v in values if v is not None]
        ranges.append(max(values) - min(values) if values else 0)
    agreement = votes.count(best) / len(votes)
    s.recognition = {"candidate": best, "agreement": round(agreement, 2), "status": "observing",
                     "method": "temporal_geometry", "note": "Rule agreement, not validated recognition accuracy."}
    if candidate == best and votes.count(best) >= 5 and agreement >= .8 and max(ranges) >= 25 and timestamp - s.recognition_window[0]["time"] >= 1200:
        s.recognition["status"] = "recognized"
        if s.auto and not s.recognized:
            s.exercise, s.recognized = best, True
            s.phase, s.cycle_bad = "seek_start", False
            s.previous_points = None


def angle_ranges(samples):
    keys = {key for sample in samples for key in sample["angles"]}
    result = {}
    for key in sorted(keys):
        values = [s["angles"][key] for s in samples if s["valid"] and s["angles"].get(key) is not None]
        if values:
            result[key] = {"min": min(values), "max": max(values), "range": round(max(values) - min(values), 1)}
    return result
