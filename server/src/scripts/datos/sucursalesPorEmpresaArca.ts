import type { EmpresaSegunArca } from "../../utils/planSucursalesPorEmpresa.js";

/**
 * LO QUE ARCA TIENE DECLARADO PARA CADA EMPLEADORA: sucursales, su código y sus actividades.
 *
 * Fuente: Simplificación Registral → Datos del Empleador → Domicilios de Explotación, leído a mano
 * con cada CUIT el 4/10/2026. Es la fuente de verdad: `scripts/cargarSucursalesPorEmpresa.ts` deja a
 * cada empresa exactamente así.
 *
 * ESTE ARCHIVO SON SÓLO DATOS, aparte del script a propósito: cuando una empleadora dé de alta un
 * domicilio o una actividad en ARCA, se actualiza acá y se vuelve a correr el script (es idempotente).
 * No se completa nada por inferencia: lo que no esté acá, no se carga.
 *
 * OJO: 900030 y 921430 tienen la misma descripción y son DOS códigos distintos. FZERO tiene los dos
 * en Tronador.
 *
 * `actividadHabitual` NO VIENE DE ARCA: es la decisión de la empresa sobre cuál se preselecciona en el
 * contrato cuando la sucursal tiene más de una (como la ★ del domicilio). Sin ese campo no se marca
 * ninguna y la actividad se elige en cada contrato — que es lo que se quiere para FZERO en Tronador.
 */
export const LEIDO_EL = "2026-10-04";

export const SUCURSALES_POR_EMPRESA_ARCA: EmpresaSegunArca[] = [
  {
    cuit: "30-71029583-9",
    razonSocial: "FZERO S.R.L.",
    sucursales: [
      { codigo: "00001", domicilio: "ZAPIOLA 392", codigoPostal: "1426", actividades: [{ codigo: "921430", descripcion: "Servicios conexos a la producción de espectáculos teatrales y musicales" }] },
      {
        codigo: "00002",
        domicilio: "TRONADOR 671",
        codigoPostal: "1427",
        actividades: [
          { codigo: "900030", descripcion: "Servicios conexos a la producción de espectáculos teatrales y musicales" },
          { codigo: "921430", descripcion: "Servicios conexos a la producción de espectáculos teatrales y musicales" },
        ],
      },
      { codigo: "00003", domicilio: "RUIZ HUIDOBRO 4365", codigoPostal: "1430", actividades: [{ codigo: "591110", descripcion: "Producción de filmes y videocintas" }] },
      { codigo: "00004", domicilio: "VALDENEGRO 4867", codigoPostal: "1430", actividades: [{ codigo: "591120", descripcion: "Postproducción de filmes y videocintas" }] },
    ],
  },
  {
    cuit: "30-71706837-4",
    razonSocial: "2030 S.R.L.",
    sucursales: [
      {
        codigo: "00001",
        domicilio: "RUIZ HUIDOBRO 4365",
        codigoPostal: "1430",
        actividades: [
          { codigo: "602900", descripcion: "Servicios de televisión n.c.p." },
          { codigo: "591110", descripcion: "Producción de filmes y videocintas" },
        ],
        /*
          PENDIENTE DE DEFINIR: cuál de las dos es la habitual de 2030 en Ruiz Huidobro. El pedido la
          dejó en blanco y no se elige por inferencia. Mientras falte, los contratos de 2030 sin
          presentar piden elegir la actividad en cada fila. Para definirla, descomentar UNA:

          actividadHabitual: "591110",
          actividadHabitual: "602900",
        */
      },
    ],
  },
  {
    cuit: "33-71767374-9",
    razonSocial: "GRINI S.R.L.",
    sucursales: [
      {
        codigo: "00003",
        domicilio: "RUIZ HUIDOBRO 4365",
        codigoPostal: "1430",
        actividades: [{ codigo: "620100", descripcion: "Servicios de consultores en informática y suministros de programas de informática" }],
      },
    ],
  },
];
