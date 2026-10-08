import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { CustomDatePicker } from "../CustomDatePicker";
import { CustomMultiDatePicker } from "../CustomMultiDatePicker";
import { Equipo, Plantilla } from "../../../../../api/plantillasEquipo";
import { CatalogosContratacion, OpcionAreaTurno } from "./useCatalogosContratacion";
import { usePlantilla, usePlantillas } from "./contexto";
import { Pantalla, Vacio } from "./Pantalla";
import { EstadoContratar, faltaDe, formaDe, guardarEstado, leerEstado, nuevaClave } from "./estadoContratar";
import { estadoDe, nombreTurno, rutas } from "./equipoUtil";
import { ChipTurno, fechaCorta, Pill, textoHorario } from "./comun";
import { PASOS_CONTRATAR } from "./Pasos";
import { cambiosDeContrato } from "./Condiciones";
import { CampoTipoContrato, ModalTipoContrato } from "../contratacion/SelectorTipoContrato";

/*
  CONTRATAR · PASO 1 DE 3 · CONTRATO Y FECHAS.

  Arriba, EL TIPO DE CONTRATO, uno para todos. Se elige acá y no al armar el equipo: medido en
  producción, es el dato que más cambia entre una contratación y la siguiente (227 de 867 vínculos
  tuvieron más de uno), así que fijarlo en la plantilla era fijar justo lo que más cambia. Y hay que
  elegirlo PRIMERO porque de él depende qué fechas se piden: un «Jornada» se contrata por días sueltos
  en el calendario, un plazo fijo por desde/hasta. Quien necesite otro para una persona lo cambia en
  el paso 2, en su fila.

  Debajo, los equipos: los elegidos vienen tildados (desde un equipo, sólo ése; desde el grupo,
  todos) y cada uno lleva sus fechas, con atajos. Botón: «Siguiente».
*/

