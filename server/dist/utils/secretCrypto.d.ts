/** Cifra un texto plano. Devuelve null/undefined tal cual si la entrada es vacía. */
export declare function encryptSecret(plain?: string | null): string | undefined;
/** Descifra un valor generado por encryptSecret. Devuelve "" si no se puede. */
export declare function decryptSecret(payload?: string | null): string;
