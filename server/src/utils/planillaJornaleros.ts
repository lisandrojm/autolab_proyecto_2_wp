/*
  LA PLANILLA DE JORNALEROS DEL MES (JORNALEROS_<MES>_<AÑO>.xlsx): las cuentas, sin base ni Excel.

  La unidad es la SOLICITUD DE CONTRATACIÓN APROBADA de tipo «Jornada» con `startDate` en el mes. Cada
  fecha de `fechasTrabajadas` es una fila del Reporte (una jornada). Lo que sale de acá lo vuelca
  `services/planillaJornaleros` en la plantilla, que hace el resto con sus propias fórmulas.

  ARITMÉTICA (verificada contra la planilla de septiembre y octubre de 2026):
    · `dailyRate` es el jornal BRUTO con presentismo.
    · sueldo_jornada (neto pactado, hoja Reporte) = dailyRate × 0,81 (1 − 19 % de aportes).
    · jornal de escala (col. J / AL de LIQUIDACION) = dailyRate ÷ 1,1 (le saca el 10 % de presentismo).
    · básico + Sattsaid = jornal × 22 ÷ 1,5 («hasta 22 jornadas, 150 % de la escala»). El reparto entre
      los dos sale del % de Sattsaid del grupo (131/75): no está cargado en la base. Es sólo lo que se
      lee en H e I: las cuentas de la planilla usan J.
*/

export const PROPORCION_NETO = 0.81;
export const FACTOR_PRESENTISMO = 1.1;
/** Montos que son datos de prueba cargados en producción: se avisan, no se corrigen. */
export const RATES_DE_PRUEBA = [123456.79, 98765.43];
/** La tabla 1 del Resumen tiene 9 filas fijas (los gráficos apuntan a ellas). */
export const FILAS_CATEGORIAS_RESUMEN = 9;

/** % de Adicional Sattsaid sobre el básico, por grupo (escala 131/75; G2 no aparece en ninguna planilla). */
export const PCT_SATTSAID_POR_GRUPO: Record<number, number> = { 1: 62.5, 3: 38, 4: 35, 5: 32, 6: 29, 7: 26.5, 8: 23.5, 9: 21.5, 10: 21, 11: 18.5, 12: 16 };

export const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

export interface SolicitudJornada {
  id: string;
  personaId: string;
  legajo: string;
  apellido: string;
  nombre: string;
  rol: string;
  categoriaNumero: number | null;
  categoriaNombre: string;
  dailyRate: number;
  fechas: string[];
}

export interface FilaReporte {
  legajo: string;
  apellido: string;
  nombre: string;
  rol: string;
  /** «Apellido Nombre»: la clave con la que la planilla agrupa y busca. */
  clave: string;
  categoriaNumero: number | null;
  categoriaNombre: string;
  sueldoJornada: number;
  fecha: string;
  solicitudId: string;
}

export interface FilaLiquidacion {
  clave: string;
  categoriaNumero: number | null;
  categoriaNombre: string;
  contratos: number;
  jornadas: number;
  netoPactado: number;
}

export interface FilaEscala {
  numero: number;
  basico: number;
  sattsaid: number;
  jornal: number;
}

