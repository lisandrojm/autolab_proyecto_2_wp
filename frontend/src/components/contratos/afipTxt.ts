// El generador se mudó a `server/src/compartido/arca/afipTxt.ts` (lo usa también el servidor). Acá queda lo que usa el DOM.
export * from "@compartido/arca/afipTxt";

/**
 * Dispara la descarga del .txt.
 *
 * Se escriben BYTES, no un string: un `Blob` de texto lo codifica en UTF-8, y aunque para ASCII puro
 * eso dé los mismos bytes, alcanza un caracter acentuado que se cuele en un campo de texto para que
 * ocupe dos bytes y corra todo el registro. Acá cada caracter es un byte (latin-1) y no hay BOM.
 */
export function downloadTxt(content: string, filename: string): void {
  const bytes = new Uint8Array(content.length);
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    if (code > 255) {
      // Se corta acá: un registro con un caracter fuera de latin-1 no es representable en el archivo
      // que ARCA espera, y mandarlo «como salga» produce un rechazo que no se entiende.
      throw new Error(`El archivo ARCA tiene un caracter no representable en latin-1 (posición ${i}, código ${code}).`);
    }
    bytes[i] = code;
  }
  const blob = new Blob([bytes], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
