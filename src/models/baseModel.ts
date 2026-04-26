import type { ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import { MAX_TOKENS, POLLING_INTERVAL, POLLING_TIMEOUT } from "../constants";
import { Status } from "../enums/status";
import { rpc } from "../tools/retriever";

export abstract class BaseModel {
  protected readonly statusMapper: Record<string, Status> = {
    loaded: Status.LOADED,
    loading: Status.LOADING,
    failed: Status.FAILED,
    unloaded: Status.UNLOADED,
  };

  protected readonly labelIcons: Record<Status, string> = {
    [Status.LOADED]: "🟢",
    [Status.LOADING]: "🟡",
    [Status.FAILED]: "🔴",
    [Status.UNLOADED]: "⚪",
  };

  abstract get id(): string;

  abstract get name(): string;

  get reasoning(): boolean {
    // We don't have a way to detect this, so we'll fallback to true
    return true;
  }

  /**
   * Detects if the model can load images
   */
  abstract get capabilities(): ["text"] | ["image"];

  /**
   * Gets the load status of the model
   */
  abstract getStatus(): Promise<Status>;

  /**
   * Gets the context size of a particular model
   */
  abstract getContextSize(): Promise<number>;

  /**
   * Returns the corresponding label of our load status
   */
  async getLabel(): Promise<string> {
    const status = await this.getStatus();
    return `${this.labelIcons[status]} ${this.name}`;
  }

  /**
   * Converts the llama-server model into a configuration object used by Pi
   * @returns A Pi configuration object
   */
  async toProviderConfig(): Promise<ProviderModelConfig> {
    const response = {
      id: this.id,
      name: this.name,
      reasoning: this.reasoning,
      input: this.capabilities,
      contextWindow: await this.getContextSize(),
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      maxTokens: MAX_TOKENS,
    };

    return response;
  }

  /**
   * Loads the model in llama-server
   */
  async load(): Promise<void> {
    if ((await this.getStatus()) === Status.LOADED) return;

    await rpc("/models/load", { model: this.id });
    await this.pollStatus();
  }

  /**
   * Unloads the model from llama-server
   */

  async unload(): Promise<void> {
    await rpc("/models/unload", { model: this.id });
  }

  /**
   * Polls llama-server to check when the model is loaded
   */
  async pollStatus(): Promise<void> {
    const startTime = Date.now();

    // Check loading status
    try {
      while ((await this.getStatus()) === Status.LOADING) {
        // Force a timeout if we wasted too much time polling
        if (Date.now() - startTime > POLLING_TIMEOUT) {
          const message = `Model loading timed out after ${POLLING_TIMEOUT} ms: ${this.id}`;
          throw new Error(message);
        }

        await new Promise((r) => setTimeout(r, POLLING_INTERVAL));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(message);
    }
  }
}
