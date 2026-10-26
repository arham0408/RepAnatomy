# RepAnatomy demo walkthrough

Reproducible demonstration of RepAnatomy's report-to-conversation workflow. This walkthrough is separate from a transcript of the linked video.

**[Watch the team-provided video](https://www.youtube.com/watch?v=teRzrT49HVo)** · [Five-minute judge's guide](JUDGE_GUIDE.md) · [Architecture](TECHNICAL_REVIEW.md)

| Time | Action | What to explain |
| --- | --- | --- |
| 0:00–0:20 | Open `/?demo=1`; choose Abdominal Ultrasound | Patients need help connecting report terminology to anatomy. This report is synthetic. |
| 0:20–0:40 | Open Voice companion and connect | This is our Alexa+ web simulation using a real Streamable HTTP MCP server. No live Alexa connection is claimed. |
| 0:40–1:10 | Ask “Show me the gallbladder” | The selected report supplies context. The viewer verifies anatomy before highlighting reference meshes. |
| 1:10–1:30 | Ask about kidneys; inspect report excerpts | Preserve negative findings and compare the original report. |
| 1:30–1:50 | Prepare questions for the doctor | Discussion prompts are anchored to report phrases, not a treatment plan. |
| 1:50–2:20 | Join a second browser using an invitation and ask about the liver | A separate voice surface shares visual context; its access can be revoked. |
| 2:20–2:45 | Show MCP activity and the SDK smoke test | Real tool calls, temporary report state, independent MCP client access, and the actual provider mode. |
| 2:45–2:55 | State product scope | Educational report companion with verified reference anatomy; consult a clinician for medical decisions. |

For voice, grant microphone permission on localhost or HTTPS. Select **Use microphone**, speak, check the transcript, then send. Enable **Read replies aloud** or select **Read aloud** beside an answer. Typed input works when recognition is unsupported.

With a functioning Groq key, select Hindi or another supported language to demonstrate translation. Without a key, describe the fallback accurately: English report excerpts with limited rule-based extraction, rather than conversational reasoning or translation.

## Check earlier footage against actual behavior

The team's video URL is linked above. Its visible title is **RepAnatomy — Making Medical Reports Understandable Through AI & 3D Anatomy**, on **Anju Singh**'s channel. YouTube blocked automated playback with **Sign in to confirm you're not a bot**. Footage, narration language, and duration could therefore not be independently checked. This playback barrier does not establish that the video is broken for viewers using their own browser. Apply these checks when watching it:

| Claim or scene | Accurate current description |
| --- | --- |
| Uploading a PDF | File upload happens in the companion web app; a speaker does not upload the file. |
| Talking to Alexa | Browser voice simulation, unless a separate real Alexa integration was actually implemented and demonstrated. |
| Separate speaking device | A second browser pairs through an invitation; physical devices need a reachable HTTPS deployment. |
| MCP HTTP server | A real server implements 2025-11-25 over Streamable HTTP. Show actual initialization, discovery, and tool calls when demonstrating it. |
| Multilingual AI | Requires a working model provider and supported browser voices. Check each answer's provider label. |
| An organ is highlighted | A reference location is shown. Disease status must come from the report, preserving negation and certainty. |

The [MCP verification command](MCP_PROTOCOL.md) and [browser walkthrough](JUDGE_GUIDE.md) provide independent checks of the runnable application; a recorded scene alone does not verify a backend protocol exchange.
