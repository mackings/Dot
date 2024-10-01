
const express = require('express');
const http = require('http');
const { isValidSignature } = require('../webhooks');
const { TradesHandler } = require('../trading');
const Big = require('big.js');
const router = express.Router();
const socketIo = require('socket.io');
const cors = require('cors');
const app = express();
const server = http.createServer(app);
const dotenv = require('dotenv').config();
const admin = require("firebase-admin");
const axios = require("axios");
const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');
const mongoose = require('mongoose');

const serviceAccount = {
  type: "service_account",
  project_id: process.env.FIREBASE_PROJECT_ID,
  private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
  private_key: privateKey,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  client_id: process.env.FIREBASE_CLIENT_ID,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
  client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

mongoose.connect('mongodb+srv://trainer:trainer@cluster0.1aivf.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
 // useNewUrlParser: true,
  //useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Error connecting to MongoDB:', err);
});


const TradeStatisticsSchema = new mongoose.Schema({
  staffId: String,
  totalFiatRequested: String,
  totalAmountPaid: String,
  mispayment: String,
  paidTrades: Number,
  unpaidTrades: Number,
  averageSpeed: Number,
  performanceScore: { type: Number, default: 0 },
  totalAssignedTrades: Number,
  flaggedTrades: Number,  // New field to track total flagged trades
  lastUpdated: { type: Date, default: Date.now }
});





// Schema to store overall mispayment information (expectedTotal, actualTotal, and difference)
const mispaymentSchema = new mongoose.Schema({
  expectedTotal: String,  // Store as string to match API response
  actualTotal: String,    // Store as string to match API response
  difference: String      // Store as string to match API response
});

// For unassigned trades
const unassignedTradesSchema = new mongoose.Schema({
  totalUnassignedTrades: Number,
  lastUpdated: { type: Date, default: Date.now }
});


const TradeStatistics = mongoose.model('TradeStatistics', TradeStatisticsSchema);
const UnassignedTrades = mongoose.model('UnassignedTrades', unassignedTradesSchema);
const Mispayment = mongoose.model('Mispayment', mispaymentSchema);  // Save global mispayment totals

const db = admin.firestore();


