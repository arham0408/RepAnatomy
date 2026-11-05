"""Exercise a deployed single-origin app with explicitly synthetic OpenCV inputs.

Install backend/requirements.lock.txt first. This creates and deletes one temporary
workout. The JSON record excludes session capabilities and private user data.
"""
import argparse
import base64
import hashlib
import json
import math
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import cv2
import httpx
import numpy as np


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def synthetic_frame(degrees=170, dark=False):
    image = np.full((480, 640, 3), 5 if dark else 75, np.uint8)
    points = [{"x": .5, "y": .3, "visibility": .98} for _ in range(33)]
    theta = math.radians(degrees)
    for side in (0, 1):
        for index, x, y in [(11, 280, 125), (13, 283, 200), (15, 290, 275),
                            (23, 290, 235), (25, 290, 325),
                            (27, 290 + math.sin(theta) * 90, 325 - math.cos(theta) * 90)]:
            points[index + side] = {"x": (x + side * 7) / 640, "y": y / 480, "visibility": .98}
    if not dark:
        for x in range(0, 640, 32):
            cv2.line(image, (x, 0), (x, 479), (110, 110, 110), 1)
        for y in range(0, 480, 32):
            cv2.line(image, (0, y), (639, y), (110, 110, 110), 1)
        for point in points:
            cv2.circle(image, (int(point["x"] * 640), int(point["y"] * 480)), 5, (200, 230, 160), -1)
    ok, encoded = cv2.imencode('.jpg', image)
    require(ok, 'Could not encode the synthetic input.')
    return {"image": base64.b64encode(encoded).decode(), "landmarks": points}


