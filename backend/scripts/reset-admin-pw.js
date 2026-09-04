import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';

dotenv.config();

await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ai-artha');
const hash = await bcrypt.hash('admin123', 10);
await User.updateOne({ email: 'admin@artha.local' }, { $set: { password: hash } });
console.log('Password reset to admin123 for admin@artha.local');
await mongoose.disconnect();
