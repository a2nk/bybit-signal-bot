// === NOTIFIKASI BYBIT FUTURES by a2nk ===
const axios = require('axios');
const ti = require('technicalindicators');
const TelegramBot = require('node-telegram-bot-api');

// === Konfigurasi ===
const TELEGRAM_TOKEN = 'TOKEN_BOT_TELEGRAM';
const CHAT_ID = 'ID_CHAT_GROUP_TELEGRAM';
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false });

const BASE_URL = 'https://api.bybit.com/v5/market/kline';
const SYMBOLS = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
const INTERVAL_MAIN = '5';    // timeframe utama
const INTERVAL_CONFIRM = '1'; // timeframe konfirmasi
const LIMIT = 250;

// === Ambil data candle Bybit berdasarkan timeframe ===
async function fetchCandles(symbol, interval) {
    try {
        const response = await axios.get(BASE_URL, {
            params: {
                category: 'linear',
                symbol,
                interval,
                limit: LIMIT
            },
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        // Debug response
        if (!response.data.result || !response.data.result.list) {
            console.log(`[${symbol}] Respon API tidak sesuai:`, response.data);
            return [];
        }

        const raw = response.data.result.list;
        if (!raw || raw.length === 0) return [];

        return raw.map(c => ({
            time: parseInt(c[0]),
            open: parseFloat(c[1]),
            high: parseFloat(c[2]),
            low: parseFloat(c[3]),
            close: parseFloat(c[4]),
            volume: parseFloat(c[5])
        })).reverse();
    } catch (err) {
        console.error(`[${symbol}][${interval}m] Gagal fetch candle: ${err.message}`);
        return [];
    }
}

// === Hitung indikator EMA dan SMA ===
function calculateIndicators(candles) {
    const closes = candles.map(c => c.close);
    return {
        ema20: ti.EMA.calculate({ period: 20, values: closes }),
        ema50: ti.EMA.calculate({ period: 50, values: closes }),
        sma20: ti.SMA.calculate({ period: 20, values: closes }),
        sma50: ti.SMA.calculate({ period: 50, values: closes }),
        rsi: ti.RSI.calculate({ period: 14, values: closes }),
        ma200: ti.SMA.calculate({ period: 200, values: closes }) // Tambahan MA200
    };
}

// === Logika sinyal: Crossover + TP/SL ===
function checkSignal(symbol, candles, indicators) {
    const lastClose = candles[candles.length - 1].close;
    const ema20 = indicators.ema20[indicators.ema20.length - 1];
    const ema50 = indicators.ema50[indicators.ema50.length - 1];
    const sma20 = indicators.sma20[indicators.sma20.length - 1];
    const sma50 = indicators.sma50[indicators.sma50.length - 1];
    const lastRSI = indicators.rsi[indicators.rsi.length - 1];
    const ma200 = indicators.ma200[indicators.ma200.length - 1];

    const tpPercent = 0.003;   // 0.3%
    const slPercent = 0.0015;  // 0.15%

    console.log(`[${symbol}] Harga Terakhir: ${lastClose}`);
    console.log(`[${symbol}] EMA 20: ${ema20}`);
    console.log(`[${symbol}] EMA 50: ${ema50}`);
    console.log(`[${symbol}] SMA 20: ${sma20}`);
    console.log(`[${symbol}] SMA 50: ${sma50}`);
    console.log(`[${symbol}] RSI: ${lastRSI}`);
    console.log(`[${symbol}] MA 200: ${ma200}`);

    // Sinyal LONG: Harus di atas MA200
    if (
        ema20 > ema50 &&
        sma20 > sma50 &&
        lastClose > ema20 &&
        lastRSI > 60 &&
        lastClose > ma200
    ) {
        return {
    type: 'LONG',
    price: lastClose,
    tp: (lastClose * (1 + tpPercent)).toFixed(2),
    sl: (lastClose * (1 - slPercent)).toFixed(2)
        };
    }

    // Sinyal SHORT: Harus di bawah MA200
    if (
        ema20 < ema50 &&
        sma20 < sma50 &&
        lastClose < ema20 &&
        lastRSI < 40 &&
        lastClose < ma200
    ) {
        return {
    type: 'SHORT',
    price: lastClose,
    tp: (lastClose * (1 - tpPercent)).toFixed(2),
    sl: (lastClose * (1 + slPercent)).toFixed(2)
        };
    }

    return null;
}

// === Kirim pesan Telegram ===
async function sendTelegramMessage(message) {
    try {
        await bot.sendMessage(CHAT_ID, message);
        console.log('✅ Pesan terkirim ke Telegram.');
    } catch (err) {
        console.error('❌ Gagal kirim Telegram:', err.message);
    }
}

// === Fungsi utama dengan konfirmasi timeframe ===
async function checkMarkets() {
    for (const symbol of SYMBOLS) {
        console.log(`\n=== Mengecek ${symbol} ===`);

        const candlesMain = await fetchCandles(symbol, INTERVAL_MAIN);
        if (candlesMain.length === 0) continue;

        const mainIndicators = calculateIndicators(candlesMain);
        const signal = checkSignal(symbol, candlesMain, mainIndicators);

        if (!signal) {
            console.log(`[${symbol}] ❌ Tidak ada sinyal di TF ${INTERVAL_MAIN}m`);
            continue;
        }

        // Konfirmasi dari TF 1m
        const candlesConfirm = await fetchCandles(symbol, INTERVAL_CONFIRM);
        if (candlesConfirm.length === 0) continue;

        const confirmIndicators = calculateIndicators(candlesConfirm);
        const emaC20 = confirmIndicators.ema20[confirmIndicators.ema20.length - 1];
        const emaC50 = confirmIndicators.ema50[confirmIndicators.ema50.length - 1];

        const isConfirmed = (
            (signal.type === 'LONG' && emaC20 > emaC50) ||
            (signal.type === 'SHORT' && emaC20 < emaC50)
        );

        if (isConfirmed) {
            const message = `📈 Bybit Futures Sinyal ${signal.type} Terdeteksi & Terkonfirmasi ✅\n\n` +
                `📊 Symbol: ${symbol}\n` +
                `🕐 TF Utama: ${INTERVAL_MAIN}m\n` +
                `🧭 Konfirmasi: ${INTERVAL_CONFIRM}m (EMA20 ${emaC20.toFixed(2)} vs EMA50 ${emaC50.toFixed(2)})\n` +
                `💰 Harga: ${signal.price}\n🎯 TP: ${signal.tp}\n🛑 SL: ${signal.sl}`;

            await sendTelegramMessage(message);
        } else {
            console.log(`[${symbol}] ⚠️ Sinyal ${signal.type} gagal dikonfirmasi oleh TF ${INTERVAL_CONFIRM}m`);
        }
    }
}


// Loop tiap 5 minit
setInterval(checkMarkets, 5 * 60 * 1000);
console.log(`[${new Date().toLocaleString()}] Menjalankan pengecekan market tiap 5 minit...`);
