import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";
import axios from "axios";

dotenv.config();

// const token = process.env.PROD_BOT_TOKEN;// Use for production mode
// const chatId = process.env.PROD_CHANNEL_ID; // Use for production mode
const chatId = process.env.DEV_CHANNEL_ID; // Use for dev mode
const token = process.env.DEV_BOT_TOKEN;// Use for dev mode
const interval_time = 30000;// Reading interval in ms
const serviceFee = 0.002;
const floatRound = 3;
let time_past = 0;// Start interval time
let msg_to_change_id;// Id which is reading from created message
let interval_id;// setInterval id for killing it on /stop command

const bot = new TelegramBot(token, { polling: true });// Setup bot

//BOT FUNCTIONS DESCRIPTION

// Get rate from garantex production server and return string with values
async function _Rate_Values() {
	let sellUSDt_USD = 0;
	let buyUSDt_USD = 0;
	let sellUSDt_RUB = 0;
	let buyUSDt_RUB = 0;
	try {
		await axios.get("https://garantex.io/api/v2/depth?market=usdtusd")
			.then((response) => {
				Object.values(response.data.asks).map((el, i) => {
					if (i < 5) sellUSDt_USD += +el.price;
					
				});
				Object.values(response.data.bids).map((el, i) => {
					if (i < 5) buyUSDt_USD += +el.price;
					
				});
				sellUSDt_USD = (((sellUSDt_USD / 5) - ((1.0 / (sellUSDt_USD / 5)) * serviceFee)) * 1.02).toFixed(floatRound);
				buyUSDt_USD = ((buyUSDt_USD / 5) - ((1.0 / (buyUSDt_USD / 5)) * serviceFee)).toFixed(floatRound);
			});
		await axios.get("https://garantex.io/api/v2/depth?market=usdtrub")
			.then((response) => {
				Object.values(response.data.asks).map((el, i) => {
					if (i < 5) sellUSDt_RUB += (+el.price);
				});
				Object.values(response.data.bids).map((el, i) => {
					if (i < 5) buyUSDt_RUB += (+el.price);
				});
				sellUSDt_RUB = (((sellUSDt_RUB / 5) - ((10 / (sellUSDt_RUB / 5)) * serviceFee)) * 1.02).toFixed(floatRound);
				buyUSDt_RUB = ((buyUSDt_RUB / 5) - ((10 / (buyUSDt_RUB / 5)) * serviceFee)).toFixed(floatRound);
			});
	} catch (err) {
		console.log(err);
	}
	return `
    Актуальный курс\n(обновляется каждые 30 секунд)\n\n<b><u>USDt/RUB</u></b>\n\nПокупка: <b>${buyUSDt_RUB}₽</b>\nПродажа: <b>${sellUSDt_RUB}₽</b>\n\n<b><u>USDt/USD</u></b>\n\nПокупка: <b>${buyUSDt_USD}$</b>\nПродажа: <b>${sellUSDt_USD}$</b>\n\nПо курсам Bitcoin, Ethereum, доллар США - пишите админу этого канала на @ob_men
    `;
}

async function createRateMessage(chatId) {
	if (msg_to_change_id) {
		bot.deleteMessage(chatId, msg_to_change_id);
	}
	bot.sendMessage(chatId, await _Rate_Values(), {
		parse_mode: "HTML",
	})
		.then((response) => {
			msg_to_change_id = response.message_id;
			bot.pinChatMessage(response.chat.id, msg_to_change_id).then(() => {
				bot.deleteMessage(chatId, ++msg_to_change_id);
				--msg_to_change_id;
			}
			);
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
		if (time_past < 169200000) {
			time_past += interval_time;
			await updateRateMessage(chatId);
		} else {
			time_past = 0;
			await createRateMessage(chatId);
		}
	}, interval_time);
}

//BOT COMMAND DESCRIPTION

//Activate menu panel
bot.onText(/\/start/, async (msg) => {
	if (checkUserAcces(msg.from.id) || (msg.from.id === (+process.env.DEVELOPER))) { //Check if user has acces to control panel
		openCommandMenu(msg.chat.id);
	} else {
		bot.sendMessage(msg.from.id, 'У вас нет доступа к панели управления!');
	}
});

function checkUserAcces(userID) {
	let userHasAcces = false;
	let administratorsID = []; //List of admin's ids

	bot.getChatAdministrators(chatId)
		.then(response =>
			response.forEach((el, i) => {
				administratorsID[i] = (el.status === 'administrator') || (el.status === 'creator') ? el.user.id : null;
			})
		)
		.then(() => {
			administratorsID.forEach(el => {
				if (userID === el) {
					userHasAcces = true;
				}
			})
		});

	return userHasAcces;
}

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
					/*{
						text: "Задать id канала",
						callback_data: "/set",
					}*/,
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

//Stop reading interval
async function stopReceivingData(bot_chat_id) {
	if (chatId) {
		clearInterval(interval_id);
		bot.sendMessage(bot_chat_id, "Получение остановлено!");
	} else {
		bot.sendMessage(bot_chat_id, "Канал не привязан!");
	}
}

//Set id from chat input
/*function setChannelID(bot_chat_id) {
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
}*/

function showInstruction(bot_chat_id) {
	bot.sendMessage(bot_chat_id,
		`	
			ИНСТРУКЦИЯ ПО НАСТРОЙКЕ БОТА:
			/*Для начала работы необходимо создать канал, куда вы хотите публиковать сообщение и получить его индентификатор. 
			Нажмите "Задать id канала", для дополнительной информации.
			Нажмите "Задать id канала" еще раз и введите полученный ID. После сообщения "Канал привязан!" */
            Вам необходимо добавить бота в канал в качестве администратора, рекомендуется использовать настройки доступа по умолчанию.
			После добавления бота в канал нажмите "Запросить данные" для публикации сообщения с курсом валют USDt/USD и USDt/RUB.
			Сообщение будет обновляться каждые 30 секунд и пересоздаваться каждые 47 часов.
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
		// case '/set':
		// 	setChannelID(callbackQuery.message.chat.id);
		// 	break;
		case '/help':
			showInstruction(callbackQuery.message.chat.id);
			break;

	}
});

//Add timestamp to log
console.logCopy = console.log.bind(console);
console.log = function (data) {
	var currentDate = '[' + new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }) + '] ';
	this.logCopy(currentDate, data);
};
