import { IRouterModel } from "../interfaces/IRouterModel";
import { DEFAULT_CTX } from "../constants";
import { rpc } from "../tools/retriever";
import { Status } from "../enums/status";
import { BaseModel } from "./baseModel";

export class RouterModel extends BaseModel {
  constructor(private readonly model: IRouterModel) {
    super();
  }

  get id(): string {
    return this.model.id;
  }

  get name(): string {
    return this.model.aliases?.[0] || this.model.id;
  }

  get capabilities(): ["text"] | ["image"] {
    const hasImage = this.model.status.args?.includes("--mmproj") ?? false;
    return hasImage ? ["image"] : ["text"];
  }

  async getStatus(): Promise<Status> {
    const { data } = await rpc<{ data: IRouterModel[] }>("/models");
    const model = data.find((m) => m.id === this.id);
    if (!model) return Status.UNLOADED;

    const response = this.statusMapper[model.status.value];
    if (!response) return Status.UNLOADED;

    return response;
  }

  async getContextSize(): Promise<number> {
    let response = this.extractFrom("--ctx-size");
    if (response) return response;

    response = this.extractFrom("--fit-ctx");
    if (response) return response;

    return DEFAULT_CTX;
  }

  /**
   * Extracts the value from a llama-server argument
   * @param arg The argument
   * @returns The value
   */
  private extractFrom(arg: string): number | null {
    const args = this.model.status.args;
    if (!args) return null;

    const ctxIdx = args.indexOf(arg);

    if (ctxIdx === -1) return null;
    if (args.length <= ctxIdx + 1) return null;

    const parsed = parseInt(args[ctxIdx + 1], 10);
    if (!isNaN(parsed)) return parsed;

    return null;
  }
}
