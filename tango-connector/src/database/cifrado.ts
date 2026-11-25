import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

/** Versión del formato, para poder rotar el algoritmo sin romper lo guardado. */
const PREFIJO = 'v1:';

/** AES-256-GCM. Devuelve `v1:` + base64(iv | tag | datos). */
export function cifrar(texto: string, clave: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', clave, iv);
  const datos = Buffer.concat([cipher.update(texto, 'utf8'), cipher.final()]);
  return PREFIJO + Buffer.concat([iv, cipher.getAuthTag(), datos]).toString('base64');
}

export function descifrar(cifrado: string, clave: Buffer): string {
  if (!cifrado.startsWith(PREFIJO)) throw new Error('Formato de cifrado desconocido');
  const crudo = Buffer.from(cifrado.slice(PREFIJO.length), 'base64');
  const decipher = createDecipheriv('aes-256-gcm', clave, crudo.subarray(0, 12));
  decipher.setAuthTag(crudo.subarray(12, 28));
  return Buffer.concat([decipher.update(crudo.subarray(28)), decipher.final()]).toString('utf8');
}
