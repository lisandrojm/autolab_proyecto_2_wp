import express from "express";
import { Types } from "mongoose";
import { Vacation } from "../models/Vacation.js";
import { VacationConfig } from "../models/VacationConfig.js";
import { Notification } from "../models/Notification.js";
import { Tenant } from "../models/Tenant.js";
import { Pdf } from "../models/Pdf.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { TenantRequest } from "../middleware/tenant.js";
import { generateVacationPDF } from "../utils/pdfGenerator.js";
import { resolveContractEmpresa } from "../utils/contractEmpresa.js";
import { User } from "../models/User.js";
import { UserProfile } from "../models/UserProfile.js";
import { Area } from "../models/Area.js";
import { Project } from "../models/Project.js";
import UserProject from "../models/UserProject.js";
import { AntiguedadArca } from "../models/AntiguedadArca.js";
import { Company } from "../models/Company.js";
import fs from "fs";
import path from "path";
import { Client } from "../models/Client.js";
import { saldosDeVacaciones } from "../services/vacaciones/saldos.js";
import { fechasBloqueadas } from "../services/vacaciones/solapamiento.js";
import { ErrorVacacion, adjustBalanceOnRequestChange, crearVacacionParaPersona, preAprobarVacacion } from "../services/vacaciones/crearVacacion.js";
import { etapaDe } from "../compartido/vacaciones/etapaDeAprobacion.js";
import { aprobarEtapa, bandejaDeAprobaciones, contarParaAprobar, iniciarAprobacion, rechazarEtapa, rechazarVacacion, recordarAlSupervisor } from "../services/vacaciones/aprobacionPorEtapas.js";
import { requirePermission, tienePermiso } from "../middleware/permissions.js";

const router = express.Router();

// Apply authentication to all routes
router.use(authenticateToken);

/*
  QUIÉN PUEDE QUÉ (15/11/2026). Hasta acá este router sólo pedía estar logueado: cualquiera podía
  pre-aprobar, aprobar o rechazar cualquier vacación. Con la aprobación por jerarquía entran supervisores
  y coordinadores, así que se cierra:
    · Lo del admin (aprobar, rechazar desde la bandeja, entregar, firma, editar, PDF, saldos): `admin_vacations:view`.
    · Aprobar/rechazar un paso de la jerarquía: quien está en ese paso de la cadena (`aprobar-etapa`).
    · Cancelar, borrar o avisar la firma de una solicitud: quien la pidió, o el admin.
  Las lecturas siguen como estaban (varias pantallas listan vacaciones para marcar quién no está).
*/
const PERMISO_ADMIN_VACACIONES = "admin_vacations:view";
const soloAdminVacaciones = requirePermission(PERMISO_ADMIN_VACACIONES);
const esDuenaOAdmin = async (req: any, vacation: any): Promise<boolean> => String(vacation.userId?._id ?? vacation.userId) === String(req.user?.userId) || (await tienePermiso(req, PERMISO_ADMIN_VACACIONES));



