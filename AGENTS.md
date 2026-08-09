# 🤖 AGENTS.md — AI Agent Installation & Operational Guide

Instructions for AI agents (Antigravity, Cursor, OpenCode Agent, etc.) on how to install and manage **`opencode-context-compressor`**.

---

## Architecture Overview

```
opencode-cc (OpenCode + proxy env vars)
         ↓
  MITM Proxy :3266 (0.0.0.0:3266, HTTP + HTTPS MITM)
         │
         ├── 1. $compressor / $context-compressor in-chat commands?
         │      → Intercepted FIRST (0ms, 0 LLM calls, 0 token cost)
         │
         ├── 2. Target is qwen-free-api (header X-Service: qwen-free-api)?
         │      → Transparent forward without double-compression
         │
         └── 3. Target is external LLM (Anthropic, OpenAI, DeepSeek, Gemini)?
                → Context compressed to active threshold (default 12k chars / configurable)
                → Unbuffered real-time SSE streaming (TCP_NODELAY + flushHeaders)
                → Output max_tokens guaranteed (prevents truncated responses)
```

---

## Installation (Single Command)

```bash
git clone https://github.com/angyedz/opencode-context-compressor.git
cd opencode-context-compressor
npm install
node bin/cli.js install
```

`node bin/cli.js install` automatically:
1. Generates local Root CA cert at `~/.context-compressor/ca/ca.crt`
2. Installs CA into system trust store (`update-ca-trust` / `update-ca-certificates`) and Chrome NSS
3. Registers `model-memo` MCP server in `~/.config/opencode/opencode.json`
4. Creates `opencode-cc` wrapper script at `~/.local/bin/opencode-cc`
5. Enables and starts `context-compressor.service` via `systemctl --user`

---

## Verification & Status

```bash
node bin/cli.js status
# Or test via HTTP:
curl -s http://127.0.0.1:3266/health
```

---

## Usage

Launch OpenCode via the wrapper:

```bash
opencode-cc
```

---

## In-Chat Commands (Intercepted at Proxy Level, 0 LLM Cost)

| Command | Action |
|---|---|
| `$compressor limit <N>` | Set session context threshold (e.g. `12k`, `32k`, `55000`). Default: `12000` chars (~3k tokens) |
| `$compressor status` | View compaction status, active limit, and memory stats |
| `$compressor off` / `on` | Disable or enable context compaction for current session |
| `$history` | Show timeline of stored checkpoints for current session |
| `$search <query>` | Search `model-memo` checkpoints |
| `$memo clear` | Clear checkpoints for current session |
| `$reset` | Reset session checkpoints |

---

## Manual Installation (Fallback Steps)

### 1. Start daemon to generate CA

```bash
node src/daemon.js &
```

### 2. Install Root CA into system trust store

**Arch Linux / CachyOS:**
```bash
sudo cp ~/.context-compressor/ca/ca.crt /etc/ca-certificates/trust-source/anchors/context-compressor-ca.crt
sudo trust extract-compat
```

**Ubuntu / Debian:**
```bash
sudo cp ~/.context-compressor/ca/ca.crt /usr/local/share/ca-certificates/context-compressor-ca.crt
sudo update-ca-certificates
```

**Fedora / RHEL:**
```bash
sudo cp ~/.context-compressor/ca/ca.crt /etc/pki/ca-trust/source/anchors/context-compressor-ca.crt
sudo update-ca-trust
```

### 3. Register MCP Server in `~/.config/opencode/opencode.json`

```json
{
  "mcp": {
    "model-memo": {
      "type": "local",
      "command": ["/usr/bin/node", "/absolute/path/to/opencode-context-compressor/src/mcp-server.js"],
      "enabled": true
    }
  }
}
```

### 4. Create Systemd User Service

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/context-compressor.service << EOF
[Unit]
Description=OpenCode Context Compressor MITM Proxy & ModelMemo MCP
After=network.target

[Service]
Type=simple
WorkingDirectory=/absolute/path/to/opencode-context-compressor
ExecStart=/usr/bin/node /absolute/path/to/opencode-context-compressor/src/daemon.js
Restart=always
RestartSec=3
Environment=NODE_ENV=production

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable context-compressor.service
systemctl --user start context-compressor.service
```

---

## Troubleshooting

```bash
# Check service logs
journalctl --user -u context-compressor.service -n 30 --no-pager

# Restart service
systemctl --user restart context-compressor.service

# Clean test memory store
rm -f ~/.model-memo/memo.json
```
