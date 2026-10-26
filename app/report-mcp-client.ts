/** Browser MCP client for the server's JSON mode of Streamable HTTP. */
export const MCP_VERSION = "2025-11-25";
export interface McpActivity { method: string; status: string; at: string }

export class ReportMcpClient {
  private id = 0;
  private ready: Promise<void> | null = null;
  constructor(private activity: (entry: McpActivity) => void = () => {}) {}

  private async request(method: string, params: unknown, notification = false, quiet = false): Promise<unknown> {
    const response = await fetch("/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream",
        "MCP-Protocol-Version": MCP_VERSION },
      body: JSON.stringify({ jsonrpc: "2.0", ...(notification ? {} : { id: ++this.id }), method, params }),
      signal: AbortSignal.timeout(60000),
    });
    const at = new Date().toLocaleTimeString();
    if (!response.ok) {
      this.activity({ method, status: `HTTP ${response.status}`, at });
      throw new Error(`MCP unavailable (${response.status}). Start the Python backend; see the README.`);
    }
    if (notification) {
      this.activity({ method, status: "accepted", at });
      return;
    }
    const payload = await response.json();
    if (payload.error) {
      this.activity({ method, status: "protocol error", at });
      throw new Error(payload.error.message);
    }
    if (payload.result?.isError) {
      this.activity({ method, status: "tool error", at });
      throw new Error(payload.result.content?.find((c: { type: string }) => c.type === "text")?.text || "MCP tool failed.");
    }
    if (!quiet) this.activity({ method, status: "OK", at });
    return payload.result;
  }

  connect(): Promise<void> {
    if (!this.ready) this.ready = (async () => {
      const initialized = await this.request("initialize", { protocolVersion: MCP_VERSION,
        capabilities: {}, clientInfo: { name: "repanatomy-web-simulator", version: "1.0.0" } }) as { protocolVersion: string };
      if (initialized.protocolVersion !== MCP_VERSION) throw new Error("Server did not negotiate MCP 2025-11-25.");
      await this.request("notifications/initialized", {}, true);
      await this.request("tools/list", {});
    })().catch(error => { this.ready = null; throw error; });
    return this.ready;
  }

  async call<T>(name: string, args: Record<string, unknown>): Promise<T> {
    await this.connect();
    const result = await this.request("tools/call", { name, arguments: args }, false, name === "get_viewer_state") as {
      structuredContent?: T; content: { type: string; text?: string }[];
    };
    // Log tool names, never report text, questions, pairing codes, or capability keys.
    if (name !== "get_viewer_state") this.activity({ method: name, status: "completed", at: new Date().toLocaleTimeString() });
    if (result.structuredContent) return result.structuredContent;
    const text = result.content.find(c => c.type === "text")?.text;
    if (!text) throw new Error("MCP tool returned no data.");
    return JSON.parse(text) as T;
  }
}
