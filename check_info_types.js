import mongoose from 'mongoose';
import { Info } from './server/src/models/Info.js';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
  await mongoose.connect(process.env.MONGODB_URI!);
  const types = await Info.distinct('type');
  console.log('Available types:', types);
  process.exit(0);
}
check();
