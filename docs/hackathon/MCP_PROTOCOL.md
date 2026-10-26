# MCP protocol and tool reference

RepAnatomy exposes a real self-hosted MCP server at `http://127.0.0.1:8000/mcp`. The browser reaches the same endpoint through Vite at `http://localhost:3016/mcp`.

**Protocol:** 2025-11-25. **Transport:** Streamable HTTP, JSON response mode. **SDK:** official `mcp==1.30.0` Python package. **Payload:** JSON-RPC 2.0. **Entry point:** `python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`.

[Server tools](../../backend/mcp_server.py) · [browser client](../../app/report-mcp-client.ts) · [independent SDK verifier](../../backend/smoke_mcp.py)

## Reproduce the protocol check

With the backend running and Python environment active:

```sh
python -m backend.smoke_mcp --output outputs/mcp-verification.json
```

Expected console messages include:

```text
Negotiated 2025-11-25; discovered 9 tools.
Report creation, grounded answer, and anatomy request passed.
Companion pairing, shared navigation, and access revocation passed.
Synthetic session deleted.
```

The optional JSON file records negotiated version, transport, discovered tool names, and completed checks. It omits report-access keys and invitation codes. The test uses its own synthetic session. If Groq is configured, extraction/chat can make real provider calls.

## Wire sequence

Send requests with these headers:

```http
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-11-25
```

Initialize:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-11-25",
    "capabilities": {},
    "clientInfo": { "name": "repanatomy-review-client", "version": "1.0.0" }
  }
}
```

After the successful initialize result, send the initialized notification, then discover tools:

```json
{"jsonrpc":"2.0","method":"notifications/initialized","params":{}}
```

```json
{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}
```

Create a report session:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "create_report",
    "arguments": {
      "text": "SYNTHETIC ULTRASOUND: Gallbladder contains a 12 mm calculus. No renal calculus in either kidney.",
      "filename": "synthetic-review.txt",
      "language": "en"
    }
  }
}
```

The result includes a `session_key`. Substitute that actual key for `OWNER_SESSION_KEY` below; the placeholder itself is not valid:

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "tools/call",
  "params": {
    "name": "ask_report",
    "arguments": {
      "session_key": "OWNER_SESSION_KEY",
      "question": "Show me the gallbladder",
      "language": "en"
    }
  }
}
```

Successful tool results include `structuredContent` and compatible text content. A tool validation/access failure has `isError: true`; clients must not treat HTTP 200 alone as success. JSON response mode does not maintain a continuous SSE stream. Opening `/mcp` in a browser address bar issues GET and is not a protocol validation.

## All nine tools

| Tool | Inputs | Returns / behavior |
| --- | --- | --- |
| `create_report` | `text`; optional `filename`, `language` | Creates an owner capability and a 30-minute report session; returns summary, findings, excerpts and extraction provider |
| `get_report` | `session_key` | Session's report, findings, excerpts and disclaimer |
| `ask_report` | `session_key`, `question`; optional `language` | Answer and actual response provider; comparison evidence; may update anatomy-request state |
| `focus_anatomy` | `session_key`, `finding_id` | Requests terms associated with that finding; rejects unknown finding IDs |
| `prepare_questions` | `session_key` | Up to eight English discussion prompts anchored to report phrases |
| `get_viewer_state` | `session_key` | Latest anatomy terms, revision, companion count and remaining lifetime |
| `create_pairing` | Owner `session_key` | Single-use invitation valid for two minutes; replaces previous outstanding owner invitations |
| `join_pairing` | `pairing_code` | Separate companion capability with access to the selected report |
| `disconnect` | `session_key`; optional `mode` | `close` deletes an owner's session or leaves as companion; owner-only `revoke_companions` retains report and revokes companions/invitations |

`session_key` is a temporary capability, not a transport-level MCP session ID. The SDK transport is stateless; application sessions live in one backend process. Never include capability values in screenshots or public logs. The companion invitation travels in a URL fragment and is removed by the companion page after reading it.

## From a tool result to 3D action

`ask_report` and `focus_anatomy` update the latest anatomy terms and revision. The main browser polls `get_viewer_state`, resolves terms against the currently loaded catalogue, and updates the viewer only for available, verified mesh IDs. The server does not invent mesh IDs or remotely control arbitrary scene objects. An unavailable target is reported rather than substituted.

## Scope

The simulator is a browser MCP client with selected report context, voice controls, explicit workflow buttons, and paired visual navigation. It is not connected to a live Alexa device. An Alexa-specific toolkit, Agent Skill, AWS runtime, production OAuth server, durable database, or model-controlled autonomous tool planner is not required by this implementation's chosen simulator flow and is not claimed here.
