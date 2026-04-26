import { PROVIDER_NAME } from "../constants";

export interface IAuthFile {
  [PROVIDER_NAME]: {
    type: string;
    key: string;
  };
}