// POST /api/vacations/:id/regenerate-pdf - Regenerate a vacation PDF
router.post("/:id/regenerate-pdf", soloAdminVacaciones, async (req: any, res) => {
  console.log("[VACATIONS] Regenerate PDF request for ID:", req.params.id);
  try {
    const tenantId = req.tenantId;
    const tenantObjectId = req.tenantObjectId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId: tenantObjectId,
    }).populate("userId");

    if (!vacation) {
      console.warn("[VACATIONS] Vacation not found for ID:", req.params.id, "and tenant:", tenantId);
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }

    const tenant = await Tenant.findById(tenantObjectId);
    if (!tenant) {
      res.status(404).json({ error: "Tenant not found" });
      return;
    }

    let templateId = vacation.rules?.pdfId;

    if (!templateId || templateId.toString().trim() === "") {
      const defaultTemplate = await Pdf.findOne({ 
        tenantId: tenantObjectId, 
        code: { $regex: /^vacaciones$/i }, 
        isActive: true 
      });
      if (defaultTemplate) {
        templateId = defaultTemplate._id.toString();
      }
    }

    if (!templateId || templateId.toString().trim() === "") {
      res.status(400).json({ error: "No se encontró una plantilla PDF configurada para esta solicitud" });
      return;
    }

    const template = await Pdf.findOne({
      _id: templateId,
      tenantId: tenantObjectId,
      isActive: true,
    });

    if (!template) {
      res.status(404).json({ error: "Plantilla PDF no encontrada o inactiva" });
      return;
    }

    const user = typeof vacation.userId === "object" && "firstName" in vacation.userId ? (vacation.userId as any) : await User.findById(vacation.userId);

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // empresaId opcional: la empresa elegida al descargar (cuando el contrato no tiene una fija).
    const pdfResult = await generateVacationPDF(vacation, template, user, tenantId.toString(), tenant.name, vacation.vacationNumber, req.body?.empresaId);

    if (!pdfResult.success) {
      res.status(500).json({ error: `Error al generar PDF: ${pdfResult.error}` });
      return;
    }

    // Optional: delete old PDF if exists
    if (vacation.pdfPreAprobacionUrl) {
      try {
        const { deletePdfFromStorage } = await import("../utils/pdfStorage.js");
        await deletePdfFromStorage(vacation.pdfPreAprobacionUrl);
      } catch (e) {
        console.warn("Could not delete old PDF:", e);
      }
    }

    vacation.pdfPreAprobacionUrl = pdfResult.pdfUrl;
    await vacation.save();

    res.json(vacation);
  } catch (error) {
    console.error("Regenerate vacation PDF error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vacations/:id/empresa-info - Empresa del membrete para descargar el PDF.
// Si el contrato del usuario no tiene empresa fija y el proyecto tiene varias, el front pregunta cuál usar.
router.get("/:id/empresa-info", async (req: any, res) => {
  try {
    const tenantObjectId = req.tenantObjectId;
    const vacation = await Vacation.findOne({ _id: req.params.id, tenantId: tenantObjectId }).lean();
    if (!vacation) {
      res.status(404).json({ error: "Vacation request not found" });
      return;
    }
    const uid = String((vacation as any).userId?._id || (vacation as any).userId || "");
    const info = await resolveContractEmpresa(uid);
    const contractEmpresa = info.contractEmpresaId ? info.projectEmpresas.find((e) => e.id === info.contractEmpresaId) || null : null;
    res.json({
      hasContractEmpresa: !!info.contractEmpresaId,
      contractEmpresa,
      projectEmpresas: info.projectEmpresas,
    });
  } catch (error) {
    console.error("Vacation empresa-info error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/vacations/availability - Get dates that are fully booked for user's area
router.get("/availability", async (req, res) => {
  try {
    // La regla vive en `services/vacaciones/solapamiento.ts`: la comparten este GET, el POST y el plan de vacaciones por proyecto.
    res.json(await fechasBloqueadas(req.tenantId, req.user!.userId));
  } catch (error: any) {
    console.error("Error fetching availability:", error);
    res.status(500).json({ error: "Error al obtener disponibilidad de vacaciones" });
  }
});

// GET /api/vacations/users-balance - Get vacation balances (calculated & overrides) for all users for a specific year
router.get("/users-balance", async (req: any, res) => {
  try {
    const tenantId = req.tenantId;
    const yearStr = req.query.year;
    const selectedYear = yearStr ? parseInt(yearStr as string) : new Date().getFullYear();

    if (isNaN(selectedYear)) {
      return res.status(400).json({ error: "Año inválido" });
    }

    // La cuenta vive en `services/vacaciones/saldos.ts`: la comparte con el plan de vacaciones por proyecto.
    res.json(await saldosDeVacaciones(tenantId, req.tenantObjectId, selectedYear));
  } catch (error: any) {
    console.error("Error fetching users vacation balance:", error);
    res.status(500).json({ error: "Error al obtener la gestión de vacaciones de los usuarios" });
  }
});

// POST /api/vacations/users-balance - Save/override user vacation balances
router.post("/users-balance", soloAdminVacaciones, async (req: any, res) => {
  try {
    const tenantId = req.tenantId;
    const { updates } = req.body;

    if (!Array.isArray(updates)) {
      return res.status(400).json({ error: "Formato de actualización inválido" });
    }

    const { UserVacationBalance } = await import("../models/UserVacationBalance.js");

    const promises = updates.map(async (update: any) => {
      const { userId, year, totalAnnual, taken, pending, available } = update;

      if (!userId || !year) {
        throw new Error("userId y year son requeridos para cada actualización");
      }

      // Upsert the override record
      return UserVacationBalance.findOneAndUpdate(
        { tenantId, userId, year },
        {
          $set: {
            totalAnnual,
            taken,
            pending,
            available,
          },
        },
        { new: true, upsert: true }
      );
    });

    await Promise.all(promises);

    res.json({ message: "Balances de vacaciones guardados correctamente" });
  } catch (error: any) {
    console.error("Error saving user vacation balances:", error);
    res.status(500).json({ error: "Error al guardar los balances de vacaciones", details: error.message });
  }
});

// GET /api/vacations - Get all vacation requests
// GET /api/vacations - Get all vacation requests
router.get("/", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { mine, page = 1, limit = 50 } = req.query as any;
    let limitNum = Number(limit);
    if (limitNum > 100) limitNum = 100; // Cap limit

    const query: any = { tenantId };

    if (mine === "true") {
      query.userId = req.user!.userId;
    }

    const skip = (Number(page) - 1) * limitNum;

    const [vacations, total] = await Promise.all([
      Vacation.find(query)
        .populate({
          path: "userId",
          select: "firstName lastName email metadata projectIds clientIds",
          populate: [
            { path: "projectIds", select: "name" },
            { path: "clientIds", select: "name" },
            {
              path: "metadata.projects",
              model: UserProject,
              select: "projectId nombre_proyecto nombre_rol_frame contracts.fecha_baja_contrato contracts.nombre_sede contracts.nombre_rol_frame",
              populate: {
                path: "projectId",
                select: "name",
              },
            },
          ],
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Vacation.countDocuments(query),
    ]);

    /*
      Los nombres de quienes aprueban (columnas Supervisor y Coordinador de la bandeja, 15/11/2026): todos
      los de la cadena y las aprobaciones de la página, en una sola consulta.
    */
    const idsAprobadores = new Set<string>();
    for (const v of vacations as any[]) {
      for (const p of v.cadena?.proyectos || []) for (const u of [...(p.supervisores || []), ...(p.coordinadores || [])]) idsAprobadores.add(String(u));
      for (const a of [v.aprobaciones?.supervisor, v.aprobaciones?.coordinador, v.rechazo]) if (a?.userId) idsAprobadores.add(String(a.userId));
    }
    const nombresAprobadores: Record<string, string> = {};
    if (idsAprobadores.size) {
      const gente: any[] = await User.find({ _id: { $in: [...idsAprobadores].filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id)) } }).select("firstName lastName metadata.fullName").lean();
      for (const g of gente) nombresAprobadores[String(g._id)] = g.metadata?.fullName || `${g.firstName || ""} ${g.lastName || ""}`.trim();
    }

    const mappedVacations = vacations.map((v: any) => {
      const userObj = v.userId;
      let projectsInfo: { name: string; role: string }[] = [];
      let userProject = "-";
      let userRoleFrame = "-";

      // Snapshot data structure
      const userSnapshot = {
        sedes: new Set<string>(),
        rolFrames: new Set<string>(),
        clients: new Set<string>(),
        projects: [] as { name: string; clientName?: string }[],
        rolesFrameIds: [] as string[],
      };

      // Helper to avoid duplicates in projects list
      const addProjectSnapshot = (name: string, clientName: string = "") => {
        if (name && !userSnapshot.projects.some((p) => p.name === name)) {
          userSnapshot.projects.push({ name, clientName });
        }
      };

      if (userObj) {
        // Extract Role Frame IDs from metadata
        if (userObj.metadata?.roles_frame && Array.isArray(userObj.metadata.roles_frame)) {
          userSnapshot.rolesFrameIds = userObj.metadata.roles_frame.map((id: any) => id.toString());
        } else if (userObj.metadata?.rolesFrameIds && Array.isArray(userObj.metadata.rolesFrameIds)) {
          userSnapshot.rolesFrameIds = userObj.metadata.rolesFrameIds.map((id: any) => id.toString());
        }
        // DEBUG: Inspect populated data
        console.log(`[Vacations Debug] Processing user ${userObj._id}`);
        if (userObj.projectIds && userObj.projectIds.length > 0) {
          console.log("[Vacations Debug] ProjectIds sample:", JSON.stringify(userObj.projectIds[0], null, 2));
        } else {
          console.log("[Vacations Debug] No projectIds found");
        }
        if (userObj.metadata?.projects && userObj.metadata.projects.length > 0) {
          console.log("[Vacations Debug] Metadata Projects sample:", JSON.stringify(userObj.metadata.projects[0], null, 2));
        }

        // 1. Metadata extraction (Sedes, Rol Frames, Legacy ProjectsInfo, Deep Linked Clients)
        if (userObj.metadata && Array.isArray(userObj.metadata.projects)) {
          projectsInfo = userObj.metadata.projects.map((p: any) => ({
            name: p.nombre_proyecto || "-",
            role: p.nombre_rol_frame || "-",
          }));

          userObj.metadata.projects.forEach((p: any) => {
            // Check contracts for Sedes and RolFrames
            if (Array.isArray(p.contracts)) {
              p.contracts.forEach((c: any) => {
                const endDate = c.fecha_baja_contrato ? new Date(c.fecha_baja_contrato) : null;
                const isActive = !endDate || endDate >= new Date();

                if (isActive) {
                  if (c.nombre_sede) userSnapshot.sedes.add(c.nombre_sede);
                  const rf = c.nombre_rol_frame || p.nombre_rol_frame;
                  if (rf) userSnapshot.rolFrames.add(rf);
                }
              });
            }
            // Fallback for role frame
            if (p.nombre_rol_frame) userSnapshot.rolFrames.add(p.nombre_rol_frame);

            // Extract Client and Project from deep link (UserProject -> Project -> Client)
            if (p.projectId) {
              const internalProj = p.projectId;
              let clientName = "";
              if (internalProj.clientId && internalProj.clientId.name) {
                clientName = internalProj.clientId.name;
                userSnapshot.clients.add(clientName);
              }
              if (internalProj.name) {
                addProjectSnapshot(internalProj.name, clientName);
              }
            }
          });
        }

        // 2. Internal Data extraction (Clients, Projects from user.projectIds)
        if (Array.isArray(userObj.clientIds)) {
          userObj.clientIds.forEach((c: any) => {
            if (c && c.name) userSnapshot.clients.add(c.name);
          });
        }

        if (Array.isArray(userObj.projectIds)) {
          userObj.projectIds.forEach((p: any) => {
            if (p && p.name) {
              let clientName = "";
              if (p.clientId && p.clientId.name) {
                clientName = p.clientId.name;
                userSnapshot.clients.add(clientName);
              }
              addProjectSnapshot(p.name, clientName);
            }
          });
        }
      }

      if (projectsInfo.length > 0) {
        userProject = projectsInfo.map((p) => p.name).join(", ");
        userRoleFrame = projectsInfo.map((p) => p.role).join(", ");
      }

      return {
        ...v,
        userId: userObj && userObj._id ? userObj._id : v.userId, // Restore ID if populated
        userProject,
        userRoleFrame,
        projectsInfo,
        nombresAprobadores: Object.fromEntries(
          [...new Set([...(v.cadena?.proyectos || []).flatMap((p: any) => [...(p.supervisores || []), ...(p.coordinadores || [])]), v.aprobaciones?.supervisor?.userId, v.aprobaciones?.coordinador?.userId, v.rechazo?.userId].filter(Boolean).map(String))].map((id) => [id, nombresAprobadores[id] || ""]),
        ),
        userSnapshot: {
          sedes: Array.from(userSnapshot.sedes),
          rolFrames: Array.from(userSnapshot.rolFrames),
          clients: Array.from(userSnapshot.clients),
          projects: userSnapshot.projects,
          rolesFrameIds: userSnapshot.rolesFrameIds,
        },
      };
    });

    res.json(mappedVacations);
  } catch (error: any) {
    console.error("Error fetching vacations:", error);
    res.status(500).json({ error: "Error al obtener las solicitudes de vacaciones" });
  }
});

/*
  LA BANDEJA «APROBACIONES» DE LA APP (15/11/2026): lo que espera mi aprobación como supervisor o
  coordinador y, para el coordinador, lo que todavía espera al supervisor. Ver `aprobacionPorEtapas.ts`.
  Van antes de `/:id` para que «aprobaciones» no se lea como un id.
*/
router.get("/aprobaciones", async (req: any, res) => {
  try {
    res.json(await bandejaDeAprobaciones(req.tenantObjectId, String(req.user!.userId)));
  } catch (error: any) {
    console.error("Error en la bandeja de aprobaciones de vacaciones:", error);
    res.status(500).json({ error: "Error al obtener las vacaciones para aprobar" });
  }
});

router.get("/aprobaciones/contar", async (req: any, res) => {
  try {
    res.json({ total: await contarParaAprobar(req.tenantObjectId, String(req.user!.userId)) });
  } catch (error: any) {
    console.error("Error contando vacaciones para aprobar:", error);
    res.status(500).json({ error: "Error al contar las vacaciones para aprobar" });
  }
});

// GET /api/vacations/:id - Get a single vacation request
router.get("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const vacation = await Vacation.findOne({ _id: id, tenantId });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }

    res.json(vacation);
  } catch (error: any) {
    console.error("Error fetching vacation:", error);
    res.status(500).json({ error: "Error al obtener la solicitud de vacaciones" });
  }
});

// POST /api/vacations - Create a new vacation request
router.post("/", async (req, res) => {
  try {
    // Todo el cálculo (fechas, solapamiento, días, saldo, snapshot de reglas) vive en `services/vacaciones/crearVacacion.ts`:
    // es el mismo camino por el que el plan de vacaciones por proyecto crea la vacación de un tercero.
    const { startDate, endDate, reason } = req.body;
    let newVacation = await crearVacacionParaPersona({ tenantId: req.tenantId, userId: req.user!.userId, startDate, endDate, reason, extra: req.body, origen: "solicitud" });
    /*
      Sube por la jerarquía: supervisor → coordinador → admin (sin ninguno, directo al admin). Si armar la
      cadena falla, la solicitud ya quedó guardada y `pending` sin cadena: la bandeja del admin la toma.
    */
    try {
      newVacation = await iniciarAprobacion(newVacation, (req as any).tenantObjectId);
    } catch (e) {
      console.error("[VACATIONS] No se pudo iniciar la aprobación por jerarquía:", e);
    }
    res.status(201).json(newVacation);
  } catch (error: any) {
    if (error instanceof ErrorVacacion) return res.status(error.status).json({ error: error.message });
    console.error("Error creating vacation:", error);
    if (error.message === "Tenant not found") {
      return res.status(404).json({ error: "Tenant no encontrado" });
    }
    res.status(500).json({ error: "Error al crear la solicitud de vacaciones", details: error.message });
  }
});

// PATCH /api/vacations/:id - Update a vacation request
router.patch("/:id", soloAdminVacaciones, async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const updatedVacation = await Vacation.findOneAndUpdate({ _id: id, tenantId }, { $set: req.body }, { new: true, runValidators: true });

    if (!updatedVacation) {
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }

    res.json(updatedVacation);
  } catch (error: any) {
    console.error("Error updating vacation:", error);
    res.status(500).json({ error: "Error al actualizar la solicitud de vacaciones" });
  }
});

