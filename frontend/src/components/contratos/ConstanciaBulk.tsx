import React, { useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faCloudArrowUp, faSpinner, faCheck, faTriangleExclamation, faXmark, faCopy, faChevronDown, faChevronUp, faLandmark, faBug } from "@fortawesome/free-solid-svg-icons";
import { ContractOverviewRow } from "../../api/users";
import { projectsAPI, ConstanciaTarget, ConstanciaResultado } from "../../api/projects";
import { afipAPI, ResultadoConsultaPadron } from "../../api/afip";
import { sweetAlert } from "../../utils/sweetAlert";
import { Modal } from "../ui/Modal";

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

/** Fecha/hora ISO completa (`constanciaAfipConsultadaAt`) → "DD/MM/YYYY HH:mm". */
const fmtFechaHora = (iso?: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

/** Hoy en Argentina como "YYYY-MM-DD" (el navegador puede estar en otro huso). */
const hoyIso = (): string => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());

export type EstadoConstancia = "activo_afip" | "activo_sin_archivar" | "inactivo_afip" | "desconocido_afip" | "vigente" | "vencida" | "sin_fecha" | "faltante";

/**
 * Estado de la constancia de una fila. La consulta al Padrón de AFIP es la fuente de verdad UNA VEZ
 * que se hizo al menos una (activo/activo_sin_archivar/inactivo/desconocido) — recién si nunca se
 * consultó (`constanciaAfipEstado` vacío) cae al criterio viejo basado en el PDF cargado a mano
 * (`vigente`/`vencida`/`sin_fecha`/`faltante`), para no perder el historial de antes de tener esta
 * consulta. Importante: "desconocido" NO debe caer a ese criterio viejo (antes lo hacía, y mostraba
 * "Vigente hasta ..." con una fecha de un PDF viejo aunque la consulta a AFIP no haya podido leer el
 * estado — parecía validado sin estarlo).
 *
 * "Activo en AFIP" solo no alcanza: el trámite se da por terminado recién cuando ese resultado quedó
 * archivado en Dropbox (constanciaAfipDropboxSubidaAt) — es lo que dispara, del otro lado, el avance
 * automático de estado a "Envío de documentación" (estadoDropboxCronService.ts vigila esa carpeta).
 */
export const estadoConstancia = (row: ContractOverviewRow, hoy: string = hoyIso()): EstadoConstancia => {
  if (row.constanciaAfipEstado === "activo") return row.constanciaAfipDropboxSubidaAt ? "activo_afip" : "activo_sin_archivar";
  if (row.constanciaAfipEstado === "inactivo") return "inactivo_afip";
  if (row.constanciaAfipEstado === "desconocido") return "desconocido_afip";
  if (!row.altaDocumentoUrl) return "faltante";
  if (!row.constanciaVigenciaHasta) return "sin_fecha";
  return row.constanciaVigenciaHasta >= hoy ? "vigente" : "vencida";
};

/** Una constancia hay que (re)pedirla cuando falta, ya venció, AFIP la dio como inactiva o como
 *  desconocida, o quedó activa pero sin poder archivarse en Dropbox (hay que reintentar "Validar CUIT"). */
export const constanciaPendiente = (row: ContractOverviewRow, hoy: string = hoyIso()): boolean => {
  const e = estadoConstancia(row, hoy);
  return e === "faltante" || e === "vencida" || e === "inactivo_afip" || e === "activo_sin_archivar" || e === "desconocido_afip";
};

