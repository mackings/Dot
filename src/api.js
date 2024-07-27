// const fs = require('fs');
// const { default: usePaxful } = require("@paxful/sdk-js");

// // In real word application you should consider using a database to store
// // credentials

// const credentialsStorage = {
//     // private
//     storageFilename: __dirname + '/../storage/credentials.json',

//     saveCredentials(credentials) {
//         fs.writeFileSync(this.storageFilename, JSON.stringify(credentials));
//     },

//     getCredentials() {
//         return fs.existsSync(this.storageFilename) ? JSON.parse(fs.readFileSync(this.storageFilename)) : null;
//     }
// };

// module.exports.createPaxfulApi = () => {
//     return usePaxful({
//         clientId: process.env.PAXFUL_CLIENT_ID,
//         clientSecret: process.env.PAXFUL_API_SECRET
//     }, credentialsStorage);
// };





const fs = require('fs');
const { default: usePaxful } = require("@paxful/sdk-js");
require('dotenv').config(); // To load environment variables from .env file

// In real-world applications, you should consider using a database to store credentials

const credentialsStorage = {
    // private
    storageFilename: __dirname + '/../storage/credentials.json',

    saveCredentials(credentials) {
        fs.writeFileSync(this.storageFilename, JSON.stringify(credentials));
    },

    getCredentials() {
        return fs.existsSync(this.storageFilename) ? JSON.parse(fs.readFileSync(this.storageFilename)) : null;
    }
};

// Helper function to get Paxful credentials from environment variables
const getPaxfulCredentials = () => {

    const credentials = [];
    let index = 1;

    while (process.env[`PAXFUL_CLIENT_ID_${index}`] && process.env[`PAXFUL_API_SECRET_${index}`]) {
        credentials.push({
            clientId: process.env[`PAXFUL_CLIENT_ID_${index}`],
            clientSecret: process.env[`PAXFUL_API_SECRET_${index}`]
        });
        index++;
    }

    return credentials;
};

module.exports.createPaxfulApi = () => {
    const credentialsList = getPaxfulCredentials();
    console.log('Loaded credentials:', credentialsList); // Debugging output

    const apis = [];

    for (const credentials of credentialsList) {
        try {
            const apiInstance = usePaxful({
                clientId: credentials.clientId,
                clientSecret: credentials.clientSecret
            }, credentialsStorage);
            apis.push(apiInstance);
            console.log('Created Paxful API instance:', apiInstance); // Debugging output
        } catch (error) {
            console.error('Error creating Paxful API instance:', error); // Debugging output
        }
    }

    return apis;
};

// Example usage:
const paxfulApis = module.exports.createPaxfulApi();

if (!Array.isArray(paxfulApis) || paxfulApis.length === 0) {
    throw new Error('Failed to create Paxful API instances. Please check your configuration.');
}

// Now you have an array of Paxful API instances
// You can use them as needed, for example:

paxfulApis.forEach((api, index) => {
    if (api.someApiMethod) {
        api.someApiMethod().then(response => {
            console.log(`Response from account ${index}:`, response);
        }).catch(error => {
            console.error(`Error from account ${index}:`, error);
        });
    } else {
        console.error(`API instance ${index} does not have the expected methods.`);
    }
});

