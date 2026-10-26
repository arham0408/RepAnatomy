"""Independent official-SDK client: python -m backend.smoke_mcp [http://127.0.0.1:8000/mcp]."""
import asyncio
import argparse
import json
from pathlib import Path
from mcp import ClientSession
from mcp.client.streamable_http import streamable_http_client


async def main():
    parser = argparse.ArgumentParser(description="Verify RepAnatomy's real MCP transport and all nine tools using synthetic data.")
    parser.add_argument("url", nargs="?", default="http://127.0.0.1:8000/mcp")
    parser.add_argument("--output", type=Path, help="Optional sanitized JSON verification report (no session or invitation keys).")
    args = parser.parse_args()
    url = args.url
    checks = []

    def require(condition, message):
        if not condition:
            raise RuntimeError(message)

    async with streamable_http_client(url) as (read, write, _):
        async with ClientSession(read, write) as session:
            initialized = await session.initialize()
            require(initialized.protocolVersion == "2025-11-25", "MCP 2025-11-25 negotiation failed.")
            tools = await session.list_tools()
            tool_names = sorted(tool.name for tool in tools.tools)
            expected = {"create_report", "get_report", "ask_report", "focus_anatomy", "prepare_questions",
                        "get_viewer_state", "create_pairing", "join_pairing", "disconnect"}
            require(expected <= set(tool_names), "Required MCP tools were not discovered.")
            checks.append("protocol_negotiation_and_tool_discovery")
            print(f"Negotiated {initialized.protocolVersion}; discovered {len(tools.tools)} tools.")

            async def call(name, arguments):
                result = await session.call_tool(name, arguments)
                require(not result.isError, f"MCP tool {name} failed.")
                require(isinstance(result.structuredContent, dict), f"MCP tool {name} returned no structured object.")
                return result.structuredContent

            text = "SYNTHETIC ULTRASOUND: Gallbladder contains a 12 mm calculus. No renal calculus or hydronephrosis in either kidney."
            created = await call("create_report", {"text": text, "filename": "synthetic-review.txt"})
            key = created["session_key"]
            try:
                report = await call("get_report", {"session_key": key})
                require(report["filename"] == "synthetic-review.txt", "Selected report identity was not preserved.")
                require(bool(report["findings"]), "Synthetic report returned no findings.")
                require(all(item["quote"] in text for item in report["evidence"]), "Report evidence does not match source text.")
                await call("focus_anatomy", {"session_key": key, "finding_id": report["findings"][0]["finding_id"]})
                answer = await call("ask_report", {"session_key": key, "question": "Show me the gallbladder"})
                require(bool(answer["answer"]), "Report question returned an empty answer.")
                state = await call("get_viewer_state", {"session_key": key})
                require("gallbladder" in [term.lower() for term in state["anatomy_terms"]], "Anatomy request was not retained.")
                questions = await call("prepare_questions", {"session_key": key})
                require(bool(questions["questions"]), "No clinician discussion prompts were returned.")
                require(all(item["quote"] in text for item in questions["questions"]), "Discussion prompts lost report evidence.")
                checks.append("report_evidence_answers_anatomy_and_doctor_prompts")
                print("Report creation, grounded answer, and anatomy request passed.")
                invitation = await call("create_pairing", {"session_key": key})
                paired = await call("join_pairing", {"pairing_code": invitation["pairing_code"]})
                peer = paired["session_key"]
                require(peer != key, "Owner and companion capabilities must be distinct.")
                reused = await session.call_tool("join_pairing", {"pairing_code": invitation["pairing_code"]})
                require(reused.isError, "Pairing invitation was incorrectly reusable.")
                await call("ask_report", {"session_key": peer, "question": "Show me the gallbladder"})
                peer_state = await call("get_viewer_state", {"session_key": key})
                require(peer_state["companions"] == 1 and peer_state["revision"] > state["revision"], "Paired navigation state was not shared.")
                await call("disconnect", {"session_key": key, "mode": "revoke_companions"})
                revoked = await session.call_tool("get_report", {"session_key": peer})
                require(revoked.isError, "Revoked companion retained report access.")
                await call("get_report", {"session_key": key})
                checks.append("single_use_pairing_shared_navigation_and_revocation")
                print("Companion pairing, shared navigation, and access revocation passed.")
            finally:
                await call("disconnect", {"session_key": key})
                print("Synthetic session deleted.")
            deleted = await session.call_tool("get_report", {"session_key": key})
            require(deleted.isError, "Deleted report session remained accessible.")
            checks.append("report_deletion")
            if args.output:
                args.output.parent.mkdir(parents=True, exist_ok=True)
                args.output.write_text(json.dumps({"passed": True, "protocol_version": initialized.protocolVersion,
                    "transport": "Streamable HTTP", "tool_names": tool_names, "checks": checks}, indent=2) + "\n", encoding="utf-8")
                print(f"Sanitized verification report: {args.output}")


if __name__ == "__main__":
    asyncio.run(main())
