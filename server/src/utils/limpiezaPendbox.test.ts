import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { nombreConCodigo, planLimpiezaPendbox } from "./limpiezaPendbox.js";
import { largoEnBytes } from "./nomenclatura.js";

// Nombres reales de Requested signatures (11/10/2026): la cola « Firma solicitada por …» viene cortada a distinto largo.
const F_CASTRO = "426_LN+_CASTRO_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20412923767_brianchicago.22-ARROBA-gmail.com_Empresa-30710295839.pdf_ Firma solicitada por Thu, 08 Oct 2026 14h56m54s.pdf";
const F_MARTINEZ_ALTA = "426_LN+_MARTINEZ_AltaAFIP_Plazo-fijo-6x6_D-20261001_H-20261031_20365478792_alvaromartinezjaluf-ARROBA-gmail.com_Empresa-30717068374.pdf_ Firma solicit Wed, 07 Oct 2026 19h06m21s.pdf";
const F_MARTINEZ_RELEASE = "426_LN+_MARTINEZ_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20365478792_alvaromartinezjaluf-ARROBA-gmail.com_Empresa-30710295839_ID-000004.pdf_ Firm Wed, 07 Oct 2026 19h10m12s.pdf";
// Y sus originales en Pendbox.
const P_CASTRO_RELEASE = "426_LN+_CASTRO_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20412923767_brianchicago.22-ARROBA-gmail.com_Empresa-30710295839_ID-000012.pdf";
const P_CASTRO_CONTRATO = "426_LN+_CASTRO_Contrato_Plazo-fijo-6x6_D-20261001_H-20261031_20412923767_brianchicago.22-ARROBA-gmail.com_Empresa-30710295839_ID-000011.pdf";
const P_MARTINEZ_ALTA = "426_LN+_MARTINEZ_AltaAFIP_Plazo-fijo-6x6_D-20261001_H-20261031_20365478792_alvaromartinezjaluf-ARROBA-gmail.com_Empresa-30717068374_ID-000003.pdf";
const P_MARTINEZ_RELEASE = "426_LN+_MARTINEZ_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20365478792_alvaromartinezjaluf-ARROBA-gmail.com_Empresa-30710295839_ID-000004.pdf";
const P_MARTINEZ_CONTRATO = "426_LN+_MARTINEZ_Contrato_Plazo-fijo-6x6_D-20261001_H-20261031_20365478792_alvaromartinezjaluf-ARROBA-gmail.com_Empresa-30710295839_ID-000005.pdf";

const f = (name: string) => ({ name, path: `/HelloSign/Requested signatures/${name}` });
const p = (name: string) => ({ name, path: `/HelloSign/Pendbox/${name}` });
const PENDBOX = [P_CASTRO_RELEASE, P_CASTRO_CONTRATO, P_MARTINEZ_ALTA, P_MARTINEZ_RELEASE, P_MARTINEZ_CONTRATO].map(p);

