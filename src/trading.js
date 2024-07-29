const fs = require('fs');
const Big = require('big.js');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const lockfile = require('proper-lockfile');



class TradesHandler {
    constructor(paxfulApis) {
        this.storageFilename = __dirname + '/../storage/trades.json';
        this.paxfulApis = paxfulApis; // Array of Paxful API instances
    }

    generatePaymentReference(trade) {
        return trade.trade_hash;
    }

    async markAsStarted(tradeHash) {
        const trade = await this.getTrade(tradeHash);
        if (!trade) {
            const tradeResponse = await this.paxfulApis.invoke('/paxful/v1/trade/get', { trade_hash: tradeHash });
            console.log('Trade get response:', tradeResponse);
            if (!tradeResponse.data || !tradeResponse.data.trade) {
                throw new Error(`Trade data not found for trade hash - '${tradeHash}'`);
            }
            const data = tradeResponse.data.trade;

            const paymentReference = this.generatePaymentReference(data);
            await this.saveTrade(tradeHash, {
                isCryptoReleased: false,
                fiatBalance: 0,
                expectedFiatAmount: new Big(data.fiat_amount_requested).toNumber(),
                expectedFiatCurrency: data.fiat_currency_code,
                expectedPaymentReference: this.generatePaymentReference(data)
            });

            await sleep(2000);
            // This is a fully automated trade. Please follow instructions that will follow.
            await this.paxfulApis.invoke('/paxful/v1/trade-chat/post', {
                trade_hash: tradeHash,
                message: "."
            });

            await sleep(2000);
            const shareResponse = await this.paxfulApis.invoke('/paxful/v1/trade/share-linked-bank-account', {
                trade_hash: tradeHash
            });

            await sleep(2000);
            // When making a payment please specify the following payment reference: ${paymentReference}
            await this.paxfulApis.invoke('/paxful/v1/trade-chat/post', {
                trade_hash: tradeHash,
                message: ".."
            });
        } else {
            throw new Error('You can mark a trade as started only once.');
        }
    }

    async isCryptoReleased(tradeHash) {
        return (await this.getTradeOrDie(tradeHash)).isCryptoReleased;
    }

    async getFiatBalanceAndCurrency(tradeHash) {
        const trade = await this.getTradeOrDie(tradeHash);

        return {
            currency: trade.expectedFiatCurrency,
            balance: new Big(trade.fiatBalance),
            expectedAmount: new Big(trade.expectedFiatAmount)
        };
    }

    async updateBalance(tradeHash, newBalance) {
        await this.updateTrade(tradeHash, async (trade) => {
            trade.fiatBalance = newBalance.toNumber();
            return trade;
        });
    }

    async isFiatPaymentReceivedInFullAmount(tradeHash) {
        const trade = await this.getFiatBalanceAndCurrency(tradeHash);
        return trade.balance.eq(trade.expectedAmount) || trade.balance.gt(trade.expectedAmount);
    }

    async findTradeHashByPaymentReference(paymentReference) {
        const trades = await this.getTrades();
        let foundTradeHash = null;
        Object.keys(trades).forEach((tradeHash) => {
            const trade = trades[tradeHash];
            if (trade.expectedPaymentReference === paymentReference) {
                foundTradeHash = tradeHash;
            }
        });

        return foundTradeHash;
    }

    async getTrades() {
        if (!fs.existsSync(this.storageFilename)) {
            await fs.promises.writeFile(this.storageFilename, JSON.stringify({}));
        }
        return JSON.parse(await fs.promises.readFile(this.storageFilename, 'utf8'));
    }

    async getTrade(tradeHash) {
        return (await this.getTrades())[tradeHash];
    }

    async getTradeOrDie(tradeHash) {
        const trade = await this.getTrade(tradeHash);
        if (!trade) {
            throw new Error(`No trade found with trade hash - '${tradeHash}'.`);
        }
        return trade;
    }

    async updateTrade(tradeHash, operation) {
        try {
            await lockfile.lock(this.storageFilename);
            const trades = await this.getTrades();

            if (!trades[tradeHash]) {
                throw new Error(`No trade found with trade hash - '${tradeHash}'.`);
            }
            const trade = trades[tradeHash];

            const updatedTrade = await operation(trade);
            if (!updatedTrade) {
                throw new Error('Updated trade cannot be empty.');
            }
            trades[tradeHash] = updatedTrade;

            await fs.promises.writeFile(this.storageFilename, JSON.stringify(trades, null, 2));
        } finally {
            await lockfile.unlock(this.storageFilename);
        }
    }

    async saveTrade(id, trade) {
        await lockfile.lock(this.storageFilename);
        const trades = await this.getTrades();
        trades[id] = trade;
        await fs.promises.writeFile(this.storageFilename, JSON.stringify(trades, null, 2));
        await lockfile.unlock(this.storageFilename);
    }
}

module.exports.TradesHandler = TradesHandler;


