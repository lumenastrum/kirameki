# Kirameki ✨

Real-time visualization of Claude Code and Codex agent orchestration — in gyaru pink and gold. Watch your agents think, branch, and coordinate as they work, glittering across a dark canvas.

Kirameki (煌めき, "sparkle") is a hard fork of [Agent Flow](https://github.com/patoles/agent-flow) by Simon Patole (Apache 2.0 — see [NOTICE](NOTICE)), rebranded, re-themed, and with telemetry removed entirely. It phones home to nobody.

## Features

- **Live agent visualization**: agent execution as an interactive node graph with real-time tool calls, branching, and return flows
- **Claude Code + Codex**: auto-detects sessions from both runtimes concurrently; restrict with `KIRAMEKI_RUNTIME=claude|codex`
- **Claude Code hooks**: lightweight local hook forwarder streams events with zero latency
- **Multi-session support**: track concurrent agent sessions with tabs
- **Interactive canvas**: pan, zoom, click agents and tool calls to inspect details
- **Timeline & transcript panels**: full execution timeline, file attention heatmap, and message transcript
- **No telemetry**: stripped at the source — no usage pings, no `~/.agent-flow` state, nothing

## Getting Started

```bash
pnpm i              # install dependencies for all packages
pnpm run setup      # configure Claude Code hooks (one-time)
pnpm run dev        # start the web app + event relay
```

Open http://localhost:3333 and start a Claude Code session in another terminal — events stream in live.

On Windows, run `Launch Kirameki.bat` from the repo root. It starts Kirameki on http://localhost:3333 and watches the parent workspace by default.

If Kirameki is checked out somewhere other than the project you are coding in, pass the target workspace explicitly:

```bash
pnpm run dev -- --workspace "C:\path\to\your\project"
```

Override the web port with `--web-port <number>` or `KIRAMEKI_WEB_PORT`.

## Runtime selection

By default Kirameki watches both Claude Code (`~/.claude/projects/`) and Codex (`~/.codex/sessions/`, respects `CODEX_HOME`). If you only use one, the other is a harmless no-op. Set `KIRAMEKI_RUNTIME` to `claude` or `codex` to restrict.

## How events flow

1. `pnpm run setup` installs a hook forwarder at `~/.claude/kirameki/hook.js` and registers it for nine Claude Code hook events in `~/.claude/settings.json`
2. The relay writes a discovery file to `~/.claude/kirameki/` with its port; the forwarder reads it at invocation time and POSTs events over localhost
3. The relay also tails session transcript JSONL files directly, so past context is replayed when you connect mid-session
4. The browser receives everything over SSE at `/events`

## Scripts

| Script | Description |
|--------|-------------|
| `pnpm run dev` | Start dev server + event relay |
| `pnpm run dev:demo` | Start with demo/mock data |
| `pnpm run dev:relay` | Run the event relay server standalone |
| `pnpm run build:app` | Build the standalone app bundle |
| `pnpm run test` | Run the test suites |

## Requirements

- [Node.js](https://nodejs.org/) 20+ (LTS recommended)
- [pnpm](https://pnpm.io/)
- Claude Code CLI

## License

Apache 2.0 — see [LICENSE](LICENSE). Forked from Agent Flow by Simon Patole; see [NOTICE](NOTICE) for attribution. "Agent Flow" and its logos are trademarks of Simon Patole and are not used here.

---

*Painted pink and gold by Clio.* 💅
