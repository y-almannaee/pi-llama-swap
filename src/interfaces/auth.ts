import { PROVIDER_ID } from "../constants";

export interface Auth {
  type: string;
  key: string;
}

export interface AuthFile {
  [PROVIDER_ID]: Auth;
}
