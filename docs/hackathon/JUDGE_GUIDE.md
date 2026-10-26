# Five-minute judge's guide

**RepAnatomy turns a report into a voice-and-screen conversation:** ask about a report phrase, compare the original evidence, and see the associated reference anatomy. The Alexa+ track is demonstrated through a labeled web simulator and a real MCP server.

[Team demo video](https://www.youtube.com/watch?v=teRzrT49HVo) · [Architecture](TECHNICAL_REVIEW.md) · [Troubleshooting](TROUBLESHOOTING.md) · [Review checklist](SUBMISSION_STATUS.md)

## Before starting

Start the frontend and Python backend using the [README instructions](../../README.md#run-locally). Open [http://localhost:3016/?demo=1](http://localhost:3016/?demo=1). Wait for the atlas to finish loading. A fresh checkout needs Node/Python dependencies and initial model loading time before the timed evaluation below.

The walkthrough needs no application account, hardware, or paid key. Use typed input first. Keep both browser and backend running. Cloning the private repository requires authorized GitHub access; see the [reviewer-access check](REVIEWER_ACCESS.md).

## Evaluation steps and expected results

| Time | Action | Expected result / what it demonstrates |
| --- | --- | --- |
| 0:00–0:30 | In **Upload**, choose the first sample, **Abdominal Ultrasound** | A synthetic report loads and findings appear. The sample filename ends in `.pdf`, but its content is embedded text. |
| 0:30–1:00 | Choose **Voice companion**, then **Connect report to assistant** | The report filename, connection/expiry label, and extraction mode appear. The browser initializes MCP, discovers its tools, and creates a report session. |
| 1:00–1:40 | Select **Show me the gallbladder** | An answer appears. In no-key mode, it quotes matching report excerpts. Available gallbladder anatomy is verified and highlighted; the camera focuses on the target. |
| 1:40–2:10 | Ask **What does my report say about the kidneys?** | The answer includes matching source text. Compare its negative statements, including the absence of renal calculus, with the report. An organ highlight is location context, not a diagnosis. |
| 2:10–2:40 | Expand **Compare with report excerpts** and **MCP activity · reviewer view** | Report evidence is inspectable. The activity view shows real `initialize`, `tools/list`, and tool calls without displaying access keys. Routine polling is omitted from this activity log. |
| 2:40–3:10 | Select **Prepare questions for my doctor (English)** | Report-anchored discussion prompts appear. They are English templates and do not require an LLM or recommend treatment. |
| 3:10–4:20 | Expand **Use another browser as the voice companion**; create an invitation; open it in a second tab; select **Join report session** | The second browser sees the same report through a separate capability. Ask **Show me the liver** there. The main viewer receives the location request and verifies the highlight. |
| 4:20–5:00 | In the main browser, choose **Revoke all companions and invitations**; then **Disconnect and delete report session** | The companion loses access on its next request/poll. The owner can retain the session after revocation and explicitly delete it when finished. |

The default demo uses the male atlas, which includes the organs used above. Do not judge exact response wording or finding counts: extraction modes differ, and deterministic extraction is intentionally limited. Evaluate source correspondence, provider labeling, protocol calls, and verified navigation.

## Optional: voice and multilingual interaction

1. Allow microphone access on localhost or HTTPS.
2. Select **Use microphone**, speak your question, inspect the transcript, then choose **Send question**. Speech is not automatically submitted.
3. Use **Read aloud** on an answer or enable **Read replies aloud** before sending a question. Use **Stop audio** to interrupt.
4. With a functioning server-side Groq key, select Hindi or another available language and ask for an explanation. Check the provider label on the answer.

No-key mode deliberately returns English excerpts and a limited-mode notice. Selecting another language does not make the fallback translate. Browser voice availability and recognition support vary; typed evaluation remains available.

## User scenario

A patient has an abdominal ultrasound report and wants to understand its terminology before a clinical appointment. They upload it through the web companion, ask about a finding, see its location on a reference body, and prepare questions for their clinician. A caregiver can use a second browser while the patient keeps the visual display open.

The potential benefit is easier access to the report's vocabulary and visual context. Clinical benefit, comprehension improvement, accessibility outcomes, and patient adoption have not been measured. The product does not interpret scan pixels or reconstruct a patient's anatomy.

## What distinguishes the prototype

- The report stays selected across conversational turns within the temporary session.
- Voice/text answers connect to a visual interaction rather than ending as standalone prose.
- Anatomy IDs are verified against the loaded catalogue; free-form model output cannot select arbitrary meshes.
- Pairing gives a second browser explicit, revocable access to the current report.
- The MCP server is independently callable using the official SDK, beyond the browser simulator.

These are current implementation features, not a claim of a live Echo integration or persistent patient records.

## Quick independent check

With the Python environment active and backend running:

```sh
python -m backend.smoke_mcp
```

Expected output includes:

```text
Negotiated 2025-11-25; discovered 9 tools.
Report creation, grounded answer, and anatomy request passed.
Companion pairing, shared navigation, and access revocation passed.
Synthetic session deleted.
```

The script creates its own synthetic session and deletes it. It does not operate on the report open in your browser. If Groq is configured, the script can call it; use an unconfigured local backend for a no-key evaluation.

## Review boundaries

Use [recorded verification](VERIFICATION.md) for completed tests, [architecture review](TECHNICAL_REVIEW.md) for implementation evidence, and [the review checklist](SUBMISSION_STATUS.md) for material/access checks. The video page is reachable and has the expected project title; automated playback was blocked by YouTube's bot check, so footage, narration, and runtime still need manual inspection.
