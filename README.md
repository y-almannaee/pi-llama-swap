# pi-llama-swap

A [Pi Coding Agent](https://pi.dev/) extension for [llama-swap](https://github.com/mostlygeek/llama-swap) integration.

## Features

- Model browser with type-ahead search, arrow navigation, pagination
- Models cached locally; offline fallback if server unreachable
- Variant grouping (`:precise`, `:q4_0`, `:f16` under base model)
- Per-model config: display name, context window, max tokens, image capability, reasoning
- Image capability auto-detection (`mmproj`, `mm-proj`, `multimodal`, `vision`, `clip`)
- Metadata autodiscovery from llama-swap model definitions
- Upstream metadata merge (vLLM, ik_llama.cpp)

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

Type to filter. Arrow keys to navigate. Enter to select.

Action menu:
- **Configure** — edit per-model settings
- **Info** — view model details
- **Cancel** — exit

### Per-model Configuration

- Display name
- Context window
- Max output tokens
- Image capability (auto-detected from model ID)
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

### Metadata autodiscovery

Add to llama-swap model definition:

```yaml
metadata:
  context_length: ${context-length}
  n_ctx: ${context-length}
  upstream_port: "${PORT}"
```

`upstream_port` must match the upstream server port. Other fields are context length macros.

### Upstream metadata merge

Auto-discovers `n_ctx_train`, `n_params`, file size, `max_model_len` from vLLM or ik_llama.cpp.

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
│       ├── health.ts      # /health endpoint shape
│       └── models.ts      # /v1/models response shapes
├── models/
│   └── swapModel.ts       # SwapModel class
└── tools/
    ├── cache.ts           # Model cache
    ├── resolver.ts        # URL and API key resolution
    └── retriever.ts       # Health check, RPC, model listing, validation
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
