import React, { useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowUpRightFromSquare, faSpinner, faCheck, faTriangleExclamation, faLandmark, faBug, faCircleInfo, faTrash } from "@fortawesome/free-solid-svg-icons";
import { ContractOverviewRow } from "../../api/users";
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

/** CUIT/CUIL formateado NN-NNNNNNNN-N (vacío si no tiene 11 dígitos). Formatear NO valida: ver `cuitEsValido`. */
export const fmtCuit = (raw?: string): string => {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length === 11 ? `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}` : "";
};

/** Texto único para la gente sin CUIT/CUIL argentino (extranjeros): mismo cartel en toda la app. */
export const SIN_CUIT_LABEL = "No posee CUIT";

/**
 * ¿Esta persona NO tiene CUIT/CUIL argentino? Cuenta como "sin CUIT" tanto el campo vacío como los
 * placeholders que quedaron cargados en su momento (todos ceros, o cualquier repetición del mismo
 * dígito), que no identifican a nadie. Un CUIT mal tipeado NO entra acá: eso es un dato a corregir,
 * no una persona sin CUIT.
 */
export const noPoseeCuit = (raw?: string): boolean => {
  const d = String(raw || "").replace(/\D/g, "");
  return d.length === 0 || /^(\d)\1*$/.test(d);
};

/**
 * Cómo mostrar el CUIT en pantalla: formateado si es válido, "No posee CUIT" si la persona no tiene,
 * y un guión si hay algo cargado pero no es un CUIT reconocible (dato a revisar).
 */
export const cuitDisplay = (raw?: string): string => fmtCuit(raw) || (noPoseeCuit(raw) ? SIN_CUIT_LABEL : "—");

/** Prefijos que usa AFIP: 20/23/24/25/26/27 personas físicas, 30/33/34 jurídicas. */
const PREFIJOS_CUIT = ["20", "23", "24", "25", "26", "27", "30", "33", "34"];

/**
 * ¿El CUIT es realmente un CUIT? Tener 11 dígitos no alcanza: había personas cargadas con
 * `00000000000`, que pasaban como "completo" y se mandaban igual a consultar al Padrón, donde AFIP
 * devolvía error. Se valida prefijo + dígito verificador (módulo 11), que además atrapa tipeos.
 */
