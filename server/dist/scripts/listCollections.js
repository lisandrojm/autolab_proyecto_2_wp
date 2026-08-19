import mongoose from 'mongoose';
import 'dotenv/config';
import fs from 'fs';
async function listCollections() {
    try {
        const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/autolab';
        const dbName = process.env.MONGO_DB_NAME || 'weprodu_development_integration';
        await mongoose.connect(mongoUri, { dbName });
        const collections = await mongoose.connection.db.listCollections().toArray();
        const hasCatSat = collections.some(c => c.name === 'categorias-sat');
        let result = { hasCatSat, collections: collections.map(c => c.name) };
        if (hasCatSat) {
            const data = await mongoose.connection.db.collection('categorias-sat').find().limit(5).toArray();
            result.sampleData = data;
        }
        fs.writeFileSync('collections_data.json', JSON.stringify(result, null, 2));
        await mongoose.disconnect();
        process.exit(0);
    }
    catch (error) {
        fs.writeFileSync('collections_error.txt', error.toString());
        process.exit(1);
    }
}
listCollections();
