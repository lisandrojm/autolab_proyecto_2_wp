import { useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { faUsers } from "@fortawesome/free-solid-svg-icons";
import { usePlantilla, usePlantillas } from "./contexto";
import { Pantalla, Seccion, Vacio } from "./Pantalla";
import { contratoDelPuesto, EstadoContratar, leerEstado } from "./estadoContratar";
import { estadoDe, nombreRoles, puestosDe, rutas } from "./equipoUtil";
import { PASOS_CONTRATAR } from "./Pasos";
import { AIRE, MARGEN, Rotulo, pastillaDe } from "./piezas";

/*
  CONTRATAR · PASO 2 DE 3 · LAS PERSONAS.

  Una fila por puesto de cada equipo incluido: quién va, con qué rol y con qué contrato. Es la
  pantalla donde después se ajusta lo de CADA persona sólo para esta vez —cambiarla, sacarla,
  reemplazo, horario, categoría, importe, días, comentario— sin tocar la plantilla. Esta primera
  versión muestra; la edición por fila viene en el paso siguiente del trabajo.

  El contrato de cada fila es el que RIGE (puntual → general → puesto), que es lo que el server va a
  calcular: si dice «Jornada», es Jornada.
*/
export default function ContratarPersonas() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { catalogos } = usePlantillas();
  const { plantilla: p } = usePlantilla(id);
  const [estado] = useState<EstadoContratar | null>(() => leerEstado(id));

  if (!estado) return <Navigate to={rutas.contratar(id)} replace />;
  const atras = rutas.contratar(id);
  if (!p)
    return (
      <Pantalla titulo="Personas" atras={atras} listo={false} pasos={{ actual: 2, etiquetas: PASOS_CONTRATAR }}>
        <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </Pantalla>
    );

  const equipos = p.equipos.filter((e) => estado.equipos[e._id]?.incluido);
  const solicitudes = equipos.reduce((s, e) => s + estadoDe(p, e).total, 0);
  const nombreContrato = (contratoId: string) => catalogos.contratos.find((c) => c._id === contratoId)?.name || "";

  return (
    <Pantalla
      titulo="Personas"
      contexto={p.nombre}
      atras={atras}
      atrasPaso={() => navigate(atras)}
      pasos={{ actual: 2, etiquetas: PASOS_CONTRATAR }}
      boton={{ texto: `Revisar ${solicitudes} ${solicitudes === 1 ? "solicitud" : "solicitudes"}`, onClick: () => navigate(rutas.revision(id)), deshabilitado: solicitudes === 0, motivo: "No hay nadie para contratar", tono: "verde" }}
    >
      {equipos.length === 0 ? (
        <Vacio texto="No elegiste ningún equipo." accion="Volver a Contrato y fechas" onAccion={() => navigate(atras)} />
      ) : (
        equipos.map((e) => (
          <Seccion key={e._id} titulo={<Rotulo icono={faUsers}>{e.nombre}</Rotulo>}>
            <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white dark:divide-slate-700 dark:border-slate-700 dark:bg-slate-800/70">
              {puestosDe(p, e).map((x) => {
                const persona = x.asignacion?.userId ? x.asignacion : null;
                const contrato = nombreContrato(contratoDelPuesto(estado, e._id, x.puesto._id, x.efectivo.contratoId));
                return (
                  <div key={x.puesto._id} className="flex min-h-[56px] items-center gap-3 px-3 py-2">
                    <span className="w-6 shrink-0 text-center text-sm font-bold tabular-nums text-slate-600 dark:text-slate-300">{x.n}</span>
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block truncate text-xs font-semibold text-slate-600 dark:text-slate-300">{nombreRoles(catalogos.roleFrames, x.puesto.rolesFrame)}</span>
                      <span className="flex flex-wrap items-center gap-1.5">
                        {/* La persona en verde, como en el alta: es un puesto cubierto. Sin persona, en ámbar: el server no la deja pasar. */}
                        {persona ? (
                          <span className={`max-w-full ${pastillaDe("verde")} ${AIRE} ${MARGEN}`}>
                            <span className="truncate">{persona.nombre}</span>
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-amber-800 dark:text-amber-300">Sin asignar</span>
                        )}
                        {contrato && <span className={`${pastillaDe("neutro")} ${AIRE} ${MARGEN}`}>{contrato}</span>}
                      </span>
                    </span>
                  </div>
                );
              })}
            </div>
          </Seccion>
        ))
      )}
    </Pantalla>
  );
}
