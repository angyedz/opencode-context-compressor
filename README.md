# opencode-context-compressor

Local bounded-context proxy for OpenCode with **session-only exact recall** and a **small durable profile memory**.

> v2 focuses on correctness: old history is compacted aggressively, current work stays intact, structured tool calls are preserved, and full chat history is not kept across sessions.

## What it does

```text
OpenCode
   │  HTTP(S)_PROXY
   ▼
127.0.0.1:3266
   │
   ├─ local $commands → answered without an LLM request
   ├─ active conversation → temporary exact recall store
   ├─ old history → bounded turn-aware compaction
   └─ provider request → OpenAI / Anthropic / Gemini
```

- Keeps historical conversation context inside a configurable character budget.
- Preserves the current user turn and provider system prompt instead of silently truncating the task being worked on.
- Compacts whole semantic turns so tool-call / tool-result chains are not split arbitrarily.
- Preserves structured OpenAI `tool_calls`, Anthropic `tool_use` / `tool_result`, and Gemini `functionCall` / `functionResponse` blocks.
- Stores exact current-session details temporarily so the model can recover compacted information with `memo_recall`.
- Does **not** retain full conversation history as long-term memory.
- Persists only short durable profile facts explicitly saved through `profile_remember` or `$remember`.

## Memory model

### 1. Active-session memory

The proxy rebuilds a temporary timeline from the request history. Multiple active conversations are isolated by session key. Temporary sessions are bounded, expire after inactivity, and are not durable cross-session profile memory. The temporary store lives under the OS temp directory and expires after inactivity.

This is what `memo_recall` searches when old turns were compacted.

### 2. Durable profile memory

Long-term memory is intentionally small and explicit. It is meant for facts such as:

- stable user preferences;
- workflow conventions;
- development environment facts;
- durable project decisions.

It is **not** intended for secrets, sensitive personal data, or complete chat transcripts. Facts are stored in `~/.context-compressor/profile.json` with restrictive file permissions.

## Context budget

`$compressor limit 16k` sets the budget for **historical conversation messages**. The current active turn and the provider's original system prompt are preserved separately.

This distinction is deliberate: a single huge current request cannot be truthfully forced below 16k without corrupting that request. The compressor therefore bounds old history while keeping the task currently being executed intact.

The implementation currently uses character-based budgeting. Token counts shown in status output are approximate (`chars / 4`), not tokenizer-exact.

## Compression strategy

1. Recent historical turns are kept intact when they fit.
2. Verbose terminal/tool output is trimmed while retaining the beginning and end.
3. Older code-heavy assistant output is skeletonized.
4. Older semantic turns are folded into a compact history message.
5. Exact details remain recoverable from temporary active-session memory.

## Security

- Proxy listener is bound to `127.0.0.1`, not the LAN.
- Upstream HTTPS certificates are verified normally.
- The generated CA private key is stored with mode `0600`.
- Installation does **not** modify the global OS CA trust store. `opencode-cc` starts the local proxy on demand and scopes its CA to the launched process.
- `opencode-cc` scopes trust to the launched OpenCode runtime with `NODE_EXTRA_CA_CERTS`.
- Local OpenCode traffic is bypassed with `NO_PROXY=localhost,127.0.0.1,::1`.
- Durable profile facts are injected as explicitly untrusted context data; they are not allowed to override higher-priority instructions.

Because this is an HTTPS MITM proxy, only use it on machines and accounts you control.

## Install

Requirements: Node.js 18+ and OpenCode. Linux, macOS, and Windows use the same on-demand launcher model.

```bash
git clone https://github.com/angyedz/opencode-context-compressor.git
cd opencode-context-compressor
npm install
node bin/cli.js install
```

Then launch:

```bash
opencode-cc
```

The launcher starts the MITM proxy only for the lifetime of OpenCode. On current OpenCode versions it automatically uses a private `--standalone` server for the TUI and `run`, so provider traffic actually inherits the proxy environment. It also merges `localhost,127.0.0.1,::1` into `NO_PROXY` to keep OpenCode's local client/server traffic out of the MITM loop.

If you explicitly pass `--server`, the provider request is made by that separate OpenCode server and cannot be guaranteed to pass through this local compressor; the launcher prints a warning.

Remove the MCP registration:

```bash
node bin/cli.js uninstall
```

The durable profile and local CA are intentionally left in place on uninstall so user data is not deleted unexpectedly.

## In-chat commands

| Command | Purpose |
|---|---|
| `$compressor status` | Show compaction and memory state |
| `$compressor limit 16k` | Set historical context budget |
| `$compressor off` / `on` | Disable/enable compaction for this session |
| `$history` | Show recent active-session timeline |
| `$search <query>` | Search exact active-session details |
| `$memo clear` | Clear temporary active-session memory |
| `$remember [category] <fact>` | Save one durable profile fact |
| `$profile` | Show durable profile facts |
| `$forget <query>` | Delete matching durable profile facts |
| `$reset` | Reset temporary session state but keep durable profile |

## MCP tools

- `memo_recall` — exact recall from the active conversation only.
- `memo_save` — temporary active-session note.
- `memo_stats` — temporary-memory statistics.
- `profile_remember` — explicitly persist one durable fact.
- `profile_recall` — read durable profile facts.
- `profile_forget` — delete durable profile facts.

## Provider support

- OpenAI-compatible `/chat/completions`
- Anthropic `/v1/messages`
- Gemini `generateContent` / `streamGenerateContent`

Unknown formats are forwarded without mutation.

## Tests

```bash
npm test
```

GitHub Actions runs syntax checks and the test suite on Node.js 18, 20, and 22.

Regression tests cover:

- bounded historical context;
- exact preservation of the active turn;
- OpenAI tool-call pairing;
- Anthropic structured blocks;
- Gemini structured parts;
- concurrent session isolation;
- durable-profile isolation;
- local command interception;
- proxy / CA security invariants.

## Русский

`opencode-context-compressor` v2 сжимает **старую историю**, но не режет текущий запрос пользователя и системный промпт. Точные детали вырезанной истории остаются только во временной памяти активной сессии и могут быть возвращены через `memo_recall`.

Полная переписка между сессиями больше не сохраняется. Между сессиями остаётся только маленький профиль из явно сохранённых устойчивых фактов: предпочтения пользователя, правила рабочего процесса, окружение и важные решения проекта.

Лимит `$compressor limit 16k` относится именно к исторической части контекста. Это честнее и безопаснее, чем обещать жёсткий лимит всего запроса и незаметно обрезать текущую задачу.

Прокси слушает только `127.0.0.1`, проверяет TLS-сертификаты настоящего провайдера и по умолчанию не добавляет свой CA в системное хранилище доверия.

## License

MIT
