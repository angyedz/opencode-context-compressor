# AGENTS.md — opencode-context-compressor v2

Operational notes for coding agents working on this repository.

## Architecture

- `src/proxy.js` — loopback MITM proxy on `127.0.0.1:3266`.
- `src/compressor.js` — turn-aware bounded historical context.
- `src/memo-store.js` — temporary active-session exact recall; not long-term conversation memory.
- `src/profile-store.js` — small durable profile facts only.
- `src/mcp-server.js` — MCP tools for session recall and durable profile memory.
- `src/formats/*` — provider adapters; structured tool/function blocks must round-trip without flattening.

## Non-negotiable invariants

1. Never disable upstream TLS verification.
2. Never bind the proxy to a non-loopback interface by default.
3. Never persist full chat history as durable memory.
4. Never split a live tool-call/tool-result chain during compaction.
5. Never flatten Anthropic/Gemini structured blocks into plain text.
6. The historical context budget must be enforced without truncating the current user turn.
7. Durable profile memory must remain explicit and small.

## Memory behavior

`memo_recall` searches only the currently active conversation. Starting/switching conversations replaces the temporary timeline.

`profile_remember` is for stable preferences, workflow conventions, environment facts, and durable project decisions. Do not store secrets, sensitive personal data, or transient chatter.

## Commands

- `$compressor status`
- `$compressor limit 16k`
- `$compressor off` / `$compressor on`
- `$history`
- `$search <query>`
- `$memo clear`
- `$remember [category] <fact>`
- `$profile`
- `$forget <query>`
- `$reset`

## Development

Run:

```bash
npm install
npm test
find src bin test -name '*.js' -print0 | xargs -0 -n1 node --check
```

CI runs the same checks on Node.js 18, 20, and 22.

## Installation

```bash
node bin/cli.js install
```

The installer generates a local CA, registers MCP, creates the wrapper and systemd user service, but does not modify the global system CA trust store by default.

## Updating

`$compressor update` performs a fetch + fast-forward-only merge from `origin/master`, refreshes dependencies, and restarts the service.
