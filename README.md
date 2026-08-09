# opencode-context-compressor

> **Transparent MITM proxy for OpenCode** — intercepts all AI provider requests, compresses context to ≤12k chars, and handles `$context-compressor` commands locally without ever touching the LLM.

---

## How it works

```
opencode-cc (OpenCode + proxy env vars)
         ↓
  MITM Proxy :3266  (HTTP + HTTPS with CA cert)
         │
         ├── $context-compressor command?
         │     → compressor answers instantly (0 LLM calls, 0ms latency)
         │
         ├── Request to localhost (127.0.0.1)?
         │     → transparent forward, no compression
         │     (local proxies like qwen-free-api manage their own context)
         │
         └── Request to external provider?
               → RTK + Skeletonizer + Aging compression (~3k–4k tokens)
               → forward to real provider with original headers, auth, URL
               → pipe response back unchanged (token counts, streaming, everything)
```

**Supports:** OpenAI, Anthropic, Gemini formats + streaming (SSE)

**Also includes:** `model-memo` MCP server — persistent timeline memory for the AI agent (`memo_recall`, `memo_save`, `memo_stats`)

---

## Installation

```bash
git clone https://github.com/YOUR_USERNAME/opencode-context-compressor
cd opencode-context-compressor
npm install
node bin/cli.js install
```

`install` automatically:
1. Generates a local root CA certificate (`~/.context-compressor/ca/ca.crt`)
2. Installs CA into system trust store + Chrome NSS
3. Registers `model-memo` MCP server in `~/.config/opencode/opencode.json`
4. Creates `opencode-cc` wrapper script (`~/.local/bin/opencode-cc`)
5. Installs and starts `context-compressor.service` systemd user service

---

## Usage

```bash
# Launch OpenCode through the MITM proxy
opencode-cc

# Or manually
HTTP_PROXY=http://127.0.0.1:3266 \
HTTPS_PROXY=http://127.0.0.1:3266 \
NODE_EXTRA_CA_CERTS=~/.context-compressor/ca/ca.crt \
opencode
```

### In-chat commands

Type these directly in OpenCode chat — the proxy intercepts them instantly, **no LLM call is made**:

| Command | Description |
|---|---|
| `$context-compressor status` | View compressor status and session info |
| `$context-compressor on` | Enable context compression (default) |
| `$context-compressor off` | Disable context compression for this session |
| `$context-compressor help` | Show all commands |

---

## Context compression algorithms

1. **RTK (Terminal Output Compressor)** — strips verbose git diffs, build logs, test output, npm noise
2. **Code Skeletonizer** — collapses long code blocks into function signatures + ellipsis
3. **Semantic Noise Trimmer** — removes filler phrases and redundant LLM preamble
4. **Hierarchical History Aging** — older turns get progressively compressed (hot/warm/cold zones)
5. **Strict bounding** — hard cap at 12,000 chars (~3k–4k tokens) of history

---

## MCP Tools (model-memo)

The `model-memo` MCP server gives the AI agent persistent memory across sessions:

| Tool | Description |
|---|---|
| `memo_recall(query)` | Search past checkpoints: `"recent"`, `"step #3"`, `"10m"`, or any keyword |
| `memo_save(note, category)` | Save a key fact or decision |
| `memo_stats()` | View memory store statistics |

Storage: `~/.model-memo/memo.json`

---

## CLI commands

```bash
node bin/cli.js install    # Full install (CA, systemd, wrapper, MCP)
node bin/cli.js status     # Check proxy, CA, memory stats, systemd status
node bin/cli.js uninstall  # Remove service and wrapper script
```

---

## Format support

| Provider | Format | URL pattern |
|---|---|---|
| OpenAI, DeepSeek, Qwen, most local | OpenAI | `/v1/chat/completions` |
| Anthropic, Claude | Anthropic | `/v1/messages` |
| Google Gemini | Gemini | `:generateContent`, `:streamGenerateContent` |

Local providers (`127.0.0.1`) are **forwarded without compression** — they manage their own context.

---

## Requirements

- Node.js ≥ 18
- Linux (systemd user services)
- OpenCode

---

## License

MIT
