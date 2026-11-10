import { create } from "zustand";
import { usersAPI } from "../api/users";
import { CONTADORES_VACIOS, type CarpetaFirma, type ContadoresContratacion } from "../config/bandejasContratacion";

/**
 * LOS NÚMEROS DE LAS BANDEJAS DE CONTRATACIÓN, UNA SOLA VEZ PARA TODOS (11/11/2026).
 *
 * El menú lateral muestra el número de cada bandeja sin entrar. Antes cada número vivía adentro de
 * `ContractsPage` y se calculaba al abrir «Gestión de Contratos»; acá los comparten el menú y las
 * pantallas, con dos ritmos:
 *
 *  · LO DE LA BASE (solicitudes, trámite impositivo, generar documentos): dos pedidos livianos. Se
 *    recuentan al navegar (a lo sumo cada `MS_ENTRE_RECUENTOS`) y cuando una pantalla avisa que algo
 *    cambió (`pendientesChanged`).
 *  · LO DE DROPBOX y EL PADRÓN (para firmar, enviado, firmados, contratos): leer tres carpetas de
 *    Dropbox y contar el padrón es caro. Se hace UNA vez por sesión (se renueva pasados
 *    `MS_VIGENCIA_CAROS`), nunca por ítem ni por render. Al abrir una de esas bandejas, la pantalla lee
 *    su carpeta de todos modos y deja acá el número fresco (`informar`).
 *
 * `null` = todavía no se sabe: el menú no dibuja nada.
 */

const MS_ENTRE_RECUENTOS = 20_000;
const MS_VIGENCIA_CAROS = 10 * 60_000;

interface Permisos {
  solicitudes: boolean;
  contratos: boolean;
}

interface Estado {
  contadores: ContadoresContratacion;
  /** Lo de la base. `forzar`: sin esperar el intervalo (algo cambió recién). */
  recontarBase: (permisos: Permisos, forzar?: boolean) => void;
  /** Lo de Dropbox y el padrón: una vez por sesión. */
  asegurarCaros: (permisos: Permisos) => void;
  /** Una pantalla que acaba de leer su bandeja deja el número fresco. */
  informar: (parte: { solicitudes?: number; generarDocumentos?: number; carpeta?: { clave: CarpetaFirma; cantidad: number }; contratos?: number }) => void;
  /** Algo cambió en una bandeja de la base (se presentó un alta, se envió a firmar): recontar ya. */
  refrescarBase: () => void;
  reiniciar: () => void;
}

let ultimoRecuentoBase = 0;
let pedidoBase = 0;
let carosPedidosAt = 0;
let ultimosPermisos: Permisos | null = null;

export const useContadoresContratacionStore = create<Estado>((set, get) => ({
  contadores: CONTADORES_VACIOS,

  recontarBase: (permisos, forzar = false) => {
    ultimosPermisos = permisos;
    const ahora = Date.now();
    if (!forzar && ahora - ultimoRecuentoBase < MS_ENTRE_RECUENTOS) return;
    ultimoRecuentoBase = ahora;
    const pedido = ++pedidoBase;
    const vigente = () => pedido === pedidoBase;
    // Cada pedido con su `catch`: sin permiso o sin red, esa parte queda sin número y el resto sigue.
    if (permisos.solicitudes)
      usersAPI
        .contarSolicitudesPendientes()
        .then((solicitudes) => vigente() && set((s) => ({ contadores: { ...s.contadores, solicitudes } })))
        .catch(() => {});
    if (permisos.contratos)
      usersAPI
        .contadoresDeContratacion()
        .then((c) => vigente() && set((s) => ({ contadores: { ...s.contadores, tramite: { alta: c.alta, cuit: c.cuit, sinCuit: c.sinCuit }, generarDocumentos: c.generarDocumentos } })))
        /*
          Un server que todavía no tiene `/contratacion/contadores` (el front se publica antes de
          reiniciar Node): el contador de siempre, que suma Alta temprana + Constancia de CUIT.
        */
        .catch(() =>
          usersAPI
            .contarContratosPendientes()
            .then((n) => vigente() && set((s) => ({ contadores: { ...s.contadores, tramite: { alta: n, cuit: 0, sinCuit: 0 } } })))
            .catch(() => {}),
        );
  },

  asegurarCaros: (permisos) => {
    if (!permisos.contratos) return;
    const ahora = Date.now();
    if (carosPedidosAt && ahora - carosPedidosAt < MS_VIGENCIA_CAROS) return;
    carosPedidosAt = ahora;
    // Import dinámico: el menú no tiene por qué cargar las pantallas de Contratos para contar.
    import("../components/contratos/ContractDropboxTabs")
      .then((m) => m.fetchDropboxCounts())
      .then((dropbox) => set((s) => ({ contadores: { ...s.contadores, dropbox } })))
      .catch(() => {});
    import("../components/contratos/ContractBulkTabs")
      .then((m) => m.contarContratados())
      .then((contratos) => contratos !== null && set((s) => ({ contadores: { ...s.contadores, contratos } })))
      .catch(() => {});
  },

  refrescarBase: () => {
    if (ultimosPermisos) get().recontarBase(ultimosPermisos, true);
  },

  informar: (parte) => {
    const c = get().contadores;
    set({
      contadores: {
        ...c,
        ...(parte.solicitudes !== undefined ? { solicitudes: parte.solicitudes } : {}),
        ...(parte.contratos !== undefined ? { contratos: parte.contratos } : {}),
        ...(parte.generarDocumentos !== undefined ? { generarDocumentos: parte.generarDocumentos } : {}),
        // Sin las tres carpetas leídas todavía no se inventan ceros para las otras dos: ya llegan (`asegurarCaros`).
        ...(parte.carpeta && c.dropbox ? { dropbox: { ...c.dropbox, [parte.carpeta.clave]: parte.carpeta.cantidad } } : {}),
      },
    });
  },

  // Al cambiar de usuario o de tenant: los números de otro no sirven.
  reiniciar: () => {
    ultimoRecuentoBase = 0;
    carosPedidosAt = 0;
    pedidoBase++;
    set({ contadores: CONTADORES_VACIOS });
  },
}));
