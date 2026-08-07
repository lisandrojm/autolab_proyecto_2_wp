import React, { useEffect, useMemo, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronDown, faFileInvoiceDollar } from "@fortawesome/free-solid-svg-icons";
import { useEstadoCatalogStore } from "../stores/estadoCatalogStore";
import { useThemeStore } from "../stores/themeStore";

interface EstadoOption {
  value: string;
  name: string;
  /** Orden visual (viene de `data.orden` del ABM). Sin valor, la opción va al final. */
  orden?: number;
}

interface EstadoSelectProps {
  options: EstadoOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

const normalize = (s: string): string =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

/**
 * Estilo (color de badge) y etiqueta por estado. La clave está normalizada (sin acentos/mayúsculas).
 * "Falta pedido de AFIP" se muestra como "Pedido de AFIP".
 */
const ESTADO_STYLES: Record<string, { label?: string; cls: string }> = {
  disponible: { cls: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  "envio de documentacion": { cls: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  "falta pedido de afip": { label: "Pedido de AFIP", cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  "pedido de afip": { cls: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  "firma pendiente": { cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  "pedido servicios": { cls: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300" },
};

const styleFor = (name: string) => ESTADO_STYLES[normalize(name)] || { cls: "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300" };
const labelFor = (name: string) => styleFor(name).label || name;

/**
 * Equivalente hexadecimal de los colores históricos de cada estado (los de ESTADO_STYLES).
 * Lo usa el ABM para arrancar con el color que el estado ya venía mostrando en la app, en vez de
 * pintarlos todos de gris hasta que alguien elija uno.
 */
const ESTADO_COLOR_HEX: Record<string, string> = {
  disponible: "#15803d",
  "envio de documentacion": "#1d4ed8",
  "falta pedido de afip": "#b91c1c",
  "pedido de afip": "#b91c1c",
  "firma pendiente": "#b45309",
  "pedido servicios": "#c2410c",
};

const COLOR_HEX_GENERICO = "#64748b";

/**
 * Alias históricos: el mismo estado se guardó con más de un nombre en los contratos.
 * Sin esto, un contrato con "Falta pedido de AFIP" no encontraría al estado "Pedido de AFIP" del
 * ABM y seguiría pintándose con el color viejo en vez del configurado.
 */
const ESTADO_ALIAS: Record<string, string> = { "falta pedido de afip": "pedido de afip", "pedido servicios": "pedido de servicios" };

/** Clave con la que se compara un estado contra el catálogo del ABM (normalizada + alias). */
export const claveEstado = (name: string): string => {
  const n = normalize(name);
  return ESTADO_ALIAS[n] || n;
};

/** Color con el que se muestra un estado que todavía no tiene color propio configurado. */
export const estadoColorPorDefecto = (name: string): string => ESTADO_COLOR_HEX[normalize(name)] || COLOR_HEX_GENERICO;

/** Etiqueta canónica del estado ("Falta pedido de AFIP" y "Pedido de AFIP" son el mismo estado). */
export const estadoLabel = (name: string): string => labelFor(name);

/** #rrggbb → rgba con la transparencia pedida. El ABM solo elige el color del texto. */
const conAlpha = (hex: string, alpha: number): string => {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "transparent";
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
};

/** #rrggbb → {h, s, l}. */
const hexToHsl = (hex: string): { h: number; s: number; l: number } | null => {
  const m = /^#([0-9a-f]{6})$/i.exec((hex || "").trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? ((g - b) / d + (g < b ? 6 : 0)) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: s * 100, l: l * 100 };
};

/**
 * Color del texto del badge. Los colores del ABM se eligen sobre fondo claro, así que en modo
 * oscuro se suben de luminosidad (manteniendo tono y saturación) para que se lean bien sobre el
 * fondo translúcido; en modo claro se bajan para que no queden lavados.
 */
export const colorTextoBadge = (hex: string, isDark: boolean): string => {
  const hsl = hexToHsl(hex);
  if (!hsl) return hex;
  const l = isDark ? Math.max(hsl.l, 68) : Math.min(hsl.l, 40);
  return `hsl(${Math.round(hsl.h)}deg ${Math.round(hsl.s)}% ${Math.round(l)}%)`;
};

/**
 * Badge de estado del contrato. Si el estado está configurado en el ABM (Configuración → Estados)
 * usa su color y su nombre dentro del contrato; si no, cae en los estilos por defecto.
 */
export const EstadoBadge: React.FC<{ name: string; className?: string }> = ({ name, className = "" }) => {
  const estados = useEstadoCatalogStore((s) => s.estados);
  const ensureLoaded = useEstadoCatalogStore((s) => s.ensureLoaded);
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

  // El match es por clave canónica: los contratos guardan variantes del mismo estado.
  const configurado = useMemo(() => estados.find((e) => claveEstado(e.name) === claveEstado(name)), [estados, name]);
  // Si el estado está en el ABM, manda lo que diga el ABM: su color.
  const color = configurado?.data?.color || (configurado ? estadoColorPorDefecto(configurado.name) : undefined);
  const texto = configurado?.name || labelFor(name);
  const esImpositivo = !!configurado?.data?.esImpositivo;

  const clases = `inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide whitespace-nowrap ${className}`;
  const iconoImpositivo = esImpositivo ? <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" title="Estado impositivo" /> : null;

  if (color) {
    const textoColor = colorTextoBadge(color, theme === "dark");
    return (
      <span className={clases} style={{ color: textoColor, backgroundColor: conAlpha(color, 0.14), border: `1px solid ${conAlpha(color, 0.35)}` }}>
        {iconoImpositivo}
        {texto}
      </span>
    );
  }

  return (
    <span className={`${clases} ${styleFor(name).cls}`}>
      {iconoImpositivo}
      {texto}
    </span>
  );
};

/**
 * De la lista de Estados vinculados a una Plantilla/Contrato, devuelve el Estado impositivo
 * asignado (p. ej. "Pedido de AFIP" o "Pedido Servicios", mutuamente excluyentes por tipo de
 * contrato: ver `toggleEstadoImpositivo` en ContractTypesTab.tsx) o `null` si no tiene ninguno.
 */
export const estadoImpositivoDe = <T extends { name: string; data?: { esImpositivo?: boolean } }>(estados: T[]): T | null => estados.find((e) => e.data?.esImpositivo) || null;

/**
 * Badge secundario de un Estado impositivo: texto y color se eligen aparte (en el ABM de Estados,
 * solo cuando "Estado impositivo" está tildado) del nombre/color del badge principal del estado.
 * Se muestra en las tarjetas de Contrato para identificar si es "Servicios", "Alta de AFIP", etc.
 * Si el estado impositivo no tiene texto secundario configurado, no se muestra nada.
 */
export const EstadoSecundarioBadge: React.FC<{ estado: { name: string; data?: { etiquetaSecundaria?: string; colorEtiquetaSecundaria?: string } } | null; className?: string }> = ({ estado, className = "" }) => {
  const theme = useThemeStore((s) => s.theme);
  const texto = estado?.data?.etiquetaSecundaria?.trim();
  if (!texto) return null;
  const color = estado?.data?.colorEtiquetaSecundaria || estadoColorPorDefecto(estado!.name);
  const textoColor = colorTextoBadge(color, theme === "dark");
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-bold uppercase tracking-wide whitespace-nowrap ${className}`} style={{ color: textoColor, backgroundColor: conAlpha(color, 0.14), border: `1px solid ${conAlpha(color, 0.35)}` }}>
      <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" title="Estado impositivo" />
      {texto}
    </span>
  );
};

/** Etiqueta del trámite impositivo (excluyente) que representa un estado impositivo. */
const TIPO_IMPOSITIVO_LABEL: Record<string, string> = {
  alta_temprana_afip: "Alta temprana de AFIP",
  constancia_cuit: "Constancia de CUIT",
};

/**
 * Badge del trámite impositivo de un estado impositivo (Alta temprana de AFIP / Constancia de CUIT).
 * Mismo violeta invertido que en el ABM de Estados: "Alta temprana de AFIP" relleno (positivo) y
 * "Constancia de CUIT" contorno (negativo). No muestra nada si el estado no tiene trámite definido.
 */
export const TramiteImpositivoBadge: React.FC<{ estado: { data?: { tipoImpositivo?: string } } | null; className?: string }> = ({ estado, className = "" }) => {
  const tipo = estado?.data?.tipoImpositivo;
  if (!tipo) return null;
  const label = TIPO_IMPOSITIVO_LABEL[tipo] || tipo;
  const cls =
    tipo === "alta_temprana_afip"
      ? "bg-purple-600 text-white border-purple-600 dark:bg-purple-500 dark:border-purple-500"
      : "bg-purple-50 text-purple-700 border-purple-300 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-700";
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-semibold border whitespace-nowrap ${cls} ${className}`}>
      <FontAwesomeIcon icon={faFileInvoiceDollar} className="h-2.5 w-2.5" />
      {label}
    </span>
  );
};

const Badge = EstadoBadge;

/** Select de Estado que muestra cada opción como un badge de color (el <select> nativo no permite colorear opciones). */
export const EstadoSelect: React.FC<EstadoSelectProps> = ({ options, value, onChange, placeholder = "Selecciona estado..." }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const selected = useMemo(() => options.find((o) => String(o.value) === String(value)), [options, value]);
  // Orden persistido en el ABM (Configuración → Contratos | Estados, se arrastra ahí). Es solo
  // guía visual: no bloquea qué estado se puede elegir. Sin valor, la opción va al final.
  const sortedOptions = useMemo(() => [...options].sort((a, b) => (a.orden ?? 999) - (b.orden ?? 999) || a.name.localeCompare(b.name)), [options]);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="input-field w-full flex items-center justify-between gap-2 text-left">
        {selected ? <Badge name={selected.name} /> : <span className="text-gray-400 dark:text-gray-500">{placeholder}</span>}
        <FontAwesomeIcon icon={faChevronDown} className={`h-3 w-3 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-60 overflow-auto rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg py-1">
          {sortedOptions.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-500">No hay estados.</p>
          ) : (
            sortedOptions.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={`w-full flex items-center px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors ${String(o.value) === String(value) ? "bg-gray-50 dark:bg-gray-700/40" : ""}`}
              >
                <Badge name={o.name} />
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default EstadoSelect;
