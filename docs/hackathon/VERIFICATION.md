# Verification record

Current local verification used Windows, Node 24.22.1, Python 3.12.10, official MCP SDK 1.30.0, and Chromium. The core path uses synthetic reports and does not require a paid model key.

| Check | Result |
| --- | --- |
| `npm run check` | Passed TypeScript validation |
| `npm run lint` | Passed with warnings denied |
| `npm test` | 125 project tests passed, including atlas/assets/interaction checks and offline evidence regression |
| `python backend/test_backend.py` | Four checks passed: health, text analysis, generated PDF upload, and chat |
| `python -m unittest backend.test_mcp -v` | Seven tests passed: negotiation/discovery, evidence/navigation, capabilities/isolation, pairing/revocation, expiry/bounds, HTTP guards, and fallback semantics |
| `python -m backend.smoke_mcp --output outputs/mcp-verification.json` | Official-SDK client negotiated 2025-11-25, discovered and exercised all nine tools, checked evidence, pairing reuse prevention, shared navigation, revocation, and report deletion |
| `npm run test:companion` | Passed the two-browser flow: sample, real MCP calls, report response, anatomy navigation, companion question, doctor prompts, mobile scrolling/width, access revocation and deletion; no uncaught page errors |
| `npm run build` | Passed production build and PWA validation of 38 model chunks; bundle-size advisory remains |
| Local documentation checks | Local file links, heading anchors and code fences are validated before delivery |

The [sanitized protocol evidence](evidence/mcp-verification.json) contains actual tool-discovery/check results, without report-access keys. Reproduction instructions are in the [README](../../README.md#verification). The [CI notes](CI.md) explain the separate viewer lifecycle/browser checks and optional Pages deployment.

## Video review

The [YouTube page](https://www.youtube.com/watch?v=teRzrT49HVo) resolves to **RepAnatomy — Making Medical Reports Understandable Through AI & 3D Anatomy**, channel **Anju Singh**. Page metadata and the project description are readable. Automated playback encountered **Sign in to confirm you're not a bot**, and local browser use was disabled during the attempted review. No actual footage or audio was observed in that attempt.

Therefore duration under three minutes, narration language, and visible MCP/voice actions remain manual video checks. The application's working behavior was checked separately through the live backend and browser automation. A bot check does not establish that the video fails to play in a normal signed-in browser.

## Verification boundaries

- No authenticated Groq inference was made. Translation, model availability, response latency, and generated-answer quality still require live-provider checks.
- Browser integration used typed input. Physical microphone capture, installed voices, multilingual read-aloud quality, and physical-device pairing require manual checks.
- No native Echo/Alexa+ connection, AWS runtime, clinical validation, or public cloud deployment is claimed.
- The one-process session store expires reports after 30 minutes and is not durable patient storage.
- A passing test suite is evidence of the exercised behaviors, not a guarantee that every medical phrase is extracted correctly or every video claim is substantiated.
