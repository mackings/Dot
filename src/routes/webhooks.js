// const express = require('express');
// const http = require('http');
// const { isValidSignature } = require('../webhooks');
// const { TradesHandler } = require('../trading');
// const Big = require('big.js');
// const router = express.Router();
// const socketIo = require('socket.io');
// const cors = require('cors');
// const app = express();
// const server = http.createServer(app);
// const dotenv = require('dotenv').config();
// const admin = require("firebase-admin");
// const privateKey = process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n');

// const serviceAccount = {
//   type: "service_account",
//   project_id: process.env.FIREBASE_PROJECT_ID,
//   private_key_id: process.env.FIREBASE_PRIVATE_KEY_ID,
//   private_key: privateKey,
//   client_email: process.env.FIREBASE_CLIENT_EMAIL,
//   client_id: process.env.FIREBASE_CLIENT_ID,
//   auth_uri: "https://accounts.google.com/o/oauth2/auth",
//   token_uri: "https://oauth2.googleapis.com/token",
//   auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs",
//   client_x509_cert_url: process.env.FIREBASE_CLIENT_X509_CERT_URL,
// };

// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount),
// });

// const db = admin.firestore();

// const saveTradeToFirestore = async (payload, collection) => {
//   try {
//     const docRef = db.collection(collection).doc(payload.trade_hash);
//     await docRef.set({
//       ...payload,
//       timestamp: admin.firestore.FieldValue.serverTimestamp(),
//     });
//     console.log(`Trade ${payload.trade_hash} saved to Firestore.`);
//   } catch (error) {
//     console.error('Error saving the trade to Firestore:', error);
//   }
// };

// const saveChatMessageToFirestore = async (payload, messages) => {
//   try {
//     const docRef = db.collection('tradeMessages').doc(payload.trade_hash);
//     await docRef.set({
//       trade_hash: payload.trade_hash,
//       messages: admin.firestore.FieldValue.arrayUnion(...messages),
//       timestamp: admin.firestore.FieldValue.serverTimestamp(),
//     }, { merge: true });
//     console.log(`Chat messages for trade ${payload.trade_hash} saved to Firestore.`);
//   } catch (error) {
//     console.error('Error saving chat messages to Firestore:', error);
//   }
// };

// const handlers = {
//   'trade.started': async (payload, tradesHandler, paxfulApi) => {
//     await tradesHandler.markAsStarted(payload.trade_hash);
//     try {
//       console.log('Handler trade.started called with payload:', JSON.stringify(payload, null, 2)); // Detailed logging

//       // Ensure payload contains the expected fields
//       if (!payload.trade_hash) {
//         throw new Error('Payload does not contain trade_hash');
//       }

//       await tradesHandler.markAsStarted(payload.trade_hash);
//       console.log(`Trade ${payload.trade_hash} marked as started.`); // Logging

//       const response = await paxfulApi.invoke('/paxful/v1/trade/get', { trade_hash: payload.trade_hash });
//       console.log(`Trade get response for ${payload.trade_hash}:`, JSON.stringify(response, null, 2)); // Detailed logging

//       await saveTradeToFirestore(payload, 'trades');
//       console.log(`Trade ${payload.trade_hash} saved to Firestore.`); // Logging

//       const message = "Hello..";
//       await paxfulApi.invoke('/paxful/v1/trade-chat/post', {
//         trade_hash: payload.trade_hash,
//         message
//       });
//       console.log(`Message sent for trade ${payload.trade_hash}.`); // Logging

//     } catch (error) {
//       console.error('Error in trade.started handler:', error); // Logging
//     }
//   },

//   'trade.chat_message_received': async (payload, _, paxfulApi, ctx) => {
//     console.log('Handler trade.chat_message_received called with payload:', JSON.stringify(payload, null, 2)); // Detailed logging
//     const offerOwnerUsername = ctx.config.username;
//     const maxRetries = 5;
//     let retries = 0;
//     let messages;

//     while (retries < maxRetries) {
//       try {
//         const response = await paxfulApi.invoke('/paxful/v1/trade-chat/get', { trade_hash: payload.trade_hash });
//         if (response && response.data && response.data.messages) {
//           messages = response.data.messages;
//           break;
//         }
//         retries++;
//         await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
//       } catch (error) {
//         console.error('Error fetching trade chat messages:', error);
//         throw error;
//       }
//     }

//     if (!messages) {
//       console.warn('Messages are not available after multiple retries.');
//       return;
//     }

//     const nonSystemMessages = messages.filter((m) => m.type === 'msg' || m.type === 'bank-account-instruction').reverse();
//     const lastNonSystemMessage = nonSystemMessages[0];

//     // Process bank account instruction messages differently
//     if (lastNonSystemMessage.type === 'bank-account-instruction') {
//       const bankAccountDetails = lastNonSystemMessage.text.bank_account;
//       console.log('Received bank account details:', JSON.stringify(bankAccountDetails, null, 2)); // Detailed logging
//     } else {
//       const isLastMessageByBuyer = lastNonSystemMessage.author !== offerOwnerUsername;
//       if (!isLastMessageByBuyer) {
//         return;
//       }
//     }
    
//     // await saveChatMessageToFirestore(payload, messages);

//   },

