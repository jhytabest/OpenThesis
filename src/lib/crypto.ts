const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const fromBase64 = (value: string): Uint8Array => {
  const normalized = value.trim();
  const binary = atob(normalized);
  const output = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    output[i] = binary.charCodeAt(i);
  }
  return output;
};

const toBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
};

const importAesKey = async (base64Key: string): Promise<CryptoKey> => {
  const rawBytes = fromBase64(base64Key);
  const raw = new Uint8Array(rawBytes);
  if (![16, 24, 32].includes(raw.byteLength)) {
    throw new Error("ENCRYPTION_KEY must decode to 16, 24, or 32 bytes");
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
};

export const Encrypt = {
  async encrypt(base64Key: string, plaintext: string): Promise<string> {
    const key = await importAesKey(base64Key);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      textEncoder.encode(plaintext)
    );
    const payload = new Uint8Array(iv.byteLength + cipher.byteLength);
    payload.set(iv, 0);
    payload.set(new Uint8Array(cipher), iv.byteLength);
    return toBase64(payload);
  },

  async decrypt(base64Key: string, ciphertext: string): Promise<string> {
    const key = await importAesKey(base64Key);
    const payload = fromBase64(ciphertext);
    if (payload.byteLength <= 12) {
      throw new Error("Encrypted payload is invalid");
    }
    const iv = payload.slice(0, 12);
    const encrypted = payload.slice(12);
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      encrypted
    );
    return textDecoder.decode(plain);
  }
};
