"""Serve the built web app and existing MCP endpoint on one origin."""
from pathlib import Path
from starlette.staticfiles import StaticFiles


class WebAndMcp:
    def __init__(self, mcp_app):
        self.mcp = mcp_app
        self.static = StaticFiles(directory=Path(__file__).resolve().parents[1] / "dist", html=True)

    async def __call__(self, scope, receive, send):
        if scope.get("path", "").rstrip("/") == "/mcp":
            return await self.mcp(scope, receive, send)
        return await self.static(scope, receive, send)


class HealthProbe:
    """ALB probes use a container IP Host header, without access to application data."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] == "http" and scope["path"] == "/healthz" and scope["method"] == "GET":
            await send({"type": "http.response.start", "status": 200, "headers": [(b"content-type", b"application/json")]})
            return await send({"type": "http.response.body", "body": b'{"status":"ok"}'})
        return await self.app(scope, receive, send)
