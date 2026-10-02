/**
 * LEE LOS CATÁLOGOS QUE ARCA PUBLICA — solo lectura, cero clicks propios.
 *
 * La pantalla «Relaciones Laborales → Registrar Nuevas Altas» trae los nomencladores en variables
 * globales (`window.l_*`), cada elemento con la forma `{ _text, _value, _valueToFilter }`. Este motor
 * entra con la empleadora pedida, verifica su CUIT en pantalla, y los lee. No aprieta ningún botón:
 * la única interacción es elegir la empleadora en el selector de CUIT, y eso lo hace
 * `aceptarSelectorDeCuit` del motor de obras sociales, con su guarda por URL ya testeada.
 *
 * Las obras sociales no están en Altas.aspx: se leen de Datos del Empleador → Obras Sociales con
 * `leerCatalogo` del motor de registro (`window.l_OS`), reutilizado, no duplicado.
 *
 * Devuelve filas con los nombres de tabla del CSV del repo; el servidor (`catalogoArcaSync.ts`) las
 * normaliza contra el espejo y arma el diff. Nada se aplica acá.
 *
 * ⚠ NO VERIFICADO todavía: si los `l_*` existen con la grilla VACÍA. Se comprueba con el comando
 * `catalogos` de `server/src/scripts/reconocerAltasArca.ts`. Si no están, este motor devuelve los que
 * encuentre y dice cuáles faltaron: no abre bloques de alta para conseguirlos.
 */
import { esperarEstado } from "./arca-postback.mjs";
import { aceptarSelectorDeCuit } from "./validar-obras-sociales.mjs";
import { leerCatalogo } from "./registrar-obras-sociales.mjs";

/** Variable global de ARCA → tabla del espejo, y si `_valueToFilter` es el padre (convenio). */
export const CATALOGOS = {
  l_CCT: { tabla: "CONVENIO_CCT", porEmpresa: true },
  l_CatCCT: { tabla: "CATEGORIA_CCT", porEmpresa: true, padre: true },
  l_PD: { tabla: "PUESTO_DESEMPENADO" },
  l_SR: { tabla: "SITUACION_REVISTA" },
  l_GTS: { tabla: "GRUPO_TIPO_SERVICIO" },
  l_TS: { tabla: "TIPO_SERVICIO", padre: true },
  l_MC: { tabla: "MODALIDAD_CONTRATACION" },
  l_ML: { tabla: "MODALIDAD_LIQUIDACION" },
  l_Dom: { tabla: "SUCURSAL_DOMICILIO", porEmpresa: true },
  l_ActDom: { tabla: "ACTIVIDAD_DOMICILIO", porEmpresa: true, padre: true },
};

const soloDigitos = (s) => String(s ?? "").replace(/\D/g, "");
const log = (...a) => console.error(...a);

/** De `{ variable: [ {_text,_value,_valueToFilter} ] }` a filas del espejo. Puro: se testea. */
export function filasDeCatalogos(globales) {
  const filas = [];
  const faltaron = [];
  for (const [variable, def] of Object.entries(CATALOGOS)) {
    const lista = globales[variable];
    if (!Array.isArray(lista)) {
      faltaron.push(variable);
      continue;
    }
    for (const x of lista) {
      const codigo = String(x?._value ?? "").trim();
      if (!codigo) continue;
      filas.push({ tabla: def.tabla, filtroPadre: def.padre ? String(x?._valueToFilter ?? "").trim() : "", codigo, descripcion: String(x?._text ?? "").trim() });
    }
  }
  return { filas, faltaron };
}

async function cuitsEnPantalla(page) {
  const txt = await page.evaluate(() => document.body?.innerText || "").catch(() => "");
  return [...new Set((txt.match(/(?<!\d)\d{2}-?\d{8}-?\d(?!\d)/g) || []).map((c) => c.replace(/\D/g, "")))];
}

/**
 * Lee los catálogos con una empleadora. `page` es la de la sesión del servidor (`navegador.ts`).
 * Devuelve `{ filas, faltaron, tablasLeidas, obrasSociales }`.
 */
export async function leerCatalogosArca({ page, empresaCuit, onProgreso = () => {} }) {
  const cuit = soloDigitos(empresaCuit);
  if (cuit.length !== 11) throw new Error("La empleadora no tiene un CUIT de 11 dígitos.");
  // Siempre por el selector: la página podría estar adentro con otra empleadora.
  if (!/IndexContribuyente\.aspx/i.test(page.url())) await page.goto(`${page.url().split("/app/")[0]}/app/login/IndexContribuyente.aspx`, { waitUntil: "domcontentloaded" });
  const ok = await aceptarSelectorDeCuit(page, cuit);
  if (!ok) throw new Error(`No pude elegir la empleadora ${cuit} en el selector de ARCA (¿el usuario delegado la tiene?).`);
  const base = page.url().split("/app/")[0];

  await page.goto(`${base}/app/Contribuyente/RelacionLaboral/Altas.aspx`, { waitUntil: "domcontentloaded" });
  await esperarEstado(async () => page.evaluate(() => Array.isArray(window.l_PD) || !!document.querySelector("[id$='InputCuil_txtCuil']")), { que: "Registrar Nuevas Altas", log });
  // El CUIT se verifica ACÁ: el encabezado «Empleador / CUIT» está en esta pantalla, no en la del selector.
  await esperarEstado(async () => (await cuitsEnPantalla(page)).includes(cuit), { ms: 10_000, que: "el CUIT de la empleadora en pantalla", log });
  const enPantalla = await cuitsEnPantalla(page);
  if (!enPantalla.includes(cuit)) throw new Error(`La pantalla de ARCA no muestra el CUIT ${cuit} (muestra ${enPantalla.length ? enPantalla.length + " otro(s)" : "ninguno"}): no se leyó nada.`);
  onProgreso({ tipo: "empleadoraVerificada", cuit });
  const globales = await page.evaluate((nombres) => {
    const out = {};
    for (const n of nombres) {
      const v = window[n];
      if (Array.isArray(v)) out[n] = v.map((x) => ({ _text: x?._text, _value: x?._value, _valueToFilter: x?._valueToFilter }));
    }
    return out;
  }, Object.keys(CATALOGOS));
  const { filas, faltaron } = filasDeCatalogos(globales);
  onProgreso({ tipo: "catalogosLeidos", filas: filas.length, faltaron });

  // Obras sociales: otra pantalla, el lector que ya existe.
  let obrasSociales = [];
  try {
    await page.goto(`${base}/app/Contribuyente/Empleador/ObrasSociales.aspx`, { waitUntil: "domcontentloaded" });
    await esperarEstado(async () => page.evaluate(() => Array.isArray(window.l_OS) && window.l_OS.length > 0), { que: "Obras Sociales", log });
    obrasSociales = (await leerCatalogo(page)).map((o) => ({ tabla: "OBRA_SOCIAL_RNOS", filtroPadre: "", codigo: String(o._value || "").trim(), descripcion: String(o._text || "").replace(/^\s*\d{6}\s*-\s*/, "").trim() }));
  } catch (e) {
    onProgreso({ tipo: "aviso", mensaje: `No se pudieron leer las obras sociales: ${e?.message || e}` });
  }

  const tablasLeidas = [...new Set([...filas.map((f) => f.tabla), ...(obrasSociales.length ? ["OBRA_SOCIAL_RNOS"] : [])])];
  return { filas: [...filas, ...obrasSociales], faltaron, tablasLeidas };
}