// DELETE /api/vacations/:id - Delete a vacation request
router.delete("/:id", async (req, res) => {
  try {
    const tenantId = req.tenantId;
    const { id } = req.params;

    const existente = await Vacation.findOne({ _id: id, tenantId }).select("userId").lean();
    if (!existente) {
      return res.status(404).json({ error: "Solicitud no encontrada" });
    }
    if (!(await esDuenaOAdmin(req, existente))) return res.status(403).json({ error: "Sólo quien la pidió o el administrador pueden eliminarla" });
    await Vacation.deleteOne({ _id: id, tenantId });

    res.json({ message: "Solicitud eliminada correctamente" });
  } catch (error: any) {
    console.error("Error deleting vacation:", error);
    res.status(500).json({ error: "Error al eliminar la solicitud de vacaciones" });
  }
});

/*
  APROBAR / RECHAZAR UN PASO DE LA JERARQUÍA (15/11/2026): el supervisor o el coordinador, cuando le
  toca. Cuando no falta nadie, la solicitud pasa a `pre_approved` (con su PDF) y espera al admin.
*/
router.put("/:id/aprobar-etapa", async (req: any, res) => {
  try {
    const vacation = await Vacation.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!vacation) return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    res.json(await aprobarEtapa(vacation, String(req.user!.userId), req.tenantObjectId));
  } catch (error: any) {
    if (error instanceof ErrorVacacion) return res.status(error.status).json({ error: error.message });
    console.error("Aprobar etapa de vacación:", error);
    res.status(500).json({ error: "Error al aprobar la solicitud de vacaciones" });
  }
});

