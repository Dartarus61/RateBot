// npm install nodemon -D
// npm install axios
// npm install node-telegram-bot-api
// npm run dev //for development mode
// npm run prod //for production mode
import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import axios from "axios";

dotenv.config();

// const chatId = process.env.CHANNEL_ID;
const token = process.env.BOT_TOKEN;// Reading token from .env
const interval_time = 30000;// Reading interval in ms
let time_past = 0;// Start interval time
let msg_to_change_id;// Id which read from created message after /read command 
let msg_to_change_text;// Contain pinned message text to check before updating
let interval_id;// setInterval id for killing it on /stop command
let chatId;

const bot = new TelegramBot(token, { polling: true });// Setup bot

//BOT FUNCTIONS DESCRIPTION

// Get rate from garantex production server and return string with values
async function _Rate_Values() {
	let sellUSDt_USD;
	let buyUSDt_USD;
	let sellUSDt_RUB;
	let buyUSDt_RUB;
	try {
		await axios.get("https://garantex.io/api/v2/depth?market=usdtusd")
			.then((responseonse) => {
				buyUSDt_USD = Object.values(responseonse.data.asks)[0].price;
				sellUSDt_USD = Object.values(responseonse.data.bids)[0].price;
			});
		await axios.get("https://garantex.io/api/v2/depth?market=usdtrub")
			.then((responseonse) => {
				buyUSDt_RUB = Object.values(responseonse.data.asks)[0].price;
				sellUSDt_RUB = Object.values(responseonse.data.bids)[0].price;
			});
	} catch (err) {
		console.log(err.code);
		console.log(err.response.body);
	}
	return `
	<b><u>USDt/USD</u></b>
	Покупка: <i><b>${buyUSDt_USD}</b></i> Продажа: <i><b>${sellUSDt_USD}</b></i>\n
	<b><u>USDt/RUB</u></b>
	Покупка: <i><b>${buyUSDt_RUB}</b></i> Продажа: <i><b>${sellUSDt_RUB}</b></i>
	`;
}

async function createRateMessage(chatId) {
	bot.sendMessage(chatId, await _Rate_Values(), {
		parse_mode: "HTML",
	})
		.then((response) => {
			msg_to_change_id = response.message_id;
			bot.pinChatMessage(response.chat.id, msg_to_change_id);
		});
}

async function updateRateMessage() {
	bot.editMessageText(await _Rate_Values(),
		{
			chat_id: chatId,
			message_id: msg_to_change_id,
			parse_mode: "HTML",
		})
		.then(() => {
			console.log("Update successful !");
		})
		.catch(err => {
			console.log(err.code);
			console.log(err.response.body);
		})
}

// Update pinned message in 48h after creating and re-create it when this time left
function dateinterval() {
	interval_id = setInterval(async () => {
		if (time_past < 172800000) {
			time_past += interval_time;
			await updateRateMessage(chatId);
		} else {
			time_past = 0;
			await createRateMessage(chatId);
		}
	}, interval_time);
}

//BOT COMMAND DESCRIPTION

//Send welcome message on start
bot.onText(/\/start/, async (msg) => {
	clearInterval(interval_id);
	openCommandMenu(msg.chat.id);
});

function openCommandMenu(id) {
	bot.sendMessage(id, 'Бот активен, выберите действие', {
		reply_markup: {
			inline_keyboard: [
				[
					{
						text: "Обновить курс",
						callback_data: "/force"
					},
					{
						text: "Запросить данные",
						callback_data: "/read"
					}
				],
				[
					{
						text: "Прервать получение",
						callback_data: "/stop",
					}
					,
					{
						text: "Задать id канала",
						callback_data: "/set",
					},
					{
						text: "Как пользоваться?",
						callback_data: "/help",
					},
				]

			]
		}
	})
}

//Begin reading data and start reading interval
async function readData(bot_chat_id) {
	if (chatId) {
		let read_message_id;
		bot.sendMessage(bot_chat_id, "Получение данных с биржи...").then(response => {
			read_message_id = response.message_id;
		})
		await createRateMessage(chatId);
		dateinterval();
		bot.editMessageText("Получение активно!", {
			chat_id: bot_chat_id,
			message_id: read_message_id
		})
	} else {
		bot.sendMessage(bot_chat_id, "Канал не привязан!");
	}
}

//Force rates update
async function updateData(bot_chat_id) {
	if (chatId) {
		let read_message_id;
		bot.sendMessage(bot_chat_id, "Обновление...").then(response => {
			read_message_id = response.message_id;
		})
		await updateRateMessage().then(() => {
			bot.editMessageText("Обновлено!", {
				chat_id: bot_chat_id,
				message_id: read_message_id
			}).then(() => {
				setTimeout(async () => {
					bot.deleteMessage(bot_chat_id, read_message_id);
				}, 1000)
			})
		});

	} else {
		bot.sendMessage(bot_chat_id, "Канал не привязан!");
	}
}

//Kill reading interval
async function stopReceivingData(bot_chat_id) {
	if (chatId) {
		clearInterval(interval_id);
		bot.sendMessage(bot_chat_id, "Получение остановлено!");
	} else {
		bot.sendMessage(bot_chat_id, "Канал не привязан!");
	}
}

//Set id from chat input
function setChannelID(bot_chat_id) {
	bot.sendMessage(bot_chat_id, 'Введите id канала (получить его можно <a href="https://bot-t.ru/link/FIND_MY_ID_BOT">здесь</a>)',
		{
			parse_mode: 'HTML'
		})
	const regexp = /\-\d+/;
	bot.onText(regexp,
		(msg, match) => {
			chatId = match[0];
			console.log(chatId);
			bot.sendMessage(bot_chat_id, 'Канал привязан!');
			bot.removeTextListener(regexp);
		})
}

function showInstruction(bot_chat_id) {
	bot.sendMessage(bot_chat_id,
		`	
			ИНСТРУКЦИЯ ПО НАСТРОЙКЕ БОТА:
			Для начала работы необходимо создать канал, куда вы хотите публиковать сообщение и получить его индентификатор. 
			Нажмите "Задать id канала", для дополнительной информации.
			Нажмите "Задать id канала" еще раз и введите полученный ID. После сообщения "Канал привязан!" вам необходимо добавить бота в канал в качестве администратора, рекомендуется использовать настройки доступа по умолчанию.
			После добавления бота в канал нажмите "Запросить данные" для публикации сообщения с курсом валют USDt/USD и USDt/RUB.
			Сообщение будет обновляться каждые 30 секунд и пересоздаваться каждые 48 часов.
			Для принудительного обновления курса нажмите "Обновить курс".
			Чтобы прервать получение данных нажмите "Прервать получение". Для возобновления работы нажмите "Запросить данные", после чего будет создано новое сообщение и помещено в закрепленные канала.
			В случае неполадок, пишите @akimaWeb.
		`)
}

//Callbacks for inline keyboard
bot.on('callback_query', function onCallbackQuery(callbackQuery) {
	let text = callbackQuery.data.toString();
	switch (text) {
		case '/read':
			readData(callbackQuery.message.chat.id);
			break;
		case '/force':
			updateData(callbackQuery.message.chat.id);
			break;
		case '/stop':
			stopReceivingData(callbackQuery.message.chat.id);
			break;
		case '/set':
			setChannelID(callbackQuery.message.chat.id);
			break;
		case '/help':
			showInstruction(callbackQuery.message.chat.id);
			break;
	}
});
