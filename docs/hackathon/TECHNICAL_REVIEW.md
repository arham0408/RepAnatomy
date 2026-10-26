# Architecture and implementation review

This describes the current runnable project. [README component and sequence diagrams](../../README.md#architecture) show the same design. The Alexa+ track uses a browser simulation connected to a standards-based MCP server; no live Alexa endpoint or AWS runtime is part of this deployment.

## Component responsibilities

| Component | Responsibility | Source |
| --- | --- | --- |
| React application | Atlas, report upload, finding cards, scoped chat, companion tab | [page.tsx](../../app/page.tsx), [report explorer](../../app/medical-report-explorer.tsx) |
| Browser speech controller | Microphone transcripts, selected language, speech synthesis and stop controls | [medical-audio.ts](../../app/medical-audio.ts) |
| REST ingestion | PDF/text extraction, existing analysis API, health and chat endpoints | [main.py](../../backend/main.py), [pdf_extractor.py](../../backend/pdf_extractor.py) |
| Browser MCP client | Negotiation, initialized notification, discovery, real tool calls, JSON-response parsing | [report-mcp-client.ts](../../app/report-mcp-client.ts) |
| Companion UI | Connection state, typed/voice questions, excerpts, pairing and navigation polling | [voice-companion.tsx](../../app/voice-companion.tsx) |
| MCP tools and report store | Report-scoped operations, temporary capabilities, bounded histories, pairing and expiry | [mcp_server.py](../../backend/mcp_server.py) |
| Medical provider | Optional Groq inference and deterministic fallback | [provider.py](../../backend/provider.py) |
| Viewer verification | Resolve anatomy terms against real atlas concepts/parts before changing scene state | [medical-mapping.ts](../../app/medical-mapping.ts), [anatomy controller](../../app/medical-anatomy-controller.ts) |
| ASGI request guards | Host/origin allowlists and body-size bound | [security.py](../../backend/security.py), [middleware setup](../../backend/main.py) |

## Report-to-conversation data flow

1. The browser submits a file or text to `POST /api/reports/analyze`. Text-based PDFs are read with PyMuPDF; the provider extracts findings for the existing report explorer.
2. The browser enriches findings against the loaded atlas. It retains the extracted report text and selected report in application state.
3. **Connect report to assistant** initializes the MCP client, discovers tools, and calls `create_report` with that extracted text. The MCP path analyzes it again and creates an independent temporary report session. This second analysis can incur another provider call and produce different findings; the prototype does not share one immutable analysis object across REST and MCP.
4. `ask_report` receives a session capability, question, and selected language. The server retrieves the associated report and bounded conversation history, then calls the provider.
5. The result carries an answer, actual provider label, optional anatomy terms, and report excerpts for comparison. Excerpts are not verified sentence-level citations for generated claims.
6. When a response requests navigation, the server updates the latest anatomy terms and increments a revision. The owner browser polls `get_viewer_state` about every 1.8 seconds after a request completes.
7. The browser resolves those terms against the currently loaded atlas. Only verified, available part IDs enter highlight/focus state. Unavailable anatomy produces a visible availability message.

Navigation state represents the **latest request**, not a durable event queue. Rapid commands can replace earlier requests. Pairing uses polling rather than WebSockets or a cloud messaging service.

## MCP transport and lifecycle

- Endpoint: `POST http://127.0.0.1:8000/mcp`, or `/mcp` through Vite on port 3016.
- Protocol implemented and negotiated by the browser: **2025-11-25**.
- Transport: **Streamable HTTP**, using the SDK's JSON response mode. A compliant JSON response is used for tool results; a persistent SSE stream is not required by this demo.
- Client sends `Accept: application/json, text/event-stream`, JSON content type, and `MCP-Protocol-Version`.
- Sequence: `initialize` → `notifications/initialized` → `tools/list` → `tools/call`.
- The official SDK is pinned to `mcp==1.30.0`. Its session manager runs in the parent FastAPI lifespan.
- MCP transport is stateless; the application's report session is separate and addressed by an expiring capability.
- Tools use typed inputs and JSON-serializable structured output. The browser also supports JSON text-content output.

Opening `/mcp` in the address bar sends a GET and is not a functional protocol test. Use the [independent official-SDK client](../../backend/smoke_mcp.py) or the browser simulator.

## Tool inputs and behavior

| Tool | Required inputs | Result / access |
| --- | --- | --- |
| `create_report` | `text` | New owner `session_key`, summary, findings, excerpts; optional `filename`, `language` |
| `get_report` | `session_key` | That session's report; owner or companion |
| `ask_report` | `session_key`, `question` | Report-scoped answer, excerpts and provider; optional `language` |
| `focus_anatomy` | `session_key`, `finding_id` | Request associated anatomy; rejects findings absent from this report |
| `prepare_questions` | `session_key` | Up to eight English report-anchored prompts |
| `get_viewer_state` | `session_key` | Latest anatomy terms/revision, companion count and remaining lifetime |
| `create_pairing` | Owner `session_key` | Single-use invitation; replaces outstanding invitations for that owner |
| `join_pairing` | `pairing_code` | Separate companion capability and report; consumes invitation |
| `disconnect` | `session_key` | Default `mode=close`: delete owner report or leave companion; owner-only `revoke_companions` keeps report and revokes peers/invitations |

There are nine tools. Session keys are capabilities carried as tool arguments, not an account/password system. An external MCP host must protect them and must not expose another user's keys or report context.

## State, access, and limits

| Item | Current implementation |
| --- | --- |
| Storage | Process-local Python dictionaries; no database, vector index, object store, or durable patient record |
| Report access | Random owner capability; separate random companion capabilities |
| Session lifetime | 30 minutes from creation; activity does not extend it; background cleanup runs every 30 seconds |
| Session capacity | Up to 64 reports per process; one backend worker is required for consistent access |
| Pairing | Invitation valid two minutes and usable once; up to four companions per report |
| Conversation | Store up to 16 history entries; provider sends the latest six previous entries to inference |
| Input size | 10 MiB request-body limit; MCP text 10–100,000 characters; question 1–2,000 characters |
| Model report context | Up to 12,000 characters for extraction; up to 4,000 for report chat |
| Revocation | Capability/invitation maps updated immediately; the browser observes loss of access on its next request |
| Closing/restarting | Explicit owner disconnect deletes the session; closing/unmounting attempts disconnect; process restart loses all report state |

Browser-close cleanup is best effort. Access expiry still applies if a disconnect request cannot be delivered. Do not assume reliable deletion solely because a tab was closed.

## Trust and data boundaries

- Uploaded reports and model outputs are untrusted. Prompts instruct the provider to preserve report qualifiers and not follow instructions embedded in reports. This is a prototype control, not a certified prompt-injection defense.
- The backend holds report/chat context in memory. With Groq configured, relevant text is sent to that provider. Browser speech recognition can use the browser vendor's audio service.
- The visible activity log omits report text, questions, keys, and invitations; routine state polls are suppressed there.
- Host/origin checks protect the local demo surface. They are not production identity, tenant authorization, OAuth consent, rate limiting, or regulatory compliance.
- MCP finding extraction uses text rather than original PDF page positions. The source `page` field does not establish page-accurate provenance.
- Reference anatomy is not a patient-specific 3D reconstruction. Only source report evidence supports report-specific statements.

## Implementation evidence

| Claim | Evidence to inspect |
| --- | --- |
| Real MCP compatibility | [SDK smoke client](../../backend/smoke_mcp.py), handshake/discovery tests in [test_mcp.py](../../backend/test_mcp.py) |
| Isolation, pairing, expiry and revocation | Capability/lifecycle tests in [test_mcp.py](../../backend/test_mcp.py) |
| Two browser surfaces and verified navigation | [Browser integration test](../../scripts/voice-companion.e2e.mjs) |
| Decimal measurements and negative findings in fallback | Fallback regression in [test_mcp.py](../../backend/test_mcp.py) |
| Offline answers avoid sample diagnoses | Offline evidence regression in [repanatomy-medical.test.mjs](../../scripts/repanatomy-medical.test.mjs) |
| Current test results and untested paths | [Verification record](VERIFICATION.md) |

## Future Amazon integration (not implemented)

The current track demonstration follows the official web-simulation route. These are possible next engineering steps, not present dependencies or completed integrations:

1. Connect an approved Alexa+ MCP host after obtaining required tooling/access and verifying its authorization, endpoint, and interaction contracts. The current server has not been tested with such a host.
2. Evaluate an Amazon Bedrock provider adapter if using AWS-hosted inference becomes a product requirement. The current provider is Groq or deterministic fallback; no Bedrock adapter exists here.
3. Evaluate an authenticated AWS deployment with durable, appropriately protected report storage and auditable consent. The current in-memory store is not deployable as a multi-worker or clinical records service without further design.

These plans do not establish AWS Builder eligibility or a live Amazon device integration. See the [official simulator FAQ](https://amazonappdev2026.devpost.com/details/faqs) and [review checklist](SUBMISSION_STATUS.md).