export default function ContratarFechas() {
  const { id = "" } = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const { catalogos, areasDe } = usePlantillas();
  const { plantilla: p, noEsta } = usePlantilla(id);
  const [estado, setEstado] = useState<EstadoContratar | null>(null);
  const [eligiendoContrato, setEligiendoContrato] = useState(false);

  // Lo guardado en la sesión; si se llegó desde un equipo (?equipos=), sólo ésos tildados.
  useEffect(() => {
    if (!p) return;
    const pedidos = (query.get("equipos") || "").split(",").filter(Boolean);
    const previo = leerEstado(id);
    const equipos: EstadoContratar["equipos"] = {};
    for (const e of p.equipos) {
      const f = previo?.equipos[e._id] || { incluido: true, fechas: [], desde: "", hasta: "" };
      equipos[e._id] = { ...f, incluido: pedidos.length ? pedidos.includes(e._id) : previo ? f.incluido : true };
    }
    /*
      El contrato general: el que ya venía en la sesión o, si no, el del equipo —si todos los incluidos
      tienen el mismo—. Es lo más probable, y así lo normal es un toque menos, no uno más.
    */
    const incluidos = p.equipos.filter((e) => equipos[e._id]?.incluido);
    const delEquipo = incluidos.length && incluidos.every((e) => e.condiciones?.contratoId && e.condiciones.contratoId === incluidos[0].condiciones?.contratoId) ? incluidos[0].condiciones! : null;
    setEstado({
      contratoId: previo?.contratoId || delEquipo?.contratoId || "",
      nombreContrato: previo?.nombreContrato || delEquipo?.nombreContrato || "",
      tipoImpositivo: previo?.tipoImpositivo || delEquipo?.tipoImpositivo || "",
      equipos,
      puntuales: previo?.puntuales || {},
      nombres: previo?.nombres || {},
      clave: previo?.clave || nuevaClave(),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p?._id]);
  useEffect(() => {
    if (estado) guardarEstado(id, estado);
  }, [id, estado]);

  const atras = rutas.grupo(id);
  if (noEsta) return <Pantalla titulo="Contratar" atras={atras}><Vacio texto="Este grupo ya no está." /></Pantalla>;
  if (!p || !estado) return <Pantalla titulo="Contratar" atras={atras} listo={false}><div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" /></Pantalla>;

  const cambiar = (equipoId: string, x: Partial<EstadoContratar["equipos"][string]>) => setEstado((s) => (s ? { ...s, equipos: { ...s.equipos, [equipoId]: { ...s.equipos[equipoId], ...x } } } : s));
  const incluidos = p.equipos.filter((e) => estado.equipos[e._id]?.incluido);
  const sinContrato = !estado.contratoId && catalogos.contratos.length > 0;
  const falta = sinContrato ? "Elegí el tipo de contrato" : incluidos.length === 0 ? "Elegí al menos un equipo" : incluidos.map((e) => faltaDe(p, e, estado.equipos[e._id], catalogos, estado)).find(Boolean) || "";
  const equipoQueFalta = incluidos.find((e) => faltaDe(p, e, estado.equipos[e._id], catalogos, estado));
  // Con su nombre y su trámite, como viajan siempre los tres (ver `cambiosDeContrato`).
  const elegirContrato = (contratoId: string) => {
    const c = cambiosDeContrato(catalogos, contratoId);
    setEstado((s) => (s ? { ...s, contratoId, nombreContrato: c.nombreContrato || "", tipoImpositivo: c.tipoImpositivo || "" } : s));
  };

  return (
    <Pantalla
      titulo="Contratar"
      contexto={p.nombre}
      atras={atras}
      boton={{
        texto: "Siguiente",
        onClick: () => navigate(rutas.personas(id)),
        deshabilitado: !!falta,
        motivo: falta,
        onMotivo: sinContrato ? () => document.getElementById("campo-contrato")?.scrollIntoView({ behavior: "smooth", block: "start" }) : equipoQueFalta ? () => document.getElementById(`equipo-${equipoQueFalta._id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }) : undefined,
      }}
      pasos={{ actual: 1, etiquetas: PASOS_CONTRATAR }}
    >
      {/* El mismo campo y la misma ventana que el alta individual: el nombre con su badge de trámite, y la lista con radio. */}
      <div id="campo-contrato" className="mb-5 scroll-mt-24">
        <CampoTipoContrato contratos={catalogos.contratos} contratoId={estado.contratoId} tramitePorContrato={catalogos.tramitePorContrato} estados={catalogos.estados} onAbrir={() => setEligiendoContrato(true)} />
      </div>
      <ModalTipoContrato abierto={eligiendoContrato} onCerrar={() => setEligiendoContrato(false)} contratos={catalogos.contratos} contratoId={estado.contratoId} tramitePorContrato={catalogos.tramitePorContrato} estados={catalogos.estados} onElegir={elegirContrato} />
      {p.equipos.length === 0 ? (
        <Vacio texto="Este grupo no tiene equipos." accion="Volver al grupo" onAccion={() => navigate(atras)} />
      ) : (
        <div className="space-y-3">
          {p.equipos.map((e) => (
            <TarjetaEquipo key={e._id} equipo={e} p={p} estado={estado} f={estado.equipos[e._id] || { incluido: false, fechas: [], desde: "", hasta: "" }} areas={areasDe(e.projectId)} catalogos={catalogos} onCambio={(x) => cambiar(e._id, x)} />
          ))}
        </div>
      )}
    </Pantalla>
  );
}

function TarjetaEquipo({ equipo, p, estado, f, areas, catalogos, onCambio }: { equipo: Equipo; p: Plantilla; estado: EstadoContratar; f: EstadoContratar["equipos"][string]; areas: OpcionAreaTurno[] | null; catalogos: CatalogosContratacion; onCambio: (x: Partial<EstadoContratar["equipos"][string]>) => void }) {
  const { conDias, conPeriodo, indeterminado } = formaDe(p, equipo, catalogos, estado);
  const est = estadoDe(p, equipo);
  const c = equipo.condiciones || {};
  return (
    <div id={`equipo-${equipo._id}`} className={`scroll-mt-20 rounded-xl border bg-white dark:bg-slate-800/70 ${f.incluido ? "border-slate-300 dark:border-slate-600" : "border-slate-200 opacity-70 dark:border-slate-700"}`}>
      <label className="flex min-h-[60px] cursor-pointer items-center gap-3 px-3 py-2">
        <input type="checkbox" checked={f.incluido} onChange={(ev) => onCambio({ incluido: ev.target.checked })} className="h-6 w-6 shrink-0 rounded" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-bold text-slate-900 dark:text-white">{equipo.nombre}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <ChipTurno inicio={c.inTime} texto={nombreTurno(areas, c.areaId, c.shiftId) || undefined} />
            <span className="text-xs text-slate-600 dark:text-slate-300">{textoHorario(c.inTime, c.outTime)}</span>
            {est.faltan > 0 ? <Pill tono="ambar">{`Faltan ${est.faltan}`}</Pill> : <Pill tono="verde">{`${est.total} personas`}</Pill>}
          </span>
        </span>
      </label>
      {f.incluido && (
        <div className="space-y-3 border-t border-slate-200 px-3 py-3 dark:border-slate-700">
          {conDias && (
            <>
              <CustomMultiDatePicker label="Días que trabajan" value={f.fechas} onChange={(d: string | string[]) => onCambio({ fechas: [...new Set(Array.isArray(d) ? d : d ? [d] : [])].sort() })} />
              {f.fechas.length > 0 && <p className="text-sm text-slate-800 dark:text-slate-100">{`${f.fechas.length} ${f.fechas.length === 1 ? "jornada" : "jornadas"}: ${f.fechas.map(fechaCorta).join(" · ")}`}</p>}
            </>
          )}
          {conPeriodo && (
            <div className="grid grid-cols-2 gap-3">
              <CustomDatePicker label="Desde" value={f.desde} onChange={(v: string) => onCambio({ desde: v })} />
              {indeterminado ? <p className="self-end pb-3 text-sm text-slate-700 dark:text-slate-200">Sin fecha de baja</p> : <CustomDatePicker label="Hasta" value={f.hasta} onChange={(v: string) => onCambio({ hasta: v })} />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

