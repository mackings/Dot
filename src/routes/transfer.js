const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const router = express.Router();

const app = express();
const BASE_URL = 'https://newwebservicetest.zenithbank.com:9443/directtransfer';
let token = '';
let tokenExpiration = new Date();


const getToken = async () => {
  try {
    const response = await axios.post(`${BASE_URL}/api/authentication/getToken`, {
      userIdentifyer: 'user', 
      userProtector: 'dsh46+eTPeM63c'
    });

    if (response.data && response.data.tokenDetail) {
      token = response.data.tokenDetail.token;
      tokenExpiration = new Date(response.data.tokenDetail.expiration);
    } else {
      throw new Error('Unable to retrieve token');
    }
  } catch (error) {
    console.error('Error retrieving token:', error);
    throw new Error('Failed to get token');
  }
};


const ensureToken = async (req, res, next) => {
  try {
    if (!token || new Date() >= tokenExpiration) {
      await getToken();
    }
    next();
  } catch (error) {
    res.status(500).json({ status: 'error', message: 'Failed to authenticate request' });
  }
};

// Direct Transfer Endpoint

router.post('/direct-transfer', ensureToken, async (req, res) => {
  const { amount, bankCode, bankName, crAccount, description, drAccount, transactionReference } = req.body;
  try {
    const response = await axios.post(
      `${BASE_URL}/api/transfer`,
      {
        amount,
        bankCode,
        bankName,
        crAccount,
        description,
        drAccount,
        transactionReference,
      },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        }
      }
    );

    res.json({ status: 'success', data: response.data });
  } catch (error) {
    console.error('Error processing direct transfer:', error);
    res.status(500).json({ status: 'error', message: 'Failed to process direct transfer' });
  }
});
