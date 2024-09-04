
const dotenv = require('dotenv');
const express = require('express');
const { createPaxfulApi } = require('./src/api');
const cors = require('cors');
const http = require("http");
const bodyParser = require('body-parser');

dotenv.config();
const port = 1000;

const paxfulApis = createPaxfulApi(); // This returns an array of Paxful API instances

if (!Array.isArray(paxfulApis) || paxfulApis.length === 0) {
    throw new Error('Failed to create Paxful API instances. Please check your configuration.');
}

console.log('Paxful API instances created:', paxfulApis);

let username = null;

const app = express();

app.use(cors());
// Savings original raw body, needed for Paxful webhook signature checking
app.use(function(req, res, next) {
    req.rawBody = '';

    req.on('data', function(chunk) {
        req.rawBody += chunk;
    });

    next();
});

app.use(function(req, res, next) {
    req.context = {
        services: {
            paxfulApi: paxfulApis[0] // Use the first Paxful API instance for now
        },
        config: {
            username
        }
    };

    next();
});

// Keep Alive 
const keepAlive = () => {
    http.get(`http://localhost:${port}`);
    console.log('Keep-alive ping sent.');
};

setInterval(keepAlive, 120000);

app.use(express.json());
app.use('/', require('./src/routes'));
//app.use(cors());
app.use(bodyParser.json());

app.listen(port, async () => {
    const paxfulApi = paxfulApis[0]; // Use the first Paxful API instance for now

    if (!paxfulApi) {
        throw new Error('No Paxful API instance available.');
    }

    if (!username) {
        console.log(username);
        try { 
            const response = await paxfulApi.invoke('/noones/v1/user/me');
            if (response.error) {
                throw new Error(response.error_description);
            }

            username = response.data.username;
        } catch (error) {
            console.error('Error invoking Paxful API:', error);
            throw error;
        }
    }

    console.debug(`App listening at http://localhost:${port}`);
});