def check_deployment(client, base_url):
    """Client may be httpx.Client or the ASGI TestClient for local regression checks."""
    checks = []

    def request(method, path, expected=200, **kwargs):
        response = client.request(method, path, **kwargs)
        # Never put the session-bearing path or response body in errors/evidence.
        require(response.status_code == expected, f'{method} check failed: expected HTTP {expected}, got {response.status_code}.')
        return response

    request('GET', '/healthz')
    page = request('GET', '/?gym=1')
    require('<title>RepAnatomy</title>' in page.text, 'The endpoint is not serving the RepAnatomy web build.')
    checks.append('same_origin_web_and_health')
    capabilities = request('GET', '/api/fitness/capabilities').json()
    require(str(capabilities['opencv_version']).split('.')[0] == '5', 'The deployed runtime must use OpenCV 5.')
    checks.append('opencv_5_runtime')
    request('GET', '/api/fitness/coach/status')
    require(len(request('GET', '/api/fitness/exercises').json()) == 5, 'Exercise catalog is incomplete.')

    manifest = json.loads((Path(__file__).resolve().parents[1] / 'data/fitness/pose-model.json').read_text())
    model = request('GET', '/pose/pose_landmarker_lite.task').content
    require(hashlib.sha256(model).hexdigest() == manifest['sha256'], 'The deployed pose model differs from the pinned checksum.')
    for suffix in ('js', 'wasm'):
        require(len(request('GET', '/pose/wasm/vision_wasm_module_internal.' + suffix).content) > 1000,
                'Pose runtime asset is incomplete.')
    checks.append('pinned_pose_model_and_wasm')

    # Confirm the configured HTTPS origin is accepted and an unrelated origin fails.
    denied = client.post('/api/fitness/sessions', headers={'Origin': 'https://untrusted.invalid'},
                         json={'exercise': 'squat', 'source': 'synthetic'})
    require(denied.status_code == 403, 'An unrelated Origin was accepted.')
    session_id = request('POST', '/api/fitness/sessions', expected=201,
                         json={'exercise': 'squat', 'source': 'synthetic'}).json()['session_id']
    checks.append('exact_origin_guard')
    path = '/api/fitness/sessions/' + session_id
    observations = []
    try:
        for index, degrees in enumerate((170, 140, 90, 55, 90, 140, 170)):
            if index:
                time.sleep(.15)  # Respect the running API's frame pacing.
            result = request('POST', path + '/frames', json={**synthetic_frame(degrees), 'timestamp_ms': index * 250}).json()
        require(result['reps'] == 1 and result['accepted_reps'] == 1, 'The synthetic complete cycle was not counted once.')
        checks.append('synthetic_cycle_one_rep')
        observations.append({'input': 'synthetic_complete_cycle', 'action': result['action'], 'reps': result['reps']})
        time.sleep(.15)
        dark = request('POST', path + '/frames', json={**synthetic_frame(dark=True), 'timestamp_ms': 1750}).json()
        require(dark['action'] == 'adjust_lighting' and dark['next_capture_ms'] == 500, 'Dark input did not change the capture decision.')
        checks.append('opencv_quality_changes_capture_action')
        observations.append({'input': 'synthetic_dark_frame', 'action': dark['action'], 'quality': dark['quality'], 'next_capture_ms': dark['next_capture_ms']})
        stopped = request('POST', path + '/stop').json()
        require(stopped['stopped'], 'The human stop was not latched.')
        time.sleep(.15)
        after_stop = request('POST', path + '/frames', json={**synthetic_frame(), 'timestamp_ms': 2000}).json()
        require(after_stop['action'] == 'stop' and after_stop['reps'] == 1, 'Capture continued counting after the stop.')
        checks.append('human_stop_latched')
        trace = after_stop['trace']
    finally:
        request('DELETE', path, expected=204)
    require(client.get(path).status_code == 404, 'The temporary workout was not deleted.')
    checks.append('temporary_session_deleted')

    mcp = request('POST', '/mcp', headers={'Accept': 'application/json, text/event-stream'},
                  json={'jsonrpc': '2.0', 'id': 1, 'method': 'initialize', 'params': {
                      'protocolVersion': '2025-11-25', 'capabilities': {},
                      'clientInfo': {'name': 'repanatomy-deployment-check', 'version': '1'}}}).json()
    require(mcp['result']['serverInfo']['name'] == 'RepAnatomy Report Companion', 'MCP initialization failed.')
    checks.append('same_origin_mcp')
    return {'recorded_at_utc': datetime.now(timezone.utc).isoformat(), 'endpoint': base_url,
            'status': 'passed', 'input_source': 'synthetic', 'checks': checks,
            'runtime': capabilities, 'observations': observations, 'trace': trace,
            'limits': 'Synthetic HTTP engineering check only; not human accuracy, camera verification or independent proof of AWS hosting. Pair with AWS stack/task evidence.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--url', required=True, help='Deployed HTTPS origin, with no path or query.')
    parser.add_argument('--output', type=Path, default=Path('outputs/deployment/workload.json'))
    parser.add_argument('--allow-local-http', action='store_true', help='Allow HTTP on localhost/127.0.0.1 for container checks only.')
    args = parser.parse_args()
    address = urlsplit(args.url)
    local_http = args.allow_local_http and address.scheme == 'http' and address.hostname in ('localhost', '127.0.0.1')
    require(address.scheme == 'https' or local_http, 'Use HTTPS, or --allow-local-http with a loopback URL.')
    require(address.hostname and not address.username and not address.password and address.path in ('', '/')
            and not address.query and not address.fragment, 'Pass an origin only, without credentials, path, query or fragment.')
    base_url = args.url.rstrip('/')
    with httpx.Client(base_url=base_url, headers={'Origin': base_url}, timeout=45, follow_redirects=False) as client:
        evidence = check_deployment(client, base_url)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(evidence, indent=2) + '\n', encoding='utf-8')
    print(f"Passed {len(evidence['checks'])} deployment checks. Synthetic evidence: {args.output}")


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, httpx.HTTPError, KeyError, ValueError) as error:
        # HTTP client exceptions can contain session URLs; do not print those.
        message = 'Network request failed; check the endpoint and service logs.' if isinstance(error, httpx.HTTPError) else str(error)
        print('Deployment check failed: ' + message, file=sys.stderr)
        sys.exit(1)
