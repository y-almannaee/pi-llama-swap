import { ISingleModel } from "../interfaces/ISingleModel";
import { IRouterModel } from "../interfaces/IRouterModel";
import { SingleModel } from "../models/singleModel";
import { RouterModel } from "../models/routerModel";
import { BaseModel } from "../models/baseModel";
import { resolveApiKey, resolveUrl } from "./resolver";

/**
 * Detects if the server is ready
 * @returns True if it's ready to work
 */
export const isServerReady = async (): Promise<boolean> => {
  try {
    const { status } = await rpc<{ status: string }>("/health");
    return status === "ok";
  } catch {
    return false;
  }
};

/**
 * Extracts the data of a fetch command
 * @param endpoint The endpoint to fetch from
 * @param body The body (optional)
 * @returns Data from the fetch command
 */
export const rpc = async <T>(
  endpoint: string,
  body?: Record<string, unknown>,
) => {
  const base = await resolveUrl(process.cwd());
  const url = `${base}${endpoint}`;

  const data = {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  };

  const apiKey = await resolveApiKey();
  const res = await fetch(url, {
    ...data,
    headers: {
      ...data.headers,
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as T;
};

/**
 * Retrieves a list of available models from llama-server
 * @param base Base URL to use
 * @returns The list of models
 */
export const listModels = async (): Promise<BaseModel[]> => {
  const { models, data } = await rpc<{
    models?: ISingleModel[];
    data: IRouterModel[];
  }>("/models");

  if (models) {
    return models.map((m) => new SingleModel(m));
  }

  const response = data
    .map((m) => new RouterModel(m))
    .sort((a, b) => (a.id > b.id ? 1 : a.id === b.id ? 0 : -1));

  return response;
};
