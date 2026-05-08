# pi-llama-swap

[Pi Coding Agent](https://pi.dev/) extension for [llama-swap](https://github.com/mostlygeek/llama-swap) integration.

## Features

- Model browser with type-ahead search, arrow navigation, pagination
- Running state indicators (🟢 ready / 🟡 loading / 🔴 error / ⚫ not loaded)
- Models cached locally with stale-while-revalidate (5-minute freshness)
- Variant grouping (`:precise`, `:q4_0`, `:f16` under base model)
- Per-model config: display name, context window, max tokens, image capability, reasoning
- Image capability detection: launch command (`--mmproj`, `--no-mmproj`, etc.) takes precedence, falls back to model ID patterns (`mmproj`, `mm-proj`, `multimodal`, `vision`, `clip`)
- Context window autodiscovery from llama-swap metadata (`context_length`, `n_ctx`)
- Upstream metadata via `/upstream/:model_id` proxy (only fetches when model is running, never triggers swap)

## Installation

```bash
pi install https://github.com/y-almannaee/pi-llama-swap
```

## Usage

### Command

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `/swap:models`  | Browse and configure models          |

### Model Browser

Type to filter. Arrow keys to navigate. Enter to select. Running models are color-coded green.

Action menu:
- **Configure** — edit per-model settings
- **Info** — view model details
- **Cancel** — exit

### Per-model Configuration

- Display name
- Context window
- Max output tokens
- Image capability (auto-detected from launch command, then model ID)
- Reasoning (extended thinking)

Changes save automatically. **Reset to defaults** removes an override.

## Configuration

### Server URL

Priority order:

1. `.pi/llama-swap.json` — `{"url": "http://127.0.0.1:8080"}`
2. `LLAMA_SWAP_URL` environment variable
3. `~/.pi/agent/settings.json` — `{"llamaSwapUrl": "..."}`
4. Default: `http://127.0.0.1:8080`

### API Key (optional)

`~/.pi/agent/auth.json`:

```json
{
  "llama-swap": {
    "key": "your-api-key"
  }
}
```

### Per-model overrides

Saved to `~/.pi/agent/extensions/pi-llama-swap/config.json`:

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

### Upstream metadata

Extension calls `/upstream/:model_id/v1/models` to fetch backend metadata (`n_ctx_train`, `n_params`, `max_model_len`, etc.). This only runs when the model is already loaded (verified via `/running`), so it never triggers an unwanted model swap. Non-running models skip the upstream fetch silently.

Supports arbitrary backend shapes (ik_llama.cpp, vLLM, etc.) — all numeric fields from the upstream `meta` block are captured defensively.

## Defaults

- `maxTokens`: `32000`
- `reasoning`: `true`
- `cost`: all zero (local)
- `contextWindow`: `128000`

## Architecture

```
src/
├── constants.ts           # Provider ID, URLs, defaults
├── index.ts               # Main extension entry point
├── config.ts              # Persistent config management
├── events.ts              # model_select event handler
├── handlers.ts            # /swap:models command handler
├── enums/
│   └── action.ts          # Action definitions
├── interfaces/
│   ├── auth.ts            # Auth file structure
│   ├── events.ts          # Event types
│   └── endpoints/
│       └── models.ts      # /v1/models, /running, upstream response shapes
├── models/
│   └── swapModel.ts       # SwapModel class
└── tools/
    ├── cache.ts           # Model cache, running state, upstream metadata merge
    ├── resolver.ts        # URL and API key resolution
    └── retriever.ts       # RPC, model listing, running state, upstream proxy
```

## Development

```bash
npm test          # Watch mode
npm run test:run  # Run once
```

## Dependencies

| Dependency                      | Purpose                               |
| ------------------------------- | ------------------------------------- |
| `@mariozechner/pi-coding-agent` | Pi Coding Agent SDK (peer dependency) |
| `@mariozechner/pi-tui`          | TUI primitives (peer dependency)      |

```
