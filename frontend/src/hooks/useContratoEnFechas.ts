import { useEffect, useState } from "react";
import { ContratoEnFechas, usersAPI } from "../api/users";

/*
  ¿LA PERSONA YA TIENE UN CONTRATO EN LAS FECHAS QUE SE ESTÁN CARGANDO? (05/11/2026)

  Si tiene, sólo se la contrata por Servicios: por eso los formularios de alta piden las fechas antes
  que el tipo de contrato. Lo usan la solicitud y el wizard de Agregar miembro / Editar y Aprobar. La
  regla está en el server (`contratoEnLasFechas`), que la vuelve a revisar al guardar. `hasta` vacío es
  sin fin: quien todavía no cargó la baja de un contrato a plazo tiene que mandar `hasta = desde`.
*/
export function useContratoEnFechas(o: { activo: boolean; userId?: string; desde: string; hasta: string; fechas?: string[] }): ContratoEnFechas | null {
  const [contrato, setContrato] = useState<ContratoEnFechas | null>(null);
  const clave = JSON.stringify([o.activo, o.userId, o.desde, o.hasta, o.fechas]);
  useEffect(() => {
    if (!o.activo || !o.userId || (!o.desde && !o.fechas?.length)) {
      setContrato(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      usersAPI
        .contratoEnFechas(o.userId!, { desde: o.desde, hasta: o.hasta, fechas: o.fechas })
        .then((c) => vigente && setContrato(c))
        // Sin respuesta no se recorta la lista: el server vuelve a revisar al guardar.
        .catch(() => vigente && setContrato(null));
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return contrato;
}
