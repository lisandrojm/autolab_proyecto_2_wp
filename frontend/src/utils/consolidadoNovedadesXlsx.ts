/**
 * LAS HOJAS DEL «CONSOLIDADO EMPRESAS» (20/11/2026), listas para que el server las escriba.
 *
 * El server (`GET /activity-reports/consolidado`) manda las filas ya clasificadas pero con las horas extra
 * CRUDAS. Acá se reparten entre 50% y 100% con `splitOvertime` y el glosario de ESTE navegador —el mismo
 * cálculo del reporte, sin tocarlo—, se suman por fila, se calculan valor hora e importes y se describen las
 * hojas como tablas (`HojaXlsx`) para `POST /activity-reports/consolidado/xlsx`.
 *
 * LAS HOJAS, en orden:
 *   Información · una «MM-AAAA - EMPRESA» por empresa del contrato · Novedades por persona · Compensatorios
 *   (resumen, calendario, detalle) · Feriados (resumen, detalle) · Resumen por persona · Detalle diario ·
 *   Partes · A revisar · Glosario.
 *
 * LA HOJA POR EMPRESA es la que se pega en la planilla de liquidación (NOVEDADES_LICHA): sus 34 columnas, en
 * su orden, una fila por persona y empresa, sólo contratos MENSUALIZADOS (los jornaleros tienen su planilla).
 * Lo que la plataforma no sabe va VACÍO, no en cero. Decisiones del usuario (20/11/2026), columna por columna:
 *   - Feriado (0017): horas trabajadas el feriado. Dio 10 de 10 contra la planilla real → se llena.
 *   - Inasistencias (0011): VACÍA. La planilla descontó compensatorios y un caso (Pineda, 7) no cierra con
 *     ninguna regla: una columna que descuenta sueldo no se emite con una excepción sin explicar.
 *   - Afiliado Sindical: VACÍA. La ficha contradice a la planilla en 2 de 5 muestreados.
 *   - Lic. Vacaciones: días CORRIDOS del tramo (así se pagan), no días con motivo en el parte.
 *   - Licencia Enfermedad: como la tenemos (incluye las de 1 o 2 días); la planilla sólo carga las largas.
 *   - Horas extras 50/100: el reparto del glosario. La planilla tenía a Soria al revés (12/5,5 vs 6/11,5)
 *     porque sumó la columna «% HS» del export viejo, que rotulaba «50%» una hora partida mitad y mitad.
 *   - Mes y nombre de hoja: el mes SIGUIENTE al cierre del período, como la planilla («11-2026» = 21/09→20/10,
 *     el sueldo de octubre). A confirmar con liquidaciones; la etiqueta se cambia en `mesDeLiquidacion`.
 *   - Días del Mes (0001): 30 si el contrato cubre el mes de sueldo entero; si no, los días que lo cubre.
 *   - La CLAVE DE CRUCE ES EL CUIL: el legajo de FZERO en la planilla no coincide con el nuestro.
 *
 * Pendiente anotado (20/11): que el glosario viva en el server como dato y el reparto se haga allá. Hoy el
 * resultado depende del navegador que exporta.
 *
 * Nada de «-»: una celda que no aplica va vacía (null). Cero es 0.
 */
import type { ColumnaHoja, ConsolidadoNovedades, FilaDetalleConsolidado, FilaResumenConsolidado, HojaXlsx } from "../api/request";
import { ANCHOS_GLOSARIO, filasGlosarioExtras } from "./hojaGlosarioExtras";
import { OvertimeSettings, splitOvertime } from "./overtimeUtils";

export interface InfoDelExport {
  exportadoPor: string;
  /** «dd/MM/yyyy HH:mm». */
  exportadoEl: string;
}

