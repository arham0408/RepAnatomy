"""Run after a root-path build: same-origin web, pose assets, REST and MCP."""
import os
os.environ["REPANATOMY_SERVE_WEB"] = "1"
os.environ["GROQ_API_KEY"] = ""
from fastapi.testclient import TestClient
from backend.main import app

with TestClient(app) as client:
    for path in ("/?gym=1", "/api/fitness/capabilities", "/pose/pose_landmarker_lite.task", "/pose/wasm/vision_wasm_module_internal.js", "/pose/wasm/vision_wasm_module_internal.wasm"):
        response = client.get(path)
        assert response.status_code == 200, (path, response.status_code)
    assert "<title>RepAnatomy</title>" in client.get("/").text
    browser_headers = {"Origin": "http://localhost:8000"}
    workout = client.post("/api/fitness/sessions", headers=browser_headers, json={"exercise": "squat", "source": "synthetic"})
    assert workout.status_code == 201, workout.text
    client.delete("/api/fitness/sessions/" + workout.json()["session_id"], headers=browser_headers)
    assert client.get("/healthz", headers={"Host": "10.42.1.8:8000"}).status_code == 200
    assert client.get("/api/fitness/capabilities", headers={"Host": "untrusted.example"}).status_code == 400
    response = client.post("/mcp", headers={**browser_headers, "Accept": "application/json, text/event-stream"}, json={"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": "2025-11-25", "capabilities": {}, "clientInfo": {"name": "repanatomy-production-smoke", "version": "1"}}})
    assert response.status_code == 200, response.text
    assert response.json()["result"]["serverInfo"]["name"] == "RepAnatomy Report Companion"
print("Single-origin web, actual pose assets, OpenCV API, restricted hosts, ALB probe and MCP initialization passed.")