describe("limpieza de Pendbox cuando vuelve el firmado", () => {
  it("firmado sin código: encuentra el original por el nombre, lo renombra con el código y borra el original", () => {
    const plan = planLimpiezaPendbox([f(F_CASTRO)], PENDBOX);
    assert.equal(plan.omitidos.length, 0);
    assert.equal(plan.acciones.length, 1);
    const a = plan.acciones[0];
    assert.equal(a.original.name, P_CASTRO_RELEASE);
    assert.equal(a.codigo, "ID-000012");
    assert.equal(a.renombrarA, "426_LN+_CASTRO_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20412923767_brianchicago.22-ARROBA-gmail.com_Empresa-30710295839_ID-000012.pdf_ Firma solicitada por Thu, 08 Oct 2026 14h56m54s.pdf");
  });

  it("la cola cortada a otro largo no cambia nada: el nombre es el comienzo del firmado", () => {
    const plan = planLimpiezaPendbox([f(F_MARTINEZ_ALTA)], PENDBOX);
    assert.equal(plan.acciones.length, 1);
    assert.equal(plan.acciones[0].original.name, P_MARTINEZ_ALTA);
    assert.equal(plan.acciones[0].codigo, "ID-000003");
    // El contrato y el release de MARTINEZ comparten CUIT y período y NO se tocan.
    assert.equal(plan.omitidos.length, 0);
  });

  it("firmado que ya trae código: el original es el de ese código, sin renombrar", () => {
    const plan = planLimpiezaPendbox([f(F_MARTINEZ_RELEASE)], PENDBOX);
    assert.equal(plan.acciones.length, 1);
    assert.equal(plan.acciones[0].original.name, P_MARTINEZ_RELEASE);
    assert.equal(plan.acciones[0].renombrarA, undefined);
  });

  it("con código, no se cae al nombre: si no está ese código en Pendbox, se omite", () => {
    const plan = planLimpiezaPendbox([f(F_MARTINEZ_RELEASE)], [p(P_MARTINEZ_ALTA), p(P_MARTINEZ_CONTRATO)]);
    assert.equal(plan.acciones.length, 0);
    assert.equal(plan.omitidos[0].motivo, "sin_original");
  });

  it("sin original en Pendbox: se omite con su motivo", () => {
    const plan = planLimpiezaPendbox([f(F_CASTRO)], [p(P_MARTINEZ_ALTA)]);
    assert.deepEqual(plan.acciones, []);
    assert.equal(plan.omitidos.length, 1);
    assert.equal(plan.omitidos[0].motivo, "sin_original");
  });

  it("ambiguo: dos archivos de Pendbox que son el comienzo del firmado, no se elige ninguno", () => {
    // Un duplicado con otro código (se generó dos veces).
    const dup = p("426_LN+_CASTRO_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20412923767_brianchicago.22-ARROBA-gmail.com_Empresa-30710295839_ID-000020.pdf");
    const plan = planLimpiezaPendbox([f(F_CASTRO)], [...PENDBOX, dup]);
    assert.deepEqual(plan.acciones, []);
    assert.equal(plan.omitidos[0].motivo, "ambiguo_2");
    assert.equal(plan.omitidos[0].candidatos?.length, 2);
  });

  it("los tres firmados juntos: cada uno con su original, y nada cruzado", () => {
    const plan = planLimpiezaPendbox([F_CASTRO, F_MARTINEZ_ALTA, F_MARTINEZ_RELEASE].map(f), PENDBOX);
    assert.equal(plan.omitidos.length, 0);
    assert.deepEqual(
      plan.acciones.map((a) => a.original.name),
      [P_CASTRO_RELEASE, P_MARTINEZ_ALTA, P_MARTINEZ_RELEASE],
    );
    // Los contratos de los dos siguen en Pendbox: nadie los nombró.
  });

  it("dos firmados del mismo original (se firmó dos veces): el segundo se omite", () => {
    const otro = f(F_CASTRO.replace("14h56m54s", "15h00m00s"));
    const plan = planLimpiezaPendbox([f(F_CASTRO), otro], PENDBOX);
    assert.equal(plan.acciones.length, 1);
    assert.equal(plan.omitidos[0].motivo, "original_repetido");
  });

  it("original sin código: no hay qué ponerle al firmado, se omite y el original se queda", () => {
    const viejo = p("426_LN+_CASTRO_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20412923767_brianchicago.22-ARROBA-gmail.com_Empresa-30710295839.pdf");
    const plan = planLimpiezaPendbox([f(F_CASTRO)], [viejo]);
    assert.deepEqual(plan.acciones, []);
    assert.equal(plan.omitidos[0].motivo, "original_sin_codigo");
  });

  it("si en Firmados ya existe el nombre que resultaría, no se renombra encima", () => {
    const yaRenombrado = f("426_LN+_CASTRO_Release_Plazo-fijo-6x6_D-20261001_H-20261031_20412923767_brianchicago.22-ARROBA-gmail.com_Empresa-30710295839_ID-000012.pdf_ Firma solicitada por Thu, 08 Oct 2026 14h56m54s.pdf");
    const plan = planLimpiezaPendbox([f(F_CASTRO), yaRenombrado], PENDBOX);
    const omitido = plan.omitidos.find((o) => o.firmado.name === F_CASTRO);
    assert.equal(omitido?.motivo, "ya_existe");
  });

  it("los .json no cuentan ni de un lado ni del otro", () => {
    const plan = planLimpiezaPendbox([f("algo.json")], [p("algo.json"), ...PENDBOX]);
    assert.deepEqual(plan, { acciones: [], omitidos: [] });
  });
});

describe("el nombre del firmado con el código", () => {
  it("el código va justo antes del primer .pdf; la cola no se toca", () => {
    assert.equal(nombreConCodigo("A_B.pdf_ Firma solicitada por X.pdf", "ID-000001"), "A_B_ID-000001.pdf_ Firma solicitada por X.pdf");
  });
  it("sin .pdf en el nombre no hay dónde ponerlo", () => {
    assert.equal(nombreConCodigo("A_B.docx", "ID-000001"), null);
  });
  it("si se pasa del máximo, se recorta sólo la cola y queda la extensión", () => {
    const nombre = `${"A".repeat(200)}.pdf_ Firma solicitada por Thu, 08 Oct 2026 14h56m54s.pdf`;
    const r = nombreConCodigo(nombre, "ID-000001", 230);
    assert.ok(r);
    assert.ok(largoEnBytes(r!) <= 230);
    assert.ok(r!.startsWith(`${"A".repeat(200)}_ID-000001.pdf`));
    assert.ok(r!.endsWith(".pdf"));
  });
  it("si ni «cabeza.pdf» entra, no se inventa un recorte de los campos", () => {
    assert.equal(nombreConCodigo(`${"A".repeat(250)}.pdf`, "ID-000001", 240), null);
  });
});
