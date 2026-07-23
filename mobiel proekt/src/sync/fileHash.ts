const base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function decodeBase64Bytes(value: string) {
  const normalized = value.replace(/\s+/g, "").replace(/=+$/, "");
  if (!normalized || normalized.length % 4 === 1) {
    throw new Error("Invalid Base64 payload.");
  }

  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (const character of normalized) {
    const index = base64Alphabet.indexOf(character);
    if (index < 0) {
      throw new Error("Invalid Base64 payload.");
    }

    buffer = (buffer << 6) | index;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

export function bytesToHex(value: ArrayBuffer) {
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function requiresClientFileHash({
  contentType,
  mediaKind
}: {
  contentType?: "image/jpeg" | "video/mp4" | null;
  mediaKind?: "photo" | "video" | null;
}) {
  return mediaKind !== "video" && contentType !== "video/mp4";
}
