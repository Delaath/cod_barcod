const { Telegraf, Markup } = require("telegraf");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

// 🔑 КЛЮЧИ
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// ====== ХРАНЕНИЕ ======
const DATA_FILE = path.join(__dirname, "users.json");
let users = {};

if (fs.existsSync(DATA_FILE)) {
  try {
    users = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch {
    users = {};
  }
}

function saveUsers() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2), "utf8");
}

function getUser(id) {
  if (!users[id]) {
    users[id] = {
      mode: "debug",
      dailyCount: 0,
      lastDay: new Date().toDateString(),
      subUntil: 0,
      roastCredits: 0,
      hardCredits: 0,
      taskLevel: null,
      taskLang: null,
    };
  }
  // сброс дневного лимита
  const today = new Date().toDateString();
  if (users[id].lastDay !== today) {
    users[id].lastDay = today;
    users[id].dailyCount = 0;
  }
  return users[id];
}

// ====== ЛИМИТЫ ======
const FREE_DAILY_LIMIT = 20;
const SUB_DAILY_LIMIT = 200;

// ====== МАГАЗИН ======
const SHOP_ITEMS = {
  sub: { title: "Подписка на 30 дней", price: 20 },
  roast: { title: "Разнос кода (15 использований)", price: 5 },
  hard: { title: "Hard задания (15 использований)", price: 5 },
};

// ====== THINKING ======
const THINKING = ["Думаю 🤔", "Ща, секунду…", "Так-так…", "Сек, считаю в уме…"];
function randomThinking() {
  return THINKING[Math.floor(Math.random() * THINKING.length)];
}

// ====== ПРОМПТЫ ======
const PROMPTS = {
  debug: "Ты — злой, остроумный программист-наставник. Ирония допустима, но по делу. В конце задай 1 вопрос.",
  teacher: "Ты — спокойный и терпеливый учитель. Объясняй как новичку. В конце задай 1 вопрос.",
  philosopher: "Ты — программист-философ. Отвечай КОРОТКО, 1–2 предложения. В конце задай 1 вопрос.",
  roast: "Ты — строгий код-ревьюер. Дай оценку 1–10, 1–2 коротких комментария и 1 конкретный совет.",
  tasks: {
    easy: "Сгенерируй ЛЁГКОЕ задание по программированию на языке: {lang}. Дай полное описание и требования.",
    medium: "Сгенерируй СРЕДНЕЕ задание по программированию на языке: {lang}. Дай полное описание и требования.",
    hard: "Сгенерируй СЛОЖНОЕ задание по программированию на языке: {lang}. Дай полное описание и требования.",
  },
};

// ====== МЕНЮ ======
function mainMenu() {
  return Markup.keyboard([
    ["🛠 Дебаг", "👨‍🏫 Учитель"],
    ["🧪 Задания", "🚬 Философ"],
    ["😈 Разнос кода", "🛒 Магазин"],
  ]).resize();
}

function tasksMenu() {
  return Markup.keyboard([
    ["🟢 Легко", "🟡 Средне", "🔴 Сложно"],
    ["⬅️ Назад"],
  ]).resize();
}

function langsMenu() {
  return Markup.keyboard([
    ["JS", "Python", "Java"],
    ["C", "C++", "C#"],
    ["⬅️ Назад"],
  ]).resize();
}

// ====== START ======
bot.start((ctx) => {
  getUser(ctx.from.id);
  ctx.reply("Выбирай режим 👇", mainMenu());
});

// ====== МАГАЗИН ======
bot.hears("🛒 Магазин", (ctx) => {
  ctx.reply(
    "🛒 Магазин:\n\n" +
      "⭐ Подписка 30 дней — 20⭐ (200 запросов/день)\n" +
      "😈 Разнос кода (15) — 5⭐\n" +
      "🔴 Hard задания (15) — 5⭐\n\n" +
      "Для покупки напиши:\n" +
      "buy sub\n" +
      "buy roast\n" +
      "buy hard"
  );
});

bot.hears(/^buy (sub|roast|hard)$/i, async (ctx) => {
  const key = ctx.match[1];
  const item = SHOP_ITEMS[key];

  await ctx.replyWithInvoice({
    title: item.title,
    description: item.title,
    payload: key,
    provider_token: "", // для Telegram Stars оставляем пустым
    currency: "XTR",
    prices: [{ label: item.title, amount: item.price }],
  });
});

// ====== ПРЕЧЕК ======
bot.on("pre_checkout_query", (ctx) => ctx.answerPreCheckoutQuery(true));

