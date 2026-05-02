import type { ProviderModelConfig } from "@mariozechner/pi-coding-agent";
import { MAX_TOKENS, POLLING_INTERVAL, POLLING_TIMEOUT } from "../constants";
import { Mode } from "../enums/mode";
import { Status } from "../enums/status";
import { DataProperty } from "../interfaces/endpoints/models";
import { rpc } from "../tools/retriever";

export abstract class BaseModel {
  constructor(protected readonly model: DataProperty) {}

  protected readonly statusMapper: Record<string, Status> = {
    loaded: Status.LOADED,
    loading: Status.LOADING,
    failed: Status.FAILED,
    sleeping: Status.SLEEPING,
    unloaded: Status.UNLOADED,
  };

  protected readonly labelIcons: Record<Status, string> = {
    [Status.LOADED]: "🟢",
    [Status.LOADING]: "🟡",
    [Status.FAILED]: "🔴",
    [Status.SLEEPING]: "🔵",
    [Status.UNLOADED]: "⚪",
  };

  abstract get mode(): Mode;

  get id(): string {
    return this.model.id;
  }

  get name(): string {
    return this.model.aliases?.[0] || this.model.id;
  }

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
   * Sets up a label for the model selection screen
   * @returns A label structured as "<icon> <name>"
   */
  async getLabel(): Promise<string> {
    const status = await this.getStatus();
    return `${this.labelIcons[status]} ${this.name}`;
  }

  /**
   * Returns a human-readable information about the model
   * @returns A string with the model information
   */
  async getInfo(): Promise<string> {
    const messages = [
      `ID           : ${this.id}`,
      `Model        : ${this.name}`,
      `Reasoning    : ${this.reasoning}`,
      `Capabilities : ${this.capabilities.join(", ")}`,
      `Context size : ${await this.getContextSize()}`,
      `Status       : ${await this.getStatus()}`,
    ];

    const response = `${messages.join("\n")}\n`;
    return response;
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
   *
   * @param startTime The initial polling timestamp
   */
  async pollStatus(startTime = Date.now()): Promise<void> {
    const status = await this.getStatus();
    if (status !== Status.LOADING) return;

    // Force a timeout if we wasted too much time polling
    if (Date.now() - startTime > POLLING_TIMEOUT) {
      const message = `Model loading timed out after ${POLLING_TIMEOUT} ms: ${this.id}`;
      throw new Error(message);
    }

    await new Promise((r) => setTimeout(r, POLLING_INTERVAL));
    await this.pollStatus(startTime);
  }
}
