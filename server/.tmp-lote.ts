import fs from "fs";
import { PDFParse } from "pdf-parse";
import { agruparPaginas, leerRecibo } from "./src/utils/reciboDeSueldo.js";
import { abrirOcr, ocrDeImagen, renderizarPagina } from "./src/utils/ocrPaginas.js";
const buffer = fs.readFileSync("C:/Users/PC/Downloads/99_PRODUCTORA_REC_SUELDO_2026_PERIODO_09_MES.pdf");
const parser = new PDFParse({ data: new Uint8Array(buffer) });
const ocr = await abrirOcr();
const t0 = Date.now();
const textos: string[] = [];
for (let i = 1; i <= 54; i++) { const { texto } = await ocrDeImagen(ocr, await renderizarPagina(parser, i)); textos.push(texto); }
await ocr.terminate(); await parser.destroy();
console.log("54 páginas en", Math.round((Date.now() - t0) / 1000), "s");
const grupos = agruparPaginas(textos, 2);
console.log("grupos:", grupos.length, "| tamaños:", [...new Set(grupos.map((g) => g.length))].join(","));
let conCuil = 0, conNombre = 0, conPeriodo = 0;
for (const g of grupos) { const d = leerRecibo(g.map((i) => textos[i]).join("\n")); if (d.cuil) conCuil++; if (d.nombre) conNombre++; if (d.periodo === "2026-09") conPeriodo++; if (!d.cuil || !d.nombre) console.log("  revisar:", JSON.stringify(g), "|", d.cuil || "sin CUIL", "|", d.nombre || "sin nombre", "|", textos[g[0]].split("\n").slice(0, 3).join(" / ")); }
console.log(`con CUIL ${conCuil}/${grupos.length} · con nombre ${conNombre} · período 2026-09 ${conPeriodo}`);
