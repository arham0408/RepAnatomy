# Setup and evaluation troubleshooting

[Judge's guide](JUDGE_GUIDE.md) · [Run instructions](../../README.md#run-locally) · [Architecture](TECHNICAL_REVIEW.md)

## Check the two services first

1. Open [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health). Expect JSON with `status: healthy`.
2. Open [http://localhost:3016/?demo=1](http://localhost:3016/?demo=1). Expect the atlas and report explorer.
3. In a terminal with the project's Python environment active, run `python -m backend.smoke_mcp`. Expect protocol 2025-11-25, nine tools, a successful synthetic report interaction, and cleanup.

Health's provider label describes configuration, not proof that a live model call succeeds. Check the provider label on an actual answer.

## Common symptoms

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Browser page does not load | Frontend not running or a different port was chosen | Run `npm ci` then `npm run dev`; use the URL printed by Vite. The documented origin/port is 3016. |
| UI loads, but assistant says MCP unavailable or returns 404 | Backend missing or an older backend process still running | Restart this project's backend from the current checkout with `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`. A healthy REST endpoint alone does not prove MCP is installed. |
| `No module named mcp` | Dependencies installed into a different Python environment | Use `python -m pip install -r backend/requirements.txt` with the same Python used to start Uvicorn. |
| PowerShell prevents virtual-environment activation | Local activation policy | Use `.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt` and `.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000` directly; activation is optional. |
| Address already in use | A process already owns the port | Check whether it is this project before stopping anything. Reuse the current working service or stop only this project's stale server. For a different backend port, see below. |
| Connect button is disabled | No report loaded yet | In Upload, choose the Abdominal Ultrasound sample, then return to Voice companion. |
| Response is English excerpts despite another selected language | Deterministic fallback is active | This is expected without successful Groq inference. Configure the server key and restart for translation; check the actual answer provider label. |
| No audible response | Automatic reading is off or no suitable voice is available | Select Read aloud, check device audio, or enable Read replies aloud before the next question. Text remains usable. |
| Microphone unsupported/denied | Browser recognition support or permission | Use a browser with speech-recognition support on localhost/HTTPS, grant permission, or type instead. Review and send the transcript manually. |
| Anatomy unavailable or not highlighted | Term has no verified target in the selected model, or main viewer is closed | Use the default male model and a known demo prompt such as Show me the gallbladder. Keep the owner's report panel open; an unavailable target is an expected outcome for unsupported terms. |
| Invitation fails | Two-minute expiry, previous use, replaced invitation, or owner session ended | Create a fresh invitation and select Join report session before it expires. |
| Second physical device cannot open the link | Link points at localhost | Two tabs on the same computer demonstrate pairing. Physical devices need the same reachable HTTPS deployment with explicit allowed host/origin configuration. |
| Session unavailable after restart or a long pause | Process-local state lost, 30-minute lifetime elapsed, or access revoked | Reconnect the report and create a new invitation if needed. Sessions are not persistent patient records. |
| PDF fails extraction | Empty, encrypted, scanned, or otherwise unsupported file | Use a text-based PDF, paste text, or select a synthetic sample. OCR is not included. |
| Large model load or blank 3D area | Initial asset download, insufficient WebGL 2 support, or graphics resources | Wait for model loading, check browser errors, and use a WebGL 2-capable desktop browser. The static screenshots can explain layout but do not replace a working navigation test. |
| Deployed GitHub Pages UI has no assistant backend | Static hosting cannot run Python | Run locally or provide the same-origin API/MCP reverse proxy described in the README. A static frontend alone is not the full application. |

## Use a different backend port

Start the backend on 8010 instead of 8000:

```sh
python -m uvicorn backend.main:app --host 127.0.0.1 --port 8010
```

Before launching Vite, set its backend target in that terminal. On PowerShell:

```powershell
$env:REPANATOMY_API_TARGET = "http://127.0.0.1:8010"
npm run dev
```

On macOS/Linux:

```sh
REPANATOMY_API_TARGET=http://127.0.0.1:8010 npm run dev
```

Then check the SDK client with `python -m backend.smoke_mcp http://127.0.0.1:8010/mcp`. Keep the frontend on 3016 for the default origin allowlist. If you deliberately change its origin, add the exact origin to `REPANATOMY_ALLOWED_ORIGINS` and restart the backend; see [the environment example](../../backend/.env.example).

## Test runner notes

Install the matching browser with `npx playwright install chromium` before `npm run test:companion`. That check starts its own services on ports 8011 and 4318; those ports must be available. It defaults to the local `.venv` interpreter when present; set `PYTHON` to a different interpreter path if needed.

No paid inference or physical microphone is required by the browser integration test. For exactly what was exercised, see [verification](VERIFICATION.md).
