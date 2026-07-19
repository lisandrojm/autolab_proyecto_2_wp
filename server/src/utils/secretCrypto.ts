import crypto from "crypto";
import { env } from "../config/env.js";

// Cifrado simétrico (AES-256-GCM) para secretos de integraciones por tenant
// (ej: Dropbox appSecret / refreshToken). La llave es del SERVER, no del tenant.
// Formato de salida: "v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>".

const SALT = "autolab.integrations.v1";

// Deriva una llave de 32 bytes desde ENCRYPTION_KEY (o, si no está, del JWT_SECRET).
function getKey(): Buffer {
  const secret = (env as any).ENCRYPTION_KEY || env.JWT_SECRET;
  return crypto.scryptSync(String(secret), SALT, 32);
}

/** Cifra un texto plano. Devuelve null/undefined tal cual si la entrada es vacía. */
export function encryptSecret(plain?: string | null): string | undefined {
  if (!plain) return undefined;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("hex")}:${tag.toString("hex")}:${enc.toString("hex")}`;
}

/** Descifra un valor generado por encryptSecret. Devuelve "" si no se puede. */
export function decryptSecret(payload?: string | null): string {
  if (!payload) return "";
  try {
    const parts = String(payload).split(":");
    if (parts.length !== 4 || parts[0] !== "v1") return "";
    const [, ivHex, tagHex, dataHex] = parts;
    const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return "";
  }
}