const BADGE: Record<EstadoConstancia, { texto: (row: ContractOverviewRow) => string; clase: string; icono: typeof faCheck }> = {
  activo_afip: {
    texto: (r) => `Activo en AFIP${r.constanciaAfipConsultadaAt ? ` (${fmtFechaHora(r.constanciaAfipConsultadaAt)})` : ""}`,
    clase: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800",
    icono: faCheck,
  },
  activo_sin_archivar: {
    texto: () => "Activo en AFIP — falta archivar en Dropbox",
    clase: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    icono: faTriangleExclamation,
  },
  inactivo_afip: {
    texto: () => "Inactivo en AFIP",
    clase: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800",
    icono: faTriangleExclamation,
  },
  desconocido_afip: {
    texto: () => "AFIP no devolvió un estado reconocible",
    clase: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800",
    icono: faTriangleExclamation,
  },
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

/**
 * Consulta masiva al Padrón de AFIP: reemplaza al flujo de "entrar a ARCA persona por persona". Un
 * solo click consulta el CUIT de cada contrato pendiente (deduplicado por persona) y actualiza el
 * estado de la constancia directo, sin descargar ni subir ningún PDF.
 */
export const BotonConsultarAfipBulk: React.FC<{
  /** Contratos a considerar: se filtran acá mismo a los pendientes (con CUIT cargado). */
  rows: ContractOverviewRow[];
  onConsultado: () => void;
}> = ({ rows, onConsultado }) => {
  const [consultando, setConsultando] = useState(false);
  const pendientes = rows.filter((r) => constanciaPendiente(r) && fmtCuit(r.cuit));

  const handleClick = async () => {
    if (pendientes.length === 0) {
      sweetAlert.info("Nada pendiente", "No hay contratos pendientes con CUIT cargado para consultar.");
      return;
    }
    setConsultando(true);
    try {
      const targets = pendientes.map((r) => ({ projectId: r.projectId, userId: r.userId, contractIndex: r.contractIndex }));
      const resp = await afipAPI.consultarPadronBulk(targets);
      const activos = resp.resultados.filter((r) => r.estado === "activo");
      const conError = resp.resultados.filter((r) => r.error).length;
      const sinArchivar = activos.filter((r) => !r.dropboxSubido).length;
      sweetAlert.success(
        "Consulta completa",
        `${resp.consultados} CUIT(s) consultado(s) — ${activos.length} activo(s) en AFIP.${conError > 0 ? ` ${conError} con error.` : ""}${sinArchivar > 0 ? ` ${sinArchivar} activo(s) no se pudieron archivar en Dropbox — tocá "Validar" en cada fila para ver el motivo puntual.` : ""}`,
      );
      onConsultado();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo consultar AFIP.");
    } finally {
      setConsultando(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={consultando || pendientes.length === 0}
      title="Consultar el estado de cada CUIT pendiente directo en el Padrón de AFIP, sin ir uno por uno"
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border transition-colors bg-blue-600 text-white border-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FontAwesomeIcon icon={consultando ? faSpinner : faLandmark} spin={consultando} className="h-3 w-3" />
      {consultando ? "Consultando AFIP..." : `Consultar en AFIP (${pendientes.length})`}
    </button>
  );
};

/**
 * Consulta el Padrón de AFIP para el CUIT de esta persona puntual — misma consulta que
 * BotonConsultarAfipBulk pero de a una, para validar un CUIT en el momento sin esperar al lote.
 */
export const BotonValidarCuit: React.FC<{ row: ContractOverviewRow; onConsultado: () => void; compacto?: boolean }> = ({ row, onConsultado, compacto }) => {
  const [consultando, setConsultando] = useState(false);
  // Último resultado crudo de esta fila (se guarda pase lo que pase, incluso si dio error o
  // "desconocido") para poder abrir el detalle técnico sin tener que ir a los logs del server.
  const [ultimoResultado, setUltimoResultado] = useState<ResultadoConsultaPadron | null>(null);
  const [verDetalle, setVerDetalle] = useState(false);
  const cuit = fmtCuit(row.cuit);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!cuit) {
      sweetAlert.error("Sin CUIT", "Esta persona no tiene un CUIT/CUIL cargado.");
      return;
    }
    setConsultando(true);
    try {
      const resp = await afipAPI.consultarPadronBulk([{ projectId: row.projectId, userId: row.userId, contractIndex: row.contractIndex }]);
      const resultado = resp.resultados[0];
      setUltimoResultado(resultado || null);
      if (resultado?.error) {
        sweetAlert.error("No se pudo validar", resultado.error);
      } else if (resultado?.estado === "activo" && resultado.dropboxSubido) {
        sweetAlert.success("CUIT activo y archivado", `${cuit} figura activo en el Padrón de AFIP y quedó archivado en Dropbox — el trámite queda completo.`);
      } else if (resultado?.estado === "activo") {
        sweetAlert.warningAlert("Activo, pero falta archivar", `${cuit} figura activo en el Padrón de AFIP, pero no se pudo archivar el resultado en Dropbox. El trámite sigue pendiente.\n\nMotivo: ${resultado.dropboxError || "no se informó (revisá los Logs de AFIP)."}`);
      } else if (resultado?.estado === "inactivo") {
        sweetAlert.warning("CUIT inactivo", `${cuit} figura inactivo en el Padrón de AFIP.`);
      } else {
        // "desconocido": AFIP no devolvió (o no se pudo leer) el estadoClave — no es lo mismo que
        // "inactivo". `encontrado: false` con un fault de "no existe persona" puede ser: el CUIT
        // realmente no existe, o el servicio Consulta Padrón A13 no está autorizado para este
        // certificado en AFIP (una sola consulta a un tercero no permite distinguirlas — para eso
        // existe la autoconsulta de "Revalidar servicio" en la página de AFIP, que si este CUIT es el
        // de la propia organización, contesta esa pregunta con certeza).
        const explicacion =
          resultado?.encontrado === false
            ? `AFIP dice que no existe una persona con el CUIT ${cuit} (o el servicio no está autorizado para consultarla — con una sola consulta no se puede distinguir). Si este CUIT es el de la propia organización, andá a la página de AFIP y usá "Revalidar servicio" para confirmarlo. Si es de un tercero, revisá que el CUIT esté bien cargado.`
            : `AFIP encontró a la persona pero no devolvió un estado de CUIT reconocible (ni activo ni inactivo explícito) para ${cuit}. Es probable que sea un problema de mapeo de la respuesta, no del CUIT.`;
        const faultTxt = resultado?.faultCode || resultado?.faultString ? `\n\nfaultCode: ${resultado?.faultCode || "—"}\nfaultString: ${resultado?.faultString || "—"}` : "";
        const rawTxt = resultado?.raw ? `\n\n--- Respuesta cruda de AFIP ---\ncuitRepresentada: ${resultado.cuitRepresentada || "?"} · ambiente: ${resultado.ambiente || "?"}\n${JSON.stringify(resultado.raw, null, 2)}` : "";
        sweetAlert.warningAlert("Estado no reconocido", explicacion + faultTxt + rawTxt);
      }
      onConsultado();
    } catch (e: any) {
      sweetAlert.error("Error", e?.response?.data?.error || "No se pudo consultar AFIP.");
    } finally {
      setConsultando(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        disabled={consultando || !cuit}
        title={cuit ? `Validar ${cuit} en el Padrón de AFIP` : "Falta el CUIT/CUIL de esta persona"}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap transition-colors bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <FontAwesomeIcon icon={consultando ? faSpinner : faLandmark} spin={consultando} className="h-2.5 w-2.5" />
        {consultando ? "Validando..." : compacto ? "Validar" : "Validar CUIT"}
      </button>
      {ultimoResultado && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setVerDetalle(true);
          }}
          title="Ver el CUIT enviado y la respuesta cruda de AFIP de la última consulta"
          className="p-1 rounded text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shrink-0"
        >
          <FontAwesomeIcon icon={faBug} className="h-3 w-3" />
        </button>
      )}
      {verDetalle && ultimoResultado && (
        <Modal isOpen={verDetalle} onClose={() => setVerDetalle(false)} title="Detalle técnico — Consulta Padrón AFIP" subtitle={`CUIT consultado: ${ultimoResultado.cuit}`} size="lg" zIndex={80}>
          <div className="space-y-3" onClick={(e) => e.stopPropagation()}>
            <ul className="grid grid-cols-2 gap-2 text-xs">
              <li className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-2">
                <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">CUIT enviado (idPersona)</span>
                <span className="font-mono text-gray-700 dark:text-gray-200">{ultimoResultado.cuit}</span>
              </li>
              <li className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-2">
                <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">CUIT representada</span>
                <span className="font-mono text-gray-700 dark:text-gray-200">{ultimoResultado.cuitRepresentada || "—"}</span>
              </li>
              <li className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-2">
                <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">Ambiente</span>
                <span className="font-mono text-gray-700 dark:text-gray-200">{ultimoResultado.ambiente || "—"}</span>
              </li>
              <li className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-2">
                <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">encontrado / estado</span>
                <span className="font-mono text-gray-700 dark:text-gray-200">{String(ultimoResultado.encontrado)} / {ultimoResultado.estado || "—"}</span>
              </li>
              {(ultimoResultado.faultCode || ultimoResultado.faultString) && (
                <li className="bg-gray-50 dark:bg-gray-900/40 rounded-lg px-3 py-2 col-span-2">
                  <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest">faultCode / faultString (SOAP Fault de AFIP)</span>
                  <span className="font-mono text-gray-700 dark:text-gray-200 break-words">{ultimoResultado.faultCode || "—"} — {ultimoResultado.faultString || "—"}</span>
                </li>
              )}
            </ul>
            <div>
              <span className="block text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-1">Respuesta cruda de AFIP (raw / Fault)</span>
              <pre className="text-[11px] bg-gray-900 text-gray-300 rounded-lg p-3 overflow-auto max-h-[50vh] whitespace-pre-wrap break-words">
                {ultimoResultado.error ? ultimoResultado.error : JSON.stringify(ultimoResultado.raw, null, 2) || "(vacío)"}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </>
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
