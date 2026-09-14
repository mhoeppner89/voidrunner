# Blender MCP — configured and verified

Verified 2026-09-12 against Blender 5.2.0 LTS.

- Official source: `/Users/mhoeppner/.local/share/blender-mcp/source`, cloned from https://projects.blender.org/lab/blender_mcp.git.
- Server executable: `/Users/mhoeppner/.local/share/blender-mcp/venv/bin/blender-mcp` (package 1.0.2).
- Codex local MCP configuration: `[mcp_servers.blender-lab]` in `/Users/mhoeppner/.codex/config.toml` points to that executable. Corrected the old tunnel configuration path too. Configuration backups have `.before-blender-repair` suffix.
- Official extension: `bl_ext.user_default.mcp`, installed in Blender 5.2 user extensions.
- User explicitly approved Blender online access and automatic bridge startup. Both settings are saved.
- Bridge verified listening on **127.0.0.1:9876 only**. Blender must be running; the add-on starts its bridge automatically.
- MCP stdio initialization and tool listing passed (26 tools).
- End-to-end `execute_blender_code` passed: queried scene/version, created a temporary triangle mesh/object, then removed both; original object count restored (3). No project model was changed.

## Connection distinction

The local `blender-lab` MCP server works. The old app connector tools named `mcp__codex_apps__blender_mcp_*` previously failed through an expired/unavailable cloud tunnel (404); that remote tunnel was not restored. Start a fresh Codex session/reload MCP connections to discover the repaired local server. In the current session, the official Python MCP SDK can access the local stdio server directly (verified); do not treat the stale connector's 404 as a Blender failure.

For direct MCP SDK use, the virtual environment includes `mcp.ClientSession`, `mcp.StdioServerParameters`, and `mcp.client.stdio.stdio_client`. Initialize a session using the server executable above, then call `execute_blender_code` with `{'code': ...}`. Blender Python should assign a JSON-serializable `result` dictionary.

Turret work remains parked in NEXT-STEPS.md until the user resumes it.
