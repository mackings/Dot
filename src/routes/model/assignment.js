const mongoose =  require('mongoose');

const tradeDetailsSchema = new mongoose.Schema({
    account: { type: String, required: true },
    amountPaid: { type: String, default: null },
    assignedAt: { type: Date, required: true },
    fiat_amount_requested: { type: String, required: true },
    handle: { type: String, required: true },
    isPaid: { type: Boolean, default: false },
    markedAt: { type: String, default: null },
    name: { type: String, required: true },
    trade_hash: { type: String, required: true }
  });
  
  const staffSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    
    // Track daily clock in/out times
    dailyClockTimes: [
      {
        clockInTime: { type: Date, default: null },
        clockOutTime: { type: Date, default: null }
      }
    ],
    
    // Track trades assigned and paid
    assignedTrades: [tradeDetailsSchema],  // Store assigned trades using the trade schema
    
    paidTrades: [tradeDetailsSchema],  // Store paid trades using the trade schema
    
    // Staff role
    role: { type: String, required: true },
    
    clockedIn: { type: Boolean, default: false },
    clockInTime: { type: Date, default: null },
    clockOutTime: { type: Date, default: null }
  });
  
  const Allstaff = mongoose.model('Staff', staffSchema); // Update model name for clarity

  module.exports = Allstaff;