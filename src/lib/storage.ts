import type { Env } from "./types.js";

const ensureBucket = (env: Env): R2Bucket => {
  if (!env.ALEXCLAW_ARTIFACTS) {
    throw new Error("ALEXCLAW_ARTIFACTS binding is required");
  }
  return env.ALEXCLAW_ARTIFACTS;
};

export const Storage = {
  async putBytes(env: Env, key: string, bytes: Uint8Array, contentType: string): Promise<string> {
    const bucket = ensureBucket(env);
    await bucket.put(key, bytes, {
      httpMetadata: {
        contentType
      }
    });
    return key;
  },

  async putText(env: Env, key: string, content: string, contentType = "text/plain; charset=utf-8"): Promise<string> {
    return this.putBytes(env, key, new TextEncoder().encode(content), contentType);
  },

  async putJson(env: Env, key: string, value: unknown): Promise<string> {
    return this.putText(env, key, JSON.stringify(value, null, 2), "application/json; charset=utf-8");
  },

  async getText(env: Env, key: string): Promise<string | null> {
    const bucket = ensureBucket(env);
    const object = await bucket.get(key);
    if (!object) {
      return null;
    }
    return object.text();
  }
};