const addNewStaff = async (staffId, staffDetails) => {
  try {
    const staffRef = db.collection('Allstaff').doc(staffId);
    
    await staffRef.set({
      ...staffDetails, 
      assignedTrades: [],
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    console.log(`Staff ${staffId} added to Firestore and ready to receive trades.`);
  } catch (error) {
    console.error('Error adding new staff to Firestore:', error);
  }
};

const newStaffDetails = {
  name: 'Mac Kingsley',
  email: 'macsonline500@gmail.com',
  role: 'Payer',
};

addNewStaff('Paxful', newStaffDetails);

//Assign Trades to Staff Automatically

const assignTradeToStaff = async (tradePayload) => {
  
  try {
    const staffSnapshot = await db.collection('Allstaff').get();
    let eligibleStaff = [];

    // Filter out staff with pending unpaid trades
    staffSnapshot.docs.forEach(doc => {
      const staffData = doc.data();
      const hasPendingTrades = staffData.assignedTrades.some(trade => !trade.isPaid);

      if (!hasPendingTrades) {
        eligibleStaff.push(doc);
      }
    });

    if (eligibleStaff.length === 0) {

      console.log('Paxful Dropping Trades for the Best >>>');
      
      // Save the trade in the unassignedTrades collection
      await db.collection('manualunassigned').add({
        trade_hash: tradePayload.trade_hash,
        fiat_amount_requested: tradePayload.fiat_amount_requested,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      return;
    }

    // Find the staff with the least number of trades
    let staffWithLeastTrades = eligibleStaff[0];
    eligibleStaff.forEach(doc => {
      if (doc.data().assignedTrades.length < staffWithLeastTrades.data().assignedTrades.length) {
        staffWithLeastTrades = doc;
      }
    });

    const assignedStaff = staffWithLeastTrades.id;
    const staffRef = db.collection('Allstaff').doc(assignedStaff);
    const assignedAt = new Date();

    // Now update the assignedTrades array without using serverTimestamp() inside arrayUnion

    await staffRef.update({
      assignedTrades: admin.firestore.FieldValue.arrayUnion({
        trade_hash: tradePayload.trade_hash,
        fiat_amount_requested: tradePayload.fiat_amount_requested,
        assignedAt: assignedAt, // Assign the manual timestamp here
        handle:tradePayload.buyer_name,
        account:"Paxful",
        isPaid: false
      }),
    });

   console.log(`Paxful Trade ${tradePayload.trade_hash} assigned to ${assignedStaff}.`);
  
  } catch (error) {
    console.error('Error assigning trade to staff:', error);
  }
};


//Assign Trades Maunally
//Trainee Assignment

// const assignTradeToStaff = async (tradePayload) => {
//   try {
//     const staffSnapshot = await db.collection('staff').get();
//     let eligibleStaff = [];

//     // Filter out staff with pending unpaid trades
//     staffSnapshot.docs.forEach(doc => {
//       const staffData = doc.data();
//       const hasPendingTrades = staffData.assignedTrades.some(trade => !trade.isPaid);

//       if (!hasPendingTrades) {
//         eligibleStaff.push(doc);
//       }
//     });

//     if (eligibleStaff.length === 0) {
//       console.log('All staff have pending unpaid trades. Saving trade for later assignment.');
      
//       // Save the trade in the unassignedTrades collection
//       await db.collection('unassignedTrades').add({
//         trade_hash: tradePayload.trade_hash,
//         fiat_amount_requested: tradePayload.fiat_amount_requested,
//         timestamp: admin.firestore.FieldValue.serverTimestamp(),
//       });

//       return;
//     }

//     // Comment out the trade assignment to staff
//     /*
//     // Find the staff with the least number of trades
//     let staffWithLeastTrades = eligibleStaff[0];
//     eligibleStaff.forEach(doc => {
//       if (doc.data().assignedTrades.length < staffWithLeastTrades.data().assignedTrades.length) {
//         staffWithLeastTrades = doc;
//       }
//     });

//     const assignedStaff = staffWithLeastTrades.id;
//     const staffRef = db.collection('staff').doc(assignedStaff);
//     const assignedAt = new Date();

//     // Now update the assignedTrades array without using serverTimestamp() inside arrayUnion
//     await staffRef.update({
//       assignedTrades: admin.firestore.FieldValue.arrayUnion({
//         trade_hash: tradePayload.trade_hash,
//         fiat_amount_requested: tradePayload.fiat_amount_requested,
//         assignedAt: assignedAt, // Assign the manual timestamp here
//         isPaid: false
//       }),
//     });

//     console.log(`Trade ${tradePayload.trade_hash} assigned to ${assignedStaff}.`);
//     */

//     console.log("Running without Assignation");
//   } catch (error) {
//     console.error('Error assigning trade to staff:', error);
//   }
// };

// const assignTradesToStaffManually = async (req, res) => {
//   try {
//     const { staffId, numberOfTrades } = req.body;

//     // Validate the request
//     if (!staffId || !numberOfTrades || isNaN(numberOfTrades)) {
//       return res.status(400).json({ message: 'Invalid staffId or numberOfTrades' });
//     }

//     const numTrades = parseInt(numberOfTrades);

//     // Fetch the staff document
//     const staffRef = db.collection('staff').doc(staffId);
//     const staffDoc = await staffRef.get();

//     if (!staffDoc.exists) {
//       return res.status(404).json({ message: 'Staff not found' });
//     }

//     // Fetch the specified number of unassigned trades
//     const unassignedTradesSnapshot = await db.collection('trades')
//       .orderBy('timestamp')
//       .limit(numTrades)
//       .get();

//     if (unassignedTradesSnapshot.empty) {
//       return res.status(404).json({ message: 'No unassigned trades available.' });
//     }

//     // Get the unassigned trades data
//     const unassignedTrades = [];
//     unassignedTradesSnapshot.docs.forEach((doc) => {
//       unassignedTrades.push({
//         id: doc.id,
//         ...doc.data(),
//       });
//     });

//     // Assign the trades to the staff
//     const assignedTrades = unassignedTrades.map(trade => ({
//       trade_hash: trade.trade_hash,
//       fiat_amount_requested: trade.fiat_amount_requested,
//       isPaid: false,
//       assignedAt: new Date(),
//     }));

//     await staffRef.update({
//       assignedTrades: admin.firestore.FieldValue.arrayUnion(...assignedTrades),
//     });

//     // Remove the assigned trades from the unassignedTrades collection
//     const batch = db.batch();
//     unassignedTrades.forEach(trade => {
//       const unassignedTradeRef = db.collection('trades').doc(trade.id);
//       batch.delete(unassignedTradeRef);
//     });

//     await batch.commit();

//     res.status(200).json({
//       message: `${numTrades} trades assigned to staff ${staffId}.`,
//     });
//   } catch (error) {
//     console.error('Error assigning trades manually:', error);
//     res.status(500).json({
//       message: 'Internal server error',
//       error: error.message,
//     });
//   }
// };



const assignTradesToStaffManually = async (req, res) => {
  try {
    const { staffId, numberOfTrades, timeLimitInMinutes, timeLimitInHours } = req.body;

    // Validate the request
    if (!staffId || !numberOfTrades || isNaN(numberOfTrades)) {
      return res.status(400).json({ message: 'Invalid staffId or numberOfTrades' });
    }

    const numTrades = parseInt(numberOfTrades);

    // Calculate time limit in milliseconds
    let timeLimit = 0;
    if (timeLimitInMinutes) {
      timeLimit += parseInt(timeLimitInMinutes) * 60 * 1000; // Convert minutes to milliseconds
    }
    if (timeLimitInHours) {
      timeLimit += parseInt(timeLimitInHours) * 60 * 60 * 1000; // Convert hours to milliseconds
    }

    // Validate time limit
    if (timeLimit <= 0) {
      return res.status(400).json({ message: 'Invalid time limit. It must be greater than 0.' });
    }

    // Fetch the staff document
    const staffRef = db.collection('Allstaff').doc(staffId);
    const staffDoc = await staffRef.get();

    if (!staffDoc.exists) {
      return res.status(404).json({ message: 'Staff not found' });
    }

    // Fetch the specified number of unassigned trades
    const unassignedTradesSnapshot = await db.collection('manualsystem')
      .orderBy('timestamp')
      .limit(numTrades)
      .get();

    if (unassignedTradesSnapshot.empty) {
      return res.status(404).json({ message: 'No unassigned trades available.' });
    }

    // Get the unassigned trades data
    const unassignedTrades = [];
    unassignedTradesSnapshot.docs.forEach((doc) => {
      unassignedTrades.push({
        id: doc.id,
        ...doc.data(),
      });
    });

    // Calculate expiration time in milliseconds from now
    const expirationTime = Date.now() + timeLimit; // Current time + time limit in milliseconds

    // Assign the trades to the staff
    const assignedTrades = unassignedTrades.map(trade => ({
      trade_hash: trade.trade_hash,
      fiat_amount_requested: Math.floor(parseFloat(trade.fiat_amount_requested)).toString(), // Remove decimals and convert back to string
      isPaid: false,
      assignedAt: new Date(),
      expirationTime: expirationTime, // Set the expiration time for each trade in milliseconds
    }));
    
    

    // Update the staff document with the assigned trades
    await staffRef.update({
      assignedTrades: admin.firestore.FieldValue.arrayUnion(...assignedTrades),
    });

    // Remove the assigned trades from the unassignedTrades collection
    const batch = db.batch();
    unassignedTrades.forEach(trade => {
      const unassignedTradeRef = db.collection('manualsystem').doc(trade.id);
      batch.delete(unassignedTradeRef);
    });

    await batch.commit();

    // Set a timeout to check for expired trades
    setTimeout(() => checkForExpiredTrades(staffId), timeLimit);

    res.status(200).json({
      message: `${numTrades} trades assigned to staff ${staffId} with a time limit of ${timeLimitInMinutes || 0} minutes and ${timeLimitInHours || 0} hours.`,
    });
  } catch (error) {
    console.error('Error assigning trades manually:', error);
    res.status(500).json({
      message: 'Internal server error',
      error: error.message,
    });
  }
};

// Function to check for expired trades
const checkForExpiredTrades = async (staffId) => {
  try {
    const staffRef = db.collection('staff').doc(staffId);
    const staffDoc = await staffRef.get();

    if (!staffDoc.exists) {
      console.log(`Staff ${staffId} not found.`);
      return;
    }

    const trades = staffDoc.data().assignedTrades || [];

    const expiredTrades = trades.filter(trade => {
      return trade.expirationTime < Date.now() && !trade.isPaid; // Check if trade is expired and not paid
    });

    if (expiredTrades.length === 0) {
      console.log(`No expired trades found for staff ${staffId}.`);
      return;
    }

    console.log(`Found ${expiredTrades.length} expired trades for staff ${staffId}.`);

    // Update only the expired trades in the assignedTrades array
    const updatedTrades = trades.map(trade => {
      if (trade.expirationTime < Date.now() && !trade.isPaid) {
        return {
          ...trade,
          isPaid: true,       // Mark as paid
          markedAt: 'expired' // Mark trade as expired
        };
      }
      return trade;
    });

    await staffRef.update({
      assignedTrades: updatedTrades
    });

    console.log(`Successfully updated expired trades for staff ${staffId}.`);
  } catch (error) {
    console.error(`Error checking for expired trades for staff ${staffId}:`, error);
  }
};


// Function to assign a trade from unassignedTrades when staff becomes free

const assignUnassignedTrade = async () => {
  try {
    // Check for free staff
    const staffSnapshot = await db.collection('staff').get();
    let eligibleStaff = [];

    staffSnapshot.docs.forEach(doc => {
      const staffData = doc.data();
      const hasPendingTrades = staffData.assignedTrades.some(trade => !trade.isPaid);

      if (!hasPendingTrades) {
        eligibleStaff.push(doc);
      }
    });

    if (eligibleStaff.length === 0) {
      console.log('No eligible staff available to assign unassigned trades.');
      return;
    }

    // Fetch the oldest unassigned trade
    const unassignedTradesSnapshot = await db.collection('unassignedTrades')
      .orderBy('timestamp')
      .limit(1)
      .get();

    if (unassignedTradesSnapshot.empty) {
      console.log('No unassigned trades available.');
      return;
    }

    const unassignedTradeDoc = unassignedTradesSnapshot.docs[0];
    const unassignedTrade = unassignedTradeDoc.data();

    // Find the staff with the least number of trades
    let staffWithLeastTrades = eligibleStaff[0];
    eligibleStaff.forEach(doc => {
      if (doc.data().assignedTrades.length < staffWithLeastTrades.data().assignedTrades.length) {
        staffWithLeastTrades = doc;
      }
    });

    const assignedStaff = staffWithLeastTrades.id;
    const staffRef = db.collection('staff').doc(assignedStaff);

    // Assign trade to the free staff with current timestamp
    await staffRef.update({
      assignedTrades: admin.firestore.FieldValue.arrayUnion({
        trade_hash: unassignedTrade.trade_hash,
        fiat_amount_requested: unassignedTrade.fiat_amount_requested,
        isPaid: false, // Mark as unpaid
        assignedAt: admin.firestore.Timestamp.now() // Add current timestamp
      }),
    });

    await db.collection('unassignedTrades').doc(unassignedTradeDoc.id).delete();

    console.log(`Unassigned trade ${unassignedTrade.trade_hash} assigned to ${assignedStaff}.`);
  } catch (error) {
    console.error('Error assigning unassigned trade:', error);
  }
};


const saveTradeToFirestore = async (payload, collection) => {

  try {

    const docRef = db.collection(collection).doc(payload.trade_hash);
    await docRef.set({
      ...payload,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

   await assignTradeToStaff(payload);

    console.log(`Paxful Trade ${payload.trade_hash} saved to Firestore and assigned`);
  } catch (error) {
    console.error('Error saving the trade to Firestore:', error);
  }
};

const TrainesaveTradeToFirestore = async (payload, collection) => {

  try {

    const docRef = db.collection(collection).doc(payload.trade_hash);
    await docRef.set({
      ...payload,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

   //await assignTradeToStaff(payload);

    console.log(`Trade ${payload.trade_hash} saved to Firestore and assigned.`);
  } catch (error) {
    console.error('Error saving the trade to Firestore:', error);
  }
};


const saveChatMessageToFirestore = async (payload, messages) => {
  try {
    const docRef = db.collection('manualmessages').doc(payload.trade_hash);
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) {
        console.log(` Paxful Message for trade ${payload.trade_hash} does not exist. Creating new Chat.`);
        transaction.set(docRef, {
          trade_hash: payload.trade_hash,
          messages: messages,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        console.log(`Paxful Message for trade ${payload.trade_hash} exists. Adding to Thread`);
        transaction.update(docRef, {
          messages: admin.firestore.FieldValue.arrayUnion(...messages),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
    console.log(`Paxful Chat messages for trade ${payload.trade_hash} saved to Firestore.`);
  } catch (error) {
    console.error('Error saving chat messages to Firestore:', error);
  }
};

const TrainsaveChatMessageToFirestore = async (payload, messages) => {
  try {
    const docRef = db.collection('tradeMessages').doc(payload.trade_hash);
    await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(docRef);
      if (!doc.exists) {
        console.log(`Document for trade ${payload.trade_hash} does not exist. Creating a new document.`);
        transaction.set(docRef, {
          trade_hash: payload.trade_hash,
          messages: messages,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        console.log(`Document for trade ${payload.trade_hash} exists. Updating the document.`);
        transaction.update(docRef, {
          messages: admin.firestore.FieldValue.arrayUnion(...messages),
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });
      }
    });
    console.log(`Chat messages for trade ${payload.trade_hash} saved to Firestore.`);
  } catch (error) {
    console.error('Error saving chat messages to Firestore:', error);
  }
};


const handleTradeStarted = async (payload, paxfulApi) => {

  try {
    const response = await paxfulApi.invoke('/paxful/v1/trade/get', { trade_hash: payload.trade_hash });
    console.log(`Trade Invocation: ${response}`);

    await saveTradeToFirestore(payload, 'manualsystem');
    //await TrainesaveTradeToFirestore(payload,'trades');
    const message = "Hello..";

    await paxfulApi.invoke('/paxful/v1/trade-chat/post', {
      trade_hash: payload.trade_hash,
      message,
    });
  
  } catch (error) {
    console.error('Error in trade.started handler:', error);
  }

};


const handleChatMessageReceived = async (payload, paxfulApi, ctx) => {
  const offerOwnerUsername = ctx.config.username;
  const maxRetries = 5;
  let retries = 0;
  let messages;

  while (retries < maxRetries) {
    try {
      const response = await paxfulApi.invoke('/paxful/v1/trade-chat/get', { trade_hash: payload.trade_hash });
      if (response && response.data && response.data.messages) {
        messages = response.data.messages;
        break;
      }
      retries++;
      await new Promise((resolve) => setTimeout(resolve, 60000)); // Wait for 1 second before retrying
    } catch (error) {
      console.error('Error fetching trade chat messages:', error);
    }
  }

  if (!messages) {
    console.warn('Messages are not available after multiple retries.');
    return;
  }

  const nonSystemMessages = messages.filter((m) => m.type === 'msg' || m.type === 'bank-account-instruction').reverse();
  const lastNonSystemMessage = nonSystemMessages[0];

  if (lastNonSystemMessage.type === 'bank-account-instruction') {
    const bankAccountDetails = lastNonSystemMessage.text.bank_account;
    console.log('Received bank account details:', bankAccountDetails);
  } else {
    const isLastMessageByBuyer = lastNonSystemMessage.author !== offerOwnerUsername;
    if (!isLastMessageByBuyer) {
      return;
    }
  }

  await saveChatMessageToFirestore(payload, messages);
};


const handlers = {

  'trade.started': async (payload, tradesHandler, paxfulApi) => {
    console.log('New trade started webhook received:', payload);
    await handleTradeStarted(payload, paxfulApi);
  },

  'trade.chat_message_received': async (payload, _, paxfulApi, ctx) => {
    console.log('New trade chat message received webhook:', payload);

    const messages = [{
      id: payload.id,
      timestamp: payload.timestamp,
      type: payload.type,
      trade_hash: payload.trade_hash,
      is_for_moderator: payload.is_for_moderator,
      author: payload.author,
      security_awareness: payload.security_awareness,
      status: payload.status,
      text: payload.text,
      author_uuid: payload.author_uuid,
      sent_by_moderator: payload.sent_by_moderator
    }];

    await saveChatMessageToFirestore(payload, messages);
   // await TrainsaveChatMessageToFirestore(payload,messages);

  },

  'trade.paid': async (payload, tradesHandler) => {
    console.log('Handler trade.paid called with payload:', payload);
    try {
      const tradeHash = payload.trade_hash;
      if (await tradesHandler.isFiatPaymentReceivedInFullAmount(tradeHash)) {
        //await tradesHandler.markCompleted(tradeHash);
        console.log(`Trade ${tradeHash} marked as completed.`);
        // Uncomment if you need to save the trade details on payment
        // await saveTradeToFirestore(payload, 'trades');
      }
    } catch (error) {
      console.error('Error in trade.paid handler:', error);
    }
  },
};


router.post('/paxful/send-message', async (req, res) => {
  const message = req.body.message;
  const hash = req.body.hash;
  const paxfulApi = req.context.services.paxfulApi;
  try {
    await paxfulApi.invoke('/paxful/v1/trade-chat/post', {
      trade_hash: hash,
      message,
    });
    res.json({ status: 'success', message: 'Message sent successfully.' });
  } catch (error) {
    console.error('Error sending chat message:', error);
    res.status(500).json({ status: 'error', message: 'Failed to send message.' });
  }
});

router.post('/paxful/addstaff', async (req, res) => {
  const { staffId, staffDetails } = req.body;

  try {
    await db.collection('staff').doc(staffId).set({
      ...staffDetails,
      assignedTrades: [],
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    res.json({ status: 'success', message: `Staff ${staffId} added successfully.` });
  } catch (error) {
    console.error('Error adding new staff to Firestore:', error);
    res.status(500).json({ status: 'error', message: 'Failed to add staff.', error });
  }
});

router.post('/paxful/pay', async (req, res) => {
  const hash = req.body.hash;
  const paxfulApi = req.context.services.paxfulApi;
  try {
    const done = await paxfulApi.invoke('/paxful/v1/trade/paid', {
      trade_hash: hash,
    });
    await assignUnassignedTrade();

    res.json({ status: 'success', message: 'Payment marked successfully.', done });
  } catch (error) {
    console.error('Error marking payment as completed:', error);
    res.status(500).json({ status: 'error', message: 'Failed to mark payment.', error });
  }
});

//Transactions

router.get('/staff/:staffId/history', async (req, res) => {
  const { staffId } = req.params;

  try {
    // Get the staff document
    const staffDoc = await admin.firestore().collection('staff').doc(staffId).get();

    if (!staffDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Staff not found.' });
    }

    const assignedTrades = staffDoc.data().assignedTrades;

    // Include all trades, regardless of whether they're paid or unpaid, to show updates
    const transactionHistory = assignedTrades
      .map(trade => ({
        trade_hash: trade.trade_hash,
        fiat_amount_requested: trade.fiat_amount_requested,
        amountPaid: trade.amountPaid || 'Pending',  // Show "Pending" if no amount is set
        markedAt: trade.markedAt || 'Not Marked',
        name: trade.name || 'No Name',
        assignedAt: trade.assignedAt,
        isPaid: trade.isPaid || false  // Flag to show whether the trade is paid
      }));

    res.json({
      status: 'success',
      data: transactionHistory
    });
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch transaction history.', error });
  }
});




router.post('/trade/mark', async (req, res) => {
  const { markedAt, trade_hash, name, amountPaid } = req.body;

  try {
    // Fetch all staff data
    const staffSnapshot = await admin.firestore().collection('staff').get();
    let staffToUpdate;

    // Loop through all staff documents to find the trade
    staffSnapshot.docs.forEach(doc => {
      const staffData = doc.data();
      const tradeIndex = staffData.assignedTrades.findIndex(trade => trade.trade_hash === trade_hash);

      if (tradeIndex !== -1) {
        staffToUpdate = {
          docId: doc.id,
          tradeIndex
        };
      }
    });

    if (!staffToUpdate) {
      return res.status(404).json({ status: 'error', message: 'Trade not found.' });
    }

    // Reference the staff document for update
    const staffRef = admin.firestore().collection('staff').doc(staffToUpdate.docId);
    const staffDoc = await staffRef.get();
    const assignedTrades = staffDoc.data().assignedTrades;

    // Get the specific trade to update
    const tradeToUpdate = assignedTrades[staffToUpdate.tradeIndex];

    // Mark the trade as paid and update markedAt
    tradeToUpdate.isPaid = true;
    tradeToUpdate.markedAt = markedAt;

    // Explicitly update name and amountPaid for the correct trade (only if provided)
    if (name) {
      tradeToUpdate.name = name; // Update name even if it exists
    }

    if (amountPaid) {
      tradeToUpdate.amountPaid = amountPaid; // Update amountPaid even if it exists
    }

    // Save the updated assignedTrades array back to Firestore
    await staffRef.update({ assignedTrades });

    res.json({
      status: 'success',
      message: `Trade marked as paid successfully with markedAt time: ${markedAt}.`
    });
  } catch (error) {
    console.error('Error marking trade as paid:', error);
    res.status(500).json({ status: 'error', message: 'Failed to mark trade as paid.', error });
  }
});



//Update dEtails 

router.post('/trade/update', async (req, res) => {
  const { staffId, amountPaid, name } = req.body;

  try {
    // Fetch the specific staff document by staffId
    const staffRef = admin.firestore().collection('staff').doc(staffId);
    const staffDoc = await staffRef.get();

    if (!staffDoc.exists) {
      return res.status(404).json({ status: 'error', message: 'Staff not found.' });
    }

    let assignedTrades = staffDoc.data().assignedTrades || [];

    // Check if there are any trades assigned to this staff
    if (assignedTrades.length === 0) {
      return res.status(404).json({ status: 'error', message: 'No trades assigned to this staff.' });
    }

    // Extract the first two digits of the amountPaid for comparison
    const amountPaidFirstTwoDigits = amountPaid.toString().substring(0, 2);

    // Find the trade based on the first two digits of fiat_amount_requested
    let tradeToUpdate = assignedTrades.find(trade => {
      const requestedFirstTwoDigits = trade.fiat_amount_requested.substring(0, 2);
      return amountPaidFirstTwoDigits === requestedFirstTwoDigits;
    });

    if (!tradeToUpdate) {
      return res.status(404).json({ status: 'error', message: 'No trade found based on the amount provided.' });
    }

    // Flag the trade if the amountPaid doesn't exactly match the fiat_amount_requested
    const requestedAmount = parseFloat(tradeToUpdate.fiat_amount_requested);
    const isFlagged = parseFloat(amountPaid) !== requestedAmount;

    // Update the trade details
    const tradeIndex = assignedTrades.indexOf(tradeToUpdate);
    assignedTrades[tradeIndex] = {
      ...tradeToUpdate,
      name: name,
      amountPaid: amountPaid, // Update amountPaid
      flagged: isFlagged ? true : false // Flag trade if necessary
    };

    // Save the updated assigned trades back to Firestore
    await staffRef.update({ assignedTrades });

    // Return a successful response
    res.json({
      status: 'success',
      message: `Trade updated successfully with amountPaid = ${amountPaid}. Trade flagged: ${isFlagged}.`
    });
  } catch (error) {
    console.error('Error updating trade details:', error);
    res.status(500).json({ status: 'error', message: 'Failed to update trade details.', error });
  }
});




//Manual Assignment 
router.post('/assign/manual', assignTradesToStaffManually);

//Get Duration

// Statistics 


router.get('/staff/trade-statistics', async (req, res) => {
  try {
    const cachedStaffData = await TradeStatistics.find();
    const cachedUnassignedTrades = await UnassignedTrades.findOne();
    const cacheExpiry = 1 * 60 * 1000; // Cache expires in 1 minute
    const currentTime = Date.now();

    if (cachedStaffData.length && cachedUnassignedTrades &&
      currentTime - new Date(cachedStaffData[0].lastUpdated).getTime() < cacheExpiry &&
      currentTime - new Date(cachedUnassignedTrades.lastUpdated).getTime() < cacheExpiry) {
      return res.status(200).json({
        status: 'success',
        data: {
          totalUnassignedTrades: cachedUnassignedTrades.totalUnassignedTrades,
          staffStatistics: cachedStaffData
        }
      });
    }

    const staffSnapshot = await db.collection('staff').limit(500).get();
    const staffData = [];
    let totalGlobalFiatRequested = 0;
    let totalGlobalAmountPaid = 0;

    for (const staffDoc of staffSnapshot.docs) {
      const staff = staffDoc.data();
      const assignedTrades = staff.assignedTrades || [];
      let totalFiatRequested = 0;
      let totalAmountPaid = 0;
      let mispaymentAmount = 0;
      let paidTrades = 0;
      let unpaidTrades = 0;
      let flaggedTrades = 0;  // New variable to track flagged trades
      let totalSpeed = 0;
      let speedCount = 0;

      assignedTrades.forEach(trade => {
        const amountPaid = trade.amountPaid ? Number(trade.amountPaid) : 0;
        const fiatRequested = trade.fiat_amount_requested ? parseFloat(trade.fiat_amount_requested) : 0;

        // Count flagged trades
        if (trade.flagged === true) {
          flaggedTrades++;
        }

        // Handle mispayments
        if (trade.markedAt === "Automatic") {
          mispaymentAmount += fiatRequested;
        }

        // Handle paid and unpaid trades
        if (trade.markedAt !== "Automatic" && trade.name) {
          if (!isNaN(amountPaid)) {
            totalAmountPaid += amountPaid;
            paidTrades++;
          }
        } else {
          unpaidTrades++;
        }

        // Add to speed calculation if markedAt is present and numeric
        const tradeSpeed = parseFloat(trade.markedAt);
        if (!isNaN(tradeSpeed)) {
          totalSpeed += tradeSpeed;
          speedCount++;
        }

        if (!isNaN(fiatRequested)) {
          totalFiatRequested += fiatRequested;
        }
      });

      // Calculate average speed based on markedAt
      let averageSpeed = speedCount > 0 ? (totalSpeed / speedCount) : null;

      let performanceScore = null;
      if (assignedTrades.length > 0) {
        const tradePerformance = totalFiatRequested > 0 ? (totalAmountPaid / totalFiatRequested) * 10 : 0;
        const speedPenalty = averageSpeed && averageSpeed > 2.5 ? 0 : 10; // Example speed threshold
        const tradeCountScore = (paidTrades + unpaidTrades) > 0 ? (paidTrades / (paidTrades + unpaidTrades)) * 10 : 0;

        performanceScore = (tradePerformance + tradeCountScore + speedPenalty) / 3;
        performanceScore = Math.max(0, Math.min(10, performanceScore)); // Ensure score is between 0 and 10
      }

      const staffMispayment = totalFiatRequested - totalAmountPaid + mispaymentAmount;

      const staffStats = {
        staffId: staffDoc.id,
        totalFiatRequested: totalFiatRequested.toFixed(2),
        totalAmountPaid: totalAmountPaid.toFixed(2),
        mispayment: staffMispayment.toFixed(2),
        paidTrades,
        unpaidTrades,
        averageSpeed: averageSpeed ? averageSpeed.toFixed(2) : null,
        flaggedTrades,  // Include flagged trades count in the stats
        totalAssignedTrades: assignedTrades.length,
        performanceScore: performanceScore !== null ? Math.round(performanceScore) : null,
        lastUpdated: new Date()
      };

      totalGlobalFiatRequested += totalFiatRequested;
      totalGlobalAmountPaid += totalAmountPaid;

      staffData.push(staffStats);

      await TradeStatistics.findOneAndUpdate(
        { staffId: staffDoc.id },
        { $set: staffStats },
        { upsert: true, new: true, overwrite: true }
      );
    }

    const overallMispayment = totalGlobalFiatRequested - totalGlobalAmountPaid;

    const unassignedTradesSnapshot = await db.collection('unassignedTrades').limit(500).get();
    const totalUnassignedTrades = unassignedTradesSnapshot.size;

    await UnassignedTrades.findOneAndUpdate(
      {},
      { totalUnassignedTrades, lastUpdated: new Date() },
      { upsert: true, new: true }
    );

    await Mispayment.findOneAndUpdate(
      {},
      {
        expectedTotal: totalGlobalFiatRequested.toFixed(2),
        actualTotal: totalGlobalAmountPaid.toFixed(2),
        difference: overallMispayment.toFixed(2)
      },
      { upsert: true, new: true }
    );

    res.status(200).json({
      status: 'success',
      data: {
        totalUnassignedTrades,
        staffStatistics: staffData,
        mispayment: {
          expectedTotal: totalGlobalFiatRequested.toFixed(2),
          actualTotal: totalGlobalAmountPaid.toFixed(2),
          difference: overallMispayment.toFixed(2)
        }
      }
    });
  } catch (error) {
    console.error('Error fetching trade statistics:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch trade statistics.',
      error: error.message,
    });
  }
});



router.post('/paxful/webhook', async (req, res) => {

  res.set('X-Paxful-Request-Challenge', req.headers['x-paxful-request-challenge']);
  console.log('Webhook received with headers:', req.headers);

  const isValidationRequest = req.body.type === undefined;
  if (isValidationRequest) {
    console.debug('Validation request arrived');
    res.json({ status: 'ok' });
    return;
  }

  const signature = req.get('x-paxful-signature');
  if (!signature) {
    console.warn('No signature');
    res.status(403).json({ status: 'error', message: 'No signature header' });
    return;
  }

  if (!isValidSignature(signature, req.get('host'), req.originalUrl, req.rawBody)) {
    console.warn('Invalid signature');
    res.status(403).json({ status: 'error', message: 'Invalid signature' });
    return;
  }

  //console.debug('\n---------------------');
  console.debug('New incoming webhook >>>>');
  console.debug(req.body);
  //console.debug('---------------------');

  const type = req.body.type;

  if (handlers[type]) {
    try {
      const paxfulApi = req.context.services.paxfulApi;
      const tradesHandler = new TradesHandler(paxfulApi);
      //console.log(`Handler for ${type} found, invoking...`);
      await handlers[type](req.body.payload, tradesHandler, paxfulApi, req.context);
      res.status(200).json({ status: 'success' });
    } catch (e) {
      console.error(`Error when handling '${type}' event:`, e);
      res.status(500).json({ status: 'error', message: 'Internal server error' });
    }
  } else {
    console.warn('Unhandled webhook event:', req.body.type);
    res.status(204).json({ status: 'ignored', message: 'Unhandled event' });
  }
});


/////Rates pax/bin


router.post('/paxful/paxful/rates', async (req, res) => {
  const hash = req.body.hash;
  const paxfulApi = req.context.services.paxfulApi;

  try {

    const response = await paxfulApi.invoke('/paxful/v1/currency/btc?response=text', {});

    // Convert the response to a number
    const price = parseFloat(response);

    // Check if the conversion was successful
    if (isNaN(price)) {
      return res.status(500).json({ status: 'error', message: 'Invalid price data' });
    }

    // Send the price as a double in the response
    res.json({ price });

    console.log(`Price: ${price}`);
  } catch (error) {
    console.error('Error fetching Paxful rate:', error);
    res.status(500).json({ status: 'error', message: 'Failed to fetch price from Paxful', error });
  }
});


router.post('/paxful/binance/rates', async (req, res) => {
  try {
    // Make a request to the Binance API
    const response = await axios.get('https://www.binance.com/api/v3/ticker/price?symbol=BTCUSDT');

    // Extract the price from the response and convert it to a number
    const priceString = response.data.price;
    const price = Math.round(parseFloat(priceString));  // Convert to float and round to nearest integer

    // Return the price in the response
    res.json({ price });
  } catch (error) {
    // Handle any errors
    console.error('Error fetching Binance rate:', error);
    res.status(500).json({ error: 'Failed to fetch the price from Binance' });
  }
});

module.exports = router;
