import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLink, faPlus, faXmark, faSpinner, faCheck, faEnvelope, faCalendarAlt, faLayerGroup, faTrash } from "@fortawesome/free-solid-svg-icons";
import { ViewType } from "../types";
import SectionHeader from "../components/SectionHeader";
import AvisoNovedades from "../components/AvisoNovedades";
import { useNovedades } from "../hooks/useNovedades";
import { NOVEDAD_REGISTRO } from "../../../../api/personnel";
import { registroLinksAPI, DetalleRegistrado, Registrado } from "../../../../api/registroLinks";
import { sweetAlert } from "../utils/sweetAlert";
import { copiarMiLinkDeRegistro } from "../utils/portapapeles";
import { resumenSinBanco } from "../../../../utils/bancarios";

interface RegistroProps {
  onNavigate: (view: ViewType) => void;
}

/**
 * ═══════════════════════════════════════════════════════════════════════
 * REGISTRO: EL LINK PARA QUE LA GENTE SE REGISTRE SOLA, Y QUIÉNES LO HICIERON
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Parecida a Contratación, pero el «+» no abre un formulario: copia al portapapeles el link de registro,
 * listo para pegar en un grupo de WhatsApp. El link SÓLO registra al usuario —no lo asigna a ningún
 * proyecto, área ni turno—, dura lo que configure la administración y, vencido, el server genera uno
 * nuevo la próxima vez que se pide: no hay que renovarlo a mano.
 *
 * Quien se registra queda asociado a quien compartió el link y aparece abajo en «Registrados». El
 * coordinador ve los de su link; el supervisor, además, los de sus coordinadores, para tener el control
 * de quién entra por cada uno. Se puede ver cómo se registró, pero no editarlo: los datos son de esa persona.
 */

type FiltroRegistrados = "todos" | "mios" | "equipo";

