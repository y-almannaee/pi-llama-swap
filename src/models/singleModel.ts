import { DEFAULT_CTX } from "../constants";
import { Mode } from "../enums/mode";
import { Status } from "../enums/status";
import { ISingleModel, ISingleProps } from "../interfaces/ISingleModel";
import { rpc } from "../tools/retriever";
import { BaseModel } from "./baseModel";

export class SingleModel extends BaseModel {
  constructor(private readonly model: ISingleModel) {
    super();
  }

  get mode(): Mode {
    return Mode.SINGLE;
  }

  get id(): string {
    return this.model.name;
  }

  get name(): string {
    return this.model.name;
  }

  get capabilities(): ["text"] | ["image"] {
    const hasImage = this.model.capabilities.includes("multimodal");
    return hasImage ? ["image"] : ["text"];
  }

  async getStatus(): Promise<Status> {
    // In single-mode, the extension will only work when the model is fully loaded
    const { is_sleeping } = await rpc<ISingleProps>("/props");
    if (is_sleeping) return Status.SLEEPING;

    return Status.LOADED;
  }

  async getContextSize(): Promise<number> {
    const slots = await rpc<{ n_ctx: number }[]>("/slots");
    const [{ n_ctx }] = slots;

    return n_ctx ?? DEFAULT_CTX;
  }
}
