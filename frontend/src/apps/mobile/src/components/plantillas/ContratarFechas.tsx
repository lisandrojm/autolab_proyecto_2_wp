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
import { ChipTurno, fechaCorta, fechaDeHoy, Pill, textoHorario } from "./comun";
import { Pasos } from "./Pasos";

/*
  CONTRATAR · PASO 1 DE 2 · EQUIPOS Y FECHAS. El mismo paso para uno o para varios equipos: los
  elegidos vienen tildados (desde un equipo, sólo ése; desde el grupo, todos). Cada equipo lleva sus
  días, con atajos. Botón: «Revisar N solicitudes».
*/

const NOMBRES_DIA = ["domingos", "lunes", "martes", "miércoles", "jueves", "viernes", "sábados"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** El próximo `dia` (0 = domingo) desde hoy (hoy incluido). */
const proximo = (dia: number) => {
  const d = new Date();
  d.setDate(d.getDate() + ((dia - d.getDay() + 7) % 7));
  return iso(d);
};

/** Todos los `dia` que quedan en este mes; si no queda ninguno, los del mes que viene. */
const todosDelMes = (dia: number): { fechas: string[]; mes: string } => {
  const hoy = new Date();
  for (const salto of [0, 1]) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() + salto, 1);
    const mes = d.getMonth();
    const fechas: string[] = [];
    for (; d.getMonth() === mes; d.setDate(d.getDate() + 1)) if (d.getDay() === dia && iso(d) >= fechaDeHoy()) fechas.push(iso(d));
    if (fechas.length) return { fechas, mes: MESES[mes] };
  }
  return { fechas: [], mes: "" };
};

export default function ContratarFechas() {
  const { id = "" } = useParams();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const { catalogos, areasDe } = usePlantillas();
  const { plantilla: p, noEsta } = usePlantilla(id);
  const [estado, setEstado] = useState<EstadoContratar | null>(null);
  const areas = areasDe(p?.projectId);

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
    setEstado({ equipos, comentarios: previo?.comentarios || {}, clave: previo?.clave || nuevaClave() });
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
  const solicitudes = incluidos.reduce((s, e) => s + estadoDe(p, e).total, 0);
  const falta = incluidos.length === 0 ? "Elegí al menos un equipo" : incluidos.map((e) => faltaDe(p, e, estado.equipos[e._id], catalogos)).find(Boolean) || "";
  const equipoQueFalta = incluidos.find((e) => faltaDe(p, e, estado.equipos[e._id], catalogos));

  return (
    <Pantalla
      titulo="Contratar"
      contexto={p.nombre}
      atras={atras}
      boton={{
        texto: `Revisar ${solicitudes} ${solicitudes === 1 ? "solicitud" : "solicitudes"}`,
        onClick: () => navigate(rutas.revision(id)),
        deshabilitado: !!falta,
        motivo: falta,
        onMotivo: equipoQueFalta ? () => document.getElementById(`equipo-${equipoQueFalta._id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }) : undefined,
        tono: "verde",
      }}
    >
      <Pasos actual={1} />
      {p.equipos.length === 0 ? (
        <Vacio texto="Este grupo no tiene equipos." accion="Volver al grupo" onAccion={() => navigate(atras)} />
      ) : (
        <div className="space-y-3">
          {p.equipos.map((e) => (
            <TarjetaEquipo key={e._id} equipo={e} p={p} f={estado.equipos[e._id] || { incluido: false, fechas: [], desde: "", hasta: "" }} areas={areas} catalogos={catalogos} onCambio={(x) => cambiar(e._id, x)} />
          ))}
        </div>
      )}
    </Pantalla>
  );
}

function TarjetaEquipo({ equipo, p, f, areas, catalogos, onCambio }: { equipo: Equipo; p: Plantilla; f: EstadoContratar["equipos"][string]; areas: OpcionAreaTurno[] | null; catalogos: CatalogosContratacion; onCambio: (x: Partial<EstadoContratar["equipos"][string]>) => void }) {
  const { conDias, conPeriodo, indeterminado } = formaDe(p, equipo, catalogos);
  const est = estadoDe(p, equipo);
  const c = equipo.condiciones || {};
  const diasAtajo = [...new Set([...(c.diasSemana?.length ? c.diasSemana : [6, 0])])].slice(0, 2);
  const sumar = (fechas: string[]) => onCambio({ fechas: [...new Set([...f.fechas, ...fechas])].sort() });
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
              <div className="flex flex-wrap gap-2">
                <Atajo onClick={() => sumar([proximo(6)])}>Próximo sábado</Atajo>
                <Atajo onClick={() => sumar([proximo(0)])}>Próximo domingo</Atajo>
                {diasAtajo.map((d) => {
                  const t = todosDelMes(d);
                  return t.fechas.length ? (
                    <Atajo key={d} onClick={() => sumar(t.fechas)}>{`Todos los ${NOMBRES_DIA[d]} de ${t.mes}`}</Atajo>
                  ) : null;
                })}
                {f.fechas.length > 0 && <Atajo onClick={() => onCambio({ fechas: [] })}>Borrar días</Atajo>}
              </div>
              <CustomMultiDatePicker label="Días (cada día es una jornada)" value={f.fechas} onChange={(d: string | string[]) => onCambio({ fechas: [...new Set(Array.isArray(d) ? d : d ? [d] : [])].sort() })} minDate={fechaDeHoy()} />
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

function Atajo({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="min-h-[40px] rounded-full border border-blue-500 px-3 text-sm font-semibold text-blue-700 dark:text-blue-300">
      {children}
    </button>
  );
}
