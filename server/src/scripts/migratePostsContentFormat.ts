import mongoose from "mongoose";
import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const nodeEnv = process.env.NODE_ENV || 'development';
const envFileName = nodeEnv === 'production' ? '.env.production' : '.env.development';
const ENV_PATH = resolve(__dirname, `../../${envFileName}`);

config({ path: ENV_PATH });

if (!process.env.MONGO_URI) {
  console.error("❌ Error: MONGO_URI no está definida en las variables de entorno");
  console.error(`📂 Intentando cargar desde: ${ENV_PATH}`);
  console.error("💡 Asegúrate de tener configurado el archivo .env correspondiente");
  process.exit(1);
}

if (!process.env.MONGO_DB_NAME) {
  console.error("❌ Error: MONGO_DB_NAME no está definida en las variables de entorno");
  process.exit(1);
}

type ContentFormat = "post" | "reel" | "story" | "video" | "short" | "article" | "thread";
type Platform = "facebook" | "instagram" | "twitter" | "linkedin" | "tiktok" | "youtube";
type Channel = string;

function getFormatFromChannel(channel: string): ContentFormat | null {
  if (channel.includes("_post")) return "post";
  if (channel.includes("_reel")) return "reel";
  if (channel.includes("_story")) return "story";
  if (channel.includes("_video")) return "video";
  if (channel.includes("_short")) return "short";
  if (channel.includes("_article")) return "article";
  if (channel.includes("_thread")) return "thread";
  return null;
}

function getPlatformFromChannel(channel: string): Platform | null {
  if (channel.startsWith("instagram")) return "instagram";
  if (channel.startsWith("facebook")) return "facebook";
  if (channel.startsWith("linkedin")) return "linkedin";
  if (channel.startsWith("tiktok")) return "tiktok";
  if (channel.startsWith("youtube")) return "youtube";
  if (channel.startsWith("twitter")) return "twitter";
  return null;
}

function buildChannelFromFormatAndPlatform(format: ContentFormat, platform: Platform): Channel | null {
  const channelKey = `${platform}_${format}`;
  const validChannels = [
    "instagram_post", "instagram_reel", "instagram_story",
    "facebook_post", "facebook_reel", "facebook_story",
    "linkedin_post", "linkedin_article",
    "tiktok_post", "tiktok_story",
    "youtube_short", "youtube_video",
    "twitter_post", "twitter_thread"
  ];

  if (validChannels.includes(channelKey)) {
    return channelKey;
  }
  return null;
}

async function migratePostsContentFormat(dryRun: boolean = true) {
  try {
    console.log("🚀 Iniciando migración de posts...");
    console.log(`Modo: ${dryRun ? "DRY RUN (sin cambios reales)" : "EJECUCIÓN REAL"}`);
    console.log(`Entorno: ${process.env.NODE_ENV || 'development'}`);
    console.log("----------------------------------------");

    const mongoUri = `${process.env.MONGO_URI}${process.env.MONGO_DB_NAME}`;
    console.log(`🔌 Conectando a: ${mongoUri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')}`);

    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log(`✅ Conectado a MongoDB: ${process.env.MONGO_DB_NAME}`);

    const postModel = mongoose.model("Post", new mongoose.Schema({}, { strict: false }));
    const posts = await postModel.find({}).lean();
    console.log(`📊 Total de posts encontrados: ${posts.length}`);

    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (const post of posts as any[]) {
      try {
        const updates: any = {};
        let needsUpdate = false;

        if (post.postType === "social") {
          if (!post.contentFormat && post.channel) {
            const inferredFormat = getFormatFromChannel(post.channel);
            if (inferredFormat) {
              updates.contentFormat = inferredFormat;
              needsUpdate = true;
              console.log(`  📝 Post ${post._id}: Inferido formato "${inferredFormat}" desde channel "${post.channel}"`);
            } else {
              updates.contentFormat = "post";
              needsUpdate = true;
              console.log(`  ⚠️  Post ${post._id}: No se pudo inferir formato, asignando "post" por defecto`);
            }
          }

          if (!post.channels || post.channels.length === 0) {
            const format = updates.contentFormat || post.contentFormat || "post";
            let platforms: Platform[] = post.platforms || [];

            if (platforms.length === 0 && post.channel) {
              const inferredPlatform = getPlatformFromChannel(post.channel);
              if (inferredPlatform) {
                platforms = [inferredPlatform];
                updates.platforms = platforms;
                console.log(`  📝 Post ${post._id}: Inferida plataforma "${inferredPlatform}" desde channel "${post.channel}"`);
              }
            }

            if (platforms.length > 0) {
              const generatedChannels: string[] = [];
              for (const platform of platforms) {
                const channelKey = buildChannelFromFormatAndPlatform(format, platform);
                if (channelKey) {
                  generatedChannels.push(channelKey);
                }
              }

              if (generatedChannels.length > 0) {
                updates.channels = generatedChannels;
                needsUpdate = true;
                console.log(`  📝 Post ${post._id}: Generados channels [${generatedChannels.join(", ")}]`);
              }
            }
          }
        } else if (post.postType === "email") {
          if (!post.channels || post.channels.length === 0) {
            updates.channels = ["email"];
            needsUpdate = true;
            console.log(`  📧 Post ${post._id}: Asignado channel "email"`);
          }
        } else if (post.postType === "push") {
          if (!post.channels || post.channels.length === 0) {
            updates.channels = ["push_notification"];
            needsUpdate = true;
            console.log(`  🔔 Post ${post._id}: Asignado channel "push_notification"`);
          }
        }

        if (needsUpdate) {
          if (!dryRun) {
            await postModel.updateOne({ _id: post._id }, { $set: updates });
          }
          migrated++;
        } else {
          skipped++;
        }
      } catch (error: any) {
        errors++;
        console.error(`  ❌ Error procesando post ${post._id}:`, error.message);
      }
    }

    console.log("----------------------------------------");
    console.log("📊 Resumen de migración:");
    console.log(`  ✅ Posts migrados: ${migrated}`);
    console.log(`  ⏭️  Posts omitidos (ya migrados): ${skipped}`);
    console.log(`  ❌ Errores: ${errors}`);
    console.log("----------------------------------------");

    if (dryRun) {
      console.log("⚠️  MODO DRY RUN: No se realizaron cambios reales en la base de datos");
      console.log("💡 Ejecuta con --exec para aplicar los cambios");
      console.log("💡 Ejemplo: npm run migrate:posts -- --exec");
    } else {
      console.log("✅ Migración completada exitosamente");
      console.log("⚠️  IMPORTANTE: Verifica los cambios en tu base de datos");
    }

    await mongoose.connection.close();
    console.log("🔌 Desconectado de MongoDB");

  } catch (error: any) {
    console.error("❌ Error en la migración:", error);

    if (error.name === 'MongooseServerSelectionError') {
      console.error("\n💡 Posibles soluciones:");
      console.error("   1. Verifica que MONGO_URI esté correctamente configurada");
      console.error("   2. Asegúrate de que tu IP esté en la whitelist de MongoDB Atlas");
      console.error("   3. Verifica que las credenciales de la base de datos sean correctas");
      console.error("   4. Comprueba tu conexión a internet");
    }

    await mongoose.connection.close().catch(() => {});
    process.exit(1);
  }
}

const dryRun = !process.argv.includes("--exec");
migratePostsContentFormat(dryRun);
