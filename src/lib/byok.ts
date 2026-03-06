import type { ByokProvider } from "./types.js";

export const BYOK_PROVIDERS = ["openai", "openrouter", "gemini", "claude"] as const;

export const isByokProvider = (value: string | undefined | null): value is ByokProvider =>
  Boolean(value && (BYOK_PROVIDERS as readonly string[]).includes(value));

export const BYOK_DEFAULT_MODELS: Record<ByokProvider, string> = {
  openai: "gpt-4.1-mini",
  openrouter: "openai/gpt-4.1-mini",
  gemini: "gemini-2.0-flash",
  claude: "claude-3-5-sonnet-latest"
};
