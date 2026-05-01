# pi-llama-cpp

A [Pi Coding Agent](https://pi.dev/) extension that integrates with a running [llama.cpp server](https://github.com/ggml-org/llama.cpp) to provide live model browsing, loading, and switching directly from Pi.

## Features

- **Auto-detect models** — discovers all models available on your running llama.cpp server
- **Live status indicators** — see which models are loaded, loading, failed, sleeping, or unloaded with color-coded icons
- **Load / unload / switch** — manage models directly from the Pi command palette
- **Multi-model router support** — works with both single-model and multi-model llama.cpp server configurations
- **Image capabilities detection** — detects multimodal models automatically
- **Flexible URL resolution** — configures the server URL via project config, environment variable, or global settings

### Status Indicators

| Icon | Status | Description |
|------|--------|-------------|
| 🟢 | Loaded | Model is active and ready to use |
| 🟡 | Loading | Model is currently being loaded |
| 🔴 | Failed | Model failed to load |
| 🔵 | Sleeping | Model is loaded but inactive (router mode) |
| ⚪ | Unloaded | Model is not loaded on the server |

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

If your llama.cpp server requires authentication, use `/login` in Pi, select the "API key" option, and choose the `Llama.cpp` provider from the list.

Alternatively, configure the API key in `~/.pi/agent/auth.json` using the provider ID `llama-server`:

```json
{
  "llama-server": {
    "type": "api_key",
    "key": "<your-api-key-here>"
  }
}
```

## Usage

### Prerequisites

Make sure your llama.cpp server is running with the appropriate flags.

- For multi-model support (model router), start the server with:

```bash
llama-server --models-preset path/to/presets.ini ...
```

The extension reads the context size from the preset file using the `ctx-size` and/or `fit-ctx` keys.

- For single-model mode, start the server with:

```bash
llama-server --model path/to/model.gguf --ctx-size 128000 ...
```

### Commands

| Command   | Description                                                                                |
| --------- | ------------------------------------------------------------------------------------------ |
| `/models` | Browse your models with live status. Select a model to load, switch, or unload it.         |

> **Note:** When the llama.cpp server is unreachable, `/models` is still available but displays an error notification with the configured server URL.

### Model Actions

When browsing models via the `/models` command, you can:

- **Load & switch** — Load an unloaded model and switch to it
- **Switch model** — Switch to a model that is already loaded
- **Unload** — Unload a loaded model to free memory
- **Retry** — Retry loading a failed model
- **Info** — View model details (ID, capabilities, context size)
- **Cancel** — Cancel the current operation

> **Note:** In single-model mode, only **Info** and **Cancel** are available, since there is only one model loaded on the server.

### Model Selection Event

When Pi switches models (via `model_select`), the extension automatically loads the selected model on the llama.cpp server. This keeps the server in sync with the active model in Pi.

### Model Configuration

Each model exposed to Pi includes the following defaults:

- **`maxTokens`** — `16384` (maximum tokens per response)
- **`reasoning`** — `true` (assumed, as llama.cpp's `/models` endpoint does not expose it)
- **`cost`** — all zero (local model)

## Dependencies

| Dependency                      | Purpose                               |
| ------------------------------- | ------------------------------------- |
| `@mariozechner/pi-coding-agent` | Pi Coding Agent SDK (peer dependency) |
