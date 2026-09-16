import type { ItemCentroCosto } from "./centrosCostoImport.js";

/*
  LEER EL CATÁLOGO DE CENTROS DE COSTO QUE DEVUELVE TANGO.

  Tango los guarda como AUXILIARES: hay varios tipos de auxiliar (centros de costo, vendedores,
  sucursales…) y cada uno es un registro del proceso 1656. El de centros de costo es el registro 1 en
  las tres empresas, y adentro, `AUXILIAR[]` son los centros.

  DOS COSAS QUE ESTE MÓDULO EXISTE PARA EVITAR:

  1. IMPORTAR EL TIPO DE AUXILIAR EQUIVOCADO. Si mañana en una empresa el registro 1 pasa a ser
     «Vendedores», la respuesta viene igual de bien formada y con la misma forma: sin verificar qué
     tipo de auxiliar es, reemplazaríamos los centros de costo por la lista de vendedores y nadie se
     enteraría hasta que alguien mirara un proyecto. `COD_TIPO_AUXILIAR` y `DESC_TIPO_AUXILIAR`
     cambian de una empresa a otra —por eso no se compara contra un valor fijo—, pero las dos formas
     de nombrarlo se reconocen: «CC» o algo que diga «centro de costo».

  2. QUE UNA DIFERENCIA DE MAYÚSCULAS DEJE EL CATÁLOGO VACÍO. La misma API contesta `ID_AUXILIAR` en
     un lado y `iD_AUXILIAR` en otro (el export que se usó para la primera carga venía así). Leer por
     nombre exacto habría devuelto 806 centros con todos los campos en `undefined`, que es peor que
     un error: pasa la validación de «llegó algo» y rompe abajo. Se leen sin distinguir capitalización.
*/

/** Lo que devuelve la API alrededor del dato (`{ value, message, exceptionInfo, succeeded }`). */
export interface SobreTango<T = unknown> {
  value?: T;
  message?: string | null;
  exceptionInfo?: unknown;
  succeeded?: boolean;
}

export interface RegistroAuxiliaresLeido {
  ok: boolean;
  /** Los centros, listos para guardar. Vacío si `ok` es false. */
  items: ItemCentroCosto[];
  /** Cómo llama Tango a este tipo de auxiliar en esta empresa, para poder mostrarlo. */
  tipo: { codigo: string; descripcion: string };
  /** Por qué no se puede usar esta respuesta. Vacío si `ok`. */
  errores: string[];
}

/** Lee una propiedad sin importar la capitalización ni los guiones bajos de más. */
const prop = (obj: any, nombre: string): unknown => {
  if (!obj || typeof obj !== "object") return undefined;
  const buscado = nombre.toLowerCase().replace(/_/g, "");
  for (const clave of Object.keys(obj)) {
    if (clave.toLowerCase().replace(/_/g, "") === buscado) return obj[clave];
  }
  return undefined;
};

const texto = (v: unknown): string => (v === null || v === undefined ? "" : String(v).trim());

/**
 * ¿Este registro es el de CENTROS DE COSTO?
 *
 * Se aceptan las dos formas en que lo nombran las empresas: el código «CC» o una descripción que
 * hable de centros de costo. Es a propósito más ancha que una igualdad —«CENTRO DE COSTOS»,
 * «Centros de Costo», «CTRO COSTOS» pasan— y aun así rechaza cualquier otro tipo de auxiliar.
 */
export const esTipoCentrosDeCosto = (codigo: string, descripcion: string): boolean => {
  const normalizar = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  const cod = normalizar(codigo);
  const desc = normalizar(descripcion);
  if (cod === "cc") return true;
  return /c(en)?tr[oa]s?\s*(de\s*)?costos?/.test(desc);
};

/**
 * Convierte la respuesta del proceso 1656 en centros de costo.
 *
 * No escribe nada ni sabe de la base: devuelve los ítems o los motivos por los que esta respuesta no
 * se puede usar. Quien llama decide qué hacer —y con tres empresas, que una falle no tiene por qué
 * voltear a las otras dos—.
 */
export function leerRegistroAuxiliares(sobre: SobreTango<any>): RegistroAuxiliaresLeido {
  const errores: string[] = [];
  const vacio = (msg: string, tipo = { codigo: "", descripcion: "" }): RegistroAuxiliaresLeido => ({ ok: false, items: [], tipo, errores: [...errores, msg] });

  if (!sobre || typeof sobre !== "object") return vacio("Tango no devolvió una respuesta que se pueda leer.");
  // `succeeded: false` es la forma en que esta API dice que algo salió mal, con el motivo en `message`.
  if (sobre.succeeded === false) return vacio(`Tango rechazó la consulta${sobre.message ? `: ${sobre.message}` : "."}`);

  const value = sobre.value;
  if (!value || typeof value !== "object") return vacio("La respuesta de Tango vino sin datos (`value` vacío).");

  const tipo = { codigo: texto(prop(value, "COD_TIPO_AUXILIAR")), descripcion: texto(prop(value, "DESC_TIPO_AUXILIAR")) };
  if (!esTipoCentrosDeCosto(tipo.codigo, tipo.descripcion)) {
    return vacio(`El registro que devolvió Tango es «${tipo.descripcion || tipo.codigo || "sin nombre"}», que no es el catálogo de centros de costo. No se tocó nada.`, tipo);
  }

  const auxiliares = prop(value, "AUXILIAR");
  if (!Array.isArray(auxiliares)) return vacio("La respuesta no trae la lista de auxiliares (`AUXILIAR`).", tipo);
  if (auxiliares.length === 0) return vacio("Tango devolvió el catálogo de centros de costo vacío.", tipo);

  const items: ItemCentroCosto[] = [];
  auxiliares.forEach((a: any, i: number) => {
    const id = Number(prop(a, "ID_AUXILIAR"));
    const cod = texto(prop(a, "COD_AUXILIAR"));
    const desc = texto(prop(a, "DESC_AUXILIAR"));
    const hab = texto(prop(a, "HABILITADO")).toUpperCase();
    if (!Number.isInteger(id) || id <= 0 || !cod) {
      // Se informa y se sigue: un auxiliar roto no puede dejar sin catálogo a los otros 805.
      errores.push(`AUXILIAR[${i}]: ${!cod ? "sin COD_AUXILIAR" : `ID_AUXILIAR inválido (${texto(prop(a, "ID_AUXILIAR"))})`}. Se omitió.`);
      return;
    }
    items.push({
      idAuxiliar: id,
      codAuxiliar: cod,
      // La descripción es opcional en Tango; el código no. Sin descripción se usa el código, que es
      // lo que se muestra igual, en vez de descartar un centro que sí existe.
      descAuxiliar: desc || cod,
      habilitado: hab === "N" ? "N" : "S",
    });
  });

  if (items.length === 0) return vacio("Ninguno de los auxiliares que devolvió Tango tiene código e id válidos.", tipo);
  return { ok: true, items, tipo, errores };
}
