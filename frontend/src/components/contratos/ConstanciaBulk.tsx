import React, { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faCloudArrowUp, faSpinner, faCheck, faTriangleExclamation, faXmark, faCopy, faChevronDown, faChevronUp } from "@fortawesome/free-solid-svg-icons";
import { ContractOverviewRow } from "../../api/users";
import { projectsAPI, ConstanciaTarget, ConstanciaResultado } from "../../api/projects";
import { sweetAlert } from "../../utils/sweetAlert";

/**
 * Constancia de CUIT (ARCA). El PDF se baja del portal público de ARCA, que pide un código de
 * seguridad por consulta: esa parte la hace una persona, de a una. Lo que sí se automatiza es el
 * resto — copiar el CUIT para pegarlo allá, y después soltar todos los PDFs juntos acá para que
 * cada uno se asigne solo (el server lee el CUIT de adentro del PDF).
 */
export const ARCA_CONSTANCIA_URL = "https://seti.afip.gob.ar/padron-puc-constancia-internet/ConsultaConstanciaAction.do";

/** CUIT/CUIL formateado NN-NNNNNNNN-N (vacío si no tiene 11 dígitos). */
export const fmtCuit = (raw?: string): string => {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : "";
};

/** "YYYY-MM-DD" → "DD/MM/YYYY". */
const fmtIso = (s?: string): string => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
};

/** Hoy en Argentina como "YYYY-MM-DD" (el navegador puede estar en otro huso). */
const hoyIso = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

export type EstadoConstancia = "vigente" | "vencida" | "sin_fecha" | "faltante";

/**
 * Estado de la constancia de una fila. `sin_fecha` es el caso de un PDF cargado a mano por el
 * flujo viejo (o uno del que no se pudo leer la vigencia): hay documento pero no se sabe hasta cuándo.
 */
export const estadoConstancia = (row: ContractOverviewRow, hoy: string = hoyIso()): EstadoConstancia => {
  if (!row.altaDocumentoUrl) return "faltante";
  if (!row.constanciaVigenciaHasta) return "sin_fecha";
  return row.constanciaVigenciaHasta >= hoy ? "vigente" : "vencida";
};

/** Una constancia hay que (re)pedirla cuando falta o ya venció. */
export const constanciaPendiente = (row: ContractOverviewRow, hoy: string = hoyIso()): boolean => {
  const e = estadoConstancia(row, hoy);
  return e === "faltante" || e === "vencida";
};

const BADGE: Record<EstadoConstancia, { texto: (row: ContractOverviewRow) => string; clase: string; icono: typeof faCheck }> = {
  vigente: {
    texto: (r) => `Vigente hasta ${fmtIso(r.constanciaVigenciaHasta)}`,
    clase: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800",
    icono: faCheck,
  },
  vencida: {
    texto: (r) => `Vencida el ${fmtIso(r.constanciaVigenciaHasta)}`,
    clase: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800",
    icono: faTriangleExclamation,
  },
  sin_fecha: {
    texto: () => "Cargada (sin vigencia)",
    clase: "bg-gray-50 text-gray-600 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700",
    icono: faCheck,
  },
  faltante: {
    texto: () => "Sin constancia",
    clase: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    icono: faTriangleExclamation,
  },
};

