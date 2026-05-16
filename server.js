require("dotenv").config();
let monitoringStarted = false;


const fetch = (...args) =>
    import('node-fetch').then(({ default: fetch }) => fetch(...args));

const express = require("express");
const cors = require("cors");
const cron = require("node-cron");
const { KiteConnect } = require("kiteconnect");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3001;

// -----------------------------------
// ENV VARIABLES
// -----------------------------------
const apiKey = process.env.KITE_API_KEY;
const apiSecret = process.env.KITE_API_SECRET;

const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
const telegramChatId = process.env.TELEGRAM_CHAT_ID;

// -----------------------------------
// KITE CONNECT
// -----------------------------------
const kite = new KiteConnect({
    api_key: apiKey
});

// -----------------------------------
// DAILY ALERT MEMORY
// -----------------------------------
const alertedStocks = new Set();

let lastResetDate = new Date().toDateString();

// -----------------------------------
// LOGIN ROUTE
// -----------------------------------
app.get("/", (req, res) => {

    const loginUrl = kite.getLoginURL();

    res.send(`
        <h2>Kite Login</h2>

        <a href="${loginUrl}" target="_blank">
            Login to Zerodha
        </a>
    `);
});

// -----------------------------------
// LOGIN CALLBACK
// -----------------------------------
app.get("/login", async (req, res) => {

    try {

        if (!monitoringStarted) {

            checkHoldings();

            setInterval(
                checkHoldings,
                3 * 60 * 1000
            );

            monitoringStarted = true;
        }
        const requestToken = req.query.request_token;

        if (!requestToken) {

            return res
                .status(400)
                .send("No request token received");
        }

        const response =
            await kite.generateSession(
                requestToken,
                apiSecret
            );

        const accessToken = response.access_token;

        kite.setAccessToken(accessToken);

        console.log("ACCESS TOKEN SET");

        checkHoldings();

        setInterval(
            checkHoldings,
            3 * 60 * 1000
        );

        console.log("\n========================");
        console.log("ACCESS TOKEN GENERATED");
        console.log("========================");
        console.log(accessToken);
        console.log("========================\n");

        // START CHECKING AFTER LOGIN
        checkHoldings();

        res.send(`
            <h2>Login Successful ✅</h2>

            <p>Backend monitoring started.</p>

            <p>You can close this tab.</p>
        `);

    } catch (error) {

        console.error(error);

        res.status(500).send(error.message);
    }
});

// -----------------------------------
// OPTIONAL API TO VIEW HOLDINGS
// -----------------------------------
app.get("/holdings", async (req, res) => {

    try {

        const holdings = await kite.getHoldings();

        const formattedHoldings =
            holdings.map(stock => ({

                tradingsymbol:
                    stock.tradingsymbol,

                quantity:
                    stock.quantity,

                average_price:
                    stock.average_price,

                last_price:
                    stock.last_price
            }));

        res.json({
            holdings: formattedHoldings
        });

    } catch (error) {

        console.error(error);

        res.status(500).json({
            error: error.message
        });
    }
});

// -----------------------------------
// TELEGRAM ALERT FUNCTION
// -----------------------------------
async function sendTelegramAlert(message) {

    const url =
        `https://api.telegram.org/bot${telegramToken}/sendMessage` +
        `?chat_id=${telegramChatId}` +
        `&text=${encodeURIComponent(message)}`;

    try {

        const response = await fetch(url);

        const data = await response.json();

        console.log("Telegram sent:", data.ok);

    } catch (err) {

        console.error(
            "Telegram error:",
            err.message
        );
    }
}

// -----------------------------------
// MAIN HOLDINGS CHECKER
// -----------------------------------
async function checkHoldings() {

    try {

        console.log("\nChecking holdings...");

        // -----------------------------------
        // RESET EVERY NEW DAY
        // -----------------------------------
        const today =
            new Date().toDateString();

        if (today !== lastResetDate) {

            alertedStocks.clear();

            lastResetDate = today;

            console.log(
                "New market day → alerts reset"
            );
        }

        const holdings =
            await kite.getHoldings();



        for (const stock of holdings) {

            const profitPercentage =
                ((stock.last_price -
                    stock.average_price)
                    / stock.average_price) * 100;



            // -----------------------------------
            // ALERT CONDITION
            // -----------------------------------
            if (

                profitPercentage >= 5 &&

                stock.quantity > 0 &&

                !alertedStocks.has(
                    stock.tradingsymbol
                )

            ) {

                const message =

                    `📈 PROFIT ALERT\n\n` +

                    `Stock: ${stock.tradingsymbol}\n` +

                    `Quantity: ${stock.quantity}\n` +

                    `Profit: ${profitPercentage.toFixed(2)}%\n` +

                    `Current Price: ₹${stock.last_price}\n`;

                await sendTelegramAlert(message);

                alertedStocks.add(
                    stock.tradingsymbol
                );

                console.log(
                    "Alert sent:",
                    stock.tradingsymbol
                );
            }
        }

    } catch (err) {

        console.error(
            "CHECK HOLDINGS ERROR:"
        );

        console.error(err);
    }
}

// -----------------------------------
// CHECK EVERY 3 MINUTES
// -----------------------------------

// -----------------------------------
// START SERVER
// -----------------------------------
app.listen(PORT, "0.0.0.0", () => {

    console.log(`\nBackend running:`);

    console.log(
        `Server running on port ${PORT}\n`
    );
});
