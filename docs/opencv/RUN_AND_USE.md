# RepAnatomy — run and use

## Environment

Use Node 24.22.1, Python 3.12 and Chromium with WebGL 2, module workers and WASM SIMD. Windows PowerShell examples start in the project folder containing `package.json`.

```powershell
npm ci
npm run prepare:pose
python -m venv .venv
.venv\Scripts\python.exe -m pip install -r backend/requirements.lock.txt
.venv\Scripts\python.exe -m pip check
```

The pose preparation command downloads a 5.8 MB model from its versioned Google-hosted location, verifies `data/fitness/pose-model.json`, and copies the matching runtime. Do not manually mix WASM versions. The generated directory is local build input; regenerate it after `npm ci` on a fresh machine.

## Two-server development

```powershell
# Terminal 1
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

```powershell
# Terminal 2
npm run dev
```

Open `http://localhost:3016/?gym=1`. Health: `http://127.0.0.1:8000/api/fitness/capabilities`; interactive API schema: `http://127.0.0.1:8000/docs`. The atlas is at `/`, the report demonstration at `/?demo=1`, and the report MCP endpoint at `/mcp`.

To use alternative ports:

```powershell
# Backend terminal
$env:REPANATOMY_ALLOWED_ORIGINS='http://localhost:3017,http://127.0.0.1:3017'
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8095 --no-access-log
```

```powershell
# Frontend terminal
$env:REPANATOMY_API_TARGET='http://127.0.0.1:8095'
npm run dev -- --host 127.0.0.1 --port 3017 --strictPort
```

## Single-origin production build

```powershell
npm run prepare:pose
npm run build
$env:REPANATOMY_SERVE_WEB='1'
.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --workers 1 --no-access-log
```

Open `http://localhost:8000/?gym=1`. Build for `/` for this mode. An HTTP-only remote host cannot request camera permission: use the HTTPS deployment described in `deploy/README.md`. Do not use multiple workers or multiple tasks with this in-memory session implementation.

To run the same Gym Studio browser suite against the production bundle after a root-path build:

```powershell
$env:REPANATOMY_PRODUCTION_TEST='1'
npm run test:fitness:browser
Remove-Item Env:REPANATOMY_PRODUCTION_TEST
```

This test mode uses one server on port 8013 and no Vite development proxy.

## Practice flow

- **Synthetic demonstration:** choose an exercise and start the labelled demonstration. Generated landmarks and actual generated JPEG frames exercise OpenCV, counting and planning together. No camera permission is requested.
- **Camera:** enable consent, select the exercise, choose Use camera and permit access. One person should fill the central area without cropped required joints. Place the camera side-on; a frontal projection cannot provide sagittal joint angles.
- **Video:** enable consent and open MP4/WebM supported by the browser. Analysis samples playback rather than processing every source frame. Do not seek; seeking or gaps require a fresh session. Stop releases the object URL and video resources.
- **Stop:** capture stops on request, on a hidden browser tab, on errors or at the end of the video. The pain/dizziness control stops capture and latches a human-review state. Start a new session only after the underlying concern has been appropriately addressed.
- **Counts:** an extended → flexed → extended joint cycle lasting 0.7–12 seconds increments observed reps. Cycles containing form cues are separated into reps for review. Occlusion, poor quality, incompatible view and tracking jumps reset the partial cycle.
- **Muscles:** the catalog shows expected primary/supporting roles and other muscles that are not primary targets. These statements are not an EMG measurement, strength assessment or proof of inactivity. Meet the muscle opens an atlas search/selection.
- **Practice draft:** stop first, choose a goal, 2–4 days, food preference and exclusions. The latest visual action and completed cycles choose the draft's focus. No successful cycle, poor capture or repeated form cues selects trainer technique review. Review is mandatory before exporting a draft. Four-day drafts split upper/lower practice across adjacent days.
- **Evidence:** inspect transitions, export JSON or delete the session. The export identifies the source as synthetic, camera, video or BODY_25. It does not include a session capability token or camera images.

## BODY_25 interoperability

Vision evidence accepts a JSON file with a single source JPEG and one person's pixel-space keypoints:

```json
{
  "image": "data:image/jpeg;base64,...",
  "people": [{"pose_keypoints_2d": [0, 0, 0]}]
}
```

The array above is abbreviated: supply exactly 75 values, ordered `(x,y,confidence)` for 25 joints. Coordinates must use the attached source frame's pixel dimensions. This UI imports one observation; temporal counting requires a sequence sent to `/api/fitness/sessions/{session_id}/frames`. Use `source: "body25"`, strictly increasing millisecond timestamps, `body25` and `image`. Do not send `landmarks` as well. Importing observations does not run an external pose executable.

## Troubleshooting

| Symptom | Action |
| --- | --- |
| Vision service offline | Start the Python backend; verify `/api/fitness/capabilities`; reload the page. |
| OpenCV import/version error | Activate the correct environment and install the lockfile. Install only one OpenCV wheel variant. |
| Missing model/WASM | Run `npm run prepare:pose`. Verify the asset requests return real files, not an HTML fallback. |
| Camera not available | Use localhost/HTTPS, grant permission, close another app holding the camera and retry. |
| Reframe / turn sideways | Use one person, more space, a side view and visible required joints. |
| No reps | Begin extended, reach the flexed phase and return. Partial cycles, short cycles and gaps do not count. |
| Video unsupported | Use a browser-compatible MP4 or WebM. No upload transcode service is included. |
| Session expired / capacity reached | Delete an old session or start a new session after expiry. Restart clears all sessions. |
| Test port in use | Close the corresponding test process or use the regular app on a different port. Fitness tests use 8013/4320; companion tests use 8011/4318. |
| Static preview works but API fails | Vite preview has no dev proxy. Use the single-origin production command above. |

Secrets remain on the backend. Optional report AI configuration is in `backend/.env.example`; fitness never requires a Groq key. Keep frame sessions private and leave HTTP access logs disabled to avoid logging session tokens in URL paths.
