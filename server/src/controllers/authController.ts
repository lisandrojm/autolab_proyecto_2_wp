import { Request, Response } from "express";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { RegisterInput } from "../validators/authSchemas.js";
import { signJwt } from "../utils/jwt.js";
import { TenantRequest } from "../middleware/tenant.js";

export const register = async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { firstName, lastName, email, password }: RegisterInput = req.body;
    const tenantId = req.tenantObjectId!;

    // Verificar si el usuario ya existe en este tenant
    const existingUser = await User.findOne({ email, tenantId });
    if (existingUser) {
      res.status(409).json({ error: "Este correo ya está registrado en este tenant" });
      return;
    }

    // Obtener rol por defecto para el tenant
    const defaultRole = await Role.findOne({ tenantId, isDefault: true });

    if (!defaultRole) {
      console.warn(`[Register] No default role found for tenant: ${tenantId}`);
    } else {
      console.log(`[Register] Assigning default role: ${defaultRole.name} (${defaultRole._id})`);
    }

    const roleIds = defaultRole ? [defaultRole._id] : [];

    // Crear nuevo usuario
    const user = new User({
      firstName,
      lastName,
      email,
      password, // Se hasheará automáticamente en el pre-save hook
      roles: roleIds,
      tenantId,
      isActive: true,
    });

    await user.save();

    // Obtener permisos agregados de todos los roles del usuario
    const userWithRoles = await User.findById(user._id).populate('roles', 'permissions');
    const rolePermissions = userWithRoles?.roles ?
      (userWithRoles.roles as any[]).flatMap(role => role.permissions || []) : [];

    // Eliminar duplicados
    const permissions = [...new Set(rolePermissions)];

    // Generar JWT con nombres de roles
    const roleNames = defaultRole ? [defaultRole.name] : [];
    const primaryRole = roleNames.length > 0 ? roleNames[0] : null;

    const payload = {
      sub: String(user._id),
      email: user.email,
      primaryRole,
      roles: roleNames,
      tenantId: String(tenantId),
      firstName: user.firstName,
      lastName: user.lastName,
    };

    const token = signJwt(payload);

    // Respuesta exitosa (sin password)
    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roles: roleIds.map(id => id.toString()),
        permissions,
        tenantId,
      },
    });
  } catch (error: any) {
    console.error("Register error:", error);
    
    // Error de duplicado (por si el índice único falla)
    if (error.code === 11000) {
      res.status(409).json({ error: "Este correo ya está registrado en este tenant" });
      return;
    }
    
    res.status(500).json({ error: "Error interno del servidor" });
  }
};

export const checkEmailAvailability = async (req: TenantRequest, res: Response): Promise<void> => {
  try {
    const { email } = req.query;
    const tenantId = req.tenantObjectId!;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: "Email is required" });
      return;
    }

    const existingUser = await User.findOne({ email, tenantId });
    
    res.json({ available: !existingUser });
  } catch (error) {
    console.error("Check email availability error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};