//   'trade.paid': async (payload, tradesHandler) => {
//     console.log('Handler trade.paid called with payload:', JSON.stringify(payload, null, 2)); // Detailed logging
//     const tradeHash = payload.trade_hash;
//     if (await tradesHandler.isFiatPaymentReceivedInFullAmount(tradeHash)) {
//       await tradesHandler.markCompleted(tradeHash);
//      // await saveTradeToFirestore(payload, 'trades');
//     }
//   },
// };


// // Send Chats
// router.post('/paxful/send-message', async (req, res) => {
//   const message = req.body.message;
//   const hash = req.body.hash;
//   const paxfulApi = req.context.services.paxfulApi;
//   try {
//       await paxfulApi.invoke('/paxful/v1/trade-chat/post', {
//           trade_hash: hash,
//           message
//       });
//       res.json({ status: 'success', message: 'Message sent successfully.' });
//   } catch (error) {
//       console.error('Error sending chat message:', error);
//       res.status(500).json({ status: 'error', message: 'Failed to send message.' });
//   }
// });

// const validateFiatPaymentConfirmationRequestSignature = async (req) => {
//   // TODO: Implement request signature validation to verify the request authenticity.
//   return true;
// };

// router.post('/paxful/webhook', async (req, res) => {
//   res.set('X-Paxful-Request-Challenge', req.headers['x-paxful-request-challenge']);
//   console.log('Webhook received with headers:', req.headers); // Logging

//   const isValidationRequest = req.body.type === undefined;
//   if (isValidationRequest) {
//     console.debug('Validation request arrived');
//     res.json({ status: 'ok' });
//     return;
//   }

//   const signature = req.get('x-paxful-signature');
//   if (!signature) {
//     console.warn('No signature');
//     res.status(403).json({ status: 'error', message: 'No signature header' });
//     return;
//   }

//   if (!isValidSignature(signature, req.get('host'), req.originalUrl, req.rawBody)) {
//     console.warn('Invalid signature');
//     res.status(403).json({ status: 'error', message: 'Invalid signature' });
//     return;
//   }

//   console.debug('\n---------------------');
//   console.debug('New incoming webhook:');
//   console.debug(req.body);
//   console.debug('---------------------'); 

//   const type = req.body.type;
//   if (handlers[type]) {
//     try {
//       const paxfulApi = req.context.services.paxfulApi;
//       const tradesHandler = new TradesHandler(paxfulApi);
//       console.log(`Handler for ${type} found, invoking...`); // Logging
//       await handlers[type](req.body.payload, tradesHandler, paxfulApi, req.context);
//     } catch (e) {
//       console.error(`Error when handling '${type}' event`);
//       console.error(e);
//       res.status(500).json({ status: 'error', message: 'Internal server error' });
//       return;
//     }
//   } else {
//     console.warn('Unhandled webhook event:', req.body.type);
//     res.status(204).json({ status: 'ignored', message: 'Unhandled event' });
//     return;
//   }

//   res.status(200).json({ status: 'success' });
// });

// module.exports = router;


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

const saveTradeToFirestore = async (payload, collection) => {
  try {
    const docRef = db.collection(collection).doc(payload.trade_hash);
    await docRef.set({
      ...payload,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log(`Trade ${payload.trade_hash} saved to Firestore.`);
  } catch (error) {
    console.error('Error saving the trade to Firestore:', error);
  }
};

const saveChatMessageToFirestore = async (payload, messages) => {
  try {
    const docRef = db.collection('tradeMessages').doc(payload.trade_hash);
    await docRef.set({
      trade_hash: payload.trade_hash,
      messages: admin.firestore.FieldValue.arrayUnion(...messages),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    console.log(`Chat messages for trade ${payload.trade_hash} saved to Firestore.`);
  } catch (error) {
    console.error('Error saving chat messages to Firestores:', error);
  }
};

const handlers = {
  
  'trade.started': async (payload, tradesHandler, paxfulApi) => {
    console.log('Handler trade.started called with payload:', payload);

    try {
      //await tradesHandler.markAsStarted(payload.trade_hash);
      const response = await paxfulApi.invoke('/paxful/v1/trade/get', { trade_hash: payload.trade_hash });
      console.log(`Trade Invocation: ${response}`);
      const message = "Hello..";

      await paxfulApi.invoke('/paxful/v1/trade-chat/post', {
        trade_hash: payload.trade_hash,
        message,
      });
      console.log("Message Sent");
    } catch (error) {
      console.error('Error in trade.started handler:', error);
   }
  },


  'trade.chat_message_received': async (payload, _, paxfulApi, ctx) => {
    console.log('Handler trade.chat_message_received called with payload:', payload);
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
        await new Promise((resolve) => setTimeout(resolve, 1000)); // Wait for 1 second before retrying
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

    // await saveChatMessageToFirestore(payload, messages);
  },


  'trade.paid': async (payload, tradesHandler) => {
    console.log('Handler trade.paid called with payload:', payload);
    try {
      const tradeHash = payload.trade_hash;
      if (await tradesHandler.isFiatPaymentReceivedInFullAmount(tradeHash)) {
        await tradesHandler.markCompleted(tradeHash);
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

  console.debug('\n---------------------');
  console.debug('New incoming webhook:');
  console.debug(req.body);
  console.debug('---------------------');

  const type = req.body.type;

  if (handlers[type]) {
    try {
      const paxfulApi = req.context.services.paxfulApi;
      const tradesHandler = new TradesHandler(paxfulApi);
      console.log(`Handler for ${type} found, invoking...`);
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

module.exports = router;
