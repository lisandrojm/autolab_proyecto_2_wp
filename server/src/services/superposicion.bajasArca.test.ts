/**
 * «Sólo Servicios» con las bajas de ARCA (18/11/2026): un contrato a tiempo indeterminado sin baja en
 * WeProdu deja de bloquear cuando ARCA ya tiene la baja de esa relación. Puro: sin base.
 *
 *   npm run test:bajas-arca
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { compromisosConBajasDeArca } from "./superposicion.js";
import { contratoEnLasFechas, mensajeSoloServicios, type CompromisoExistente } from "../utils/superposicionContratos.js";
import type { RelacionArcaResumida } from "./arca/altasVigentes.js";

const CUIL = "27255114099";
const CUIT = "30717068374";
const cuitDe = (id: string) => (id === "emp1" ? CUIT : "");
// Indeterminado desde el 01/06/2023, sin baja en WeProdu.
const contrato = (o: Partial<CompromisoExistente> = {}): CompromisoExistente => ({ origen: "contrato", proyectoNombre: "La Nación | LN+", desde: "2023-06-01", hasta: "", empresaId: "emp1", ref: { userProjectId: "up1", contractIndex: 0 }, ...o });
const relacion = (o: Partial<RelacionArcaResumida> = {}): RelacionArcaResumida => ({ cuil: CUIL, empleadoraCuit: CUIT, inicio: "2023-06-01", fin: "", cerrada: false, ...o });
// La jornada que se quiere dar: el 20/11/2026.
const JORNADA = { desde: "2026-11-20", hasta: "2026-11-20" };
const bloquea = (compromisos: CompromisoExistente[], relaciones: RelacionArcaResumida[], pedido = JORNADA) => contratoEnLasFechas(pedido, compromisosConBajasDeArca(compromisos, relaciones, CUIL, cuitDe));

describe("sólo Servicios con las bajas de ARCA", () => {
  it("indeterminado abierto en WeProdu + baja en el espejo de ARCA: NO bloquea", () => {
    assert.equal(bloquea([contrato()], [relacion({ fin: "2025-03-31", cerrada: true })]), null);
  });

  it("sin baja en el espejo (relación abierta o sin relación): sigue bloqueando", () => {
    assert.ok(bloquea([contrato()], [relacion()]));
    assert.ok(bloquea([contrato()], []));
  });

  it("baja de ARCA posterior a las fechas pedidas: bloquea, y el mensaje dice que la baja es de ARCA", () => {
    const c = bloquea([contrato()], [relacion({ fin: "2026-12-31", cerrada: true })]);
    assert.ok(c);
    assert.equal(c!.hasta, "2026-12-31");
    assert.deepEqual(c!.bajaSegunArca, { hastaContrato: "", empleadoraCuit: CUIT });
    assert.match(mensajeSoloServicios(c!), /al 31\/12\/2026 \(baja según ARCA\)/);
  });

  it("el match es el de la presentación de altas: otra empleadora u otra fecha de alta no aplican la baja", () => {
    assert.ok(bloquea([contrato()], [relacion({ fin: "2025-03-31", empleadoraCuit: "30710295839" })]));
    assert.ok(bloquea([contrato()], [relacion({ fin: "2025-03-31", inicio: "2023-06-02" })]));
  });

  it("contrato sin empresa (los importados de FRAME pueden no tenerla): queda como está", () => {
    assert.ok(bloquea([contrato({ empresaId: "" })], [relacion({ fin: "2025-03-31" })]));
  });

  it("la baja del contrato, si es más temprana, manda", () => {
    const [c] = compromisosConBajasDeArca([contrato({ hasta: "2024-01-31" })], [relacion({ fin: "2025-03-31" })], CUIL, cuitDe);
    assert.equal(c.hasta, "2024-01-31");
    assert.equal(c.bajaSegunArca, undefined);
  });

  it("las solicitudes pendientes no se tocan", () => {
    const solicitud: CompromisoExistente = { origen: "solicitud", proyectoNombre: "", desde: "2023-06-01", hasta: "", empresaId: "emp1" };
    assert.deepEqual(compromisosConBajasDeArca([solicitud], [relacion({ fin: "2025-03-31" })], CUIL, cuitDe), [solicitud]);
  });
});