export interface PlanillaJornaleros {
  mes: string;
  reporte: FilaReporte[];
  liquidacion: FilaLiquidacion[];
  escala: FilaEscala[];
  /** Nombre de categoría + número, de mayor a menor neto: las que entran en la tabla 1 del Resumen. */
  categoriasResumen: { numero: number | null; nombre: string }[];
  totales: { contratos: number; jornadas: number; personas: number; netoPactado: number };
  advertencias: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const cmp = (a: string, b: string) => a.localeCompare(b, "es", { sensitivity: "base" });

/** "2026-10" → primer y último día, en "YYYY-MM-DD". */
export const rangoDelMes = (mes: string): { desde: string; hasta: string } => {
  const [y, m] = mes.split("-").map(Number);
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
};

export const nombreDelArchivo = (mes: string) => {
  const [y, m] = mes.split("-").map(Number);
  return `JORNALEROS_${MESES[m - 1]}_${y}.xlsx`;
};

/** El valor que más se repite (empate: el primero en aparecer). */
const moda = (valores: number[]): number | null => {
  const cuenta = new Map<number, number>();
  for (const v of valores) cuenta.set(v, (cuenta.get(v) || 0) + 1);
  let mejor: number | null = null;
  let max = 0;
  for (const [v, n] of cuenta) if (n > max) [mejor, max] = [v, n];
  return mejor;
};

export function armarPlanilla(mes: string, solicitudes: SolicitudJornada[]): PlanillaJornaleros {
  const { desde, hasta } = rangoDelMes(mes);
  const advertencias: string[] = [];
  const reporte: FilaReporte[] = [];

  for (const s of solicitudes) {
    const clave = `${s.apellido} ${s.nombre}`.trim();
    if (!s.legajo) advertencias.push(`${clave}: no tiene legajo de Tango.`);
    if (!s.dailyRate) advertencias.push(`${clave}: solicitud con importe por jornada en $0.`);
    if (RATES_DE_PRUEBA.includes(round2(s.dailyRate))) advertencias.push(`${clave}: importe por jornada de prueba (${s.dailyRate}). Corregirlo en la app.`);
    if (s.categoriaNumero == null) advertencias.push(`${clave}: la solicitud no tiene categoría.`);
    if (s.fechas.length === 0) advertencias.push(`${clave}: solicitud sin días trabajados; no entra en la planilla.`);
    const fuera = s.fechas.filter((f) => f < desde || f > hasta);
    if (fuera.length) advertencias.push(`${clave}: ${fuera.length === 1 ? "la fecha" : "las fechas"} ${fuera.join(", ")} ${fuera.length === 1 ? "cae" : "caen"} fuera del mes (la solicitud empieza en el mes).`);
    for (const fecha of [...s.fechas].sort()) {
      reporte.push({
        legajo: s.legajo,
        apellido: s.apellido,
        nombre: s.nombre,
        rol: s.rol,
        clave,
        categoriaNumero: s.categoriaNumero,
        categoriaNombre: s.categoriaNombre,
        sueldoJornada: round2(s.dailyRate * PROPORCION_NETO),
        fecha,
        solicitudId: s.id,
      });
    }
  }
  reporte.sort((a, b) => cmp(a.clave, b.clave) || a.fecha.localeCompare(b.fecha));

  // LIQUIDACION: una fila por persona y categoría (quien trabajó en dos categorías tiene dos filas).
  const grupos = new Map<string, FilaReporte[]>();
  for (const f of reporte) {
    const k = `${f.clave}\u0000${f.categoriaNumero ?? ""}`;
    grupos.set(k, [...(grupos.get(k) || []), f]);
  }
  const liquidacion: FilaLiquidacion[] = [...grupos.values()].map((filas) => {
    const nombres = filas.map((f) => f.categoriaNombre);
    const nombre = [...new Set(nombres)].sort((a, b) => nombres.filter((x) => x === b).length - nombres.filter((x) => x === a).length)[0] || "";
    return {
      clave: filas[0].clave,
      categoriaNumero: filas[0].categoriaNumero,
      categoriaNombre: nombre,
      contratos: new Set(filas.map((f) => f.solicitudId)).size,
      jornadas: filas.length,
      netoPactado: round2(filas.reduce((t, f) => t + f.sueldoJornada, 0)),
    };
  });

  // La escala de cada número de categoría: el jornal más repetido (sin $0 ni montos de prueba).
  const porNumero = new Map<number, number[]>();
  for (const s of solicitudes) {
    if (s.categoriaNumero == null || !s.dailyRate || RATES_DE_PRUEBA.includes(round2(s.dailyRate))) continue;
    porNumero.set(s.categoriaNumero, [...(porNumero.get(s.categoriaNumero) || []), ...s.fechas.map(() => s.dailyRate)]);
  }
  const escala: FilaEscala[] = [...porNumero.entries()]
    .sort(([a], [b]) => a - b)
    .map(([numero, rates]) => {
      const valores = [...new Set(rates)];
      if (valores.length > 1) advertencias.push(`Categoría ${numero}: hay jornales distintos en el mes (${valores.map((v) => round2(v / FACTOR_PRESENTISMO)).join(", ")}); la escala usa el más repetido.`);
      const jornal = moda(rates)! / FACTOR_PRESENTISMO;
      const pct = PCT_SATTSAID_POR_GRUPO[numero];
      if (pct === undefined) advertencias.push(`Categoría ${numero}: no hay % de Adicional Sattsaid para ese grupo; el básico se muestra sin separar.`);
      const basicoMasSattsaid = (jornal * 22) / 1.5;
      const basico = basicoMasSattsaid / (1 + (pct ?? 0) / 100);
      return { numero, basico, sattsaid: basicoMasSattsaid - basico, jornal };
    });

  // Tabla 1 del Resumen: agrupa por NOMBRE de categoría (el 4 tiene dos nombres), de mayor a menor neto.
  const netoPorNombre = new Map<string, { numeros: number[]; neto: number }>();
  for (const f of reporte) {
    const actual = netoPorNombre.get(f.categoriaNombre) || { numeros: [], neto: 0 };
    actual.neto += f.sueldoJornada;
    if (f.categoriaNumero != null) actual.numeros.push(f.categoriaNumero);
    netoPorNombre.set(f.categoriaNombre, actual);
  }
  // El número es el más repetido para ese nombre: una solicitud mal cargada no le cambia el número a todas.
  const categoriasResumen = [...netoPorNombre.entries()].sort(([, a], [, b]) => b.neto - a.neto).map(([nombre, v]) => ({ numero: moda(v.numeros), nombre }));
  if (categoriasResumen.length > FILAS_CATEGORIAS_RESUMEN) {
    const afuera = categoriasResumen.slice(FILAS_CATEGORIAS_RESUMEN).map((c) => c.nombre);
    advertencias.push(`El Resumen muestra ${FILAS_CATEGORIAS_RESUMEN} categorías y el mes tiene ${categoriasResumen.length}: quedan afuera ${afuera.join(", ")} (la tabla avisa que no cuadra).`);
  }

  return {
    mes,
    reporte,
    liquidacion: liquidacion.sort((a, b) => cmp(a.clave, b.clave) || (a.categoriaNumero ?? 0) - (b.categoriaNumero ?? 0)),
    escala,
    categoriasResumen: categoriasResumen.slice(0, FILAS_CATEGORIAS_RESUMEN),
    totales: {
      contratos: new Set(reporte.map((f) => f.solicitudId)).size,
      jornadas: reporte.length,
      personas: new Set(reporte.map((f) => f.clave)).size,
      netoPactado: round2(reporte.reduce((t, f) => t + f.sueldoJornada, 0)),
    },
    // Una persona con varias solicitudes sin legajo es un solo aviso.
    advertencias: [...new Set(advertencias)],
  };
}
