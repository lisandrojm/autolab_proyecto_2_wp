import { ItemImportCentroCosto } from "../api/centrosCosto";

/*
  VALIDAR EL ARCHIVO DE CENTROS DE COSTO, EN EL NAVEGADOR.

  Son las MISMAS reglas que `server/src/services/centrosCostoImport.ts`, escritas dos veces porque el
  front y el server no comparten código en este repo. La del server es la que manda —es la que protege
  la base—; ésta existe para que quien importa vea los errores con el archivo en la mano, antes de
  mandar 115 KB y antes de confirmar un borrado de todo el catálogo.

  Si cambian las reglas, cambian en los dos lados. El test del server (`centrosCostoImport.test.ts`)
  documenta los casos.
*/

export interface ResumenArchivoCentrosCosto {
  ok: boolean;
  items: ItemImportCentroCosto[];
  errores: string[];
  /** Lo que se muestra antes de confirmar: cuántos son y cuántos vienen inhabilitados. */
  total: number;
  habilitados: number;
  inhabilitados: number;
  /** El `modo` que declara el archivo, si trae uno. */
  modoDelArchivo?: string;
}

const esEnteroPositivo = (v: unknown): boolean => typeof v === "number" && Number.isInteger(v) && v > 0;

export function validarArchivoCentrosCosto(crudo: unknown): ResumenArchivoCentrosCosto {
  const vacio: ResumenArchivoCentrosCosto = { ok: false, items: [], errores: [], total: 0, habilitados: 0, inhabilitados: 0 };
  if (!crudo || typeof crudo !== "object") return { ...vacio, errores: ["El archivo no es un JSON con la forma esperada."] };

  const payload = crudo as Record<string, unknown>;
  const lista = payload.items;
  if (!Array.isArray(lista)) return { ...vacio, errores: ['El archivo no trae la lista "items".'], modoDelArchivo: typeof payload.modo === "string" ? payload.modo : undefined };
  if (lista.length === 0) return { ...vacio, errores: ["El archivo no trae ningún centro de costo."] };

  const errores: string[] = [];
  const items: ItemImportCentroCosto[] = [];
  const porId = new Map<number, number>();
  const porCod = new Map<string, number>();

  lista.forEach((c: any, i: number) => {
    const donde = `items[${i}]`;
    if (!c || typeof c !== "object") {
      errores.push(`${donde}: no es un objeto.`);
      return;
    }
    const cod = typeof c.codAuxiliar === "string" ? c.codAuxiliar.trim() : c.codAuxiliar;
    const desc = typeof c.descAuxiliar === "string" ? c.descAuxiliar.trim() : c.descAuxiliar;
    const hab = typeof c.habilitado === "string" ? c.habilitado.trim().toUpperCase() : c.habilitado;

    let valido = true;
    if (!esEnteroPositivo(c.idAuxiliar)) {
      errores.push(`${donde}: idAuxiliar tiene que ser un entero mayor a 0.`);
      valido = false;
    }
    if (typeof cod !== "string" || cod === "") {
      errores.push(`${donde}: falta codAuxiliar.`);
      valido = false;
    }
    if (typeof desc !== "string" || desc === "") {
      errores.push(`${donde}: falta descAuxiliar.`);
      valido = false;
    }
    if (hab !== "S" && hab !== "N") {
      errores.push(`${donde}: habilitado tiene que ser "S" o "N".`);
      valido = false;
    }
    if (!valido) return;

    const yaId = porId.get(c.idAuxiliar);
    if (yaId !== undefined) {
      errores.push(`${donde}: idAuxiliar ${c.idAuxiliar} repetido (ya está en items[${yaId}]).`);
      return;
    }
    const yaCod = porCod.get(cod);
    if (yaCod !== undefined) {
      errores.push(`${donde}: codAuxiliar "${cod}" repetido (ya está en items[${yaCod}]).`);
      return;
    }
    porId.set(c.idAuxiliar, i);
    porCod.set(cod, i);
    items.push({ idAuxiliar: c.idAuxiliar, codAuxiliar: cod, descAuxiliar: desc, habilitado: hab });
  });

  if (typeof payload.total === "number" && payload.total !== lista.length) {
    errores.push(`El archivo dice ${payload.total} centros y trae ${lista.length}: puede haber llegado cortado.`);
  }

  return {
    ok: errores.length === 0,
    items,
    errores,
    total: lista.length,
    habilitados: items.filter((i) => i.habilitado === "S").length,
    inhabilitados: items.filter((i) => i.habilitado === "N").length,
    modoDelArchivo: typeof payload.modo === "string" ? payload.modo : undefined,
  };
}
