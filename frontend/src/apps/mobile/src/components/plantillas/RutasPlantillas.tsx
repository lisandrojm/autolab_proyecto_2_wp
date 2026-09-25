import { Navigate, Route, Routes } from "react-router-dom";
import { ProveedorPlantillas } from "./contexto";
import ListaGrupos from "./ListaGrupos";
import DetalleGrupo from "./DetalleGrupo";
import PantallaEquipo from "./PantallaEquipo";
import DetallePuesto from "./DetallePuesto";
import ContratarFechas from "./ContratarFechas";
import ContratarRevision from "./ContratarRevision";
import ContratarEnviado from "./ContratarEnviado";
import NuevoEquipo from "./NuevoEquipo";

/*
  LAS PANTALLAS DE PLANTILLAS, con ruta propia (se recargan, se comparten y Atrás funciona):

    /mobile/plantillas                                   grupos de puestos del proyecto
    /mobile/plantillas/nuevo                             nuevo equipo (y grupo), en el orden del alta individual
    /mobile/plantillas/:id                               un grupo: sus equipos
    /mobile/plantillas/:id/equipos/:equipoId             un equipo: condiciones + puestos
    /mobile/plantillas/:id/equipos/:equipoId/puesto/:n   un puesto
    /mobile/plantillas/:id/contratar                     paso 1: equipos y fechas
    /mobile/plantillas/:id/contratar/revision            paso 2: la solicitud múltiple
    /mobile/plantillas/:id/contratar/enviado             listo

  El resto de la app del celular sigue navegando por estado (sin URL); ésta es la única parte con rutas.
*/
export default function RutasPlantillas() {
  return (
    <ProveedorPlantillas>
      <Routes>
        <Route path="plantillas" element={<ListaGrupos />} />
        <Route path="plantillas/nuevo" element={<NuevoEquipo />} />
        <Route path="plantillas/:id" element={<DetalleGrupo />} />
        <Route path="plantillas/:id/equipos/:equipoId" element={<PantallaEquipo />} />
        <Route path="plantillas/:id/equipos/:equipoId/puesto/:n" element={<DetallePuesto />} />
        <Route path="plantillas/:id/contratar" element={<ContratarFechas />} />
        <Route path="plantillas/:id/contratar/revision" element={<ContratarRevision />} />
        <Route path="plantillas/:id/contratar/enviado" element={<ContratarEnviado />} />
        <Route path="*" element={<Navigate to="/mobile/plantillas" replace />} />
      </Routes>
    </ProveedorPlantillas>
  );
}
