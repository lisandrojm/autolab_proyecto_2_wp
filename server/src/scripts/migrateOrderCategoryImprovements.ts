import { OrderCategory } from '../models/OrderCategory.js';

export async function migrateOrderCategoryImprovements() {
  console.log('🔄 Iniciando migración de mejoras en OrderCategory...');

  try {
    // Fase 1: Inicializar config vacíos a {}
    const result1 = await OrderCategory.updateMany(
      { config: { $exists: false } },
      { $set: { config: {} } }
    );

    const result2 = await OrderCategory.updateMany(
      { config: null },
      { $set: { config: {} } }
    );

    console.log(`✅ Inicializados ${result1.modifiedCount + result2.modifiedCount} campos config a {}`);

    // Fase 2: Convertir fechaLimite de string a Date
    const categoriesWithStringDates = await OrderCategory.find({
      fechaLimite: { $type: "string" }
    });

    let convertedCount = 0;
    for (const cat of categoriesWithStringDates) {
      if (cat.fechaLimite) {
        try {
          const stringDate = cat.fechaLimite as unknown as string;
          cat.fechaLimite = new Date(stringDate) as any;
          await cat.save();
          convertedCount++;
        } catch (error) {
          console.error(`⚠️ Error convirtiendo fecha para categoría ${cat._id}:`, error);
        }
      }
    }

    console.log(`✅ Convertidas ${convertedCount} fechaLimite de string a Date`);

    // Verificación final
    const totalCategories = await OrderCategory.countDocuments();
    const categoriesWithConfig = await OrderCategory.countDocuments({
      config: { $exists: true, $ne: null }
    });
    const categoriesWithSubtipos = await OrderCategory.countDocuments({
      'config.subtipos': { $exists: true, $ne: [] }
    });

    console.log(`\n📊 Resumen de migración OrderCategory:`);
    console.log(`   Total de categorías: ${totalCategories}`);
    console.log(`   Con config definido: ${categoriesWithConfig}`);
    console.log(`   Con subtipos configurados: ${categoriesWithSubtipos}`);

    return {
      success: true,
      configInitialized: result1.modifiedCount + result2.modifiedCount,
      datesConverted: convertedCount,
      totalCategories,
      categoriesWithConfig,
      categoriesWithSubtipos
    };

  } catch (error) {
    console.error('❌ Error en migración de OrderCategory:', error);
    throw error;
  }
}
