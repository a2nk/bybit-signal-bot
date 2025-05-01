const TelegramBot = require('node-telegram-bot-api');

const token = 'TOKEN_BOT_TELEGRAM';
const bot = new TelegramBot(token, { polling: true });

bot.on('message', (msg) => {
    console.log('Chat ID kamu:', msg.chat.id);
    process.exit(); // keluar setelah dapat ID
});

