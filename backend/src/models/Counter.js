import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
}, { timestamps: false });

counterSchema.statics.getNextSequence = async function(name, filter = {}) {
  const update = { $inc: { seq: 1 } };
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  
  // Use a unique key combining name and filter hash
  const filterKeys = Object.keys(filter).sort().map(k => `${k}:${filter[k]}`).join('|');
  const counterId = filterKeys ? `${name}:${filterKeys}` : name;
  
  const counter = await this.findOneAndUpdate({ _id: counterId }, update, options);
  return counter.seq;
};

export default mongoose.model('Counter', counterSchema);
