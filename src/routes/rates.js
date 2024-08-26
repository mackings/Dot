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



router.post('/paxful/paxful/rates', async (req, res) => {

    const hash = req.body.hash;
    const paxfulApi = req.context.services.paxfulApi;
    try {
     const theres = await paxfulApi.invoke('/paxful/v1/currency/btc?response=text', {});
  
        res.json({ status: 'success', message: 'Message sent successfully.','Done?':theres });
        console.log(theres);
    } catch (error) {
        console.error('Error sending chat message:', error);
        res.status(500).json({ status: 'error', message: 'Failed to send message.','error':error });
    }
  });


router.post('/paxful/binance/rates', async (req, res) => {
    try {
      // Make a request to the Binance API
      const response = await axios.get('https://www.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
  
      // Extract the price from the response
      const price = response.data.price;
  
      // Return the price in the response
      res.json({ price });
    } catch (error) {
      // Handle any errors
      console.error(error);
      res.status(500).json({ error: 'Failed to fetch the price from Binance' });
    }
  });


  module.exports = router;