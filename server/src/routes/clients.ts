import { Router } from "express";
import { z } from "zod";
import { Client } from "../models/Client.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { authenticateToken, AuthenticatedRequest } from "../middleware/auth.js";
import { requireTenant, TenantRequest } from "../middleware/tenant.js";
import { requireAnyRole } from "../middleware/requireAnyRole.js";
import { Types } from "mongoose";
import { toObjectIdOrNull } from "../utils/mongoIds.js";

const router = Router();

/** ✅ Global: exigir tenant + token + al menos un rol */
router.use(requireTenant, authenticateToken, requireAnyRole);

const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  industry: z.string().optional(),
  website: z.string().url().optional().or(z.literal("")),
  socialMedia: z
    .object({
      facebook: z.string().optional(),
      instagram: z.string().optional(),
      twitter: z.string().optional(),
      linkedin: z.string().optional(),
      tiktok: z.string().optional(),
      youtube: z.string().optional(),
    })
    .default({}),
  brandKit: z
    .object({
      logo: z.string().optional(),
      logos: z
        .array(
          z.object({
            url: z.string(),
            name: z.string().max(50).optional(),
            fileName: z.string().optional(),
            uploadedAt: z.union([z.string(), z.date()]).optional(),
            size: z.number().optional(),
          })
        )
        .default([]),
      documents: z
        .array(
          z.object({
            url: z.string(),
            name: z.string().max(100).optional(),
            fileName: z.string().optional(),
            fileType: z.string().optional(),
            uploadedAt: z.union([z.string(), z.date()]).optional(),
            size: z.number().optional(),
          })
        )
        .default([]),
      colors: z.array(z.string()).default([]),
      fonts: z.array(z.string()).default([]),
      guidelines: z.string().optional(),
    })
    .default({ logos: [], documents: [], colors: [], fonts: [] }),
  brief: z
    .object({
      objectives: z.array(z.string()).default([]),
      targetAudience: z.string().optional().or(z.literal("")),
      budget: z.number().optional(),
      timeline: z.string().optional(),
      preferences: z.string().optional(),
    })
    .default({ objectives: [] }),
  costCenters: z
    .array(
      z.object({
        name: z.string().min(1),
        code: z.string().min(1),
        description: z.string().optional(),
        budget: z.object({
          total: z.number().min(0),
          allocated: z.number().min(0).default(0),
          spent: z.number().min(0).default(0),
          currency: z.enum(["EUR", "USD", "GBP", "MXN", "ARS"]).default("EUR"),
        }),
        isActive: z.boolean().default(true),
      })
    )
    .default([]),
});