export const cuitEsValido = (raw?: string): boolean => {
  const d = String(raw || "").replace(/\D/g, "");
  if (d.length !== 11) return false;
  if (!PREFIJOS_CUIT.includes(d.slice(0, 2))) return false;
  if (/^(\d)\1{10}$/.test(d)) return false; // 00000000000, 11111111111, etc.
  const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const suma = pesos.reduce((acc, p, i) => acc + p * Number(d[i]), 0);
  const resto = suma % 11;
  const verificador = resto === 0 ? 0 : resto === 1 ? 9 : 11 - resto;
  return verificador === Number(d[10]);
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

/** Badge SOLO del estado en el Padrón de AFIP/ARCA (Activo/Inactivo/Desconocido/Sin consultar) —
 *  independiente de si ya quedó archivado en Dropbox (ver `DropboxBadge`). */
export const ArcaBadge: React.FC<{ row: ContractOverviewRow }> = ({ row }) => {
  const estado = row.constanciaAfipEstado;
  const cfg =
    estado === "activo"
      ? { clase: "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800", icono: faCheck, texto: "Activo" }
      : estado === "inactivo"
        ? { clase: "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400 border-red-200 dark:border-red-800", icono: faTriangleExclamation, texto: "Inactivo" }
        : estado === "desconocido"
          ? { clase: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800", icono: faTriangleExclamation, texto: "Desconocido" }
          : { clase: "bg-gray-50 text-gray-500 dark:bg-gray-800 dark:text-gray-400 border-gray-200 dark:border-gray-700", icono: faTriangleExclamation, texto: "Sin consultar" };
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${cfg.clase}`} title={row.constanciaAfipConsultadaAt ? `Consultado ${fmtFechaHora(row.constanciaAfipConsultadaAt)}` : "Todavía no se consultó al Padrón de AFIP"}>
      <FontAwesomeIcon icon={cfg.icono} className="h-2.5 w-2.5" />
      {cfg.texto}
    </span>
  );
};

/** Badge SOLO de si la constancia quedó archivada en Dropbox — independiente del estado en AFIP
 *  (ver `ArcaBadge`). Recién con esto el trámite se considera terminado. */
export const DropboxBadge: React.FC<{ row: ContractOverviewRow; onEliminado?: () => void }> = ({ row, onEliminado }) => {
  const guardado = !!row.constanciaAfipDropboxSubidaAt;
  const [borrando, setBorrando] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const eliminar = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const res = await sweetAlert.confirm(
      "¿Eliminar el archivo de Dropbox?",
      "Se borra el JSON de la validación y el contrato deja de estar listo para avanzar en la próxima sincronización. La consulta a AFIP no se pierde: se puede volver a validar.",
      "Sí, eliminar",
    );
    if (!res.isConfirmed) return;
    setBorrando(true);
    try {
      const r = await afipAPI.eliminarConstanciaArchivada({ projectId: row.projectId, userId: row.userId, contractIndex: row.contractIndex });
      if (r.aviso) sweetAlert.warning("Se quitó la marca", r.aviso);
      else sweetAlert.success("Eliminado", "El archivo se borró de Dropbox.");
      onEliminado?.();
    } catch (err: any) {
      sweetAlert.error("Error", err?.response?.data?.error || "No se pudo eliminar el archivo.");
    } finally {
      setBorrando(false);
    }
  };

  return (
    <span className="inline-flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${
          guardado
            ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 border-green-200 dark:border-green-800"
            : "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-200 dark:border-amber-800"
        }`}
        title={guardado ? `Archivado ${fmtFechaHora(row.constanciaAfipDropboxSubidaAt)}` : "Todavía no se archivó en Dropbox"}
      >
        <FontAwesomeIcon icon={guardado ? faCheck : faTriangleExclamation} className="h-2.5 w-2.5" />
        {guardado ? "Guardado" : "Sin guardar"}
      </span>
      {guardado && (
        <>
          {/* El archivo en Dropbox es lo que dispara el avance de bandeja: conviene decir qué va a
              pasar, porque no ocurre al instante sino en la próxima sincronización. */}
          <button type="button" onClick={() => setInfoOpen(true)} title="Qué pasa al sincronizar" className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 shrink-0">
            <FontAwesomeIcon icon={faCircleInfo} className="h-3 w-3" />
          </button>
          {onEliminado && (
            <button
              type="button"
              onClick={eliminar}
              disabled={borrando}
              title="Eliminar el archivo de Dropbox para que NO avance de bandeja"
              className="p-1 rounded text-gray-600 dark:text-gray-300 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-600 dark:hover:text-red-400 transition-colors disabled:opacity-50 shrink-0"
            >
              <FontAwesomeIcon icon={borrando ? faSpinner : faTrash} spin={borrando} className="h-3 w-3" />
            </button>
          )}
        </>
      )}

      {infoOpen && (
        <Modal isOpen={infoOpen} onClose={() => setInfoOpen(false)} title="Qué pasa en la próxima sincronización" size="sm" zIndex={80}>
          <div className="space-y-3 text-sm text-gray-600 dark:text-gray-300">
            <p>
              El CUIT dio <strong>Activo en AFIP</strong> y el resultado quedó <strong>archivado en Dropbox</strong>. Eso es exactamente lo que vigila el escaneo automático.
            </p>
            <p>
              En la próxima sincronización el contrato va a avanzar solo a <strong>Envío de documentación</strong> y va a pasar a verse en la bandeja <strong>Firma digital</strong>. No es inmediato:
              depende del intervalo configurado en <span className="font-mono text-xs">Configuración → Dropbox | Documentos</span> (por defecto, cada 20 minutos).
            </p>
            <p className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300">
              <FontAwesomeIcon icon={faTriangleExclamation} className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              <span>Si no querés que avance (se validó por error, o hay que rehacerlo), eliminá el archivo con el tacho de al lado antes de que sincronice.</span>
            </p>
          </div>
        </Modal>
      )}
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
export const BotonArca: React.FC<{ cuit?: string; compacto?: boolean; label?: string }> = ({ cuit, compacto, label }) => {
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
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap transition-colors bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
    >
      <FontAwesomeIcon icon={faArrowUpRightFromSquare} className="h-2.5 w-2.5" />
      {label || (compacto ? "Verificar ARCA" : "Abrir en ARCA")}
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
  const pendientes = rows.filter((r) => constanciaPendiente(r) && cuitEsValido(r.cuit));

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
      title="Valida el estado de cada CUIT seleccionado (o todos los pendientes, si no hay selección) directo en el Padrón de AFIP, sin ir uno por uno"
      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold border transition-colors bg-blue-600 text-white border-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <FontAwesomeIcon icon={consultando ? faSpinner : faLandmark} spin={consultando} className="h-3 w-3" />
      {consultando ? "Validando..." : `Validar ARCA Masivo (${pendientes.length})`}
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
    // Consultar un CUIT que no es un CUIT solo devuelve un error de AFIP y ensucia los logs.
    if (!cuitEsValido(row.cuit)) {
      sweetAlert.error("CUIT inválido", `${cuit} no es un CUIT/CUIL válido (no pasa el dígito verificador). Corregilo en los datos personales de la persona antes de consultar a ARCA.`);
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
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[11px] font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
      >
        <FontAwesomeIcon icon={consultando ? faSpinner : faLandmark} spin={consultando} className="h-3 w-3" />
        {consultando ? "Validando..." : compacto ? "Validar ARCA" : "Validar CUIT"}
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
