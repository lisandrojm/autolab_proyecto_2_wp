import { useEffect, useState } from "react";
import { AltaEnFechas, usersAPI } from "../api/users";

/*
  ¿LA PERSONA YA TIENE UN ALTA DE ARCA EN LAS FECHAS QUE SE ESTÁN CARGANDO? (05/11/2026; regla nueva el 21/11/2026)

  La regla está en el server (`compartido/altaVigente.ts`), que la vuelve a revisar al guardar:
    · un alta MENSUAL (indeterminado o plazo fijo) en esas fechas → sólo Servicios, con cualquier empresa;
    · un alta por JORNADA (liquidación Jornal) → sólo frena otra alta con la MISMA empresa (`empresaId`).
  `hasta` vacío es sin fin. Lo que la pantalla hace con la respuesta lo dice `reglaDelAlta`.
*/
export function useAltaEnFechas(o: { activo: boolean; userId?: string; desde: string; hasta: string; fechas?: string[]; empresaId?: string | null; excluir?: { projectId: string; contractIndex?: number | null } | null }): AltaEnFechas | null {
  const [r, setR] = useState<AltaEnFechas | null>(null);
  const clave = JSON.stringify([o.activo, o.userId, o.desde, o.hasta, o.fechas, o.empresaId || "", o.excluir || null]);
  useEffect(() => {
    if (!o.activo || !o.userId || (!o.desde && !o.fechas?.length)) {
      setR(null);
      return;
    }
    let vigente = true;
    const t = setTimeout(() => {
      usersAPI
        .contratoEnFechas(o.userId!, { desde: o.desde, hasta: o.hasta, fechas: o.fechas, empresaId: o.empresaId || undefined, excluir: o.excluir || undefined })
        .then((x) => vigente && setR(x))
        // Sin respuesta no se recorta la lista: el server vuelve a revisar al guardar.
        .catch(() => vigente && setR(null));
    }, 400);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave]);
  return r;
}

/**
 * QUÉ HACE LA PANTALLA CON LA RESPUESTA.
 *
 *   · `soloServicios`: el mensaje, y la lista de tipos se recorta a los de Servicios.
 *   · `aviso`: sólo se avisa, no se recorta.
 *
 * `sinFechas`: todavía no hay fechas (el puesto de un equipo, la solicitud antes de elegirlas) y se
 * preguntó «de hoy en adelante». Ahí sólo recorta un alta SIN fecha de baja —un indeterminado: cualquier
 * fecha la va a pisar—; una que termina (una jornada, un plazo fijo que vence mañana) sólo avisa, y la
 * regla se aplica al elegir las fechas.
 */
export function reglaDelAlta(r: AltaEnFechas | null, sinFechas = false): { soloServicios: string; aviso: string } {
  const frena = r?.contrato || r?.mismaEmpleadora || null;
  if (!r || !frena) return { soloServicios: "", aviso: sinFechas ? r?.aviso || "" : "" };
  if (sinFechas && frena.hasta) return { soloServicios: "", aviso: r.aviso || frena.mensaje };
  return { soloServicios: frena.mensaje, aviso: "" };
}
