# OpenCV AI Competition 2026 — RepAnatomy submission audit

Official sources checked during local preparation: [competition overview](https://opencv26.devpost.com/) and [rules](https://opencv26.devpost.com/rules). The overview states final submission is **October 26, 2026 at 11:59 pm Pacific**, which converts to **October 27, 2026 at 12:29 pm IST** assuming Pacific Daylight Time (UTC−7). The attached text also displayed **12:15 pm IST**; these times conflict. **Use the live Devpost submission countdown and finish before the earlier displayed time.** No submission was made by this task.

This checklist reports evidence, not certification of eligibility or a prediction of winning. Current public rules and organizer decisions govern. The public overview and rules also differ in their age wording; verify each team member against the actual entry flow and official rules. Do not infer eligibility from this file.

| Requirement | Local material | Status / evidence still needed |
| --- | --- | --- |
| Substantive OpenCV 5 image/video analysis | Actual 5.0.0 runtime; quality, tracking, geometry gates; fitness API and tests | Implemented and locally exercised |
| Meaningful AWS component | Container + ECS Fargate/ALB/ECR/CloudWatch template; cloud would execute all backend vision processing | **Pending actual AWS deployment and execution evidence** |
| Problem, users and impact | Technical report; conservative educational scope | Documented; real-world benefit not measured |
| Technical report including architecture, deployment, evaluation, limits and responsible use | `TECHNICAL_REPORT.md` | Prepared; add actual cloud results and real clip results before claiming them |
| Judge-accessible repository or archive | Local source folder | **Pending access arrangement or archive handoff**; nothing pushed |
| Pinned dependencies | npm lock, Python direct pins + environment lock, pose hash manifest | Prepared; Windows local validation; Linux container execution pending |
| Build, deploy, test and use instructions | Main README, `RUN_AND_USE.md`, `deploy/README.md` | Prepared |
| Architecture diagram | Technical report and README | Prepared; AWS component explicitly labelled as prepared |
| Working endpoint or arranged live screen-share | Working local app | **Pending public HTTPS endpoint or arranged judge screen-share** |
| At-most-five-minute judge-accessible video showing team, working app, architecture and results | `DEMO_SCRIPT.md` | **Pending recording and upload/link**; older report demo does not demonstrate Gym Studio |
| Evaluation including failure cases | Regression tests, synthetic evaluation JSON, browser evidence | Local engineering evidence; **human clips and AWS measurements pending** |
| Rights, consent and licenses | Existing anatomy credits retained; local pose asset manifest and runtime credits | Preserve included licenses; obtain consent/rights for any new evaluation media |
| Security and responsible operation | Explicit capture consent, bounded sessions/frames, ephemeral data, abstention, human review, non-root HTTPS cloud preparation | Demo safeguards implemented; production identity/quotas/load/security review pending |
| Team eligibility, team representative, registration, necessary consent/tax forms | No personal details invented | **Team must complete/verify on Devpost** |
| Grant team bio/progress check-in | No claim of grant participation | Only relevant to teams that actually received a grant; verify their separate obligations |

## Featured paths

| Path | Implementation and evidence | Status |
| --- | --- | --- |
| Agentic Vision | OpenCV output changes capture cadence, counting state, recapture requests and a later practice draft; observable trace; pain stop and user review | Local deterministic perception–decision–action loop demonstrated. Add real-camera trace and AWS run; organizers determine qualification. |
| Best Use of COOL | No COOL library, Graviton core workload, baseline comparison or cloud measurements | **Not implemented; do not claim eligibility for this award.** |

## Before the actual submission

1. Validate team eligibility, entry access and the actual closing time in the live submission flow.
2. Run and validate the container; deploy a meaningful backend component on AWS. Record task/image identifiers, runtime version, HTTPS URL and operational evidence without credentials/session tokens.
3. Run a consented exercise clip, annotate expected reps with a qualified trainer, export its trace and record errors and failure cases. Do not substitute synthetic counts for real recognition accuracy.
4. Provide judge access to the code or an archive; test access without relying on your logged-in browser.
5. Record a new video following `DEMO_SCRIPT.md`, verify its duration and judge access, and supply the final link.
6. Rerun the verification commands and attach actual results. Keep the descriptions consistent with demonstrated capabilities.

## Judging alignment

Technical execution has a real OpenCV pipeline and regression evidence; innovation is the connection between visual cues, anatomy and reviewed planning; UX includes consent, understandable abstention and mobile layouts. Documentation is provided. Impact is a hypothesis rather than a measured outcome, and AWS execution is still a material submission gap. No checklist or implementation can guarantee an award.
