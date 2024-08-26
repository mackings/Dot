
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

const db = admin.firestore();

const addNewStaff = async (staffId, staffDetails) => {
  try {
    const staffRef = db.collection('staff').doc(staffId);
    
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

addNewStaff('Auto Marker', newStaffDetails);


const assignTradeToStaff = async (tradePayload) => {
  try {
    const staffSnapshot = await db.collection('staff').get();
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
      console.log('All staff have pending unpaid trades. Saving trade for later assignment.');
      
      // Save the trade in the unassignedTrades collection
      await db.collection('unassignedTrades').add({
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
    const staffRef = db.collection('staff').doc(assignedStaff);

    // First, get the server timestamp
    const assignedAt = new Date();

    // Now update the assignedTrades array without using serverTimestamp() inside arrayUnion
    await staffRef.update({
      assignedTrades: admin.firestore.FieldValue.arrayUnion({
        trade_hash: tradePayload.trade_hash,
        fiat_amount_requested: tradePayload.fiat_amount_requested,
        assignedAt: assignedAt, // Assign the manual timestamp here
        isPaid: false
      }),
    });

    console.log(`Trade ${tradePayload.trade_hash} assigned to ${assignedStaff}.`);
  } catch (error) {
    console.error('Error assigning trade to staff:', error);
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

    // Assign trade to the free staff
    await staffRef.update({
      assignedTrades: admin.firestore.FieldValue.arrayUnion({
        trade_hash: unassignedTrade.trade_hash,
        fiat_amount_requested: unassignedTrade.fiat_amount_requested,
        isPaid: false // Mark as unpaid
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
    console.log(`Trade ${payload.trade_hash} saved to Firestore and assigned.`);
    console.log(`Trade ${payload.trade_hash} saved to Firestore.`);
  } catch (error) {
    console.error('Error saving the trade to Firestore:', error);
  }
};

const saveChatMessageToFirestore = async (payload, messages) => {
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
    await saveTradeToFirestore(payload, 'trades');
    const message = "Hello..";

    await paxfulApi.invoke('/paxful/v1/trade-chat/post', {
      trade_hash: payload.trade_hash,
      message,
    });
    console.log("Message Sent");
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
    res.json({ status: 'success', message: 'Payment marked successfully.', done });
  } catch (error) {
    console.error('Error marking payment as completed:', error);
    res.status(500).json({ status: 'error', message: 'Failed to mark payment.', error });
  }
});

router.post('/trade/mark', async (req, res) => {

  const { trade_hash, markedAt } = req.body;

  try {
    // Query Firestore to find the staff member with the given trade_hash
    const staffSnapshot = await admin.firestore().collection('staff').get();
    let staffToUpdate;

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

    // Reference the staff document
    const staffRef = admin.firestore().collection('staff').doc(staffToUpdate.docId);
    const staffDoc = await staffRef.get();
    const assignedTrades = staffDoc.data().assignedTrades;

    // Get the specific trade to update
    const tradeToUpdate = assignedTrades[staffToUpdate.tradeIndex];

    // Update the isPaid field to true and set the markedAt from the request body
    tradeToUpdate.isPaid = true;
    tradeToUpdate.markedAt = markedAt; // Use the markedAt provided in the request body

    // Save the updated assignedTrades array back to Firestore
    await staffRef.update({ assignedTrades });

    // Now call the function to assign unassigned trades
    await assignUnassignedTrade();

    res.json({
      status: 'success',
      message: `Trade marked as paid successfully with markedAt time: ${markedAt}.`
    });
  } catch (error) {
    console.error('Error marking trade as paid:', error);
    res.status(500).json({ status: 'error', message: 'Failed to mark trade as paid.', error });
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





/////Rates 


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
