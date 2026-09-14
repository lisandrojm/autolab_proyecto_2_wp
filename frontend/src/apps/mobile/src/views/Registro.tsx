import { useEffect, useMemo, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faArrowLeft, faLink, faPlus, faXmark, faSpinner, faCheck, faEnvelope, faCalendarAlt, faLayerGroup, faCopy } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import { useAuthStore } from "../../../../stores/authStore";
import { useProfile } from "../hooks/useProfile";
import { projectsAPI, Project } from "../../../../api/projects";
import { shiftsAPI, Shift } from "../../../../api/shifts";
import { registroLinksAPI, buildRegistroUrl, DetalleRegistrado, Registrado } from "../../../../api/registroLinks";
import { sweetAlert } from "../utils/sweetAlert";

interface RegistroProps {
  onNavigate: (view: ViewType) => void;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * REGISTRO: EL LINK PARA QUE LA GENTE SE REGISTRE SOLA, Y QUIÉNES LO HICIERON
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Parecida a Contratación, pero el «+» no abre un formulario: copia al portapapeles el link de registro
 * de un área y turno, con su vencimiento, listo para pegar en un grupo de WhatsApp. El link dura 7 días
 * y, vencido, el server genera uno nuevo la próxima vez que se pide: no hay que renovarlo a mano.
 *
 * Quien se registra queda asociado a ese proyecto, área y turno y a quien lo invitó, y aparece abajo en
 * «Registrados». Se puede ver cómo se registró, pero no editarlo: los datos son de esa persona.
 *
 * Qué combinaciones se ofrecen: las que coordina, o todas las de los proyectos que supervisa (mismo
 * criterio que Mis equipos). El server vuelve a validarlo al generar el link.
 */

interface Combinacion {
  projectId: string;
  proyecto: string;
  areaId: string;
  area: string;
  shiftId: string;
  turno: string;
  orden: string;
}

const idDe = (x: any): string => (x && typeof x === "object" ? String(x._id || x.id || "") : String(x || ""));
const fecha = (d?: string) => (d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");

/** Copia al portapapeles con respaldo para navegadores sin `navigator.clipboard` (http, webviews viejos). */
const copiar = async (texto: string): Promise<boolean> => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    /* sigue con el respaldo */
  }
  try {
    const area = document.createElement("textarea");
    area.value = texto;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
};

export default function Registro({ onNavigate }: RegistroProps) {
  const { user } = useAuthStore();
  const { profile } = useProfile();

  const [proyectos, setProyectos] = useState<Project[] | null>(null);
  const [turnos, setTurnos] = useState<Shift[]>([]);
  const [registrados, setRegistrados] = useState<Registrado[] | null>(null);
  const [error, setError] = useState("");
  const [selectorAbierto, setSelectorAbierto] = useState(false);
  const [generando, setGenerando] = useState<string | null>(null);
  const [detalle, setDetalle] = useState<DetalleRegistrado | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    Promise.all([projectsAPI.listAll(), shiftsAPI.getAll(), registroLinksAPI.misRegistrados()])
      .then(([ps, ss, rs]) => {
        if (cancelado) return;
        setProyectos(ps);
        setTurnos(ss);
        setRegistrados(rs);
      })
      .catch((e) => !cancelado && setError(e?.response?.data?.error || "No se pudo cargar. Probá de nuevo en un momento."));
    return () => {
      cancelado = true;
    };
  }, []);

  // Quién soy, para reconocer mis coordinaciones y los proyectos que superviso (igual que Mis equipos).
  const misIds = useMemo(() => new Set([(user as any)?.id, (user as any)?._id, profile?.userId, profile?._id].filter(Boolean).map(String)), [user, profile]);
  const miIdFrame = (profile as any)?.metadata?.id ?? (user as any)?.metadata?.id;

  const combinaciones = useMemo<Combinacion[]>(() => {
    if (!proyectos) return [];
    const turnoPorId = new Map(turnos.map((s) => [String(s._id), s]));
    const res: Combinacion[] = [];
    for (const p of proyectos) {
      const supervisa = miIdFrame != null && p.metadata?.responsableId != null && String(p.metadata.responsableId) === String(miIdFrame);
      const pares = supervisa
        ? (p.areasConfig || []).flatMap((ac: any) => (ac.shiftIds || []).map((s: any) => ({ area: ac.areaId, turno: s })))
        : (p.coordinatorAssignments || []).filter((a: any) => misIds.has(idDe(a.userId))).map((a: any) => ({ area: a.areaId, turno: a.shiftId }));
      for (const { area, turno } of pares) {
        const areaId = idDe(area);
        const shiftId = idDe(turno);
        if (!areaId || !shiftId || res.some((c) => c.projectId === p._id && c.areaId === areaId && c.shiftId === shiftId)) continue;
        const t = turnoPorId.get(shiftId);
        res.push({
          projectId: p._id,
          proyecto: p.name,
          areaId,
          area: (area && typeof area === "object" && area.name) || "Área",
          shiftId,
          turno: t?.name || (turno && typeof turno === "object" && turno.name) || "Turno",
          orden: t?.startTime || "99:99",
        });
      }
    }
    return res.sort((a, b) => a.proyecto.localeCompare(b.proyecto) || a.area.localeCompare(b.area) || a.orden.localeCompare(b.orden));
  }, [proyectos, turnos, misIds, miIdFrame]);

  /** Pide (o genera) el link de esa combinación y lo copia listo para pegar. */
  const compartir = async (c: Combinacion) => {
    const clave = `${c.projectId}::${c.areaId}::${c.shiftId}`;
    setGenerando(clave);
    try {
      const link = await registroLinksAPI.miLink(c.projectId, c.areaId, c.shiftId);
      const url = buildRegistroUrl(link.token);
      const dias = link.diasRestantes === 1 ? "1 día" : `${link.diasRestantes} días`;
      const mensaje = `Hola! Para trabajar en ${c.proyecto} (${c.area} · ${c.turno}) registrate acá:\n${url}\n\nEl link vence el ${fecha(link.expiresAt)} (quedan ${dias}).`;
      const ok = await copiar(mensaje);
      setSelectorAbierto(false);
      if (ok) await sweetAlert.success("Link copiado", `Pegalo en el grupo de WhatsApp o donde corresponda.\n\n${c.area} · ${c.turno} — vence el ${fecha(link.expiresAt)} (quedan ${dias}).`);
      else await sweetAlert.warning("No se pudo copiar", `Copialo a mano:\n\n${url}`);
    } catch (e: any) {
      sweetAlert.error("No se pudo generar el link", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setGenerando(null);
    }
  };

  const abrirMas = () => {
    if (combinaciones.length === 1) compartir(combinaciones[0]);
    else setSelectorAbierto(true);
  };

  const verDetalle = async (id: string) => {
    setCargandoDetalle(id);
    try {
      setDetalle(await registroLinksAPI.detalleRegistrado(id));
    } catch (e: any) {
      sweetAlert.error("No se pudo abrir", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setCargandoDetalle(null);
    }
  };

  const dato = (label: string, valor: any) =>
    valor ? (
      <div className="flex justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
        <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
        <span className="text-right text-sm font-medium text-slate-900 dark:text-slate-100">{String(valor)}</span>
      </div>
    ) : null;

  return (
    <div className="flex-1 pb-24">
      {/* HEADER */}
      <div className="sticky top-0 z-30 border-b border-slate-800 bg-slate-50/90 px-4 py-4 backdrop-blur-sm dark:bg-slate-900/90">
        <div className="flex items-center gap-3">
          <button onClick={() => onNavigate("home")} className="flex h-10 w-10 items-center justify-center rounded transition-colors hover:bg-slate-200 dark:hover:bg-slate-800">
            <FontAwesomeIcon icon={faArrowLeft} className="h-5 w-5 text-slate-900 dark:text-slate-100" />
          </button>
          <div className="flex items-center gap-2">
            <FontAwesomeIcon icon={faLink} className="h-5 w-5 text-slate-900 dark:text-slate-100" />
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Registro</h1>
          </div>
        </div>
      </div>

      <div className="px-4 pt-4">
        <h3 className="mb-1 text-lg font-bold">Registrados</h3>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">Personas que se registraron con tus links. Tocá una para ver cómo se registró. Con el + copiás un link nuevo.</p>

        {error ? (
          <p className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">{error}</p>
        ) : registrados === null ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl border bg-white dark:border-slate-800 dark:bg-slate-900/70" />
            ))}
          </div>
        ) : registrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border bg-slate-50 p-10 text-center dark:border-slate-700 dark:bg-slate-800/50">
            <FontAwesomeIcon icon={faLink} className="mb-3 h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Todavía nadie se registró con tus links. Tocá el + para copiar uno.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {registrados.map((r) => (
              <button key={r._id} onClick={() => verDetalle(r._id)} className="w-full rounded-xl border bg-white p-4 text-left shadow-sm transition-colors active:bg-slate-50 dark:border-slate-700 dark:bg-slate-900/70 dark:active:bg-slate-800">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h4 className="truncate font-bold text-slate-900 dark:text-slate-100">{r.nombre}</h4>
                    <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-slate-500 dark:text-slate-400">
                      <FontAwesomeIcon icon={faEnvelope} className="h-3 w-3 opacity-70" />
                      {r.email}
                    </p>
                  </div>
                  {cargandoDetalle === r._id ? (
                    <FontAwesomeIcon icon={faSpinner} className="animate-spin text-slate-400" />
                  ) : (
                    r.validadoEnArca && <span className="shrink-0 rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700 dark:bg-green-900/30 dark:text-green-400">Validado ARCA</span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faCalendarAlt} className="h-3 w-3 opacity-70" /> {fecha(r.registradoAt)}
                  </span>
                  {r.proyecto && (
                    <span className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 opacity-70" /> {[r.proyecto, r.area, r.turno].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* + : copiar un link */}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-10 flex w-full -translate-x-1/2 justify-end px-6 xl:w-1/2">
        <button
          onClick={abrirMas}
          disabled={proyectos === null || combinaciones.length === 0 || !!generando}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition-transform hover:scale-105 hover:bg-blue-700 active:scale-95 disabled:opacity-50"
          title={combinaciones.length === 0 && proyectos !== null ? "No tenés áreas y turnos a cargo para invitar" : "Copiar link de registro"}
        >
          <FontAwesomeIcon icon={generando ? faSpinner : faPlus} className={`h-6 w-6 ${generando ? "animate-spin" : ""}`} />
        </button>
      </div>
      {proyectos !== null && combinaciones.length === 0 && !error && <p className="px-4 pt-4 text-center text-xs text-amber-600 dark:text-amber-400">No tenés áreas y turnos a cargo: el link se genera para un área y turno que coordinás o para un proyecto que supervisás.</p>}

      {/* ELEGIR PARA DÓNDE ES EL LINK */}
      {selectorAbierto && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onClick={() => setSelectorAbierto(false)}>
          <div className="flex max-h-[80vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 xl:w-1/2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div>
                <p className="text-base font-bold text-slate-900 dark:text-slate-100">¿Para dónde es el link?</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Quien se registre queda en ese proyecto, área y turno. Vence a los 7 días.</p>
              </div>
              <button onClick={() => setSelectorAbierto(false)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded text-slate-500">
                <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-1.5 overflow-y-auto p-3">
              {combinaciones.map((c) => {
                const clave = `${c.projectId}::${c.areaId}::${c.shiftId}`;
                return (
                  <button key={clave} onClick={() => compartir(c)} disabled={!!generando} className="flex w-full items-center gap-3 rounded-xl border border-slate-200 px-3 py-3 text-left disabled:opacity-60 dark:border-slate-700">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-slate-900 dark:text-slate-100">
                        {c.area} · {c.turno}
                      </span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{c.proyecto}</span>
                    </span>
                    <FontAwesomeIcon icon={generando === clave ? faSpinner : faCopy} className={`text-blue-600 ${generando === clave ? "animate-spin" : ""}`} />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* CÓMO SE REGISTRÓ: sólo lectura */}
      {detalle && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50" onClick={() => setDetalle(null)}>
          <div className="flex max-h-[85vh] w-full flex-col rounded-t-2xl bg-white shadow-xl dark:bg-slate-900 xl:w-1/2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
                  {detalle.personales.nombre} {detalle.personales.apellido}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Se registró el {fecha(detalle.registradoAt)}
                  {detalle.proyecto ? ` · ${[detalle.proyecto, detalle.area, detalle.turno].filter(Boolean).join(" · ")}` : ""}
                </p>
              </div>
              <button onClick={() => setDetalle(null)} aria-label="Cerrar" className="flex h-9 w-9 items-center justify-center rounded text-slate-500">
                <FontAwesomeIcon icon={faXmark} className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              <p className="rounded-lg bg-slate-100 px-3 py-2 text-[11px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">Sólo lectura: son los datos que cargó la persona al registrarse.</p>
              <section>
                <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Personales</h4>
                {dato("Email", detalle.personales.email)}
                {dato("Teléfono", detalle.personales.telefono)}
                {dato("CUIT / CUIL", detalle.personales.sinCuit ? "No tiene (extranjero)" : detalle.personales.cuit)}
                {detalle.personales.validadoEnArca && (
                  <p className="flex items-center gap-1.5 py-1 text-xs text-green-600 dark:text-green-400">
                    <FontAwesomeIcon icon={faCheck} /> Nombre validado con ARCA
                  </p>
                )}
                {dato(detalle.personales.tipoDocumento || "Documento", detalle.personales.documento)}
                {dato("Fecha de nacimiento", detalle.personales.fechaNac ? fecha(detalle.personales.fechaNac) : null)}
                {dato("Nacionalidad", detalle.personales.nacionalidad)}
                {dato("Género", detalle.personales.genero)}
                {dato("Estado civil", detalle.personales.estadoCivil)}
                {dato("Nivel de estudio", detalle.personales.nivelEstudio)}
                {dato("Roles empresa", (detalle.personales.rolesEmpresa || []).join(", "))}
              </section>
              <section>
                <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Domicilio</h4>
                {dato("País", detalle.domicilio.pais)}
                {dato("Localidad", detalle.domicilio.localidad)}
                {dato("Calle", [detalle.domicilio.calle, detalle.domicilio.altura].filter(Boolean).join(" "))}
                {dato("Piso / Depto", detalle.domicilio.pisoDepto)}
                {dato("Código postal", detalle.domicilio.codigoPostal)}
              </section>
              <section>
                <h4 className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Bancarios</h4>
                {detalle.bancarios.solicitaCreacionCuenta ? (
                  <p className="py-1.5 text-sm text-slate-700 dark:text-slate-300">No tiene cuenta: pidió que se la abran.</p>
                ) : (
                  <>
                    {dato("Entidad", detalle.bancarios.banco)}
                    {dato("Tipo de cuenta", detalle.bancarios.tipoDeCuenta)}
                    {dato("CBU / CVU", detalle.bancarios.cbu)}
                    {dato("Alias", detalle.bancarios.alias)}
                  </>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
