# Product feedback and observed friction

Implementation feedback based on the tools used by RepAnatomy and observed local verification. The table distinguishes directly tested behavior from checks requiring live provider access or physical audio testing.

| Tool | Used for / what worked | Limitations / onboarding | Would use again? |
| --- | --- | --- | --- |
| Official MCP Python SDK | Typed report tools, discovery, Streamable HTTP, independent client verification | Pin the maintenance-line version and use matching documentation. FastAPI hosting needs explicit session-manager lifespan ownership. | Yes, with transport-level tests and explicit versions. |
| FastAPI and Pydantic | Existing report APIs and validation; parent app hosts the MCP endpoint | Keep the MCP mount after REST routes; configure origin/host allowlists. Existing report processing reduced setup work. | Yes, with a dedicated ingestion/provenance layer for broader use. |
| PyMuPDF | Existing PDF text extraction; generated-PDF backend tests | Scanned files need OCR. Passing extracted text into MCP loses original page positions. | Yes, with explicit OCR and provenance handling. |
| Groq | Existing optional extraction/chat provider reused by MCP | Configure server-side key. No authenticated live request was validated in this pass; translation, latency, and clinical accuracy remain unverified. Long context is truncated. | Evaluate after authenticated tests on synthetic multilingual cases. |
| Browser Web Speech API | Existing audio controller reused for microphone input and speech output | Browser permission, secure origin, voices, and recognition coverage vary. Automated tests use typed input; physical microphone/audio quality needs manual review. | Yes for a prototype, with a supported-browser matrix. |
| React, Vite, Three.js | Existing atlas supports verified navigation; Vite proxies both APIs and MCP | Large model downloads/bundle; physical-phone performance needs separate testing. Install dependencies and run both services. | Yes, with future bundle splitting and device profiling. |
| Playwright | Two browser surfaces, real backend requests, revocation, mobile layout | Matching Chromium must be installed separately from npm dependencies. | Yes, as a repeatable integration check. |

No gated Alexa+ SDK, Echo connection, Alexa developer-console integration, or AWS runtime is used here. The project follows the official simulation path. First-hand SDK/device or AWS feedback cannot be supplied for tools we did not use.

## Observed friction log

| Task and steps | Expected vs actual | Severity | Workaround | Suggested improvement |
| --- | --- | --- | --- | --- |
| Restart the same MCP manager across separate test-app lifespans | Expected repeatable starts; SDK rejects running the same manager instance twice | Medium | Use one test-class app lifespan and reset application sessions between tests | Document test fixture lifetime beside mounting examples |
| Return an unparameterized `dict` from a tool and consume `structuredContent` | Expected structured output; received JSON text content instead | Low | Annotate `dict[str, Any]`; retain text-content parsing fallback in browser client | Include generic-container return annotations and robust response parsing in examples |
| Launch the browser test after npm installation | Expected a browser; matching Chromium executable absent | Low | Run `npx playwright install chromium` | Keep browser installation explicit in setup and CI |

## Feature requests

- **Important:** an accessible Alexa+ integration sandbox for true assistant/device invocation alongside self-hosted MCP tools. The official FAQ currently points entrants toward their own simulators.
- **Important:** document provenance carried through ingestion and tool/model responses to support original-page evidence.
- **Nice-to-have:** consistent multilingual browser speech capability reporting before users begin a conversation.
