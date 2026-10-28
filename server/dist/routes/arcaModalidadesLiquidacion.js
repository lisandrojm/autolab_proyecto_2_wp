import { ArcaModalidadLiquidacion } from "../models/ArcaModalidadLiquidacion.js";
import { createSimpleCatalogRouter } from "./_simpleCatalogRouter.js";
import { CAMPOS_RETRIBUCION, esCampoRetribucion } from "../compartido/arca/retribucionPactada.js";
// Tabla oficial de ARCA (Simplificación Registral). El "ID Externo" genérico del catálogo es acá el
// CÓDIGO que va en el TXT de alta, con sus ceros a la izquierda: se conserva tal cual, sin sanitizar.
const router = createSimpleCatalogRouter(ArcaModalidadLiquidacion, {
    entityLabel: "Modalidad de liquidación",
    sheetName: "Modalidades de Liquidación",
    templateFilename: "plantilla_arca_modalidades_liquidacion.xlsx",
    sampleNames: ["MES", "QUINCENA", "JORNAL"],
    externalIdExcelHeader: "Código (1 díg.)",
    externalIdExcelAliases: ["Código", "Codigo", "codigo", "código"],
    // Qué importe del contrato se declara como retribución pactada (vacío = el bruto de la escala). Dato propio: no entra en el Excel.
    extraValidatedFields: [
        {
            key: "retribucionPactada",
            resolver: async (bruto) => {
                if (bruto === undefined)
                    return {};
                const v = String(bruto ?? "").trim();
                if (!v)
                    return { valor: "" };
                return esCampoRetribucion(v) ? { valor: v } : { error: `Retribución pactada: «${v}» no es uno de ${CAMPOS_RETRIBUCION.map((c) => c.label).join(", ")}.` };
            },
        },
    ],
});
export { router as arcaModalidadLiquidacionRoutes };