const fecha = (d?: string) => (d ? new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—");


export default function Registro({ onNavigate }: RegistroProps) {
  const [registrados, setRegistrados] = useState<Registrado[] | null>(null);
  const [error, setError] = useState("");
  const [generando, setGenerando] = useState(false);
  const [detalle, setDetalle] = useState<DetalleRegistrado | null>(null);
  const [cargandoDetalle, setCargandoDetalle] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<FiltroRegistrados>("todos");
  /** Qué registro se está borrando: la fila se apaga mientras el server contesta. */
  const [borrando, setBorrando] = useState<string | null>(null);
  /** Cuáles son nuevos (hay un aviso sin leer que habla de ellos) y cómo marcarlos leídos. */
  const novedades = useNovedades([NOVEDAD_REGISTRO]);

  // Sólo un supervisor recibe registrados de otros links: al coordinador no se le muestra el filtro.
  const cuentas = { todos: registrados?.length || 0, mios: (registrados || []).filter((r) => r.esMio).length, equipo: (registrados || []).filter((r) => !r.esMio).length };
  const hayDeEquipo = cuentas.equipo > 0;
  const visibles = (registrados || []).filter((r) => filtro === "todos" || (filtro === "mios" ? r.esMio : !r.esMio));

  useEffect(() => {
    let cancelado = false;
    registroLinksAPI
      .misRegistrados()
      .then((rs) => !cancelado && setRegistrados(rs))
      .catch((e) => !cancelado && setError(e?.response?.data?.error || "No se pudo cargar. Probá de nuevo en un momento."));
    return () => {
      cancelado = true;
    };
  }, []);

  /** Pide (o genera) mi link de registro y lo copia listo para pegar. */
  const compartir = async () => {
    setGenerando(true);
    try {
      await copiarMiLinkDeRegistro();
    } finally {
      setGenerando(false);
    }
  };

  const verDetalle = async (id: string) => {
    setCargandoDetalle(id);
    try {
      setDetalle(await registroLinksAPI.detalleRegistrado(id));
      // Abrir el detalle ES mirarlo: el aviso de ESE registro queda leído, los demás no se tocan.
      void novedades.marcarLeido(id);
    } catch (e: any) {
      sweetAlert.error("No se pudo abrir", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setCargandoDetalle(null);
    }
  };

  /*
    BORRAR UN REGISTRO, con confirmación y con el nombre adentro.

    Se pide confirmación porque no se puede deshacer: la persona tendría que registrarse de nuevo con
    el link. Lo que el server no deja borrar —ya tiene contrato, proyecto o una solicitud en curso—
    vuelve con su explicación, y se muestra tal cual: dice qué hacer antes de poder borrarlo.
  */
  const borrarRegistro = async (r: Registrado) => {
    const c: any = await sweetAlert.confirm("¿Borrar este registro?", `Se borra la ficha de ${r.nombre} y sale de la lista. Si hace falta, tendrá que registrarse de nuevo con el link.`, "Borrar", "Cancelar");
    if (!(c === true || c?.isConfirmed)) return;
    setBorrando(r._id);
    try {
      await registroLinksAPI.borrarRegistrado(r._id);
      setRegistrados((prev) => (prev || []).filter((x) => x._id !== r._id));
      sweetAlert.success("Registro borrado", `${r.nombre} salió de la lista.`);
    } catch (e: any) {
      sweetAlert.error("No se pudo borrar", e?.response?.data?.error || "Probá de nuevo en un momento.");
    } finally {
      setBorrando(null);
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
      <SectionHeader
        icon={faLink}
        titulo="Registro"
        onBack={() => onNavigate("home")}
        info={"Con el + copiás tu link de registro para compartirlo, por ejemplo en un grupo de WhatsApp. Quien lo abre carga sus datos y queda registrado.\n\nEl link tiene vencimiento y, cuando vence, se renueva solo la próxima vez que tocás el +. Abajo ves quiénes se registraron con tu link y, si coordinás, también con los links de tus supervisores. Podés ver sus datos, pero no editarlos."}
      />

      <div className="px-4 pt-4">
        <AvisoNovedades tipos={[NOVEDAD_REGISTRO]} texto={(n) => (n === 1 ? "1 registro nuevo" : `${n} registros nuevos`)} />
        <h3 className="mb-1 text-lg font-bold">Registrados</h3>
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">{hayDeEquipo ? "Personas que se registraron con tu link o con los de tus supervisores." : "Personas que se registraron con tu link."} Tocá una para ver cómo se registró. Con el + copiás el link para compartir.</p>

        {hayDeEquipo && (
          <div className="mb-4 grid grid-cols-3 gap-1 rounded-xl border border-slate-200 p-1 dark:border-slate-700">
            {(
              [
                ["todos", "Todos"],
                ["mios", "Míos"],
                ["equipo", "Supervisores"],
              ] as const
            ).map(([id, label]) => (
              <button key={id} onClick={() => setFiltro(id)} className={`rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors ${filtro === id ? "bg-blue-600 text-white" : "text-slate-600 dark:text-slate-300"}`}>
                {label} <span className="opacity-70">{cuentas[id]}</span>
              </button>
            ))}
          </div>
        )}

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
            <p className="text-sm text-slate-500 dark:text-slate-400">Todavía nadie se registró con tu link. Tocá el + para copiarlo.</p>
          </div>
        ) : visibles.length === 0 ? (
          <p className="rounded-xl border p-6 text-center text-sm text-slate-500 dark:border-slate-700">{filtro === "mios" ? "Todavía nadie se registró con tu link." : "Todavía nadie se registró con los links de tus supervisores."}</p>
        ) : (
          <div className="space-y-3">
            {visibles.map((r) => (
              // Contenedor: el contenido abre el detalle y el tacho borra. Dos botones, no uno adentro del otro.
              <div key={r._id} className={`relative w-full rounded-xl border bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900/70 ${borrando === r._id ? "opacity-50" : ""}`}>
              <button onClick={() => verDetalle(r._id)} disabled={borrando === r._id} className="w-full text-left transition-opacity active:opacity-70">
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
                    <span className="flex shrink-0 items-center gap-1">
                      {r.validadoEnArca && <span className="rounded bg-green-100 px-2 py-0.5 text-[10px] font-bold uppercase text-green-700 dark:bg-green-900/30 dark:text-green-400">Validado ARCA</span>}
                    </span>
                  )}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-slate-100 pr-10 pt-2 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <span className="flex items-center gap-1.5">
                    <FontAwesomeIcon icon={faCalendarAlt} className="h-3 w-3 opacity-70" /> {fecha(r.registradoAt)}
                  </span>
                  <span className={`flex items-center gap-1.5 ${r.esMio ? "" : "font-semibold text-amber-600 dark:text-amber-400"}`}>
                    <FontAwesomeIcon icon={faLink} className="h-3 w-3 opacity-70" /> {r.esMio ? "Tu link" : `Link de ${r.compartidoPor || "un supervisor"}`}
                  </span>
                  {/* Sólo registros de links viejos, de cuando el link llevaba proyecto/área/turno. */}
                  {r.proyecto && (
                    <span className="flex items-center gap-1.5">
                      <FontAwesomeIcon icon={faLayerGroup} className="h-3 w-3 opacity-70" /> {[r.proyecto, r.area, r.turno].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </div>
              </button>

              {/*
                BORRAR EL REGISTRO.

                Una prueba, un duplicado o alguien que al final no entra quedaban en la lista para
                siempre: sacarlos era tarea de administración. El server sólo lo deja mientras la
                persona no tenga contrato, proyecto ni una solicitud en curso, y si no, dice por qué.
              */}
              {/*
                «NUEVO», y el botón para marcar leído SÓLO este.

                El banner de arriba marca todo; acá se marca de a uno, que es lo que hace falta cuando
                entraron tres registros y uno se revisa ahora y los otros después.
              */}
              {novedades.esNuevo(r._id) && (
                <button type="button" onClick={() => void novedades.marcarLeido(r._id)} title="Marcar este registro como leído" className="absolute bottom-3 right-12 flex items-center gap-1.5 rounded-lg border border-orange-300 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-orange-700 active:scale-95 dark:border-orange-800 dark:text-orange-300">
                  <FontAwesomeIcon icon={faCheck} className="h-2.5 w-2.5" />
                  Nuevo
                </button>
              )}

              <button
                type="button"
                onClick={() => void borrarRegistro(r)}
                disabled={borrando === r._id}
                aria-label={`Borrar el registro de ${r.nombre}`}
                title="Borrar el registro"
                className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-400 transition-colors active:scale-95 disabled:opacity-50 dark:border-slate-700 dark:text-slate-500"
              >
                <FontAwesomeIcon icon={borrando === r._id ? faSpinner : faTrash} className={`h-3.5 w-3.5 ${borrando === r._id ? "animate-spin" : ""}`} />
              </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* + : copiar el link */}
      <div className="pointer-events-none fixed bottom-24 left-1/2 z-10 flex w-full -translate-x-1/2 justify-end px-6 xl:w-1/2">
        <button
          onClick={compartir}
          disabled={generando}
          className="pointer-events-auto flex h-14 w-14 items-center justify-center rounded-full bg-blue-600 text-white shadow-xl transition-transform hover:scale-105 hover:bg-blue-700 active:scale-95 disabled:opacity-50"
          title="Copiar link de registro"
        >
          <FontAwesomeIcon icon={generando ? faSpinner : faPlus} className={`h-6 w-6 ${generando ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* CÓMO SE REGISTRÓ: sólo lectura */}
      {detalle && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setDetalle(null)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-slate-900 dark:text-slate-100">
                  {detalle.personales.nombre} {detalle.personales.apellido}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">Se registró el {fecha(detalle.registradoAt)}</p>
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
                {detalle.bancarios.tipoEntidad === "sin_banco" || detalle.bancarios.solicitaCreacionCuenta ? (
                  <p className="py-1.5 text-sm text-slate-700 dark:text-slate-300">No tiene banco. {resumenSinBanco(detalle.bancarios) || ""}</p>
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
