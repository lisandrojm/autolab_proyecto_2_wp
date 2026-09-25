import React from "react";

/*
  Piezas comunes de las pantallas de plantillas de equipo: las mismas clases que el formulario
  individual (`UserRegistrationModal`), para que se vean iguales.
*/

export const CLASE_CAMPO = "w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white text-sm";
export const CLASE_HORA = "w-full h-12 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium text-slate-900 dark:text-white";

export const Rotulo: React.FC<{ children: React.ReactNode; obligatorio?: boolean; accion?: React.ReactNode }> = ({ children, obligatorio, accion }) => (
  <div className="mb-1.5 flex items-center justify-between gap-2">
    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
      {children}
      {obligatorio && <span className="ml-1 text-red-500">*</span>}
    </span>
    {accion}
  </div>
);

/** Domingo = 0. Se muestran de lunes a domingo, como en el alta. */
export const DIAS = [
  { i: 1, corto: "Lu" },
  { i: 2, corto: "Ma" },
  { i: 3, corto: "Mi" },
  { i: 4, corto: "Ju" },
  { i: 5, corto: "Vi" },
  { i: 6, corto: "Sá" },
  { i: 0, corto: "Do" },
];

export const textoDias = (dias: number[]) => (dias.length === 0 ? "Sin días" : DIAS.filter((d) => dias.includes(d.i)).map((d) => d.corto).join(" · "));

/** $ 1.234.567,89 */
export const pesos = (n: number | null | undefined) => (n == null || !Number.isFinite(n) ? "—" : `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export const fechaCorta = (iso?: string | null) => {
  const [y, m, d] = String(iso || "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y.slice(2)}` : "—";
};

export const fechaDeHoy = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Para meter texto de la base en el HTML de un SweetAlert. */
export const esc = (t: string) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export const Badge: React.FC<{ children: React.ReactNode; tono?: "azul" | "ambar" | "rojo" | "verde" | "gris" }> = ({ children, tono = "gris" }) => {
  const clases = {
    azul: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    ambar: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
    rojo: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
    verde: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    gris: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
  }[tono];
  return <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${clases}`}>{children}</span>;
};

// ── Turnos: la franja del día, con texto y color (nunca sólo color) ──

export type Franja = "Mañana" | "Tarde" | "Noche";

/** La franja por la hora de entrada: 05–12 mañana, 12–19 tarde, el resto noche. */
export const franjaDe = (inicio?: string | null): Franja | null => {
  const m = /^(\d{1,2}):/.exec(inicio || "");
  if (!m) return null;
  const h = Number(m[1]);
  return h >= 5 && h < 12 ? "Mañana" : h >= 12 && h < 19 ? "Tarde" : "Noche";
};

const COLOR_FRANJA: Record<Franja, string> = {
  Mañana: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
  Tarde: "bg-sky-100 text-sky-900 dark:bg-sky-500/20 dark:text-sky-200",
  Noche: "bg-indigo-100 text-indigo-900 dark:bg-indigo-500/25 dark:text-indigo-200",
};

/**
 * «Noche · Técnica», o «Sin turno». Si el nombre del turno ya dice la franja («Técnica · Noche»), manda
 * el nombre (un turno «Noche» que entra a las 18 no es «Tarde») y no se repite.
 */
export const ChipTurno: React.FC<{ inicio?: string | null; texto?: string }> = ({ inicio, texto }) => {
  const delNombre = /mañana/i.test(texto || "") ? "Mañana" : /tarde/i.test(texto || "") ? "Tarde" : /noche/i.test(texto || "") ? "Noche" : null;
  const f: Franja | null = delNombre || franjaDe(inicio);
  const etiqueta = delNombre ? texto : f ? `${f}${texto ? ` · ${texto}` : ""}` : texto || "Sin turno";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${f ? COLOR_FRANJA[f] : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"}`}>{etiqueta}</span>;
};

/** «18:00–00:00». */
export const textoHorario = (entrada?: string | null, salida?: string | null) => (entrada && salida ? `${entrada}–${salida}` : "Sin horario");

/** Un estado corto en una fila: reemplazo, diferencia, superposición. */
export const Pill: React.FC<{ children: React.ReactNode; tono?: "azul" | "ambar" | "rojo" | "verde" | "gris" }> = ({ children, tono = "gris" }) => {
  const clases = {
    azul: "bg-blue-100 text-blue-900 dark:bg-blue-500/20 dark:text-blue-200",
    ambar: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200",
    rojo: "bg-red-100 text-red-900 dark:bg-red-500/20 dark:text-red-200",
    verde: "bg-emerald-100 text-emerald-900 dark:bg-emerald-500/20 dark:text-emerald-200",
    gris: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-200",
  }[tono];
  // Pasa a otra línea en vez de cortarse: «Reemplaza a Miguel Ángel Aguirre · Revisar motivo» se lee entero.
  return <span className={`inline-flex max-w-full items-center whitespace-normal break-words rounded-xl px-2 py-0.5 text-xs font-semibold ${clases}`}>{children}</span>;
};
