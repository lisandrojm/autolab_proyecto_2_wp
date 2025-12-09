import mongoose from "mongoose";
import { Order } from "../models/Order.js";
import { OrderCounter } from "../models/OrderCounter.js";
import { Tenant } from "../models/Tenant.js";

export async function syncOrderCounters() {
  try {
    console.log("🔄 Iniciando sincronización de contadores de pedidos...");

    const tenants = await Tenant.find({});
    console.log(`📊 Encontrados ${tenants.length} tenants`);

    let syncedCount = 0;
    let issuesCount = 0;

    for (const tenant of tenants) {
      try {
        const lastOrder = await Order.findOne({ tenantId: tenant._id })
          .sort({ orderNumber: -1 })
          .select("orderNumber")
          .lean();

        if (!lastOrder || !lastOrder.orderNumber) {
          console.log(`   ℹ️  Tenant ${tenant.slug}: sin pedidos, inicializando contador en 0`);
          await OrderCounter.findOneAndUpdate(
            { tenantId: tenant._id },
            { $setOnInsert: { sequence: 0 } },
            { upsert: true, setDefaultsOnInsert: true }
          );
          syncedCount++;
          continue;
        }

        const match = lastOrder.orderNumber.match(/-(\d+)$/);
        if (!match) {
          console.warn(`   ⚠️  Tenant ${tenant.slug}: formato inválido de orderNumber: ${lastOrder.orderNumber}`);
          issuesCount++;
          continue;
        }

        const maxSequence = parseInt(match[1], 10);
        const existingCounter = await OrderCounter.findOne({ tenantId: tenant._id });

        if (!existingCounter) {
          await OrderCounter.create({
            tenantId: tenant._id,
            sequence: maxSequence,
          });
          console.log(`   ✅ Tenant ${tenant.slug}: contador creado con secuencia ${maxSequence}`);
          syncedCount++;
        } else if (existingCounter.sequence < maxSequence) {
          await OrderCounter.findOneAndUpdate(
            { tenantId: tenant._id },
            { $set: { sequence: maxSequence } }
          );
          console.log(`   ✅ Tenant ${tenant.slug}: contador actualizado de ${existingCounter.sequence} a ${maxSequence}`);
          syncedCount++;
        } else if (existingCounter.sequence > maxSequence) {
          console.log(`   ⚠️  Tenant ${tenant.slug}: contador (${existingCounter.sequence}) mayor que máximo pedido (${maxSequence}). Se mantiene actual.`);
        } else {
          console.log(`   ✔️  Tenant ${tenant.slug}: contador sincronizado (${existingCounter.sequence})`);
          syncedCount++;
        }
      } catch (error) {
        console.error(`   ❌ Error procesando tenant ${tenant.slug}:`, error);
        issuesCount++;
      }
    }

    console.log(`\n✅ Sincronización completada: ${syncedCount} tenants procesados, ${issuesCount} con problemas`);
  } catch (error) {
    console.error("❌ Error en sincronización de contadores:", error);
    throw error;
  }
}

export async function validateOrderCounters(): Promise<boolean> {
  try {
    const tenants = await Tenant.find({});
    let hasIssues = false;

    for (const tenant of tenants) {
      const duplicates = await OrderCounter.countDocuments({ tenantId: tenant._id });
      if (duplicates > 1) {
        console.warn(`⚠️  Tenant ${tenant.slug} tiene ${duplicates} contadores duplicados`);
        hasIssues = true;
      }
    }

    return !hasIssues;
  } catch (error) {
    console.error("❌ Error validando contadores:", error);
    return false;
  }
}
