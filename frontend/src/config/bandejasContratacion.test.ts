/**
 * Las bandejas de Contratación: el orden del circuito, las URLs viejas, los permisos y los números.
 *
 * Run with:
 *   npx tsx --test src/config/bandejasContratacion.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { BANDEJAS, CONTADORES_VACIOS, bandejaDeRuta, bandejaPorClave, contadorDeBandeja, rutaNuevaDeContratos, siguienteBandeja, sumaAccionable, varianteDeQuery, type ContadoresContratacion } from "./bandejasContratacion";
import { REGLAS_RUTAS, puedeAbrirRuta } from "./accesoRutas";

describe("el circuito", () => {
  it("son siete bandejas, numeradas en el orden del flujo", () => {
    assert.deepEqual(
      BANDEJAS.map((b) => `${b.numero} ${b.label}`),
      ["1 Solicitudes", "2 Trámite impositivo", "3 Generar documentos", "4 Para Firmar", "5 Enviado a la firma", "6 Firmados", "7 Contratos"],
    );
  });
  it("cada una tiene su URL propia y estable", () => {
    assert.deepEqual(
      BANDEJAS.map((b) => b.ruta),
      ["/admin/solicitudes", "/admin/contratacion/tramite-impositivo", "/admin/contratacion/generar-documentos", "/admin/contratacion/para-firmar", "/admin/contratacion/enviado-a-la-firma", "/admin/contratacion/firmados", "/admin/contratacion/contratos"],
    );
    assert.equal(new Set(BANDEJAS.map((b) => b.ruta)).size, BANDEJAS.length);
  });
  it("«siguiente paso» recorre el circuito y la última no tiene", () => {
    assert.equal(siguienteBandeja("solicitudes")?.clave, "tramite-impositivo");
    assert.equal(siguienteBandeja("generar-documentos")?.clave, "para-firmar");
    assert.equal(siguienteBandeja("contratos"), undefined);
  });
  it("la ruta dice qué bandeja es, con o sin query", () => {
    assert.equal(bandejaDeRuta("/admin/contratacion/firmados")?.clave, "firmados");
    assert.equal(bandejaDeRuta("/admin/contratacion/tramite-impositivo/?variante=sin-cuit")?.clave, "tramite-impositivo");
    assert.equal(bandejaDeRuta("/admin/contracts"), undefined);
  });
});

describe("cada bandeja muestra lo que mostraba su pestaña", () => {
  it("Solicitudes → la pantalla de solicitudes", () => assert.deepEqual(bandejaPorClave("solicitudes").contenido, { tipo: "solicitudes" }));
  it("Trámite impositivo → las tres variantes de ARCA (adentro, no en el menú)", () => {
    assert.deepEqual(bandejaPorClave("tramite-impositivo").contenido, { tipo: "tramite" });
    assert.equal(varianteDeQuery(null), "alta-temprana");
    assert.equal(varianteDeQuery("constancia-cuit"), "constancia-cuit");
    assert.equal(varianteDeQuery("sin-cuit"), "sin-cuit");
    assert.equal(varianteDeQuery("cualquiera"), "alta-temprana");
  });
  it("Generar documentos → la bandeja de generar y enviar a firmar", () => assert.deepEqual(bandejaPorClave("generar-documentos").contenido, { tipo: "generar" }));
  it("Para Firmar / Enviado / Firmados → cada una su carpeta de Dropbox Sign", () => {
    assert.deepEqual(bandejaPorClave("para-firmar").contenido, { tipo: "dropbox", carpeta: "para_firmar" });
    assert.deepEqual(bandejaPorClave("enviado-a-la-firma").contenido, { tipo: "dropbox", carpeta: "enviado_firma" });
    assert.deepEqual(bandejaPorClave("firmados").contenido, { tipo: "dropbox", carpeta: "firmados" });
  });
  it("Contratos → el padrón: una sola bandeja para el viejo listado y «Contratados»", () => {
    assert.deepEqual(bandejaPorClave("contratos").contenido, { tipo: "padron" });
    assert.equal(BANDEJAS.filter((b) => b.contenido.tipo === "padron").length, 1);
  });
});

describe("las URLs viejas de /admin/contracts", () => {
  it("sin parámetros va a Trámite impositivo, que era lo que abría por defecto", () => {
    assert.equal(rutaNuevaDeContratos(""), "/admin/contratacion/tramite-impositivo");
    assert.equal(rutaNuevaDeContratos("?"), "/admin/contratacion/tramite-impositivo");
  });
  it("?tab=contracts va a Contratos", () => assert.equal(rutaNuevaDeContratos("?tab=contracts"), "/admin/contratacion/contratos"));
  it("?tab=management va a Trámite impositivo, con y sin proyecto", () => {
    assert.equal(rutaNuevaDeContratos("?tab=management"), "/admin/contratacion/tramite-impositivo");
    assert.equal(rutaNuevaDeContratos("?tab=management&projectId=65f0c1"), "/admin/contratacion/tramite-impositivo?projectId=65f0c1");
  });
  it("el proyecto se conserva también hacia Contratos y sin `tab`", () => {
    assert.equal(rutaNuevaDeContratos("?tab=contracts&projectId=65f0c1"), "/admin/contratacion/contratos?projectId=65f0c1");
    assert.equal(rutaNuevaDeContratos("projectId=65f0c1"), "/admin/contratacion/tramite-impositivo?projectId=65f0c1");
  });
  it("?paso=solicitudes va a Solicitudes con la búsqueda", () => {
    assert.equal(rutaNuevaDeContratos("?paso=solicitudes&buscar=Ana%20Paz"), "/admin/solicitudes?buscar=Ana+Paz");
  });
});

describe("permisos: los de la pestaña que reemplazan", () => {
  const usuario = (permisos: string[]) => ({ permissions: permisos, roles: [], primaryRole: "" }) as any;
  it("cada bandeja tiene su regla en la tabla de rutas, con sus permisos", () => {
    for (const b of BANDEJAS) assert.deepEqual(REGLAS_RUTAS.find((r) => r.path === b.ruta)?.permisos, b.permisos, b.ruta);
  });
  it("las de contratos piden lo que pedía /admin/contracts; Solicitudes, lo de siempre", () => {
    const deContratos = REGLAS_RUTAS.find((r) => r.path === "/admin/contracts")?.permisos;
    for (const b of BANDEJAS.filter((x) => x.clave !== "solicitudes")) assert.deepEqual(b.permisos, deContratos, b.clave);
    assert.deepEqual(bandejaPorClave("solicitudes").permisos, ["admin_users:view"]);
  });
  it("sin el permiso de contratos no se abre ninguna de las bandejas 2 a 7", () => {
    const soloSolicitudes = usuario(["admin_users:view"]);
    assert.equal(puedeAbrirRuta(soloSolicitudes, "/admin/solicitudes"), true);
    for (const b of BANDEJAS.filter((x) => x.clave !== "solicitudes")) assert.equal(puedeAbrirRuta(soloSolicitudes, b.ruta), false, b.clave);
  });
  it("con el de contratos se abren las seis, y Solicitudes no", () => {
    const soloContratos = usuario(["admin_contracts:view"]);
    for (const b of BANDEJAS.filter((x) => x.clave !== "solicitudes")) assert.equal(puedeAbrirRuta(soloContratos, b.ruta), true, b.clave);
    assert.equal(puedeAbrirRuta(soloContratos, "/admin/solicitudes"), false);
  });
});

describe("los números del menú", () => {
  const c: ContadoresContratacion = { solicitudes: 18, tramite: { alta: 17, cuit: 3, sinCuit: 2 }, generarDocumentos: 16, dropbox: { para_firmar: 184, enviado_firma: 164, firmados: 1403 }, contratos: 461 };
  it("cada bandeja muestra el suyo; el trámite suma sus tres variantes", () => {
    assert.deepEqual(
      BANDEJAS.map((b) => contadorDeBandeja(c, b.clave)),
      [18, 22, 16, 184, 164, 1403, 461],
    );
  });
  it("lo que todavía no se contó no es cero: no hay número", () => {
    for (const b of BANDEJAS) assert.equal(contadorDeBandeja(CONTADORES_VACIOS, b.clave), null, b.clave);
  });
  it("el grupo suma sólo lo accionable (no enviados, firmados ni el padrón)", () => {
    assert.equal(sumaAccionable(c), 18 + 22 + 16 + 184);
    assert.equal(sumaAccionable(CONTADORES_VACIOS), 0);
  });
  it("el grupo no suma bandejas que el usuario no ve", () => {
    assert.equal(sumaAccionable(c, ["tramite-impositivo", "generar-documentos", "para-firmar", "enviado-a-la-firma", "firmados", "contratos"]), 22 + 16 + 184);
    assert.equal(sumaAccionable(c, ["solicitudes"]), 18);
  });
});
