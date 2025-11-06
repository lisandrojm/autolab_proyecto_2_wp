const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = `${process.env.MONGO_URI}${process.env.MONGO_DB_NAME}`;

async function cleanDatabase() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collections = await db.listCollections().toArray();

    console.log(`\n📋 Found ${collections.length} collections`);

    for (const collection of collections) {
      const name = collection.name;
      console.log(`🗑️  Dropping collection: ${name}`);
      await db.dropCollection(name);
    }

    console.log('\n✅ Database cleaned successfully!');
    console.log('👉 Now restart your server to run the seed automatically');

    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

cleanDatabase();