/** Badge de vigencia de la constancia de una fila. */
export const ConstanciaBadge: React.FC<{ row: ContractOverviewRow }> = ({ row }) => {
  const estado = estadoConstancia(row);
  const cfg = BADGE[estado];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${cfg.clase}`} title={row.constanciaVerificador ? `Verificador ${row.constanciaVerificador}` : undefined}>
      <FontAwesomeIcon icon={cfg.icono} className="h-2.5 w-2.5" />
      {cfg.texto(row)}
    </span>
  );
};

/** Copia el texto al portapapeles; devuelve false si el navegador no lo permitió. */
const copiar = async (texto: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    return false;
  }
};

/**
 * Copia el CUIT y abre el formulario de ARCA en otra pestaña. Ese formulario tiene captcha y no
 * acepta el CUIT por querystring, así que lo más rápido que se puede hacer es dejarlo listo para
 * pegar.
 */
export const BotonArca: React.FC<{ cuit?: string; compacto?: boolean }> = ({ cuit, compacto }) => {
  const formateado = fmtCuit(cuit);
  const digitos = String(cuit || "").replace(/\D/g, "");

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const copiado = await copiar(digitos);
    window.open(ARCA_CONSTANCIA_URL, "_blank", "noopener,noreferrer");
    if (copiado) sweetAlert.success("CUIT copiado", `${formateado} — pegalo en ARCA y resolvé el código de seguridad.`);
  };

  if (!formateado) return null;
  return (
    <button
      type="button"
      onClick={handleClick}
      title={`Copiar ${formateado} y abrir la constancia en ARCA`}
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap transition-colors bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40"
    >
      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
      {compacto ? "ARCA" : "Abrir en ARCA"}
    </button>
  );
};

/** Botón que copia al portapapeles los CUITs que hay que ir a buscar a ARCA. */
export const BotonCopiarPendientes: React.FC<{ rows: ContractOverviewRow[] }> = ({ rows }) => {
  const cuits = [...new Set(rows.filter((r) => constanciaPendiente(r)).map((r) => fmtCuit(r.cuit)).filter(Boolean))];

  const handleClick = async () => {
    if (cuits.length === 0) {
      sweetAlert.info("Nada pendiente", "Todas las constancias del listado están vigentes.");
      return;
    }
    const ok = await copiar(cuits.join("\n"));
    if (ok) sweetAlert.success(`${cuits.length} CUIT(s) copiados`, "Uno por línea, listos para ir pegando en ARCA.");
    else sweetAlert.error("No se pudo copiar", "El navegador bloqueó el acceso al portapapeles.");
  };

  return (
    <button type="button" onClick={handleClick} disabled={cuits.length === 0} title="Copiar los CUITs que faltan o vencieron" className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border transition-colors bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed">
      <FontAwesomeIcon icon={faCopy} className="h-3 w-3" />
      Copiar CUITs pendientes ({cuits.length})
    </button>
  );
};

/* ------------------------------ Carga masiva ------------------------------ */

const ESTILO_RESULTADO: Record<ConstanciaResultado["status"], { clase: string; icono: typeof faCheck; leyenda: string }> = {
  ok: { clase: "text-green-700 dark:text-green-400", icono: faCheck, leyenda: "Asignada" },
  vencida: { clase: "text-amber-700 dark:text-amber-400", icono: faTriangleExclamation, leyenda: "Asignada, pero ya venció" },
  duplicado: { clase: "text-amber-700 dark:text-amber-400", icono: faTriangleExclamation, leyenda: "CUIT repetido en el lote" },
  sin_coincidencia: { clase: "text-red-600 dark:text-red-400", icono: faXmark, leyenda: "Ese CUIT no está en el listado" },
  sin_cuit: { clase: "text-red-600 dark:text-red-400", icono: faXmark, leyenda: "No se pudo leer el CUIT del PDF" },
  ilegible: { clase: "text-red-600 dark:text-red-400", icono: faXmark, leyenda: "El PDF no se pudo leer" },
};

/**
 * Drop zone para soltar de una vez todas las constancias descargadas de ARCA. Cada PDF se asigna
 * solo: el server le lee el CUIT y lo busca entre los contratos del listado. Si el PDF es de otra
 * persona, se rechaza en vez de quedar pegado en la fila equivocada.
 */
export const ConstanciaBulkDrop: React.FC<{
  /** Contratos visibles: son los únicos a los que se les puede asignar una constancia. */
  rows: ContractOverviewRow[];
  /** Refetch del listado después de una carga con asignaciones. */
  onUploaded: () => void;
}> = ({ rows, onUploaded }) => {
  const [subiendo, setSubiendo] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [resultados, setResultados] = useState<ConstanciaResultado[] | null>(null);
  // Colapsado por defecto: la dropzone ocupa bastante lugar y no siempre se está por cargar constancias.
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const targets: ConstanciaTarget[] = rows.map((r) => ({ projectId: r.projectId, userId: r.userId, contractIndex: r.contractIndex }));

  const procesar = async (fileList: FileList | null) => {
    const files = Array.from(fileList || []).filter((f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"));
    if (files.length === 0) {
      sweetAlert.error("Sin PDFs", "Soltá los archivos PDF que bajaste de ARCA.");
      return;
    }
    if (targets.length === 0) {
      sweetAlert.error("Sin contratos", "No hay contratos en el listado a los que asignar constancias.");
      return;
    }
    try {
      setSubiendo(true);
      setResultados(null);
      const resp = await projectsAPI.bulkUploadConstancias(files, targets);
      setResultados(resp.resultados);
      if (resp.asignados > 0) {
        sweetAlert.success(`${resp.asignados} constancia(s) asignada(s)`, `Se procesaron ${resp.archivos} archivo(s).`);
        onUploaded();
      } else {
        sweetAlert.warning("Ninguna constancia se pudo asignar", "Revisá el detalle de cada archivo.");
      }
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudieron subir las constancias.");
    } finally {
      setSubiendo(false);
    }
  };

  const conError = (resultados || []).filter((r) => r.status !== "ok").length;

  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/70 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <FontAwesomeIcon icon={faCloudArrowUp} className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          Cargar constancias de ARCA
        </span>
        <span className="flex items-center gap-2 text-[11px] text-gray-400">
          {!expanded && "Soltá acá los PDFs que bajaste de ARCA"}
          <FontAwesomeIcon icon={expanded ? faChevronUp : faChevronDown} className="h-3.5 w-3.5" />
        </span>
      </button>

      {expanded && (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            procesar(e.dataTransfer.files);
          }}
          onClick={() => !subiendo && inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 px-4 py-6 rounded-xl border-2 border-dashed cursor-pointer transition-colors ${
            dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-gray-300 dark:border-gray-600 hover:border-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/40"
          } ${subiendo ? "opacity-60 pointer-events-none" : ""}`}
        >
          <FontAwesomeIcon icon={subiendo ? faSpinner : faCloudArrowUp} spin={subiendo} className="h-6 w-6 text-blue-600 dark:text-blue-400" />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">{subiendo ? "Leyendo los PDFs..." : "Soltá acá todas las constancias que bajaste de ARCA"}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 text-center">
            Cada PDF se asigna solo por el CUIT que trae adentro. Podés soltar varios juntos (hasta 50) — no hace falta renombrarlos.
          </p>
          <input ref={inputRef} type="file" accept="application/pdf" multiple className="hidden" onChange={(e) => { procesar(e.target.files); e.target.value = ""; }} />
        </div>
      )}

      {resultados && resultados.length > 0 && (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-3 py-2 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-200 dark:border-gray-700">
            <span className="text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider">Resultado de la carga</span>
            <div className="flex items-center gap-2">
              {conError > 0 && <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">{conError} con observaciones</span>}
              <button type="button" onClick={() => setResultados(null)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200" title="Cerrar">
                <FontAwesomeIcon icon={faXmark} className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <ul className="divide-y divide-gray-100 dark:divide-gray-800 max-h-64 overflow-y-auto custom-scrollbar">
            {resultados.map((r, i) => {
              const cfg = ESTILO_RESULTADO[r.status];
              return (
                <li key={`${r.filename}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2">
                  <span className="flex items-start gap-2 min-w-0">
                    <FontAwesomeIcon icon={cfg.icono} className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.clase}`} />
                    <span className="min-w-0">
                      <span className="block text-xs text-gray-700 dark:text-gray-200 truncate">{r.filename}</span>
                      <span className={`block text-[11px] ${cfg.clase}`}>
                        {cfg.leyenda}
                        {r.cuit ? ` · CUIT ${fmtCuit(r.cuit)}` : ""}
                        {r.vigenciaHasta ? ` · vence ${fmtIso(r.vigenciaHasta)}` : ""}
                      </span>
                    </span>
                  </span>
                  {r.matched.length > 0 && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 text-right shrink-0 max-w-[45%] truncate" title={r.matched.map((m) => `${m.userName} — ${m.projectName}`).join(" · ")}>
                      {r.matched.map((m) => m.userName).join(", ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
};
