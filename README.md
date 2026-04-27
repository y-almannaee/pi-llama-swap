# pi-llama-cpp

A [Pi Coding Agent](https://pi.dev/) extension that integrates with a running [llama.cpp server](https://github.com/ggml-org/llama.cpp) to provide live model browsing, loading, and switching directly from Pi.

## Features

- **Auto-detect models** — discovers all models available on your running llama.cpp server
- **Live status indicators** — see which models are loaded, loading, failed, or unloaded with color-coded icons
- **Load / unload / switch** — manage models directly from the Pi command palette
- **Multi-model router support** — works with both single-model and multi-model llama.cpp server configurations
- **Image model support** — detects multimodal models automatically
- **Flexible URL resolution** — configures the server URL via project config, environment variable, or global settings

## Installation

This package is a Pi extension. Install it with

```bash
pi install npm:pi-llama-cpp
```

or

```bash
pi install https://github.com/gsanhueza/pi-llama-cpp
```

## Configuration

The extension resolves the llama.cpp server URL using the following priority order:

1. **Per-project config** — `.pi/llama-server.json` in your project root:

   ```json
   {
     "url": "http://127.0.0.1:8080"
   }
   ```

2. **Environment variable** — `LLAMA_SERVER_URL`

3. **Global settings** — `~/.pi/agent/settings.json`:

   ```json
   {
     "llamaServerUrl": "http://127.0.0.1:8080"
   }
   ```

4. **Default** — `http://127.0.0.1:8080`

### API Key

If your llama.cpp server requires authentication, use `/login` in Pi, select the "API key" option, and choose the `llama-server` provider.

Alternatively, configure the API key in `~/.pi/agent/auth.json`:

```json
{
  "llama-server": {
    "type": "bearer",
    "key": "your-api-key-here"
  }
}
```

## Usage

### Prerequisites

Make sure your llama.cpp server is running with the appropriate flags. For multi-model support (model router), start the server with:

```bash
llama-server --models-preset path/to/presets.ini
```

(You can use both `--fit-ctx` and `--ctx-size` in the preset — the extension checks both.)

For single-model mode, a standard invocation works:

```bash
llama-server --model path/to/model.gguf --ctx-size 128000 ...
```

### Commands

| Command   | Description                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| `/models` | Browse llama-server models with live status. Select a model to load, switch, or unload it. |

### Model Actions

When browsing models via the `/models` command, you can:

- **Load & switch** — Load an unloaded model and switch to it
- **Switch model** — Switch to a model that is already loaded
- **Unload** — Unload a loaded model to free memory

### Model Selection Event

When Pi switches models (e.g., via `model_select`), the extension automatically loads the selected model on the llama.cpp server. This keeps the server in sync with the active model in Pi.

### Model Configuration

Each model exposed to Pi includes the following defaults:

- **`maxTokens`** — `16384` (maximum tokens per response)
- **`reasoning`** — `true` (assumed, as llama.cpp's `/models` endpoint does not expose it)
- **`cost`** — all zero (local model)

## Dependencies

| Dependency                      | Purpose                               |
| ------------------------------- | ------------------------------------- |
| `@mariozechner/pi-coding-agent` | Pi Coding Agent SDK (peer dependency) |
