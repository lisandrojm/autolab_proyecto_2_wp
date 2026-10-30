/**
 *   npm run test:colocacion-firma
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { REGLAS_BASE, buscarTexto, coincidencias, colocacionDesdeMarcas, contienePalabra, deteccionDesdeDeclarada, distanciaARect, extenderAPalabra, motivoPaginaIntermedia, motivoPorTipo, motivosDesactualizado, pdfAPantalla, pantallaAPdf, reglaDe, resolverColocacion, validarPunto, validarReglas, vecesFirmaEnPlantilla } from "./reglasColocacionFirma.js";
const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), "../services/dropboxSignBot/fixtures");
const fixture = (nombre) => JSON.parse(readFileSync(resolve(FIXTURES, `${nombre}.json`), "utf8"));
const dentro = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
const cerca = (a, b, tol) => Math.abs(a - b) <= tol;
// Nombres reales del Outbox (anonimizados).
const NOMBRES = {
    AltaAFIP: "426_LN+_PEREZ_AltaAFIP_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000123.pdf",
    Contrato_Jornada: "426_LN+_PEREZ_Contrato_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000124.pdf",
    "Contrato_Plazo-fijo": "426_LN+_PEREZ_Contrato_Plazo-fijo-6x6_D-20261010_H-20261210_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000125.pdf",
    Contrato_Servicios: "99_PRODUCTORA_PEREZ_Contrato_Servicios_D-20261001_H-20261130_27438746167_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000378.pdf",
    Release: "426_LN+_PEREZ_Release_Jornada_D-20261010_H-20261010_20273130293_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000126.pdf",
    Release_Servicios: "99_PRODUCTORA_PEREZ_Release_Servicios_D-20261001_H-20261130_27438746167_fulano-ARROBA-gmail.com_Empresa-30717068374_ID-000380.pdf",
    REC_SUELDO: "99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_PEREZ_Juana_fulano-ARROBA-gmail.com_20273130293_ID-000900.pdf",
};
const DESCONOCIDO = "701_X_PEREZ_CCM_Jornada_D-20261010_H-20261010_20273130293_a-ARROBA-b.com_ID-000001.pdf";
const pagina = (items, numero = 1) => ({ numero, ancho: 595, alto: 842, items: items.map(([str, x, y, w, h]) => ({ str, x, y, w, h })) });
describe("1. resolución por nombre de archivo", () => {
    it("cada patrón matchea su archivo real; Release_Servicios NO matchea Release", () => {
        for (const [tipo, nombre] of Object.entries(NOMBRES))
            assert.equal(reglaDe(nombre)?.tipo, tipo, nombre);
    });
    it("un tipo desconocido (CCM) cae a revisión y el motivo lista los patrones conocidos", () => {
        assert.equal(reglaDe(DESCONOCIDO), null);
        assert.match(motivoPorTipo(DESCONOCIDO), /no matchea ningún patrón conocido.*REC_SUELDO/);
        assert.equal(resolverColocacion(DESCONOCIDO, null).ok, false);
    });
    it("todas las reglas del catálogo están activas, con ancla, y el catálogo pasa su propia validación tal cual (ida y vuelta por JSON)", () => {
        for (const r of REGLAS_BASE)
            assert.ok(r.estado === "activo" && r.anclas.length > 0, r.tipo);
        const v = validarReglas(JSON.parse(JSON.stringify(REGLAS_BASE)));
        assert.ok(v.ok, v.ok === false ? v.error : "");
        assert.deepEqual(v.ok ? v.reglas : null, REGLAS_BASE);
    });
});
describe("2. anclas sobre fixtures de texto PDF (campo en puntos, y desde arriba)", () => {
    it("Contrato_Jornada: última página, el campo va sobre la línea de guiones a la derecha de «Firma:», con el ancho de la línea", () => {
        const f = fixture("contrato-jornada");
        const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
        assert.ok(r.ok, r.ok === false ? r.motivo : "");
        const c = r.colocacion;
        assert.equal(c.paginaIndex, 1);
        assert.equal(c.pagina, "ultima");
        assert.equal(r.ancla.texto, "Firma:");
        // «Firma: ________________________» x=56 w=220: los guiones arrancan en el carácter 7 de 32 → x≈104, hasta ≈269; el renglón termina en y=247.
        assert.ok(cerca(c.campo.x, 104, 8), `x=${c.campo.x}`);
        assert.ok(cerca(c.campo.x + c.campo.w, 269, 8), `derecha=${c.campo.x + c.campo.w}`);
        assert.ok(cerca(c.campo.y + c.campo.h, 247, 4), `base=${c.campo.y + c.campo.h}`);
        assert.equal(c.campo.h, 45);
        assert.ok(c.linea && cerca(c.linea.w, 165, 8), "midió la línea");
        assert.ok(dentro(c.puntoPdf, c.rectEsperado) && distanciaARect(c.puntoPdf, c.campo) === 0);
        assert.match(c.nota, /línea de guiones/);
    });
    it("Contrato_Plazo-fijo: misma ancla, más abajo (mitad inferior), con la viñeta «·» delante", () => {
        const f = fixture("contrato-plazo-fijo");
        const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
        assert.ok(r.ok && r.colocacion.paginaIndex === 2 && r.colocacion.puntoPdf.y > 842 / 2);
    });
    it("Contrato_Servicios: «Firma: Firma: ______» en un solo ítem: se toma el ÚLTIMO «Firma:» (el que precede a la línea) y el campo cubre los guiones", () => {
        const f = fixture("contrato-servicios");
        const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
        assert.ok(r.ok, r.ok === false ? r.motivo : "");
        const c = r.colocacion;
        assert.equal(c.paginaIndex, 2);
        // x=86 w=252, 44 caracteres, guiones desde el 14 → x≈166, ancho≈172; base del renglón 610.
        assert.ok(cerca(c.campo.x, 166, 8), `x=${c.campo.x}`);
        assert.ok(cerca(c.campo.w, 172, 10), `w=${c.campo.w}`);
        assert.ok(cerca(c.campo.y + c.campo.h, 610, 4), `base=${c.campo.y + c.campo.h}`);
        // Lejos de «Aclaración» (está 50 pt más abajo).
        assert.ok(c.puntoPdf.y < 640);
    });
    it("Release: la línea de firma de la columna del FIRMANTE (izquierda), sobre «______», con «Aclaración: <SU NOMBRE>» debajo", () => {
        const f = fixture("release");
        const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
        assert.ok(r.ok, r.ok === false ? r.motivo : "");
        const c = r.colocacion;
        assert.equal(c.paginaIndex, 4);
        assert.ok(c.puntoPdf.x < 595 / 2, "mitad izquierda");
        assert.ok(cerca(c.campo.x, 62, 3) && cerca(c.campo.w, 190, 3), `campo=${JSON.stringify(c.campo)}`);
        assert.ok(cerca(c.campo.y + c.campo.h, 238, 4), `base=${c.campo.y + c.campo.h}: sobre la línea «______» de arriba`);
        assert.match(r.ancla.texto, /Aclaraci.n: JUANA INES PEREZ/);
        // La columna del empleador queda descartada y se informa.
        assert.ok(r.descartados.some((d) => /Pellegrini/.test(d.texto) && /firmante|Socio Gerente/.test(d.motivo)), JSON.stringify(r.descartados));
        // Con el nombre de la base en otro orden igual lo encuentra.
        assert.ok(resolverColocacion(f.archivo, f.paginas, { nombreFirmante: "PEREZ JUANA" }).ok);
    });
    it("Release: sin nombre de firmante no se resuelve; con el nombre del EMPLEADOR, su columna se descarta por lo que dice («Socio Gerente») y frena", () => {
        const f = fixture("release");
        const sinNombre = resolverColocacion(f.archivo, f.paginas, {});
        assert.equal(sinNombre.ok, false);
        assert.match(sinNombre.ok === false ? sinNombre.motivo : "", /firmante/);
        const malo = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: "HERNAN PELLEGRINI" });
        assert.equal(malo.ok, false);
        assert.match(malo.ok === false ? malo.motivo : "", /Socio Gerente/);
    });
    it("AltaAFIP: la celda de la página 1, mitad derecha, encima del rótulo; con PDF de 2 páginas nunca apunta a la 2", () => {
        const f = fixture("alta-afip");
        const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
        assert.ok(r.ok, r.ok === false ? r.motivo : "");
        assert.equal(r.colocacion.paginaIndex, 0);
        assert.equal(r.colocacion.pagina, "primera");
        assert.ok(r.colocacion.puntoPdf.x > 595 / 2);
        assert.ok(r.colocacion.campo.y + r.colocacion.campo.h <= 430, "apenas arriba del rótulo");
    });
});
describe("3. REC_SUELDO: «Firma Empleado» del ORIGINAL por OCR; «Firma Empleador» de la COPIA, jamás", () => {
    it("coloca el campo sobre la línea dibujada que tiene «Firma Empleado» debajo, en la página 1, con el ancho de la línea", () => {
        const f = fixture("rec-sueldo");
        const r = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
        assert.ok(r.ok, r.ok === false ? r.motivo : "");
        const c = r.colocacion;
        assert.equal(c.paginaIndex, 0, "el ORIGINAL");
        assert.equal(c.pagina, "primera");
        assert.equal(r.ancla.texto, "Firma Empleado");
        assert.equal(r.ancla.fuente, "ocr");
        assert.ok(cerca(c.campo.x, 433, 2) && cerca(c.campo.w, 115, 2), `campo=${JSON.stringify(c.campo)}`);
        assert.ok(cerca(c.campo.y + c.campo.h, 818, 1), "apoyado sobre la línea");
        assert.equal(c.campo.h, 40);
        assert.match(c.nota, /OCR/);
        // La COPIA se descartó por «Empleador» y se informa con su página.
        const emp = r.descartados.find((d) => d.pagina === 2);
        assert.ok(emp && /Empleador/.test(emp.texto) && /Empleador/.test(emp.motivo), JSON.stringify(r.descartados));
    });
    it("si sólo existiera «Firma Empleador» (sin la página del ORIGINAL), no hay ancla: queda en revisión y el motivo lo dice", () => {
        const f = fixture("rec-sueldo");
        const r = resolverColocacion(f.archivo, [{ ...f.paginas[1], numero: 1 }], { nombreFirmante: f.firmante });
        assert.equal(r.ok, false);
        assert.match(r.ok === false ? r.motivo : "", /«Firma Empleado» no encontrada/);
        assert.match(r.ok === false ? r.motivo : "", /Firma Empleador.*contiene «Empleador»/);
    });
    it("«Firma Empleado» NUNCA matchea por substring adentro de «Firma Empleador», ni en la capa de texto", () => {
        const soloEmpleador = pagina([["Firma Empleador", 459, 825, 60, 7]]);
        const r = resolverColocacion(NOMBRES.REC_SUELDO, [soloEmpleador]);
        assert.equal(r.ok, false);
        assert.equal(r.ok ? 0 : r.descartados.length, 1);
        assert.match(r.ok === false ? r.descartados[0].motivo : "", /Empleador/);
        // Y el rótulo entero sí: con la línea de texto «____» arriba.
        const conEmpleado = pagina([["________________", 440, 810, 100, 8], ["Firma Empleado", 459, 825, 55, 7]]);
        const ok = resolverColocacion(NOMBRES.REC_SUELDO, [conEmpleado]);
        assert.ok(ok.ok && ok.ancla.fuente === "texto" && cerca(ok.colocacion.campo.x, 440, 1) && cerca(ok.colocacion.campo.w, 100, 1));
    });
    it("sin OCR (la capa de texto no trae el rótulo) no se inventa nada: revisión con motivo", () => {
        const f = fixture("rec-sueldo");
        const sinOcr = f.paginas.map((p) => ({ ...p, ocr: [], lineas: [] }));
        const r = resolverColocacion(f.archivo, sinOcr, { nombreFirmante: f.firmante });
        assert.equal(r.ok, false);
        assert.match(r.ok === false ? r.motivo : "", /no encontrada en las 2 páginas/);
    });
});
describe("4. ocurrencias y exclusiones", () => {
    const dosFirmas = pagina([
        ["Firma: ____________", 56, 200, 150, 11],
        ["Firma: ____________", 56, 500, 150, 11],
    ]);
    it("con varias coincidencias válidas, por defecto la ÚLTIMA del documento; con `ocurrencia: primera`, la primera", () => {
        const ultima = resolverColocacion(NOMBRES.Contrato_Jornada, [dosFirmas]);
        assert.ok(ultima.ok && ultima.colocacion.puntoPdf.y > 400);
        const reglas = REGLAS_BASE.map((r) => (r.tipo === "Contrato_Jornada" ? { ...r, anclas: r.anclas.map((a) => ({ ...a, ocurrencia: "primera" })) } : r));
        const primera = resolverColocacion(NOMBRES.Contrato_Jornada, [dosFirmas], {}, reglas);
        assert.ok(primera.ok && primera.colocacion.puntoPdf.y < 300);
    });
    it("una coincidencia que no pasa las validaciones se descarta con el motivo y se sigue con la anterior", () => {
        const conAclaracion = pagina([
            ["Firma: ____________", 56, 200, 150, 11],
            ["Firma: ____________", 56, 500, 150, 11],
            // Un texto que cae ADENTRO del campo de la de abajo (el campo mide 45 pt hacia arriba de la línea).
            ["Aclaración: JUANA", 56, 485, 100, 11],
        ]);
        const r = resolverColocacion(NOMBRES.Contrato_Jornada, [conAclaracion]);
        assert.ok(r.ok && r.colocacion.puntoPdf.y < 300, "cayó a la de arriba");
        assert.ok(r.ok && r.descartados.some((d) => /validaciones/.test(d.motivo)));
    });
    it("las palabras de `excluir` descartan por palabra entera: «Empleador» no está en «Firma Empleado»", () => {
        assert.equal(contienePalabra("RECIBO N° 99999 Firma Empleado", "Empleador"), false);
        assert.equal(contienePalabra("Firma Empleador", "Empleador"), true);
        assert.equal(contienePalabra("Firma del EMPLEADOR:", "empleador"), true);
        assert.equal(contienePalabra("Cargo: Socio Gerente", "Socio Gerente"), true);
        assert.deepEqual(extenderAPalabra("Firma Empleador", 0, 14), { desde: 0, hasta: 15 });
        assert.deepEqual(extenderAPalabra("· Firma: ____", 2, 8), { desde: 2, hasta: 8 });
    });
    it("sin ancla en el PDF no se envía: motivo con el rótulo y dónde se buscó; sin texto, tampoco", () => {
        const f = fixture("contrato-jornada");
        const sinAncla = f.paginas.map((p) => ({ ...p, items: p.items.filter((i) => !/Firma:/.test(i.str)) }));
        const r = resolverColocacion(f.archivo, sinAncla, { nombreFirmante: f.firmante });
        assert.equal(r.ok, false);
        assert.match(r.ok === false ? r.motivo : "", /Ancla «Firma:» no encontrada en la última página/);
        assert.equal(resolverColocacion(f.archivo, null).ok, false);
        assert.equal(resolverColocacion(f.archivo, []).ok, false);
    });
    it("un ancla en una página del medio se informa como «otra»: el motor no la navega", () => {
        const tres = [pagina([["x", 56, 57, 10, 10]], 1), pagina([["Firma Empleado", 459, 825, 55, 7]], 2), pagina([["y", 56, 57, 10, 10]], 3)];
        const r = resolverColocacion(NOMBRES.REC_SUELDO, tres);
        assert.ok(r.ok && r.colocacion.pagina === "otra" && r.colocacion.paginaIndex === 1);
    });
});
describe("5. pdfAPantalla", () => {
    it("convierte por posición relativa dentro de la caja renderizada, con páginas de distinto tamaño", () => {
        const caja = { x: 300, y: 100, w: 700, h: 990 };
        assert.deepEqual(pdfAPantalla({ x: 0, y: 0 }, { ancho: 595, alto: 842 }, caja), { x: 300, y: 100 });
        const p = pdfAPantalla({ x: 297.5, y: 421 }, { ancho: 595, alto: 842 }, caja);
        assert.ok(Math.abs(p.x - 650) < 0.01 && Math.abs(p.y - 595) < 0.01);
        const carta = pdfAPantalla({ x: 612, y: 792 }, { ancho: 612, alto: 792 }, { x: 10, y: 20, w: 100, h: 200 });
        assert.deepEqual(carta, { x: 110, y: 220 });
        const v = pantallaAPdf(p, { ancho: 595, alto: 842 }, caja);
        assert.ok(Math.abs(v.x - 297.5) < 0.01 && Math.abs(v.y - 421) < 0.01);
    });
});
describe("6. validaciones y renglones", () => {
    const f = fixture("release");
    const pag = f.paginas[4];
    const ctx = { pagina: pag, paginaIndex: 4, totalPaginas: 5, nombreFirmante: f.firmante };
    it("cada validación bloquea su caso", () => {
        assert.deepEqual(validarPunto({ x: 150, y: 230 }, [{ tipo: "enMitadIzquierda" }], ctx), []);
        assert.equal(validarPunto({ x: 400, y: 230 }, [{ tipo: "enMitadIzquierda" }], ctx).length, 1);
        assert.equal(validarPunto({ x: 150, y: 230 }, [{ tipo: "enMitadDerecha" }], ctx).length, 1);
        assert.equal(validarPunto({ x: 390, y: 232 }, [{ tipo: "lejosDeTexto", patron: "Pellegrini|FZERO", distanciaMin: 60 }], ctx).length, 1);
        assert.deepEqual(validarPunto({ x: 150, y: 230 }, [{ tipo: "lejosDeTexto", patron: "Pellegrini|FZERO", distanciaMin: 60 }], ctx), []);
        assert.deepEqual(validarPunto({ x: 150, y: 230 }, [{ tipo: "textoCercano", patron: "FIRMANTE", distanciaMax: 90 }], ctx), []);
        assert.equal(validarPunto({ x: 150, y: 60 }, [{ tipo: "textoCercano", patron: "FIRMANTE", distanciaMax: 90 }], ctx).length, 1);
        assert.equal(validarPunto({ x: 150, y: 230 }, [{ tipo: "textoCercano", patron: "FIRMANTE", distanciaMax: 90 }], { ...ctx, nombreFirmante: "" }).length, 1);
    });
    it("buscarTexto encuentra una frase partida en varios ítems de la misma línea, con el rectángulo del tramo", () => {
        const p = { numero: 1, ancho: 595, alto: 842, items: [{ str: "Firma empleado y", x: 350, y: 430, w: 80, h: 9 }, { str: "fecha de notificacion", x: 435, y: 431, w: 95, h: 9 }] };
        const r = buscarTexto(p, /Firma empleado y fecha de notificaci[oó]n/i);
        assert.equal(r.length, 1);
        assert.ok(r[0].x === 350 && r[0].w === 180, JSON.stringify(r[0]));
    });
    it("«Firma: Firma: ____» da dos coincidencias; la segunda tiene los guiones en su segmento, la primera no", () => {
        const f2 = fixture("contrato-servicios");
        const cs = coincidencias(f2.paginas[2], /Firma:/i);
        assert.equal(cs.length, 2);
        assert.doesNotMatch(cs[0].segmento, /_{3,}/);
        assert.match(cs[1].segmento, /_{3,}/);
        assert.ok(cs[1].rect.x > cs[0].rect.x);
    });
});
describe("7. validarReglas (lo que llega del PUT)", () => {
    const base = () => JSON.parse(JSON.stringify(REGLAS_BASE));
    it("rechaza tipo repetido, patrón que no compila, regla activa sin ancla, franja de OCR inválida y campo fuera de rango", () => {
        const repetido = base();
        repetido[1].tipo = repetido[0].tipo;
        assert.match(validarReglas(repetido).error, /repetido/);
        const malPatron = base();
        malPatron[0].patronNombre = "(";
        assert.match(validarReglas(malPatron).error, /no compila/);
        const sinAncla = base();
        sinAncla[0].anclas = [];
        assert.match(validarReglas(sinAncla).error, /al menos un ancla/);
        const franja = base();
        franja[0].ocr = { desde: 0.9, hasta: 0.5 };
        assert.match(validarReglas(franja).error, /franja de OCR/);
        const campo = base();
        campo[0].campo = { alto: 5, anchoFijo: 100 };
        assert.match(validarReglas(campo).error, /alto/);
        assert.equal(validarReglas([]).ok, false);
    });
    it("una regla pendiente puede no tener ancla y conserva su motivo; los valores faltantes se normalizan", () => {
        const v = validarReglas([{ tipo: "CCM", patronNombre: "_CCM_", estado: "pendiente", motivoPendiente: "falta relevar el PDF", anclas: [], campo: {}, validaciones: [] }]);
        assert.ok(v.ok);
        const r = v.ok ? v.reglas[0] : null;
        assert.equal(r?.estado, "pendiente");
        assert.equal(r?.pagina, "ultima");
        assert.deepEqual(r?.campo, { alto: 45, anchoFijo: 170 });
        assert.equal(motivoPorTipo("1_X_PEREZ_CCM_D-1_H-1_1_a-ARROBA-b.com_ID-000001.pdf", v.ok ? v.reglas : []), "Tipo CCM: falta relevar el PDF");
    });
});
describe("8. posición DECLARADA por la plantilla ({{firma}}, 25/10/2026)", () => {
    it("cuenta {{firma}} con o sin espacios", () => {
        assert.equal(vecesFirmaEnPlantilla("<p>Firma {{firma}}</p><p>{{ firma }}</p>"), 2);
        assert.equal(vecesFirmaEnPlantilla("<p>sin firma</p>"), 0);
    });
    it("en el contrato de servicios real ubica la línea de guiones y da el MISMO campo que la regla por rótulo", () => {
        const f = fixture("contrato-servicios");
        const r = colocacionDesdeMarcas(f.paginas, 1);
        assert.equal(r.ok, true);
        if (r.ok !== true)
            return;
        assert.equal(r.pagina, f.paginas.length);
        const regla = resolverColocacion(f.archivo, f.paginas, { nombreFirmante: f.firmante });
        assert.equal(regla.ok, true);
        if (regla.ok !== true)
            return;
        for (const k of ["x", "y", "w", "h"])
            assert.ok(cerca(r.campo[k], regla.colocacion.campo[k], 0.5), `${k}: ${r.campo[k]} vs ${regla.colocacion.campo[k]}`);
    });
    it("sin la línea de firma en el PDF: no hay posición, con el motivo", () => {
        const r = colocacionDesdeMarcas([pagina([["Contrato sin línea de firma", 56, 100, 200, 11]])], 1);
        assert.equal(r.ok, false);
    });
    it("con dos líneas toma la última y avisa", () => {
        const r = colocacionDesdeMarcas([pagina([["Firma: ______________________________", 86, 300, 252, 11]], 1), pagina([["Firma: ______________________________", 86, 500, 252, 11]], 2)], 2);
        assert.equal(r.ok, true);
        if (r.ok !== true)
            return;
        assert.equal(r.pagina, 2);
        assert.ok(r.avisos.some((a) => /última/.test(a)));
    });
    const declarada = (pagina, total) => ({ origen: "plantilla", plantillaTipo: "contrato", plantillaId: "p1", plantillaNombre: "Servicios", plantillaVersion: 3, pagina, totalPaginas: total, campo: { x: 122, y: 340, w: 176, h: 45 }, linea: { x: 122, y: 385, w: 176, h: 0 }, paginaSize: { w: 595, h: 842 }, sha256: "x", avisos: [], capturadaAt: new Date() });
    it("el bot la usa tal cual: última página, centro del campo, origen «plantilla», sin regla por nombre", () => {
        const d = deteccionDesdeDeclarada(declarada(6, 6));
        assert.equal(d.ok, true);
        if (d.ok !== true)
            return;
        assert.equal(d.colocacion.pagina, "ultima");
        assert.equal(d.colocacion.origen, "plantilla");
        assert.deepEqual(d.colocacion.puntoPdf, { x: 210, y: 362.5 });
    });
    it("en una página del medio no se coloca (el motor sólo navega a la primera o a la última)", () => {
        const d = deteccionDesdeDeclarada(declarada(2, 3));
        assert.equal(d.ok, false);
    });
});
describe("9. cuándo una verificación guardada quedó desactualizada", () => {
    const ayer = new Date(Date.now() - 3600 * 1000);
    it("vigente si nada cambió", () => {
        assert.deepEqual(motivosDesactualizado({ verificadaAt: ayer, origen: "ancla", contentHash: "h1", reglasAt: ayer }, { contentHash: "h1", reglasAt: ayer }), []);
    });
    it("el PDF del Outbox cambió", () => {
        assert.ok(motivosDesactualizado({ verificadaAt: ayer, origen: "ancla", contentHash: "h1", reglasAt: ayer }, { contentHash: "h2", reglasAt: ayer }).some((m) => /PDF/.test(m)));
    });
    it("las reglas cambiaron después de verificar (sólo importa si salió por regla)", () => {
        const despues = new Date();
        assert.ok(motivosDesactualizado({ verificadaAt: ayer, origen: "ancla", contentHash: "h1", reglasAt: ayer }, { contentHash: "h1", reglasAt: despues }).some((m) => /reglas/.test(m)));
        assert.deepEqual(motivosDesactualizado({ verificadaAt: ayer, origen: "plantilla", contentHash: "h1", plantillaVersion: 3 }, { contentHash: "h1", reglasAt: despues, plantillaVersion: 3 }), []);
    });
    it("la plantilla tiene una versión nueva", () => {
        assert.ok(motivosDesactualizado({ verificadaAt: ayer, origen: "plantilla", contentHash: "h1", plantillaVersion: 3 }, { contentHash: "h1", plantillaVersion: 4 }).some((m) => /versión nueva/.test(m)));
    });
    it("una de antes de guardar el hash, con más de un día, se avisa por la fecha", () => {
        assert.ok(motivosDesactualizado({ verificadaAt: new Date(Date.now() - 3 * 86400 * 1000) }, {}).length > 0);
    });
});
describe("10. firma en una página del medio", () => {
    it("es motivo de revisión del documento (no llega al motor)", () => {
        assert.match(motivoPaginaIntermedia({ pagina: "otra", paginaIndex: 1, totalPaginas: 3 }), /página 2 de 3, una del medio/);
        assert.equal(motivoPaginaIntermedia({ pagina: "ultima", paginaIndex: 2, totalPaginas: 3 }), "");
        assert.equal(motivoPaginaIntermedia({ pagina: "primera", paginaIndex: 0 }), "");
    });
});
