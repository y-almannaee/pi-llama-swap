# pi-llama-swap

A [Pi Coding Agent](https://pi.dev/) extension that integrates with a running [llama-swap](https://github.com/mostlygeek/llama-swap) server to provide live model browsing, per-model configuration, and auto-registration.

## Features

- **Model browser** — type-ahead search, arrow key navigation, pagination (15 per page)
- **Stale-while-revalidate cache** — models fetched at startup and cached instantly; background refresh if data is stale (>5 min). Prevents empty screens on server timeouts.
- **Grouped variants** — colon-suffixed variants (`:precise`, `:q4_0`, `:f16`, `:general`) grouped under the base model
- **Per-model config overrides** — display name, context window, max tokens, image capability toggle, reasoning toggle
- **Auto-save** — every change saves instantly to `~/.pi/agent/extensions/pi-llama-swap/config.json`
- **Reset to defaults** — removes an override entirely; cached values fill the field
- **Image capability detection** — auto-detects multimodal models from model ID keywords: `mmproj`, `mm-proj`, `multimodal`, `vision`, `clip`
- **Reasoning toggle** — controls whether Pi sends extended thinking params to the API
- **Metadata autodiscovery** — reads `context_length`, `n_ctx`, `upstream_port` from llama-swap model definitions
- **Upstream metadata merge** — auto-discovers upstream model metadata (vLLM, ik_llama.cpp) for fields like `n_ctx_train`, `n_params`, file size, `max_model_len`
- **Provider registration** — registers with Pi as `pi-llama-swap` provider with all config overrides applied
- **Model selection events** — notifies when you switch models via Pi's model picker
- **Flexible URL resolution** — configures server URL via project config, environment variable, or global settings

## Installation

```bash
pi install https://github.com/y-almannaee/pi-llama-swap
```

## Usage

### Prerequisites

A running llama-swap server accessible from your machine.

### Command

| Command         | Description                                                  |
| --------------- | ------------------------------------------------------------ |
| `/swap:models`  | Browse models, search, and configure per-model settings      |

When the llama-swap server is unreachable, `/swap:models` is still available (shows `Llama Swap models (offline)`) and displays cached models if available.

### Model Browser

1. **Search** — type a query to filter models (leave empty to show all)
2. **Navigate** — use arrow keys to move, Enter to select
3. **Paginated list** — models appear 15 at a time with `← Previous` / `Next →` navigation. Variants grouped under base model.
4. **Action menu** — select a model to:
   - **Configure** — edit per-model settings
   - **Info** — view model details (ID, capabilities, context size)
   - **Cancel** — exit

### Per-model Configuration

The configuration editor lets you adjust:

- **Display name** — friendly name shown in model pickers
- **Context window** — max context tokens
- **Max output tokens** — max response length
- **Image capability** — toggle text-only vs multimodal (auto-detected from model ID)
- **Reasoning** — toggle extended thinking support

Changes save instantly. To revert a field to its default, use **Reset to defaults** — this removes the override from `config.json` and lets the cached value take over.

## Configuration

### Server URL

Resolved in priority order:

1. **Per-project config** — `.pi/llama-swap.json` in your project root:

   ```json
   {
     "url": "http://127.0.0.1:8080"
   }
   ```

2. **Environment variable** — `LLAMA_SWAP_URL`

3. **Global settings** — `~/.pi/agent/settings.json`:

   ```json
   {
     "llamaSwapUrl": "http://127.0.0.1:8080"
   }
   ```

4. **Default** — `http://127.0.0.1:8080`

### API Key (optional)

Store in `~/.pi/agent/auth.json`:

```json
{
  "llama-swap": {
    "key": "your-api-key"
  }
}
```

### Per-model overrides

Saved automatically by `/swap:models` to:

```
~/.pi/agent/extensions/pi-llama-swap/config.json
```

```json
{
  "models": {
    "Qwen3.6-35B-A3B-UD-IQ4_NL-mmproj:precise": {
      "displayName": "Qwen3.6-35B MM Coding",
      "contextWindow": 131072,
      "maxTokens": 17408,
      "hasImage": true,
      "reasoning": true
    }
  }
}
```

### Metadata autodiscovery

If your llama-swap model definition includes a `metadata` block, the extension reads it automatically:

```yaml
metadata:
  context_length: ${context-length}
  n_ctx: ${context-length}
  upstream_port: "${PORT}"
```

- `upstream_port` must be the exact port used by llama.cpp or the upstream server.
- Everything else is treated as a macro for context length.

### Upstream metadata merge

If the upstream server (vLLM, ik_llama.cpp) exposes model metadata, the extension merges it automatically. Fields discovered include `n_ctx_train`, `n_params`, file size, and `max_model_len`.

## Default Model Settings

Each model exposed to Pi includes these defaults:

- **`maxTokens`** — `32000`
- **`reasoning`** — `true` (assumed, as llama-swap does not expose it per model)
- **`cost`** — all zero (local model)
- **`contextWindow`** — `128000` (fallback when server does not expose it)

## Architecture

```
src/
├── constants.ts           # Provider ID, URLs, defaults
├── index.ts               # Main extension entry point
├── config.ts              # Persistent config management
├── events.ts              # model_select event handler
├── handlers.ts            # /swap:models command handler
├── enums/
│   ├── action.ts          # Action definitions
│   └── status.ts          # Model status enum
├── interfaces/
│   ├── auth.ts            # Auth file structure
│   ├── events.ts          # Event types
│   └── endpoints/
│       ├── health.ts      # /health endpoint shape
│       └── models.ts      # /v1/models response shapes
├── models/
│   └── swapModel.ts       # SwapModel class (OOP model wrapper)
└── tools/
    ├── resolver.ts        # URL and API key resolution
    └── retriever.ts       # Health check, RPC, model listing
```

## Development

```bash
# Run tests
npm test

# Run tests once
npm run test:run
```

## Dependencies

| Dependency                      | Purpose                               |
| ------------------------------- | ------------------------------------- |
| `@mariozechner/pi-coding-agent` | Pi Coding Agent SDK (peer dependency) |
