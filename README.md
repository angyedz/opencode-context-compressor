# opencode-context-compressor

Keep long OpenCode sessions small without making them feel forgetful.

`opencode-context-compressor` compacts old conversation history before it reaches the model. The current request, recent work, tool protocol messages, and useful implementation details stay available; stale logs and repetitive history are reduced to a bounded working context.

> **Status:** v2 is under active testing. Compression ratios are measured by tests/benchmarks; this README intentionally does not promise a fixed "Nx cheaper" number.

## Why

Coding agents accumulate expensive context quickly:

- terminal output and test logs
- repeated file contents and diffs
- tool calls/results
- old reasoning and completed subtasks
- generated code that has already been applied

Sending all of that again on every request costs tokens and eventually makes the prompt noisy. Simply truncating it is worse: the model forgets decisions and breaks work it already did.

This project takes a different approach:

1. **Keep the active edge lossless.** The current user request and recent tool interactions are preserved.
2. **Compact cold history.** Older turns become small summaries.
3. **Keep implementation anchors.** Paths, function signatures, failures, TODOs, API/schema details, requirements, and decisions are preferentially retained.
4. **Recall details on demand.** Exact session details can be searched from temporary active-session checkpoints.
5. **Do not persist whole chats.** Active-session recall expires; only explicitly useful profile facts can be stored durably.

## Install

Requires Node.js 18+.

```bash
git clone https://github.com/angyedz/opencode-context-compressor.git
cd opencode-context-compressor
npm install
node bin/cli.js install
```

Then launch OpenCode through the installed integration:

```bash
opencode-cc
```

## Use it

The default historical budget is **16,000 characters**. You normally do not need to manage the compressor while coding.

Useful chat commands:

```text
$compressor status
$compressor limit 16k
$compressor off
$compressor on

$history
$search <query>
$memo clear

$remember preference <fact>
$profile
$forget <query>
$reset
```

Compressor commands are handled locally and do not need an LLM request.

### Choosing a budget

| Budget | Use |
| --- | --- |
| `8k` | aggressive; short/simple work |
| `16k` | default |
| `32k` | large multi-file work |
| `55k+` | conservative compression |

A smaller budget is not automatically better. If exact old code matters more than token cost, use a larger budget.

## What is preserved

The compressor treats protocol correctness as more important than compression ratio.

It preserves the current user turn and protects retained structured content such as tool calls/results and multimodal/provider blocks from lossy rewriting. Cold summaries additionally try to retain high-value coding anchors such as:

- `src/auth/session.js`
- `validateSession(token)`
- test/error messages
- TODO/FIXME items
- endpoint and schema names
- explicit requirements and decisions

The goal is not to make every old byte recoverable from the prompt. The goal is to keep the model's **working state** useful while moving old detail out of the expensive hot context.

## Memory model

There are two deliberately separate stores.

### Active-session recall

Detailed checkpoints are temporary. They live in the OS temporary directory, are scoped to the active session, have a TTL, and are not intended as cross-session memory.

Use:

```text
$history
$search authentication error
```

### Durable profile

Only small facts that are useful across sessions should live here: preferences, workflow conventions, environment facts, or project conventions.

```text
$remember preference Prefer concise answers
$remember project Tests must pass on Node 18+
$profile
```

The profile is stored separately with restrictive file permissions. Whole conversation history is not copied into it.

## Compatibility

The v2 compressor has explicit handling/tests for:

- OpenAI-style messages and tool calls
- Anthropic-style structured content/tool blocks
- Gemini-style structured function blocks
- OpenCode native message transformation
- proxy mode
- streaming/local command responses

Structured protocol blocks are kept lossless when retained instead of being flattened into prose.

## Testing

Run everything:

```bash
npm test
```

Syntax-check the same source set used by CI:

```bash
find src bin test -name '*.js' -print0 | xargs -0 -n1 node --check
```

CI runs the suite on Node.js 18, 20, and 22.

The regression suite covers, among other things:

- exact preservation of the current request
- bounded historical context
- aggressive reduction of stale tool-heavy logs
- session isolation
- command interception
- structured/multimodal protocol preservation
- semantic continuity after deep compaction

## Benchmarks

Do not treat a single compression ratio as a product guarantee. Savings depend heavily on the workload.

A session containing megabytes of repetitive terminal output can shrink dramatically. A short conversation containing mostly unique, relevant code should barely be compressed at all.

For that reason v2 uses two separate quality gates:

**Compression:** how much historical request payload is removed.

**Continuity:** whether information needed by later coding turns remains available.

A benchmark is only considered useful when both are measured. Projected numbers are not presented as measured results.

## Architecture

```text
OpenCode
   |
   v
command/session layer
   |
   +--> local commands
   +--> temporary session recall
   +--> small durable profile
   |
   v
context compressor
   |
   +--> preserve current/recent edge
   +--> preserve structured protocol blocks
   +--> compact cold turns
   +--> retain semantic coding anchors
   |
   v
provider request
```

Important modules:

- `src/compressor.js` — compaction policy and context budgeting
- `src/memo-store.js` — temporary active-session recall
- `src/profile-store.js` — small durable profile facts
- `src/commands.js` — local chat commands
- `src/plugin.js` — native OpenCode integration
- `src/formats/` — provider-specific request/response handling

## Design rules

1. Never sacrifice the current request for a compression target.
2. Never rewrite structured provider/tool protocol data just to save characters.
3. Prefer deleting noise over deleting decisions.
4. Keep full-session history temporary.
5. Do not claim quality or savings that a reproducible test did not measure.
6. CI must pass before v2 is considered releasable.

## Security and privacy

The compressor runs locally. Temporary session checkpoints and durable profile memory are separate. Profile files are written with restrictive permissions where the platform supports them.

As with any local proxy/plugin that processes model requests, review the code and deployment configuration before using it with sensitive repositories.

## License

MIT © angyedz
