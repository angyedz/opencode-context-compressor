# ⚡ opencode-context-compressor

<div align="center">

### **Transparent MITM Proxy for OpenCode — Realistic Token Compression & Cost Reduction**

[English](#english) | [Русский](#русский)

---

</div>

<a name="english"></a>
## 🇬🇧 English

### 🚀 Manage Exploding Context Windows in OpenCode

During extended coding sessions in OpenCode, context sizes naturally grow as previous tool outputs, git diffs, and build logs accumulate.

**opencode-context-compressor** is a local MITM proxy running between OpenCode and your chosen LLM provider (GPT-5.6 Sol/Terra, Claude Opus 5/Fable 5, Moonshot Kimi K3, DeepSeek V4). It intelligently prunes redundant terminal output, compresses historical turns, and bounds context according to your configured limit (`12k`, `32k`, `55k` chars).

---

### 📊 Realistic Token & Cost Savings Estimates

Here is a realistic breakdown of token usage based on typical OpenCode coding tasks:

| Session Depth | Avg. Context without Proxy | Avg. Context with Proxy | Real Token Reduction | Est. Savings (GPT-5.6 Sol / Claude Opus 5) |
|---|---|---|---|---|
| **Short (1–5 turns)** | ~6,000 tokens | ~4,200 tokens | **~25% – 30%** | ~$0.30 – $0.80 / session |
| **Medium (10–15 turns)** | ~28,000 tokens | ~9,500 tokens | **~60% – 65%** | ~$1.50 – $3.20 / session |
| **Long (25+ turns + logs)** | ~85,000 tokens | **~18,000 tokens** *(at 32k limit)* | **~75% – 80%** | **~$4.50 – $11.00 / day** |

> 💡 **Key Benefit**: Keeps long agentic sessions within predictable token bounds and prevents rate-limit (TPM/RPM) crashes.

---

### 🔥 Features

- **⚡ Zero-Cost In-Chat Commands**: Commands like `$compressor status`, `$compressor limit 32k`, `$compressor off/on` are answered directly by the proxy in **0ms with 0 LLM API calls**.
- **🎛️ Configurable Context Limit**: Set your session threshold dynamically (`$compressor limit 12k`, `$compressor limit 32k`, `$compressor limit 55k`).
- **🌊 Unbuffered Real-Time Streaming**: Socket `TCP_NODELAY` + header flushing for smooth word-by-word SSE streaming.
- **🛡️ Truncation Protection**: Enforces adequate `max_tokens` headers to prevent output cutting off mid-response.
- **🧠 Persistent Memory (`model-memo` MCP)**: Allows the model to recall pruned tool outputs from earlier in the session when needed.
- **🎯 Local Provider Detection**: Fingerprints local endpoints like `qwen-free-api` (via `X-Service: qwen-free-api`) to bypass double compression.

---

### 🏗 Architecture

```
opencode-cc (OpenCode + proxy env vars)
         ↓
  MITM Proxy :3266 (0.0.0.0:3266, HTTP + HTTPS MITM)
         │
         ├── 1. In-chat $compressor command?
         │      → Answered locally in 0ms (0 LLM cost)
         │
         ├── 2. Target is local qwen-free-api (X-Service header)?
         │      → Transparent passthrough
         │
         └── 3. Target is external LLM (GPT-5.6, Claude Opus 5, Kimi K3)?
                → Prune terminal logs & apply aging up to active limit
                → Unbuffered real-time SSE streaming (TCP_NODELAY)
                → Forward to upstream provider
```

---

### ⚡ Quick Installation

```bash
git clone https://github.com/angyedz/opencode-context-compressor.git
cd opencode-context-compressor
npm install
node bin/cli.js install
```

Launch OpenCode:
```bash
opencode-cc
```

---
---

<a name="русский"></a>
## 🇷🇺 Русский

### 🚀 Контроль расхода контекста в OpenCode

В процессе длительной разработки в OpenCode объем контекста неизбежно растет из-за накапливающихся выводов консоли, `git diff` и сборок.

**opencode-context-compressor** — это локальный MITM прокси-сервер между OpenCode и провайдерами нейросетей (GPT-5.6 Sol/Terra, Claude Opus 5/Fable 5, Moonshot Kimi K3, DeepSeek V4). Он аккуратно сжимает устаревшие логи, удаляет лишний шум и удерживает контекст в пределах заданного лимита (`12k`, `32k`, `55k` символов).

---

### 📊 Реалистичная статистика экономии токенов

Реальные показатели расхода токенов при обычных задачах разработки:

| Глубина сессии | Средний контекст без прокси | Средний контекст с прокси | Реальное сжатие | Экономия на API (GPT-5.6 Sol / Claude Opus 5) |
|---|---|---|---|---|
| **Короткая (1–5 шагов)** | ~6 000 токенов | ~4 200 токенов | **~25% – 30%** | ~$0.30 – $0.80 за сессию |
| **Средняя (10–15 шагов)** | ~28 000 токенов | ~9 500 токенов | **~60% – 65%** | ~$1.50 – $3.20 за сессию |
| **Длинная (25+ шагов + логи)** | ~85 000 токенов | **~18 000 токенов** *(лимит 32k)* | **~75% – 80%** | **~$4.50 – $11.00 в день** |

> 💡 **Главный плюс**: Сессии перестают бесконечно раздуваться, предотвращая ошибки превышения лимитов токенов (TPM) и контекстного окна.

---

### 🔥 Возможности

- **⚡ Бесплатные инчат-команды**: Команды `$compressor status`, `$compressor limit 32k`, `$compressor off/on` обработаются локально за **0мс и 0 токенов**.
- **🎛️ Гибкая настройка порога**: Изменение лимита контекста прямо в чате (`$compressor limit 12k`, `$compressor limit 32k`, `$compressor limit 55k`).
- **🌊 Плавный стриминг**: Сокеты в режиме `TCP_NODELAY` отдают токены без задержек.
- **🛡️ Защита от обрыва ответа**: Гарантия выставления корректных `max_tokens` заголовков.
- **🧠 Память хронологии (`model-memo` MCP)**: Позволяет модели при необходимости точечно запрашивать вырезанные логи прошлых шагов.
- **🎯 Детект локальных сервисов**: Автоматически распознает `qwen-free-api` (заголовок `X-Service: qwen-free-api`) и не сжимает их повторно.

---

### ⚡ Быстрая установка

```bash
git clone https://github.com/angyedz/opencode-context-compressor.git
cd opencode-context-compressor
npm install
node bin/cli.js install
```

Запуск OpenCode через прокси:
```bash
opencode-cc
```

---

### 💬 Инчат-команды

- `$compressor limit <N>` — Установить лимит контекста (например `12k`, `32k`, `55000`)
- `$compressor status` — Проверить статус сжатия
- `$compressor off` / `on` — Переключить компрессор
- `$history` — Посмотреть историю сохранённых чекпоинтов

---

## License

MIT © [angyedz](https://github.com/angyedz)