// ✅ GET /clients
router.get("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) return res.status(400).json({ error: "Invalid tenant ID" });

    const clients = await Client.find({ tenantId }).sort({ createdAt: -1 });
    res.json(clients);
  } catch (error) {
    console.error("Get clients error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET /clients/count
router.get("/count", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const tenantId = toObjectIdOrNull(req.tenantObjectId);
    if (!tenantId) return res.status(400).json({ error: "Invalid tenant ID" });

    const count = await Client.countDocuments({ tenantId });
    res.json({ count });
  } catch (error) {
    console.error("Count clients error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ POST /clients
router.post("/", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const data = createClientSchema.parse(req.body);

    const existingClient = await Client.findOne({
      email: data.email,
      tenantId: req.tenantObjectId,
    });
    if (existingClient) return res.status(409).json({ error: "Client with this email already exists" });

    const existingUser = await User.findOne({
      email: data.email,
      tenantId: req.tenantObjectId,
    });

    let newUser: any = null;

    if (!existingUser) {
      const clientRole = await Role.findOne({
        tenantId: req.tenantObjectId,
        name: { $regex: /^(client|cliente)$/i },
      });

      const nameParts = data.name.split(" ").filter((p) => p.trim());
      const firstName = nameParts[0] || data.name;
      const lastName = nameParts.length > 1 ? nameParts.slice(1).join(" ") : undefined;

      newUser = await User.create({
        email: data.email,
        password: "cliente123",
        firstName,
        lastName,
        role: "client",
        roles: clientRole ? [clientRole._id] : [],
        tenantId: req.tenantObjectId,
        isActive: true,
      });
    }

    const client = new Client({
      ...data,
      tenantId: req.tenantObjectId,
      createdBy: req.user!.userId,
      ownerUserId: newUser ? newUser._id : existingUser?._id,
      usuarios: newUser
        ? [
            {
              userId: newUser._id,
              permiso: "editar" as const,
            },
          ]
        : [],
      status: "onboarding",
    });

    await client.save();

    if (newUser) {
      newUser.clientIds = [client._id];
      await newUser.save();
    }

    res.status(201).json(client);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });

    console.error("Create client error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ GET /clients/:id
router.get("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const client = await Client.findOne({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    })
      .populate({
        path: "usuarios.userId",
        select: "email firstName lastName roles isActive",
        populate: { path: "roles", select: "name" },
      })
      .lean();

    if (!client) return res.status(404).json({ error: "Client not found" });

    const usuariosResolved = (client.usuarios || []).map((u: any) => {
      const userData = u.userId;
      let primaryRole = "client";
      if (userData?.roles?.length > 0) primaryRole = userData.roles[0]?.name || "client";
      return {
        id: String(userData?._id || ""),
        email: userData?.email || "Sin email",
        firstName: userData?.firstName || "",
        lastName: userData?.lastName || "",
        primaryRole,
        roles: userData?.roles || [],
        isActive: userData?.isActive ?? true,
        permiso: u.permiso,
      };
    });

    res.json({ ...client, usuarios: usuariosResolved, assignedUsersResolved: usuariosResolved });
  } catch (error) {
    console.error("Get client error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ PATCH /clients/:id
router.patch("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const updateData = createClientSchema.partial().parse(req.body);
    delete (updateData as any).createdBy;

    const client = await Client.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId }, updateData, { new: true, runValidators: true });

    if (!client) return res.status(404).json({ error: "Client not found" });

    res.json(client);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Update client error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ DELETE /clients/:id
router.delete("/:id", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const client = await Client.findOneAndDelete({
      _id: req.params.id,
      tenantId: req.tenantObjectId,
    });

    if (!client) return res.status(404).json({ error: "Client not found" });

    res.json({ message: "Client deleted successfully" });
  } catch (error) {
    console.error("Delete client error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ POST /clients/:id/share
router.post("/:id/share", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id, permiso } = z
      .object({
        id: z.string().min(1),
        permiso: z.enum(["ver", "editar"]),
      })
      .parse(req.body);

    if (!Types.ObjectId.isValid(id)) return res.status(400).json({ error: "Invalid user ID format" });

    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const userExists = await User.findOne({ _id: id, tenantId: req.tenantObjectId });
    if (!userExists) return res.status(404).json({ error: "User not found" });

    const exists = (client.usuarios || []).some((u) => String(u.userId) === String(id));

    if (!exists) {
      client.usuarios = [...(client.usuarios || []), { userId: new Types.ObjectId(id), permiso }];
      if (!userExists.clientIds) userExists.clientIds = [];
      if (!userExists.clientIds.some((cid) => String(cid) === String(client._id))) {
        userExists.clientIds.push(client._id as any);
        await userExists.save();
      }
    } else {
      const existingIndex = client.usuarios.findIndex((u) => String(u.userId) === String(id));
      if (existingIndex >= 0) client.usuarios[existingIndex].permiso = permiso;
    }

    await client.save();
    res.json(client);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Share client error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ POST /clients/:id/unshare
router.post("/:id/unshare", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { id } = z.object({ id: z.string().min(1) }).parse(req.body);

    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    client.usuarios = client.usuarios.filter((u) => String(u.userId) !== id);
    await client.save();

    const user = await User.findById(id);
    if (user) {
      user.clientIds = user.clientIds.filter((cid) => !(cid as any).equals(client._id));
      await user.save();
    }

    res.json(client);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Unshare client error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ POST /clients/:id/brandkit/logos - Add a new logo
router.post("/:id/brandkit/logos", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const logoData = z
      .object({
        url: z.string(),
        name: z.string().max(50).optional(),
        fileName: z.string().optional(),
        size: z.number().optional(),
      })
      .parse(req.body);

    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    if (!client.brandKit) {
      client.brandKit = { logos: [], documents: [], colors: [], fonts: [] };
    }
    if (!client.brandKit.logos) {
      client.brandKit.logos = [];
    }

    if (client.brandKit.logos.length >= 10) {
      return res.status(400).json({ error: "Maximum of 10 logos allowed" });
    }

    const newLogo = {
      _id: new Types.ObjectId(),
      url: logoData.url,
      name: logoData.name,
      fileName: logoData.fileName,
      uploadedAt: new Date(),
      size: logoData.size,
    };

    client.brandKit.logos.push(newLogo as any);
    await client.save();

    res.status(201).json(newLogo);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Add logo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ PATCH /clients/:id/brandkit/logos/:logoId - Update logo name
router.patch("/:id/brandkit/logos/:logoId", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { name } = z.object({ name: z.string().max(50) }).parse(req.body);

    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const logo = client.brandKit?.logos?.find((l: any) => String(l._id) === req.params.logoId);
    if (!logo) return res.status(404).json({ error: "Logo not found" });

    (logo as any).name = name;
    await client.save();

    res.json(logo);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Update logo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ DELETE /clients/:id/brandkit/logos/:logoId - Delete a logo
router.delete("/:id/brandkit/logos/:logoId", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const logoIndex = client.brandKit?.logos?.findIndex((l: any) => String(l._id) === req.params.logoId);
    if (logoIndex === undefined || logoIndex === -1) {
      return res.status(404).json({ error: "Logo not found" });
    }

    client.brandKit.logos.splice(logoIndex, 1);
    await client.save();

    res.json({ message: "Logo deleted successfully" });
  } catch (error) {
    console.error("Delete logo error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ PUT /clients/:id/brandkit/logos/reorder - Reorder logos
router.put("/:id/brandkit/logos/reorder", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { logoIds } = z.object({ logoIds: z.array(z.string()) }).parse(req.body);

    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    if (!client.brandKit?.logos) {
      return res.status(400).json({ error: "No logos to reorder" });
    }

    const reorderedLogos = logoIds
      .map((id) => client.brandKit.logos.find((l: any) => String(l._id) === id))
      .filter(Boolean);

    if (reorderedLogos.length !== client.brandKit.logos.length) {
      return res.status(400).json({ error: "Invalid logo IDs" });
    }

    client.brandKit.logos = reorderedLogos as any;
    await client.save();

    res.json({ logos: client.brandKit.logos });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Reorder logos error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ PATCH /clients/:id/favorite - Toggle favorite status
router.patch("/:id/favorite", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { favorite } = z.object({ favorite: z.boolean() }).parse(req.body);

    const client = await Client.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantObjectId }, { favorite }, { new: true });

    if (!client) return res.status(404).json({ error: "Client not found" });

    res.json(client);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Update client favorite error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ POST /clients/:id/brandkit/documents - Add a new document
router.post("/:id/brandkit/documents", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const documentData = z
      .object({
        url: z.string(),
        name: z.string().max(100).optional(),
        fileName: z.string().optional(),
        fileType: z.string().optional(),
        size: z.number().optional(),
      })
      .parse(req.body);

    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    if (!client.brandKit) {
      client.brandKit = { logos: [], documents: [], colors: [], fonts: [] };
    }
    if (!client.brandKit.documents) {
      client.brandKit.documents = [];
    }

    if (client.brandKit.documents.length >= 20) {
      return res.status(400).json({ error: "Maximum of 20 documents allowed" });
    }

    const newDocument = {
      _id: new Types.ObjectId(),
      url: documentData.url,
      name: documentData.name,
      fileName: documentData.fileName,
      fileType: documentData.fileType,
      uploadedAt: new Date(),
      size: documentData.size,
    };

    client.brandKit.documents.push(newDocument as any);
    await client.save();

    res.status(201).json(newDocument);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Add document error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ PATCH /clients/:id/brandkit/documents/:docId - Update document name
router.patch("/:id/brandkit/documents/:docId", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { name } = z.object({ name: z.string().max(100) }).parse(req.body);

    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const document = client.brandKit?.documents?.find((d: any) => String(d._id) === req.params.docId);
    if (!document) return res.status(404).json({ error: "Document not found" });

    (document as any).name = name;
    await client.save();

    res.json(document);
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Update document error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ DELETE /clients/:id/brandkit/documents/:docId - Delete a document
router.delete("/:id/brandkit/documents/:docId", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    const docIndex = client.brandKit?.documents?.findIndex((d: any) => String(d._id) === req.params.docId);
    if (docIndex === undefined || docIndex === -1) {
      return res.status(404).json({ error: "Document not found" });
    }

    client.brandKit.documents.splice(docIndex, 1);
    await client.save();

    res.json({ message: "Document deleted successfully" });
  } catch (error) {
    console.error("Delete document error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// ✅ PUT /clients/:id/brandkit/documents/reorder - Reorder documents
router.put("/:id/brandkit/documents/reorder", async (req: AuthenticatedRequest & TenantRequest, res) => {
  try {
    const { documentIds } = z.object({ documentIds: z.array(z.string()) }).parse(req.body);

    const client = await Client.findOne({ _id: req.params.id, tenantId: req.tenantObjectId });
    if (!client) return res.status(404).json({ error: "Client not found" });

    if (!client.brandKit?.documents) {
      return res.status(400).json({ error: "No documents to reorder" });
    }

    const reorderedDocuments = documentIds
      .map((id) => client.brandKit.documents.find((d: any) => String(d._id) === id))
      .filter(Boolean);

    if (reorderedDocuments.length !== client.brandKit.documents.length) {
      return res.status(400).json({ error: "Invalid document IDs" });
    }

    client.brandKit.documents = reorderedDocuments as any;
    await client.save();

    res.json({ documents: client.brandKit.documents });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: "Invalid data", details: error.errors });
    console.error("Reorder documents error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

export { router as clientRoutes };