// ====== УСПЕШНАЯ ОПЛАТА ======
bot.on("successful_payment", (ctx) => {
  const user = getUser(ctx.from.id);
  const payload = ctx.message.successful_payment.invoice_payload;

  if (payload === "sub") {
    user.subUntil = Date.now() + 30 * 24 * 60 * 60 * 1000;
    ctx.reply("✅ Подписка активна на 30 дней!");
  }
  if (payload === "roast") {
    user.roastCredits += 15;
    ctx.reply("✅ Куплено 15 использований 'Разнос кода'!");
  }
  if (payload === "hard") {
    user.hardCredits += 15;
    ctx.reply("✅ Куплено 15 Hard-заданий!");
  }

  saveUsers();
});

// ====== РЕЖИМЫ ======
bot.hears("🛠 Дебаг", (ctx) => {
  const u = getUser(ctx.from.id);
  u.mode = "debug";
  saveUsers();
  ctx.reply("Кидай код или ошибку 😈");
});

bot.hears("👨‍🏫 Учитель", (ctx) => {
  const u = getUser(ctx.from.id);
  u.mode = "teacher";
  saveUsers();
  ctx.reply("Что объяснить?");
});

bot.hears("🚬 Философ", (ctx) => {
  const u = getUser(ctx.from.id);
  u.mode = "philosopher";
  saveUsers();
  ctx.reply("О чём поговорим?");
});

bot.hears("🧪 Задания", (ctx) => {
  const u = getUser(ctx.from.id);
  u.mode = "tasks";
  u.taskLevel = null;
  u.taskLang = null;
  saveUsers();
  ctx.reply("Выбери сложность:", tasksMenu());
});

bot.hears("😈 Разнос кода", (ctx) => {
  const u = getUser(ctx.from.id);
  if (u.roastCredits <= 0) {
    return ctx.reply("❌ Нет доступов. Купи в магазине: 🛒 Магазин");
  }
  u.mode = "roast";
  saveUsers();
  ctx.reply("Кидай код, сейчас разнесу 😈");
});

// ====== ВЫБОР СЛОЖНОСТИ ======
bot.hears(/Легко|Средне|Сложно/, (ctx) => {
  const u = getUser(ctx.from.id);
  if (u.mode !== "tasks") return;

  let level =
    ctx.message.text.includes("Легко") ? "easy" :
    ctx.message.text.includes("Средне") ? "medium" : "hard";

  u.taskLevel = level;
  saveUsers();

  ctx.reply("Теперь выбери язык программирования:", langsMenu());
});

// ====== ВЫБОР ЯЗЫКА ======
bot.hears(/^(JS|Python|Java|C\+\+|C#|C)$/, async (ctx) => {
  const u = getUser(ctx.from.id);
  if (u.mode !== "tasks" || !u.taskLevel) return;

  const lang = ctx.message.text;
  const level = u.taskLevel;

  if (level === "hard") {
    if (u.hardCredits <= 0) {
      return ctx.reply("❌ Нет доступов к Hard. Купи в магазине 🛒");
    }
    u.hardCredits--;
  }

  await ctx.reply(randomThinking());

  const promptTemplate = PROMPTS.tasks[level];
  const systemPrompt = promptTemplate.replace("{lang}", lang);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }],
      max_tokens: 800,
    });

    ctx.reply(response.choices[0].message.content);
  } catch (e) {
    console.error(e);
    ctx.reply("Ошибка при генерации задания 😢");
  }

  saveUsers();
});

// ====== ОСНОВНОЙ ЧАТ ======
bot.on("text", async (ctx) => {
  const u = getUser(ctx.from.id);

  const isSub = u.subUntil > Date.now();
  const limit = isSub ? SUB_DAILY_LIMIT : FREE_DAILY_LIMIT;

  if (u.dailyCount >= limit) {
    return ctx.reply("⛔ Лимит на сегодня исчерпан. Купи подписку в 🛒 Магазин");
  }

  u.dailyCount++;

  if (u.mode === "roast") {
    if (u.roastCredits <= 0) {
      return ctx.reply("❌ Закончились доступы. Купи ещё в магазине 🛒");
    }
    u.roastCredits--;
  }

  await ctx.reply(randomThinking());

  const systemPrompt = PROMPTS[u.mode] || PROMPTS.debug;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: ctx.message.text },
      ],
      max_tokens: u.mode === "philosopher" ? 120 : 800,
    });

    ctx.reply(response.choices[0].message.content);
  } catch (e) {
    console.error(e);
    ctx.reply("Ошибка при обращении к ИИ 😢");
  }

  saveUsers();
});

// ====== НАЗАД ======
bot.hears("⬅️ Назад", (ctx) => {
  ctx.reply("Главное меню:", mainMenu());
});

// ====== ЗАПУСК ======
bot.launch();
console.log("Бот запущен 🚀");
process.on("SIGINT", () => bot.stop("SIGINT"));
process.on("SIGTERM", () => bot.stop("SIGTERM"));
