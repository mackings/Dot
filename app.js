const dotenv = require('dotenv');
const express = require('express');
const { createPaxfulApi } = require('./src/api');
const cors = require('cors');
const http = require("http");

dotenv.config();
const port = 1000;

const paxfulApi = createPaxfulApi();

let username = null;

const app = express();
// Savings original raw body, needed for Paxful wehbhook signature checking
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
            paxfulApi
        },
        config: {
            username
        }
    };

    next();
});

//Keep Alive 

const keepAlive = () => {
    http.get(`http://localhost:${port}`);
    console.log('Keep-alive ping sent.');
  };

setInterval(keepAlive, 120000);

app.use(express.json());
app.use('/', require('./src/routes'));
app.use(cors());
app.listen(port, async () => {
    if (!username) {
        const response = await paxfulApi.invoke('/paxful/v1/user/me');
        if (response.error) {
            throw new Error(response.error_description);
        }

        username = response.data.username;
    }

    console.debug(`App listening at http://localhost:${port}`);
});

