import mongoose from 'mongoose';
import { Role } from '../models/Role.js';

/**
 * Script de migración para convertir permisos antiguos al nuevo sistema simplificado
 *
 * Cambios:
 * - module:read → module:view
 * - Eliminar module:write, module:update, module:delete redundantes
 * - Mantener solo module:view que da acceso completo por defecto
 */

const PERMISSION_MAPPING: Record<string, string> = {
  'clients:read': 'clients:view',
  'clients:write': 'clients:view',
  'clients:update': 'clients:view',
  'clients:delete': 'clients:view',

  'campaigns:read': 'campaigns:view',
  'campaigns:write': 'campaigns:view',
  'campaigns:update': 'campaigns:view',
  'campaigns:delete': 'campaigns:view',

  'posts:read': 'posts:view',
  'posts:write': 'posts:view',
  'posts:update': 'posts:view',
  'posts:delete': 'posts:view',

  'briefs:read': 'briefs:view',
  'briefs:write': 'briefs:view',
  'briefs:update': 'briefs:view',
  'briefs:delete': 'briefs:view',

  'projects:read': 'projects:view',
  'projects:write': 'projects:view',
  'projects:update': 'projects:view',
  'projects:delete': 'projects:view',

  'tasks:read': 'tasks:view',
  'tasks:write': 'tasks:view',
  'tasks:update': 'tasks:view',
  'tasks:delete': 'tasks:view',

  'assets:read': 'assets:view',
  'assets:write': 'assets:view',
  'assets:update': 'assets:view',
  'assets:delete': 'assets:view',

  'roles:read': 'roles:view',
  'roles:write': 'roles:view',
  'roles:update': 'roles:view',
  'roles:delete': 'roles:view',

  'users:read': 'users:view',
  'users:write': 'users:view',
  'users:update': 'users:view',
  'users:delete': 'users:view',
  'users:manage': 'users:view',

  'tenants:read': 'tenants:view',
  'tenants:write': 'tenants:view',
  'tenants:update': 'tenants:view',
  'tenants:delete': 'tenants:view',
};

async function migratePermissions() {
  try {
    const mongoUri = process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error('MONGO_URI not found in environment variables');
    }

    console.log('🔌 Connecting to MongoDB...');
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Obtener todos los roles
    const roles = await Role.find({});
    console.log(`📋 Found ${roles.length} roles to migrate`);

    let migratedCount = 0;
    let unchangedCount = 0;

    for (const role of roles) {
      const oldPermissions = role.permissions;
      const newPermissions = new Set<string>();

      // Mapear permisos antiguos a nuevos
      for (const perm of oldPermissions) {
        if (PERMISSION_MAPPING[perm]) {
          newPermissions.add(PERMISSION_MAPPING[perm]);
        } else if (perm === '*' || perm.endsWith(':*')) {
          // Mantener comodines
          newPermissions.add(perm);
        } else if (perm.endsWith(':view') || perm === 'dashboard:view' || perm === 'creative:view' || perm === 'analytics:view' || perm === 'calendar:view') {
          // Ya está en el formato nuevo
          newPermissions.add(perm);
        } else {
          // Permiso desconocido, mantener pero avisar
          console.warn(`⚠️  Unknown permission: ${perm} in role ${role.name}`);
          newPermissions.add(perm);
        }
      }

      const newPermissionsArray = Array.from(newPermissions);

      // Solo actualizar si hay cambios
      if (JSON.stringify(oldPermissions.sort()) !== JSON.stringify(newPermissionsArray.sort())) {
        console.log(`🔄 Migrating role: ${role.name}`);
        console.log(`   Old permissions (${oldPermissions.length}):`, oldPermissions.slice(0, 5), oldPermissions.length > 5 ? '...' : '');
        console.log(`   New permissions (${newPermissionsArray.length}):`, newPermissionsArray);

        role.permissions = newPermissionsArray;
        await role.save();
        migratedCount++;
      } else {
        unchangedCount++;
      }
    }

    console.log('\n✅ Migration completed successfully!');
    console.log(`   📝 Migrated: ${migratedCount} roles`);
    console.log(`   ⏭️  Unchanged: ${unchangedCount} roles`);
    console.log(`   📊 Total: ${roles.length} roles`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  }
}

// Ejecutar migración
migratePermissions()
  .then(() => {
    console.log('\n🎉 All done!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n💥 Migration failed:', error);
    process.exit(1);
  });
