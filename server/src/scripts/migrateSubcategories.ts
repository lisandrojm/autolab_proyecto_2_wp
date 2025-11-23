import mongoose from 'mongoose';
import { Order } from '../models/Order.js';

export async function migrateSubcategoriesToArray() {
  console.log('🔄 Iniciando migración de subcategorías...');

  try {
    // Migrar documentos que tienen subcategoryId
    const result = await Order.updateMany(
      {
        subcategoryId: { $exists: true, $nin: [null, ""] }
      },
      [
        {
          $set: {
            subcategories: {
              $cond: {
                if: { $ne: ["$subcategoryId", null] },
                then: ["$subcategoryId"],
                else: []
              }
            }
          }
        },
        {
          $unset: ["subcategoryId", "subcategoryLabel"]
        }
      ]
    );

    console.log(`✅ Migrados ${result.modifiedCount} pedidos con subcategoryId → subcategories`);

    // Documentos sin subcategoryId: asegurar array vacío
    const result2 = await Order.updateMany(
      {
        subcategories: { $exists: false }
      },
      {
        $set: { subcategories: [] }
      }
    );

    console.log(`✅ Inicializados ${result2.modifiedCount} pedidos sin subcategorías`);

    // Limpiar campos antiguos si quedaron
    const result3 = await Order.updateMany(
      {
        $or: [
          { subcategoryId: { $exists: true } },
          { subcategoryLabel: { $exists: true } }
        ]
      },
      {
        $unset: { subcategoryId: "", subcategoryLabel: "" }
      }
    );

    console.log(`✅ Limpiados ${result3.modifiedCount} pedidos con campos antiguos`);

    // Verificar resultado final
    const totalOrders = await Order.countDocuments();
    const ordersWithSubcategories = await Order.countDocuments({
      subcategories: { $exists: true, $ne: [] }
    });
    const ordersWithoutSubcategories = await Order.countDocuments({
      $or: [
        { subcategories: { $exists: false } },
        { subcategories: [] }
      ]
    });

    console.log(`\n📊 Resumen de migración:`);
    console.log(`   Total de pedidos: ${totalOrders}`);
    console.log(`   Con subcategorías: ${ordersWithSubcategories}`);
    console.log(`   Sin subcategorías: ${ordersWithoutSubcategories}`);

    return {
      success: true,
      migrated: result.modifiedCount,
      initialized: result2.modifiedCount,
      cleaned: result3.modifiedCount
    };

  } catch (error) {
    console.error('❌ Error en migración:', error);
    throw error;
  }
}
