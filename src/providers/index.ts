import type { Env, Providers } from "../lib/types.js";
import { buildLiveProviders } from "./live.js";

export function buildProviders(env: Env): Providers {
  return buildLiveProviders(env);
}
