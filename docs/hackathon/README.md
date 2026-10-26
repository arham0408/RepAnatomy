# Legacy report-companion documentation

This directory documents the retained report and voice workflow from an earlier competition scope. For the current RepAnatomy OpenCV 5/AWS project, use [the OpenCV technical report](../opencv/TECHNICAL_REPORT.md), [current submission audit](../opencv/SUBMISSION_CHECKLIST.md), and [current verification](../opencv/VERIFICATION.md). Historical screenshots and verification records here do not establish the fitness extension's capabilities or current competition eligibility.

# RepAnatomy review pack

**Alexa+ primary-track prototype: a voice-first report companion with verified 3D anatomy and a real Streamable HTTP MCP server.**

[Watch the team demo](https://www.youtube.com/watch?v=teRzrT49HVo) · [Project README](../../README.md) · [Local demo](http://localhost:3016/?demo=1)

The local link works after starting the two services on your own computer. The video page resolves to the expected RepAnatomy title. Automated playback encountered YouTube's bot check; footage and runtime need manual inspection. The runnable browser/MCP workflow has been verified independently.

## Choose a review path

| Goal | Read this | Result |
| --- | --- | --- |
| Understand the product and try it | [Judge's guide](JUDGE_GUIDE.md) | Five-minute evaluation with clicks, prompts, and expected behavior |
| Start from a fresh checkout | [Local setup](../../README.md#run-locally) | Browser on 3016 and Python API/MCP on 8000 |
| Inspect the implementation | [Architecture review](TECHNICAL_REVIEW.md) | Components, protocol flow, data boundaries, tool inputs, and source links |
| Inspect protocol/tool interoperability | [MCP protocol](MCP_PROTOCOL.md) | Wire examples, all nine tools, and an independent SDK verification command |
| Confirm private-repository reviewer access | [Access check](REVIEWER_ACCESS.md) | Confirmed collaborators and invitations that require owner review |
| Resolve setup/demo issues | [Troubleshooting](TROUBLESHOOTING.md) | Symptom-based fixes and readiness checks |
| Understand GitHub checks and deployment | [CI and Pages](CI.md) | Mandatory validation with optional, automatically detected Pages deployment |
| Review a short presentation | [Demo walkthrough](DEMO_WALKTHROUGH.md) | Suggested current-version sequence under three minutes |
| Check test evidence | [Verification record](VERIFICATION.md) | Recorded results and what remains untested |
| Review developer experience | [Product feedback](PRODUCT_FEEDBACK.md) | Tools actually used, observed friction, and feature requests |
| Review the submission materials | [Review checklist](SUBMISSION_STATUS.md) | Demo, source, feedback, and reviewer-access checks |
| Inspect anatomy documentation and licenses | [Technical guide](../../README-technical.md), [asset attribution](../../public/ATTRIBUTION.md) | Viewer architecture and applicable notices |

## What to expect

The core evaluation needs no login, Alexa hardware, AWS account, or paid inference. Typed questions work without a microphone. No-key mode returns English report excerpts; conversational reasoning and translation require a configured Groq provider. A separate browser tab can demonstrate pairing without another physical device.

For verification evidence rather than feature descriptions alone, use the [JSON protocol result](evidence/mcp-verification.json), [verification record](VERIFICATION.md), and [repeatable judge walkthrough](JUDGE_GUIDE.md).