type Celda = string | number | null;
const r2 = (n: number) => Number(n.toFixed(2));
const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const ddmmaaaa = (f: string) => (f && ES_FECHA.test(f) ? `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}` : f || "");
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const DIAS_CORTOS = ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sá"];
const diaDeSemana = (f: string) => new Date(`${f}T00:00:00Z`).getUTCDay();
const diaSiguiente = (f: string) => { const d = new Date(`${f}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const diasDelPeriodo = (desde: string, hasta: string) => { const out: string[] = []; for (let d = desde; d <= hasta; d = diaSiguiente(d)) out.push(d); return out; };
const OTRO_MOTIVO = "Otro motivo";
const SIN_EMPRESA = "SIN EMPRESA";
const personaDe = (clave: string) => clave.split("|")[0];
const esCompensatorio = (motivo: string) => /compensatori/i.test(motivo);
const trabajado = (d: { estado: string }) => d.estado === "Presente" || d.estado === "Tardanza";

/** Horas entre dos «HH:mm»; una salida anterior a la entrada cruza la medianoche. 0 si falta alguna. */
const horasEntre = (entrada: string, salida: string) => {
  if (!/^\d{2}:\d{2}$/.test(entrada) || !/^\d{2}:\d{2}$/.test(salida)) return 0;
  const [h1, m1] = entrada.split(":").map(Number), [h2, m2] = salida.split(":").map(Number);
  let h = h2 + m2 / 60 - (h1 + m1 / 60);
  if (h <= 0) h += 24;
  return r2(h);
};

/**
 * El mes de liquidación: el SIGUIENTE al mes en que cierra el período, como nombra sus hojas la planilla de
 * referencia («11-2026» contiene las novedades del 21/09 al 20/10, el sueldo de octubre que se paga en
 * noviembre). Es una lectura de su archivo, no una confirmación: cuando liquidaciones diga cómo lo llama,
 * se cambia acá y nada más.
 */
export function mesDeLiquidacion(hasta: string): { etiqueta: string; aaaamm: number } {
  const y = Number(hasta.slice(0, 4)), m = Number(hasta.slice(5, 7));
  const m2 = m === 12 ? 1 : m + 1, y2 = m === 12 ? y + 1 : y;
  return { etiqueta: `${String(m2).padStart(2, "0")}-${y2}`, aaaamm: y2 * 100 + m2 };
}

/** El mes de sueldo: el mes calendario en que cierra el período (octubre para 21/09→20/10). */
const mesDeSueldo = (hasta: string) => {
  const y = Number(hasta.slice(0, 4)), m = Number(hasta.slice(5, 7));
  const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { desde: `${hasta.slice(0, 7)}-01`, hasta: `${hasta.slice(0, 7)}-${String(ultimo).padStart(2, "0")}`, nombre: hasta.slice(0, 7) };
};

/**
 * Días del Mes (0001): 30 si los contratos de la persona en esa empresa cubren el mes de sueldo entero
 * (la planilla pone 30 a quien entró el 01/10 aunque la ventana de novedades arranque el 21/09); si no,
 * los días del mes que cubren. 0 = ningún contrato de esa empresa vigente en el mes de sueldo.
 */
export function diasDelMes(hasta: string, contratos: { desde: string; hasta: string }[]): number {
  const mes = mesDeSueldo(hasta);
  const dias = diasDelPeriodo(mes.desde, mes.hasta);
  const cubiertos = dias.filter((d) => contratos.some((c) => c.desde && c.desde <= d && (!c.hasta || c.hasta >= d))).length;
  return cubiertos === dias.length ? 30 : cubiertos;
}

/** Nombre de hoja válido para Excel: sin []:*?/\ y hasta 31 caracteres. */
const nombreDeHoja = (s: string) => s.replace(/[[\]:*?/\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 31);

/**
 * El reparto de las extras de un día, igual que en el reporte: feriado → todo al 100% (aunque el parte
 * traiga un reparto guardado); reparto guardado → se respeta; si no, `splitOvertime` contra el horario del
 * turno de ese día (el del parte, o el del contrato).
 */
export function repartoDeExtras(d: FilaDetalleConsolidado, g: OvertimeSettings): { h50: number; h100: number } | null {
  const x = d.extras;
  if (!x || x.total <= 0) return null;
  if (x.feriado) return { h50: 0, h100: x.total };
  if (x.h50 > 0 || x.h100 > 0) return { h50: x.h50, h100: x.h100 };
  const res = splitOvertime(d.fecha, d.entradaReal || "", d.salidaReal || "", x.total, g, x.horarioEntrada || undefined, x.horarioSalida || undefined);
  return { h50: res.h50, h100: res.h100 };
}

interface HorasDeLaFila { h50: number; h100: number; total: number }
interface DetalleConReparto { d: FilaDetalleConsolidado; rep: { h50: number; h100: number } | null }

/** Las 34 columnas de la planilla de liquidación, en su orden y con sus nombres. */
export const COLUMNAS_EMPRESA: ColumnaHoja[] = [
  { titulo: "Mes", tipo: "entero", ancho: 8 }, { titulo: "CC", ancho: 6 }, { titulo: "Descripción", ancho: 14 }, { titulo: "Leg", tipo: "entero", ancho: 6 }, { titulo: "Apellido", ancho: 20 }, { titulo: "Nombre", ancho: 22 }, { titulo: "Cuil", ancho: 13 },
  { titulo: "ALTA", tipo: "fecha", ancho: 11 }, { titulo: "BAJA", tipo: "fecha", ancho: 11 }, { titulo: "Código", ancho: 8 }, { titulo: "Grupo", tipo: "entero", ancho: 6 }, { titulo: "Tarea", ancho: 34 },
  { titulo: "Afiliado Sindical", ancho: 8 }, { titulo: "Fondo Medicamentos", ancho: 10 }, { titulo: "TURISMO", ancho: 8 },
  { titulo: "Días del Mes (0001)", tipo: "entero", ancho: 8 }, { titulo: "Días del SAC (0501)", ancho: 8 }, { titulo: "Inasistencias (0011)", ancho: 10 },
  { titulo: "Horas Extras 50% (0015)", tipo: "numero", ancho: 10 }, { titulo: "Horas Extras 100% (0016)", tipo: "numero", ancho: 10 }, { titulo: "Feriado (0017)", tipo: "numero", ancho: 8 },
  { titulo: "Adicional F (0019)", ancho: 9 }, { titulo: "Plus Nocturno", ancho: 9 }, { titulo: "Licencia Enfermedad (0012)", tipo: "entero", ancho: 10 }, { titulo: "Lic. Sin Goce de Sueldo", tipo: "entero", ancho: 10 }, { titulo: "Lic. Vacaciones", tipo: "entero", ancho: 9 },
  { titulo: "Adicional H (0601)", ancho: 9 }, { titulo: "Adicional (0008)", ancho: 9 }, { titulo: "Remplazos Inasistencias", tipo: "entero", ancho: 10 }, { titulo: "ART", ancho: 6 }, { titulo: "Día del Gremio", ancho: 8 },
  { titulo: "Adelantos Sueldo (0018)", ancho: 10 }, { titulo: "NETO Pactado", ancho: 10 }, { titulo: "NOVEDAD MENSUAL (0099)", ancho: 40 },
];

/** Los motivos del catálogo que alimentan cada concepto. Por nombre, porque el catálogo es del tenant. */
const esEnfermedad = (m: string) => /^enfermedad$/i.test(m.trim());
const esSinGoce = (m: string) => /sin goce/i.test(m);

export function hojasDelConsolidado(c: ConsolidadoNovedades, g: OvertimeSettings, info: InfoDelExport): HojaXlsx[] {
  const divisor = g.salaryDivisorPercentage || 150;
  const horasPorClave = new Map<string, HorasDeLaFila>();
  const detalleConReparto: DetalleConReparto[] = c.detalle.map((d) => {
    const rep = repartoDeExtras(d, g);
    if (rep) {
      const h = horasPorClave.get(d.claveResumen) || horasPorClave.set(d.claveResumen, { h50: 0, h100: 0, total: 0 }).get(d.claveResumen)!;
      h.h50 += rep.h50;
      h.h100 += rep.h100;
      h.total += d.extras!.total;
    }
    return { d, rep };
  });
  const horasDe = (clave: string) => horasPorClave.get(clave) || { h50: 0, h100: 0, total: 0 };
  const motivos = [...c.motivos, OTRO_MOTIVO];
  const mes = mesDeLiquidacion(c.hasta);
  const proyectoPorId = new Map(c.proyectos.map((p) => [p.id, p]));

  // ---------- Hojas por empresa: una fila por persona y empresa, sólo mensualizados ----------
  const grupos = new Map<string, FilaResumenConsolidado[]>();
  for (const f of c.resumen) {
    if (!f.mensualizado) continue;
    const k = `${personaDe(f.clave)}|${f.empresa || ""}`;
    (grupos.get(k) || grupos.set(k, []).get(k)!).push(f);
  }
  const porEmpresa = new Map<string, Celda[][]>();
  for (const [k, filas] of grupos) {
    const empresa = k.split("|")[1] || SIN_EMPRESA;
    // El contrato que rige: el abierto, o el de alta más reciente. Da ALTA, BAJA, categoría y obra social.
    const ordenados = [...filas].sort((a, b) => (a.hasta === "" ? 1 : 0) - (b.hasta === "" ? 1 : 0) || a.desde.localeCompare(b.desde));
    const rige = ordenados[ordenados.length - 1];
    const suma = (fn: (f: FilaResumenConsolidado) => number) => filas.reduce((acc, f) => acc + fn(f), 0);
    const porMotivo = (es: (m: string) => boolean) => suma((f) => Object.entries(f.porMotivo).filter(([m]) => es(m)).reduce((a, [, n]) => a + n, 0));
    const proyecto = proyectoPorId.get(rige.proyectoId);
    const cc = proyecto?.centroCostoCodigo || "";
    const fila: Celda[] = [
      mes.aaaamm, /^\d+$/.test(cc) ? Number(cc) : cc || null, proyecto?.centroCostoDescripcion || null,
      /^\d+$/.test(rige.legajo) ? Number(rige.legajo) : rige.legajo || null, rige.apellido || null, rige.nombrePila || null, rige.cuil || null,
      rige.desde || null, rige.hasta || null, rige.obraSocialCodigo || null, rige.grupo, rige.categoria ? (rige.grupo === null ? rige.categoria : `${rige.categoria} / N* ${rige.grupo}`) : null,
      null, null, null, // Afiliado Sindical (vacía por decisión), Fondo Medicamentos, TURISMO
      diasDelMes(c.hasta, filas), null, null, // Días del Mes, Días del SAC, Inasistencias (vacía por decisión)
      r2(suma((f) => horasDe(f.clave).h50)), r2(suma((f) => horasDe(f.clave).h100)), r2(suma((f) => f.horasFeriado)),
      null, null, porMotivo(esEnfermedad), porMotivo(esSinGoce), suma((f) => f.vacacionesCorridas),
      null, null, suma((f) => f.reemplazos), null, null,
      null, null, null,
    ];
    (porEmpresa.get(empresa) || porEmpresa.set(empresa, []).get(empresa)!).push(fila);
  }
  const ordenEmpresas = [...porEmpresa.keys()].sort((a, b) => (a === SIN_EMPRESA ? 1 : 0) - (b === SIN_EMPRESA ? 1 : 0) || a.localeCompare(b, "es"));
  const hojasEmpresa: HojaXlsx[] = ordenEmpresas.map((empresa) => ({
    nombre: nombreDeHoja(`${mes.etiqueta} - ${empresa}`),
    tabla: true,
    vacioDice: "Ningún contrato mensualizado de esta empresa en el período.",
    columnas: COLUMNAS_EMPRESA,
    filas: porEmpresa.get(empresa)!.sort((a, b) => (typeof a[3] === "number" && typeof b[3] === "number" ? a[3] - b[3] : a[3] === null ? 1 : b[3] === null ? -1 : 0) || String(a[4] || "").localeCompare(String(b[4] || ""), "es")),
  }));

  // ---------- Novedades por persona: la hoja de control ----------
  const porPersona = new Map<string, { legajo: string; nombre: string; cuil: string; filas: DetalleConReparto[] }>();
  for (const x of detalleConReparto) {
    const pid = personaDe(x.d.claveResumen);
    const f = c.resumen.find((r) => r.clave === x.d.claveResumen);
    const p = porPersona.get(pid) || porPersona.set(pid, { legajo: f?.legajo || "", nombre: x.d.colaborador, cuil: x.d.cuil, filas: [] }).get(pid)!;
    p.filas.push(x);
  }
  const novedadesPorPersona: HojaXlsx = {
    nombre: "Novedades por persona",
    tabla: true,
    vacioDice: "No hay partes ni días asignados en este período.",
    columnas: [
      { titulo: "Legajo", ancho: 9 }, { titulo: "Empleado", ancho: 30 }, { titulo: "CUIL", ancho: 13 }, { titulo: "Presente", tipo: "entero", ancho: 9 },
      ...motivos.map((m) => ({ titulo: m, tipo: "entero" as const, ancho: Math.max(9, Math.min(18, m.length + 2)) })),
      { titulo: "Sin contrato vigente", tipo: "entero", ancho: 10 }, { titulo: "Falta parte", tipo: "entero", ancho: 9 }, { titulo: "Total días", tipo: "entero", ancho: 9 },
      { titulo: "HE 50%", tipo: "numero", ancho: 8 }, { titulo: "HE 100%", tipo: "numero", ancho: 8 }, { titulo: "Total HE", tipo: "numero", ancho: 8 }, { titulo: "Días con HE", tipo: "entero", ancho: 9 },
    ],
    filas: [...porPersona.values()].sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })).map((p) => {
      const ausentes = p.filas.filter(({ d }) => d.estado === "Ausente");
      const porMotivo = motivos.map((m) => (m === OTRO_MOTIVO ? ausentes.filter(({ d }) => !d.motivo || !c.motivos.includes(d.motivo)).length : ausentes.filter(({ d }) => d.motivo === m).length));
      const h50 = p.filas.reduce((a, { rep }) => a + (rep?.h50 || 0), 0), h100 = p.filas.reduce((a, { rep }) => a + (rep?.h100 || 0), 0);
      return [
        p.legajo || null, p.nombre, p.cuil || null, p.filas.filter(({ d }) => trabajado(d)).length,
        ...porMotivo,
        p.filas.filter(({ d }) => d.estado === "Sin contrato vigente").length, p.filas.filter(({ d }) => d.estado === "Falta parte").length, p.filas.length,
        r2(h50), r2(h100), r2(h50 + h100), p.filas.filter(({ d }) => (d.extras?.total || 0) > 0).length,
      ];
    }),
  };

  // ---------- Compensatorios: resumen, calendario y detalle ----------
  const compensatorios = c.detalle.filter((d) => d.estado === "Ausente" && esCompensatorio(d.motivo));
  const compPorPersona = new Map<string, FilaDetalleConsolidado[]>();
  for (const d of compensatorios) (compPorPersona.get(personaDe(d.claveResumen)) || compPorPersona.set(personaDe(d.claveResumen), []).get(personaDe(d.claveResumen))!).push(d);
  const personasComp = [...compPorPersona.values()].sort((a, b) => a[0].colaborador.localeCompare(b[0].colaborador, "es", { sensitivity: "base" }));
  const etiquetaDia = (f: string) => `${DIAS_CORTOS[diaDeSemana(f)]} ${ddmm(f)}`;
  const dias = diasDelPeriodo(c.desde, c.hasta);
  const vacioComp = "No hay compensatorios en los partes de este período.";
  const compensatoriosResumen: HojaXlsx = {
    nombre: "Compensatorios",
    tabla: true,
    vacioDice: vacioComp,
    columnas: [{ titulo: "Legajo", ancho: 9 }, { titulo: "Empleado", ancho: 30 }, { titulo: "CUIL", ancho: 13 }, { titulo: "Cant. días", tipo: "entero", ancho: 9 }, { titulo: "Fechas", ancho: 60 }, { titulo: "Control", ancho: 14 }],
    filas: personasComp.map((ds) => { const fechas = [...new Set(ds.map((d) => d.fecha))].sort(); const f = c.resumen.find((r) => r.clave === ds[0].claveResumen); return [f?.legajo || null, ds[0].colaborador, ds[0].cuil || null, fechas.length, fechas.map(etiquetaDia).join(", "), null]; }),
  };
  const compensatoriosCalendario: HojaXlsx = {
    nombre: "Compensatorios calendario",
    tabla: true,
    vacioDice: vacioComp,
    columnas: [{ titulo: "Empleado", ancho: 30 }, ...dias.map((d) => ({ titulo: etiquetaDia(d), tipo: "entero" as const, ancho: 7 })), { titulo: "Total", tipo: "entero", ancho: 7 }],
    filas: personasComp.map((ds) => { const set = new Set(ds.map((d) => d.fecha)); return [ds[0].colaborador, ...dias.map((d) => (set.has(d) ? 1 : null)), set.size]; }),
  };
  const compensatoriosDetalle: HojaXlsx = {
    nombre: "Compensatorios detalle",
    tabla: true,
    vacioDice: vacioComp,
    columnas: [{ titulo: "Empleado", ancho: 30 }, { titulo: "CUIL", ancho: 13 }, { titulo: "Fecha", tipo: "fecha", ancho: 11 }, { titulo: "Día", ancho: 6 }, { titulo: "Empresa", ancho: 20 }, { titulo: "Área", ancho: 14 }, { titulo: "Turno", ancho: 22 }, { titulo: "Parte", ancho: 16 }],
    filas: [...compensatorios].sort((a, b) => a.colaborador.localeCompare(b.colaborador, "es", { sensitivity: "base" }) || a.fecha.localeCompare(b.fecha)).map((d) => [d.colaborador, d.cuil || null, d.fecha, d.dia, d.empresa || null, d.area || null, d.turno || null, d.parte || null]),
  };

  // ---------- Feriados: resumen por feriado y detalle por persona ----------
  const vacioFeriados = "No hay feriados del catálogo en este período.";
  const feriadosResumen: HojaXlsx = {
    nombre: "Feriados",
    tabla: true,
    vacioDice: vacioFeriados,
    columnas: [
      { titulo: "Feriado", ancho: 40 }, { titulo: "Fecha", tipo: "fecha", ancho: 11 }, { titulo: "Día", ancho: 6 }, { titulo: "Empleados", tipo: "entero", ancho: 10 }, { titulo: "Presentes", tipo: "entero", ancho: 10 }, { titulo: "Ausentes", tipo: "entero", ancho: 10 }, { titulo: "Falta parte", tipo: "entero", ancho: 10 }, { titulo: "Sin contrato", tipo: "entero", ancho: 10 },
      { titulo: "% asistencia", tipo: "numero", ancho: 10 }, { titulo: "Hs trabajadas", tipo: "numero", ancho: 10 }, { titulo: "Hs extras", tipo: "numero", ancho: 10 }, { titulo: "Con hs extras", tipo: "entero", ancho: 10 },
    ],
    filas: c.feriados.map((h) => {
      const del = detalleConReparto.filter(({ d }) => d.fecha === h.fecha);
      const presentes = del.filter(({ d }) => trabajado(d)), ausentes = del.filter(({ d }) => d.estado === "Ausente");
      const evaluados = presentes.length + ausentes.length;
      return [
        h.nombre, h.fecha, DIAS_CORTOS[diaDeSemana(h.fecha)], del.length, presentes.length, ausentes.length, del.filter(({ d }) => d.estado === "Falta parte").length, del.filter(({ d }) => d.estado === "Sin contrato vigente").length,
        evaluados ? r2((presentes.length / evaluados) * 100) : null, r2(presentes.reduce((a, { d }) => a + horasEntre(d.entradaReal || d.entradaPrevista, d.salidaReal || d.salidaPrevista), 0)), r2(del.reduce((a, { d }) => a + (d.extras?.total || 0), 0)), del.filter(({ d }) => (d.extras?.total || 0) > 0).length,
      ];
    }),
  };
  const feriadosDetalle: HojaXlsx = {
    nombre: "Feriados detalle",
    tabla: true,
    vacioDice: vacioFeriados,
    columnas: [
      { titulo: "Feriado", ancho: 40 }, { titulo: "Fecha", tipo: "fecha", ancho: 11 }, { titulo: "Empleado", ancho: 30 }, { titulo: "CUIL", ancho: 13 }, { titulo: "Empresa", ancho: 20 }, { titulo: "Área", ancho: 14 }, { titulo: "Turno", ancho: 22 }, { titulo: "Estado", ancho: 18 }, { titulo: "Motivo", ancho: 28 },
      { titulo: "Entrada real", tipo: "hora", ancho: 10 }, { titulo: "Salida real", tipo: "hora", ancho: 10 }, { titulo: "Hs trabajadas", tipo: "numero", ancho: 10 }, { titulo: "Hs extras", tipo: "numero", ancho: 9 }, { titulo: "Hs 50%", tipo: "numero", ancho: 8 }, { titulo: "Hs 100%", tipo: "numero", ancho: 8 }, { titulo: "Parte", ancho: 16 },
    ],
    filas: c.feriados.flatMap((h) =>
      detalleConReparto
        .filter(({ d }) => d.fecha === h.fecha)
        .sort((a, b) => a.d.colaborador.localeCompare(b.d.colaborador, "es", { sensitivity: "base" }))
        .map(({ d, rep }) => [
          h.nombre, d.fecha, d.colaborador, d.cuil || null, d.empresa || null, d.area || null, d.turno || null, d.estado, d.motivo || null,
          d.entradaReal || null, d.salidaReal || null, trabajado(d) ? horasEntre(d.entradaReal || d.entradaPrevista, d.salidaReal || d.salidaPrevista) : null, d.extras ? r2(d.extras.total) : null, rep ? r2(rep.h50) : d.extras ? 0 : null, rep ? r2(rep.h100) : d.extras ? 0 : null, d.parte || null,
        ]),
    ),
  };

  // ---------- Las hojas de siempre ----------
  const filaResumen = (f: FilaResumenConsolidado): Celda[] => {
    const h = horasDe(f.clave);
    const valorHora = !f.valorHoraNoAplica && f.sueldoMano !== null && f.sueldoMano > 0 ? r2(f.sueldoMano / divisor) : null;
    const imp50 = valorHora === null ? null : r2(h.h50 * valorHora * (1 + g.pct50 / 100));
    const imp100 = valorHora === null ? null : r2(h.h100 * valorHora * (1 + g.pct100 / 100));
    return [
      f.legajo || null, f.colaborador, f.cuil || null, f.empresa || null, f.tipo, f.categoria || null, f.centroCosto || null, f.proyecto, f.area || null, f.turno || null,
      f.desde || null, f.hasta || null, f.contratos, f.jornadasTrabajadas, f.jornadasPrevistas,
      r2(h.h50), r2(h.h100), r2(h.total),
      f.ausencias, ...motivos.map((m) => f.porMotivo[m] ?? 0), f.diasSinParte,
      f.valorJornada, valorHora, imp50, imp100, imp50 === null || imp100 === null ? null : r2(imp50 + imp100),
    ];
  };

  const resumen: HojaXlsx = {
    nombre: "Resumen por persona",
    tabla: true,
    vacioDice: "No hay personas con contrato ni partes en este período.",
    columnas: [
      { titulo: "Legajo", ancho: 9 }, { titulo: "Colaborador", ancho: 30 }, { titulo: "CUIL", ancho: 13 }, { titulo: "Empresa del contrato", ancho: 22 }, { titulo: "Tipo de contrato", ancho: 20 }, { titulo: "Categoría", ancho: 26 }, { titulo: "Centro de costo", ancho: 14 }, { titulo: "Proyecto", ancho: 12 }, { titulo: "Área", ancho: 14 }, { titulo: "Turno", ancho: 14 },
      { titulo: "Desde", tipo: "fecha", ancho: 11 }, { titulo: "Hasta", tipo: "fecha", ancho: 11 }, { titulo: "Contratos", tipo: "entero", ancho: 10 }, { titulo: "Jornadas trabajadas", tipo: "entero", ancho: 11 }, { titulo: "Jornadas previstas", tipo: "entero", ancho: 11 },
      { titulo: "Hs extras 50%", tipo: "numero", ancho: 10 }, { titulo: "Hs extras 100%", tipo: "numero", ancho: 10 }, { titulo: "Hs extras total", tipo: "numero", ancho: 10 },
      { titulo: "Ausencias", tipo: "entero", ancho: 10 }, ...motivos.map((m) => ({ titulo: m, tipo: "entero" as const, ancho: Math.max(9, Math.min(18, m.length + 2)) })), { titulo: "Días sin parte", tipo: "entero", ancho: 10 },
      { titulo: "Valor jornada", tipo: "numero", ancho: 13 }, { titulo: "Valor hora", tipo: "numero", ancho: 12 }, { titulo: "Importe extras 50%", tipo: "numero", ancho: 14 }, { titulo: "Importe extras 100%", tipo: "numero", ancho: 14 }, { titulo: "Importe extras total", tipo: "numero", ancho: 14 },
    ],
    filas: c.resumen.map(filaResumen),
  };

  const detalle: HojaXlsx = {
    nombre: "Detalle diario",
    tabla: true,
    vacioDice: "No hay días con algo que decir en este período.",
    columnas: [
      { titulo: "Fecha", tipo: "fecha", ancho: 11 }, { titulo: "Día", ancho: 6 }, { titulo: "Feriado", ancho: 22 }, { titulo: "Colaborador", ancho: 30 }, { titulo: "CUIL", ancho: 13 }, { titulo: "Proyecto", ancho: 12 }, { titulo: "Empresa del contrato", ancho: 20 }, { titulo: "Área", ancho: 14 }, { titulo: "Turno", ancho: 22 },
      { titulo: "Estado", ancho: 18 }, { titulo: "Motivo", ancho: 28 },
      { titulo: "Entrada prevista", tipo: "hora", ancho: 10 }, { titulo: "Salida prevista", tipo: "hora", ancho: 10 }, { titulo: "Entrada real", tipo: "hora", ancho: 10 }, { titulo: "Salida real", tipo: "hora", ancho: 10 },
      { titulo: "Hs 50%", tipo: "numero", ancho: 8 }, { titulo: "Hs 100%", tipo: "numero", ancho: 8 }, { titulo: "Hs extras total", tipo: "numero", ancho: 10 },
      { titulo: "Reemplaza a / Reemplazado por", ancho: 36 }, { titulo: "Parte", ancho: 16 },
    ],
    filas: detalleConReparto.map(({ d, rep }) => [
      d.fecha, d.dia, d.feriado ? `Sí: ${d.feriado}` : "No", d.colaborador, d.cuil || null, d.proyecto, d.empresa || null, d.area || null, d.turno || null,
      d.estado, d.motivo || null,
      d.entradaPrevista || null, d.salidaPrevista || null, d.entradaReal || null, d.salidaReal || null,
      rep ? r2(rep.h50) : d.extras ? 0 : null, rep ? r2(rep.h100) : d.extras ? 0 : null, d.extras ? r2(d.extras.total) : null,
      d.reemplazo || null, d.parte || null,
    ]),
  };

  const partes: HojaXlsx = {
    nombre: "Partes",
    tabla: true,
    vacioDice: "No hay partes cargados en este período.",
    columnas: [{ titulo: "Parte", ancho: 16 }, { titulo: "Fecha", tipo: "fecha", ancho: 11 }, { titulo: "Proyecto", ancho: 12 }, { titulo: "Área", ancho: 14 }, { titulo: "Turno", ancho: 22 }, { titulo: "Responsable", ancho: 26 }, { titulo: "Presentes", tipo: "entero", ancho: 10 }, { titulo: "Ausentes", tipo: "entero", ancho: 10 }, { titulo: "Comentario", ancho: 80 }],
    filas: c.partes.map((p) => [p.parte, p.fecha, p.proyecto, p.area || null, p.turno || null, p.responsable || null, p.presentes, p.ausentes, p.comentario || null]),
  };

  const revisar: HojaXlsx = {
    nombre: "A revisar",
    tabla: true,
    vacioDice: "No hay nada para revisar en este período.",
    columnas: [{ titulo: "Tipo", ancho: 30 }, { titulo: "Colaborador", ancho: 30 }, { titulo: "CUIL", ancho: 13 }, { titulo: "Fecha", ancho: 24 }, { titulo: "Detalle", ancho: 100 }],
    filas: c.revisar.map((x) => [x.tipo, x.colaborador, x.cuil || null, x.fecha, x.detalle]),
  };

  // ---------- Información ----------
  const proyectos = c.proyectos.map((p) => (p.cliente ? `${p.cliente} | ${p.nombre}` : p.nombre)).join(", ");
  const centros = [...new Set(c.proyectos.map((p) => p.centroCosto).filter(Boolean))].join(", ");
  const mesSueldo = mesDeSueldo(c.hasta);
  const informacion: HojaXlsx = {
    nombre: "Información",
    columnas: [{ titulo: "", ancho: 36 }, { titulo: "", ancho: 110 }, { titulo: "", ancho: 12 }],
    filas: [
      ["CONSOLIDADO EMPRESAS"],
      ["Período", `${ddmmaaaa(c.desde)} al ${ddmmaaaa(c.hasta)}`],
      ["Mes de liquidación (hojas por empresa)", `${mes.etiqueta}: el mes siguiente al cierre del período, como nombra sus hojas la planilla de liquidación («11-2026» = 21/09 al 20/10, el sueldo de octubre). A confirmar con liquidaciones.`],
      ["Mes de sueldo (Días del Mes)", `${mesSueldo.nombre}: el mes calendario en que cierra el período. Días del Mes = 30 si el contrato lo cubre entero; si no, los días que cubre.`],
      ["Proyecto(s)", proyectos],
      ["Centro de costo", centros || "(el proyecto no tiene centro de costo cargado)"],
      ["Empresas incluidas", ordenEmpresas.map((e) => `${e} (${porEmpresa.get(e)!.length} filas)`).join(" · ") || "ninguna"],
      ["Filtro aplicado", "Proyecto(s) y período. Los demás filtros de la pantalla de Novedades no aplican a este archivo."],
      ["Exportado por", info.exportadoPor || c.exportadoPor || ""],
      ["Exportado el", info.exportadoEl],
      [],
      ["CLAVE DE CRUCE: EL CUIL"],
      ["El legajo es el de WeProdu y puede no coincidir con el de la planilla de liquidación (FZERO numera distinto). No cruzar por legajo ni por posición: cruzar por CUIL."],
      [],
      ["HOJAS POR EMPRESA: QUÉ SE LLENA Y DE DÓNDE SALE"],
      ["Mes · CC · Descripción", "Mes de liquidación (ver arriba) y centro de costo del proyecto (catálogo Tango)."],
      ["Leg · Apellido · Nombre · Cuil", "La ficha de la persona (legajo Tango, apellido y nombre separados, CUIL)."],
      ["ALTA · BAJA", "Del contrato mensualizado que rige al cierre del período en esa empresa. Una persona con contratos mensuales en dos empresas aparece en las dos hojas."],
      ["Código", "RNOS de la obra social: la fijada en el contrato, o la del convenio de la categoría, o la de la empleadora si la categoría está excluida de convenio (la cascada del alta de ARCA)."],
      ["Grupo · Tarea", "Grupo = número de la categoría en el catálogo; Tarea = categoría / N* grupo."],
      ["Horas Extras 50% · 100%", "Reparto del glosario de horas extra de este navegador (abajo), igual que el reporte."],
      ["Feriado (0017)", "Horas trabajadas los feriados del catálogo en el período: salida real menos entrada real; si no hay horas reales, el turno. 0 si estuvo ausente."],
      ["Licencia Enfermedad (0012)", "Días con motivo «Enfermedad» en el parte, incluidas las ausencias de uno o dos días."],
      ["Lic. Sin Goce de Sueldo", "Días con motivo «Sin Goce de Sueldo» en el parte."],
      ["Lic. Vacaciones", "Días CORRIDOS de cada tramo de vacaciones: del primer al último día con motivo Vacaciones, aunque en el medio haya francos."],
      ["Remplazos Inasistencias", "Días en que la persona figura en el parte reemplazando a otra."],
      ["Sólo contratos mensualizados", "Tiempo indeterminado y plazo fijo. Los jornaleros (Servicios, Jornada, Eventual) no van en estas hojas: tienen su planilla («Exportar Jornaleros»)."],
      [],
      ["HOJAS POR EMPRESA: COLUMNAS QUE VAN VACÍAS Y POR QUÉ"],
      ["Inasistencias (0011)", "Sin regla confirmada: la planilla descontó compensatorios como inasistencia y un caso no cierra con ninguna combinación. Una columna que descuenta sueldo no se emite con una excepción sin explicar."],
      ["Afiliado Sindical", "El dato de la ficha contradice a la planilla en 2 de 5 casos muestreados: hasta limpiarlo, vacía."],
      ["Fondo Medicamentos · TURISMO · Días del SAC · Adicional F · Plus Nocturno · Adicional H · Adicional · ART · Día del Gremio · Adelantos · NETO Pactado · NOVEDAD MENSUAL", "Son de liquidaciones: la plataforma no los conoce."],
      ["RETENCION · Dif. Mes Anterior (hoja FZERO de la planilla)", "Son del cálculo de liquidación: no se emiten. Las dos hojas por empresa llevan las mismas 34 columnas."],
      ["Compensatorios «No registrados»", "Omitida: no hay planilla de compensatorios contra qué cruzar. El módulo de Compensatorios de la app toma los días tomados del mismo parte."],
      [],
      ["GLOSARIO USADO PARA LAS HORAS EXTRA"],
      ["Lunes a viernes", `${g.weekdayDayStart} a ${g.weekdayDayEnd}`, `${g.pct50}%`],
      ["Sábados", `${g.satDayStart} a ${g.satDayEnd}`, `${g.pct50}%`],
      ["Fuera de esos rangos, domingos y feriados", "", `${g.pct100}%`],
      ["Divisor del valor hora", `Sueldo mano / ${divisor}`],
      ["Feriados del catálogo en el período", c.feriados.map((h) => `${ddmmaaaa(h.fecha)} ${h.nombre}`).join(" · ") || "ninguno"],
      [],
      ["FILAS POR HOJA"],
      ...hojasEmpresa.map((h) => [h.nombre, h.filas.length] as Celda[]),
      ["Novedades por persona", novedadesPorPersona.filas.length],
      ["Compensatorios", compensatoriosResumen.filas.length],
      ["Feriados", feriadosResumen.filas.length],
      ["Resumen por persona", resumen.filas.length],
      ["Detalle diario", detalle.filas.length],
      ["Partes", partes.filas.length],
      ["A revisar", revisar.filas.length],
      [],
      ["Las hojas de datos tienen los encabezados en la fila 1, autofiltro y la primera fila congelada. Una celda vacía es «no aplica»; cero es 0."],
    ],
  };

  const glosario: HojaXlsx = {
    nombre: "Glosario",
    columnas: ANCHOS_GLOSARIO.map((a) => ({ titulo: "", ancho: a.wch })),
    filas: [
      ...filasGlosarioExtras(g, c.feriados),
      [],
      ["CUÁNDO UNA HORA SE PARTE ENTRE 50% Y 100% DENTRO DEL MISMO TURNO"],
      [`Lo extra es lo trabajado FUERA del horario del turno de ese día. Cada tramo extra se compara con el rango del día: la parte que cae dentro del rango va al ${g.pct50}% y la que cae fuera va al ${g.pct100}%.`],
      [`Por eso un turno de 06:00 a 12:00 trabajado de 05:30 a 12:30 un día de semana da media hora al ${g.pct100}% (antes de las ${g.weekdayDayStart}) y media al ${g.pct50}% (después de las 12:00): una hora, partida.`],
      [`Si llegó antes y se fue antes, el tiempo que se fue antes se descuenta primero del tramo al ${g.pct100}%: las extras van primero al ${g.pct50}%.`],
      ["El export viejo rotulaba cada día con un solo porcentaje («% HS»); sumar las horas por ese rótulo invierte el reparto de las horas partidas. Este archivo trae las horas ya repartidas: Hs 50% y Hs 100%."],
      [],
      ["TURNOS QUE CRUZAN MEDIANOCHE"],
      ["Un turno que cruza la medianoche (18:00 a 00:00, 00:00 a 06:00) se imputa entero al día de la entrada, que es la fecha del parte. En esos turnos una salida anterior a la entrada no es un error y no va a «A revisar»."],
      [],
      ["FERIADO (0017)"],
      ["Horas trabajadas el día del feriado: salida real menos entrada real. Si el parte no tiene horas reales (no hubo extras), las del turno. Ausente ese día = 0. Un turno de 06:00 a 12:00 trabajado de 05:30 a 12:30 el feriado da 7."],
      ["Los feriados salen del catálogo de Feriados de la app, con la fuente legal anotada en cada uno. Un feriado que falte en el catálogo no se cuenta."],
      [],
      ["LIC. VACACIONES: DÍAS CORRIDOS"],
      ["Las vacaciones se pagan por días corridos: se cuenta del primer al último día con motivo Vacaciones en el parte, francos incluidos. Un día trabajado en el medio corta el tramo y empieza otro. Sólo se ven los días dentro del período."],
      [],
      ["DÍAS DEL MES (0001) Y MES DE LIQUIDACIÓN"],
      ["El período de novedades va del 21 al 20; el sueldo que se liquida es el del mes calendario en que cierra (21/09 al 20/10 → octubre). Días del Mes = 30 si el contrato cubre ese mes entero; si no, los días que cubre. Las hojas se nombran con el mes siguiente («11-2026»), como la planilla de liquidación. Ambas lecturas salen de la planilla real y están pendientes de confirmación."],
      [],
      ["COLUMNAS DE ESTE ARCHIVO"],
      ["Entrada prevista / Salida prevista", "El horario del turno de la persona ese día, según el parte."],
      ["Entrada real / Salida real", "Las horas reales. El parte sólo las carga cuando hay horas extra."],
      ["Estado", "Presente · Tardanza · Ausente (con motivo) · Falta parte (día asignado en el contrato sin parte) · Sin contrato vigente (figura en un parte sin contrato que cubra ese día)."],
      ["Jornadas previstas", "Días asignados del contrato dentro del período. Vacío cuando el contrato es de días rotativos o no tiene días cargados (ver «Días no evaluables» en A revisar)."],
      ["Valor hora", `Sueldo mano / ${divisor}. Vacío en jornadas: su sueldo mano es el valor de la jornada, no un mensual.`],
      ["Importes de extras", `Hs 50% × valor hora × ${1 + g.pct50 / 100} + Hs 100% × valor hora × ${1 + g.pct100 / 100}.`],
      ["Novedades por persona › Total días", "Cuántas filas tiene la persona en el Detalle diario. No da los días del período cuando la persona no tenía días asignados, o cuando tuvo dos partes el mismo día."],
    ],
  };

  return [informacion, ...hojasEmpresa, novedadesPorPersona, compensatoriosResumen, compensatoriosCalendario, compensatoriosDetalle, feriadosResumen, feriadosDetalle, resumen, detalle, partes, revisar, glosario];
}

/** El nombre del archivo: consolidado_empresas_<proyectos>_<desde>_a_<hasta>.xlsx */
export const nombreDelConsolidado = (c: ConsolidadoNovedades) => `consolidado_empresas_${c.proyectos.map((p) => p.nombre.replace(/[^\w+]+/g, "-")).join("_").slice(0, 60) || "proyecto"}_${c.desde}_a_${c.hasta}.xlsx`;
