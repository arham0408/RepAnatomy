# Integrated movement workspace

## Product flow

The default route and `?gym=1` open **Train + anatomy**. Camera/video, pose overlay, live coaching, expected target muscles and the native 3D atlas share one screen. **My practice** contains local daily totals, planning chat, food restrictions, the existing reviewable weekly plan, and expandable diagnostics. The standalone atlas remains at `?atlas=1`; report features remain accessible by their legacy links but are absent from the main training navigation.

1. State a muscle goal by typing or tapping the microphone, or select a movement.
2. Give frame-processing consent. Start the camera or open a video.
3. Follow movement phase, observed reps and quality/form cues; explore expected muscle targets alongside capture.
4. Turn voice on to hear cues and replies. Stop ends capture and requests a set review when reps exist. Pain/dizziness latches a session stop.
5. Review daily practice and create a meal/exercise draft. Export the reviewed plan or the raw bounded measurement trace.

## Measurement and recognition

OpenCV 5 continues to decode frames, project normalized landmarks into pixel geometry, measure blur/exposure and cross-check motion with Lucas–Kanade flow. MediaPipe's worker estimates landmarks. Samples now include left/right elbow, shoulder, hip and knee angles, timestamps, validity and phase. Low-visibility joints are null, never zero degrees. The server retains the last 600 samples and last 100 per-rep records in its existing 30-minute memory-only session; the normal frame response includes the latest 20 rep records. Each completed rep records its duration, review flag, and visible-joint minimum/maximum/range. Full retained arrays are available through telemetry export. Raw frame images are not retained in the export.

Automatic exercise recognition is a **temporal geometry heuristic**, not a trained classifier. It uses body orientation, wrist/upper-arm position, knee/elbow motion and visible ankle separation. It requires at least five agreeing candidate observations, 80% agreement among candidate-bearing frames, at least 25 degrees of joint excursion, and 1.2 seconds of observations within a 30-frame rolling window. Static, clipped, poorly visible and frontal evidence must not start counting. Once selected automatically, the exercise stays locked until a new session. The user can choose any supported exercise manually when recognition is uncertain. Warm-up recognition movements are not retroactively counted.

Supported movements: bodyweight squat, forward lunge, biceps curl, shoulder press and push-up. Split-stance recognition requires both ankles; unsupported movements can resemble supported ones. Rule agreement is **not a calibrated probability or measured real-world accuracy**. Counting uses the existing extended–flexed–extended state machine, hysteresis, timing and quality gates. Exercise catalog thresholds are counting heuristics, not personalized ideal joint ranges. Video timestamps come from the media clock; labelled synthetic fixtures use a fixed 250 ms simulation step independent of 3D rendering speed.

The embedded atlas disables transitions and multisample antialiasing and caps drawing to 180,000 pixels so its rendering competes less with capture. The standalone atlas keeps its existing render quality. Muscle links filter out similarly named vessels and nerves. Highlighted targets express expected anatomical roles; neither the camera nor LLM measures activation, inactivity, load or muscle recruitment.

## Coaching and voice

`GROQ_API_KEY` and `GROQ_MODEL` configure the shared Groq provider. The optional `FITNESS_COACH_*` variables override its key, base URL and model. The fitness coach never silently substitutes another model. It sends a question, up to 120 recent angle samples, rep summaries, bounded conversation context and optional planning preferences; it never sends the sampled JPEGs to the LLM. The LLM cannot modify recognition, measured angles, rep counts or stop state. A stop during a provider request supersedes its response.

The backend uses a 10-second provider timeout, bounded messages/history, per-session concurrency/cooldown, and clearly labelled local fallback for missing keys, rejected models, errors and empty responses. `/coach/status` reports configuration, not a successful upstream connection. Error messages do not expose credentials or raw provider bodies.

Groq's [model retirement list](https://console.groq.com/docs/deprecations) states `deepseek-r1-distill-llama-70b` retired on October 2, 2025. The existing `openai/gpt-oss-120b` default is listed in [supported models](https://console.groq.com/docs/models). To use DeepSeek specifically, an account/provider must actually expose the chosen DeepSeek model; a Groq key alone cannot restore a retired model. No live authenticated LLM success is claimed without a key.

Speech input uses the browser SpeechRecognition API with a typed fallback. It is tap-to-speak and may use the browser vendor's remote service. Spoken replies/cues use speech synthesis, with pacing to avoid repeating every frame. Microphone capture is distinct from video capture. “Stop session” stops capture; discomfort phrases stop coaching. Browser tests mock speech recognition and synthesis to verify transport, commands and reply behavior; physical microphone recognition and audible speaker quality still need a human test.

## API

All paths below start with `/api/fitness`.

| Method | Path | Behavior |
|---|---|---|
| GET | `/capabilities`, `/exercises` | Runtime and supported catalog |
| POST | `/sessions` | Create manual or `auto` session |
| POST | `/sessions/{id}/frames` | Quality gates, recognition, angles, count and cues |
| GET | `/sessions/{id}` | Current summary |
| GET | `/sessions/{id}/telemetry` | Bounded timestamped angle arrays and rep records |
| POST | `/sessions/{id}/stop` | Latched discomfort stop |
| POST | `/sessions/{id}/plan` | Reviewable plan with restrictions and clinical gate |
| DELETE | `/sessions/{id}` | Delete memory-only session |
| GET | `/coach/status` | Configuration status without secrets |
| POST | `/coach` | Goal recommendation, measured-set review, planning conversation |

Example coach body: `{"message":"Review my set","session_id":"<opaque token>"}`. Omit the session ID for a pre-workout goal. Optional `preferences` accepts the same fields as the plan endpoint. Daily summaries live on the user's device under `repanatomy.workouts.v1`, limited to 100 camera/video sets, upserted by session ID so updates do not duplicate sets. Synthetic sets are excluded. Clear history removes saved aggregates. These aggregates contain no images or transcripts.

## Verification and remaining evidence

Run `npm run check`, `npm run lint`, `npm test`, `npm run build`, `python -m unittest backend.test_fitness backend.test_movement backend.test_mcp -v`, `npm run test:fitness:browser`, and `python scripts/smoke-production.py` after a root build. On Windows, use `.venv/Scripts/python.exe`.

The implementation checks include all five automatic recognition fixtures, stationary/occlusion/darkness/frontal abstention, exact angle telemetry, per-rep ranges, bounded retention, goal suggestions, mocked provider payload/error handling, in-flight stop precedence, actual local WASM/model startup, no-person video, plan restrictions, exports, responsive controls, integrated atlas muscle selection, simulated voice commands and history reload/deletion. Current execution evidence is recorded in `movement-verification.json`.

**No human-dataset accuracy percentage is claimed.** Before an investor demonstration with live participants, collect consented held-out clips across body types, lighting, clothing, viewpoints and unsupported exercises. Have a qualified reviewer label exercise, rep boundaries and visible technique cues. Report a confusion matrix including “unknown,” count error, missed/false cues, failures and latency separately from these synthetic/software checks. This project cannot prove actual muscle activation without appropriate additional measurements.

The [competition rules](https://opencv26.devpost.com/rules) value technical execution, evaluation, user experience and responsible operation. This update retains the real OpenCV feedback loop and adds an LLM explanation step, bounded observability and human stop control. The prepared AWS deployment still needs actual deployment and validation; this local change does not establish AWS eligibility, COOL use, medical validation, or competition acceptance.

Pose implementation reference: [MediaPipe Pose Landmarker guide](https://developers.google.com/edge/mediapipe/solutions/vision/pose_landmarker). Existing exercise references and anatomical provenance remain in the catalog and attribution files.
