# 🤖 AGENTS.md — AI Agent Installation Instructions

Instructions for AI agents (Antigravity, Cursor, OpenCode Agent, etc.) on how to install **`opencode-context-compressor`** on any system.

---

## What this installs

- **MITM Proxy** on `http://127.0.0.1:3266` — intercepts all OpenCode HTTP/HTTPS requests
- **Root CA certificate** — enables HTTPS interception
- **`opencode-cc` wrapper** — launches OpenCode through the proxy
- **`model-memo` MCP server** — persistent timeline memory tools for the AI agent
- **Systemd user service** — keeps proxy running in background

---

## Installation (run these commands exactly)

### Step 1: Clone and install dependencies

```bash
cd /path/to/where/you/want/it
git clone https://github.com/YOUR_USERNAME/opencode-context-compressor
cd opencode-context-compressor
npm install
```

### Step 2: Run the automated installer

```bash
node bin/cli.js install
```

This single command does everything:
1. Generates root CA cert at `~/.context-compressor/ca/ca.crt`
2. Installs CA into system trust store (`update-ca-trust` / `update-ca-certificates`) and Chrome NSS
3. Registers `model-memo` MCP server in `~/.config/opencode/opencode.json`
4. Creates `opencode-cc` wrapper at `~/.local/bin/opencode-cc`
5. Creates and starts `context-compressor.service` systemd user service

### Step 3: Verify

```bash
node bin/cli.js status
# Should show:
# - Proxy: http://127.0.0.1:3266
# - CA Cert: ✅ exists
# - Systemd Service: 🟢 active
```

### Step 4: Use

```bash
opencode-cc   # instead of opencode
```

---

## Manual installation (if automated fails)

### 1. Generate CA and start proxy manually

```bash
node src/daemon.js &
# CA cert will be generated at: ~/.context-compressor/ca/ca.crt
```

### 2. Install CA into system trust

**Arch Linux:**
```bash
sudo cp ~/.context-compressor/ca/ca.crt /etc/ca-certificates/trust-source/anchors/context-compressor-ca.crt
sudo trust extract-compat
```

**Ubuntu/Debian:**
```bash
sudo cp ~/.context-compressor/ca/ca.crt /usr/local/share/ca-certificates/context-compressor-ca.crt
sudo update-ca-certificates
```

**Fedora/RHEL:**
```bash
sudo cp ~/.context-compressor/ca/ca.crt /etc/pki/ca-trust/source/anchors/context-compressor-ca.crt
sudo update-ca-trust
```

**Chrome/Chromium NSS (no sudo):**
```bash
certutil -A -n "context-compressor-ca" -t "CT,," \
  -i ~/.context-compressor/ca/ca.crt \
  -d "sql:$HOME/.pki/nssdb"
```

### 3. Register MCP server in `~/.config/opencode/opencode.json`

Add under `"mcp"` key:
```json
{
  "mcp": {
    "model-memo": {
      "type": "local",
      "command": ["node", "/path/to/opencode-context-compressor/src/mcp-server.js"],
      "enabled": true
    }
  }
}
```

### 4. Create systemd service

```bash
mkdir -p ~/.config/systemd/user
cat > ~/.config/systemd/user/context-compressor.service << EOF
[Unit]
Description=OpenCode Context Compressor MITM Proxy & ModelMemo MCP
After=network.target

[Service]
Type=simple
WorkingDirectory=/path/to/opencode-context-compressor
ExecStart=$(which node) /path/to/opencode-context-compressor/src/daemon.js
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

### 5. Create wrapper script

```bash
cat > ~/.local/bin/opencode-cc << EOF
#!/bin/bash
export HTTP_PROXY=http://127.0.0.1:3266
export HTTPS_PROXY=http://127.0.0.1:3266
export NODE_EXTRA_CA_CERTS="$HOME/.context-compressor/ca/ca.crt"
exec opencode "\$@"
EOF
chmod +x ~/.local/bin/opencode-cc
```

---

## In-chat commands

After installation, type in OpenCode chat (proxy intercepts — no LLM call is made):

- `$context-compressor status` — view status
- `$context-compressor on` / `off` — toggle compression
- `$context-compressor help` — list all commands

---

## Troubleshooting

```bash
# Check if proxy is running
curl http://127.0.0.1:3266/health

# Check service logs
journalctl --user -u context-compressor.service -n 30

# Restart service
systemctl --user restart context-compressor.service

# Full reinstall
node bin/cli.js uninstall && node bin/cli.js install
```