router.put("/:id/rechazar-etapa", async (req: any, res) => {
  try {
    const vacation = await Vacation.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!vacation) return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    res.json(await rechazarEtapa(vacation, String(req.user!.userId), req.body?.reason));
  } catch (error: any) {
    if (error instanceof ErrorVacacion) return res.status(error.status).json({ error: error.message });
    console.error("Rechazar etapa de vacación:", error);
    res.status(500).json({ error: "Error al rechazar la solicitud de vacaciones" });
  }
});

// El coordinador le pide al supervisor que apruebe (no aprueba por él). Uno por día.
router.post("/:id/recordar-supervisor", async (req: any, res) => {
  try {
    const vacation = await Vacation.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!vacation) return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    await recordarAlSupervisor(vacation, String(req.user!.userId));
    res.json({ ok: true });
  } catch (error: any) {
    if (error instanceof ErrorVacacion) return res.status(error.status).json({ error: error.message });
    console.error("Recordar al supervisor:", error);
    res.status(500).json({ error: "Error al avisar al supervisor" });
  }
});

/*
  PRE-APROBAR YA NO ES DEL ADMIN (15/11/2026): la pre-aprobación es la jerarquía. Queda el endpoint por
  compatibilidad (una app vieja), y hace lo mismo que `aprobar-etapa`: sólo pasa si le toca a quien llama.
*/
router.put("/:id/pre-approve", async (req: any, res) => {
  try {
    const vacation = await Vacation.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }
    res.json(await aprobarEtapa(vacation, String(req.user!.userId), req.tenantObjectId));
  } catch (error: any) {
    if (error instanceof ErrorVacacion) return res.status(error.status).json({ error: error.message });
    console.error("Pre-approve vacation error:", error);
    res.status(500).json({ error: "Error al preAprobar la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/approve - Approve a vacation request
// El admin aprueba recién cuando la jerarquía terminó (`pre_approved`): decisión del usuario, 15/11/2026.
router.put("/:id/approve", soloAdminVacaciones, async (req: any, res) => {
  try {
    const approverId = req.user!.userId;
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    /*
      Una `pending` que no espera a nadie (anterior a la jerarquía, sin cadena) es del admin: se pre-aprueba
      (con su PDF, como antes) y se aprueba. Si espera al supervisor o al coordinador, no se adelanta.
    */
    if (vacation.status === "pending" && etapaDe(vacation as any) === "admin") await preAprobarVacacion(vacation, approverId, req.tenantObjectId);
    if (vacation.status !== "pre_approved") {
      return res.status(400).json({ error: vacation.status === "pending" ? "Todavía espera la aprobación del supervisor o del coordinador" : "Solo las solicitudes preaprobadas pueden ser aprobadas" });
    }

    vacation.status = "approved";
    vacation.approvedBy = new Types.ObjectId(approverId);
    vacation.approvedAt = new Date();

    // Check if rules requires signature
    const requiresSignature = vacation.rules?.requiereFirma || false;
    vacation.requiresSignature = requiresSignature;

    if (requiresSignature) {
      vacation.signatureStatus = "sent";
      vacation.signatureSentAt = new Date();
    }

    await vacation.save();

    await adjustBalanceOnRequestChange(tenantId, vacation.userId, vacation.startDate.getFullYear(), vacation.daysRequested, "approve");

    if (requiresSignature) {
      await Notification.create({
        tenantId,
        userId: vacation.userId,
        type: "vacation",
        title: "Documento enviado para firma",
        message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada. Revisá tu casilla de email para firmar el documento.`,
        linkUrl: `/vacations`,
      });
    } else {
      await Notification.create({
        tenantId,
        userId: vacation.userId,
        type: "vacation",
        title: "Solicitud de vacaciones aprobada",
        message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido aprobada.`,
        linkUrl: `/vacations`,
      });
    }

    res.json(vacation);
  } catch (error: any) {
    console.error("Approve vacation error:", error);
    res.status(500).json({ error: "Error al aprobar la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/reject - Reject a vacation request
// El admin rechaza en cualquier paso (decisión del usuario, 15/11/2026). Mismo cierre que el rechazo de la jerarquía.
router.put("/:id/reject", soloAdminVacaciones, async (req: any, res) => {
  try {
    const vacation = await Vacation.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }
    res.json(await rechazarVacacion(vacation, { userId: String(req.user!.userId), nivel: "admin", motivo: req.body?.reason }));
  } catch (error: any) {
    if (error instanceof ErrorVacacion) return res.status(error.status).json({ error: error.message });
    console.error("Reject vacation error:", error);
    res.status(500).json({ error: "Error al rechazar la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/cancel - Cancel vacation request
router.put("/:id/cancel", async (req: any, res) => {
  try {
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (!(await esDuenaOAdmin(req, vacation))) return res.status(403).json({ error: "Sólo quien la pidió o el administrador pueden cancelarla" });
    if (!["pending", "pre_approved", "approved", "delivered"].includes(vacation.status)) {
      return res.status(400).json({ error: "Esta solicitud no puede ser cancelada" });
    }

    vacation.status = "cancelled";
    vacation.cancelledAt = new Date();
    await vacation.save();

    await adjustBalanceOnRequestChange(tenantId, vacation.userId, vacation.startDate.getFullYear(), vacation.daysRequested, "cancel");

    res.json(vacation);
  } catch (error: any) {
    console.error("Cancel vacation error:", error);
    res.status(500).json({ error: "Error al cancelar la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/deliver - Mark vacation as delivered
router.put("/:id/deliver", soloAdminVacaciones, async (req: any, res) => {
  try {
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (vacation.status !== "approved") {
      return res.status(400).json({ error: "Solo las solicitudes aprobadas pueden ser marcadas como entregadas" });
    }

    vacation.status = "delivered";
    vacation.deliveredAt = new Date();
    await vacation.save();

    await adjustBalanceOnRequestChange(tenantId, vacation.userId, vacation.startDate.getFullYear(), vacation.daysRequested, "deliver");

    await Notification.create({
      tenantId,
      userId: vacation.userId,
      type: "vacation",
      title: "Vacaciones Confirmadas",
      message: `Tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido confirmada y entregada.`,
      linkUrl: `/vacations`,
    });

    res.json(vacation);
  } catch (error: any) {
    console.error("Deliver vacation error:", error);
    res.status(500).json({ error: "Error al marcar como entregada la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/send-signature - Send vacation for signature
router.put("/:id/send-signature", soloAdminVacaciones, async (req: any, res) => {
  try {
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (vacation.status !== "approved") {
      return res.status(400).json({ error: "Solo las solicitudes aprobadas pueden ser enviadas para firma" });
    }

    vacation.signatureStatus = "sent";
    vacation.signatureSentAt = new Date();
    await vacation.save();

    await Notification.create({
      tenantId,
      userId: vacation.userId,
      type: "vacation",
      title: "Documento enviado para firma",
      message: `El documento de tu solicitud de vacaciones N°: ${vacation.vacationNumber} ha sido enviado para firma.`,
      linkUrl: `/vacations`,
    });

    res.json(vacation);
  } catch (error: any) {
    console.error("Send signature vacation error:", error);
    res.status(500).json({ error: "Error al enviar para firma la solicitud de vacaciones" });
  }
});

// PUT /api/vacations/:id/notify-signature - User notifies they have signed
router.put("/:id/notify-signature", async (req: any, res) => {
  try {
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (!(await esDuenaOAdmin(req, vacation))) return res.status(403).json({ error: "Sólo quien la pidió puede avisar que la firmó" });
    if (vacation.signatureStatus !== "sent") {
      // Allow re-notifying? Or fail? Better fail if not in sent state.
      return res.status(400).json({ error: "Solo las solicitudes enviadas para firma pueden ser notificadas" });
    }

    vacation.signatureNotifiedAt = new Date();
    await vacation.save();

    // Notify the approver (Supervisor/Admin)
    const approverId = vacation.approvedBy; // Assuming approvedBy is the admin/manager
    if (approverId) {
      await Notification.create({
        tenantId,
        userId: approverId,
        type: "vacation",
        title: "Firma completada por usuario",
        message: `El usuario ha notificado que completó la firma de la solicitud N°: ${vacation.vacationNumber}. Por favor verificá.`,
        linkUrl: `/vacations?id=${vacation._id}`,
      });
    }

    res.json(vacation);
  } catch (error: any) {
    console.error("Notify signature error:", error);
    res.status(500).json({ error: "Error al notificar la firma" });
  }
});

// PUT /api/vacations/:id/mark-signed - Mark vacation as signed
router.put("/:id/mark-signed", soloAdminVacaciones, async (req: any, res) => {
  try {
    const signerId = req.user!.userId;
    const tenantId = req.tenantId;

    const vacation = await Vacation.findOne({
      _id: req.params.id,
      tenantId,
    });

    if (!vacation) {
      return res.status(404).json({ error: "Solicitud de vacaciones no encontrada" });
    }

    if (vacation.signatureStatus !== "sent") {
      return res.status(400).json({ error: "Solo las solicitudes enviadas para firma pueden ser marcadas como firmadas" });
    }

    vacation.signatureStatus = "signed";
    vacation.signedAt = new Date();
    vacation.signedBy = new Types.ObjectId(signerId);
    await vacation.save();

    await adjustBalanceOnRequestChange(tenantId, vacation.userId, vacation.startDate.getFullYear(), vacation.daysRequested, "sign");

    // Notify the approver (Supervisor/Admin)
    if (vacation.approvedBy) {
      await Notification.create({
        tenantId,
        userId: vacation.approvedBy,
        type: "vacation",
        title: "Documento firmado por colaborador",
        message: `El colaborador ha confirmado la firma de la solicitud N°: ${vacation.vacationNumber}. Verifique el documento.`,
        linkUrl: `/vacations/${vacation._id}`,
      });
    }

    res.json(vacation);
  } catch (error: any) {
    console.error("Mark signed vacation error:", error);
    res.status(500).json({ error: "Error al marcar como firmada la solicitud de vacaciones" });
  }
});

export const vacationsRoutes = router;
