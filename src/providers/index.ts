import type { Env, Providers } from "../lib/types.js";
import { buildLiveProviders } from "./live.js";
import { buildMockProviders } from "./mock.js";

export function buildProviders(env: Env): Providers {
  if ((env.PROVIDER_MODE ?? "live") === "mock") {
    return buildMockProviders();
  }
  return buildLiveProviders(env);
}
