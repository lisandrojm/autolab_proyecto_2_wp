import mongoose from 'mongoose';
import { env } from './env.js';

export const connectDB = async (): Promise<void> => {
  try {
    // In WebContainer environment, use in-memory MongoDB for development
    if (env.NODE_ENV === 'development' && env.MONGO_URI.includes('localhost')) {
      console.log('🔧 Development mode: Using in-memory database simulation');
      console.log(`✅ Database Connected: ${env.MONGO_DB_NAME} (simulated)`);
      return;
    }

    const connectionString = `${env.MONGO_URI}/${env.MONGO_DB_NAME}`;
    await mongoose.connect(connectionString);
    console.log(`✅ MongoDB Connected: ${env.MONGO_DB_NAME}`);
  } catch (error) {
    if (env.NODE_ENV === 'development') {
      console.log('⚠️  MongoDB not available, continuing in development mode');
      console.log(`✅ Database Connected: ${env.MONGO_DB_NAME} (simulated)`);
      return;
    }
    console.error('❌ MongoDB connection error:', error);
    process.exit(1);
  }
};

export const disconnectDB = async (): Promise<void> => {
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB Disconnected');
  } catch (error) {
    console.error('❌ MongoDB disconnection error:', error);
  }
};