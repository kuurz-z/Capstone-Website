import 'dotenv/config';
import mongoose from 'mongoose';
import { validateWaterCutoverReadiness } from '../services/billing/waterCutoverReadiness.js';

const [roomId, baselineId, ...extra] = process.argv.slice(2);
if (extra.length || !mongoose.isValidObjectId(roomId) || !mongoose.isValidObjectId(baselineId)) {
  process.stderr.write('Usage: node scripts/validate_water_cutover.mjs <roomId> <verifiedReadingId>\n');
  process.exitCode = 2;
} else {
  try {
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error('Database configuration is required.');
    await mongoose.connect(uri, { autoIndex: false, autoCreate: false });
    const result = await validateWaterCutoverReadiness({ roomId, baselineId });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.status === 'READY' ? 0 : 1;
  } catch {
    process.stderr.write('BLOCKED: Unable to validate water cutover evidence.\n');
    process.exitCode = 2;
  } finally { await mongoose.disconnect(); }
}
