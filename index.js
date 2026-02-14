const { Telegraf, Markup } = require("telegraf");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

const FREE_DAILY_LIMIT = 20;
const SUB_DAILY_LIMIT = 200;
const SHOP_ITEMS = {
  sub: { title: "Подписка на 30 дней", price: 20 },
  roast: { title: "Разнос кода (15 использований)", price: 5 },
  hard: { title: "Hard задания (15 использований)", price: 5 },
};

// 🔑 КЛЮЧИ
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({ apiKey: OPENAI_KEY });

// ====== ХРАНЕНИЕ ПРОФИЛЕЙ ======
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

// ====== THINKING ======
const THINKING = {
  ru: [
    "Думаю 🤔",
    "Ща, секунду…",
    "Погодь, соображаю…",
    "Так-так…",
    "Сек, считаю в уме…",
  ],
  en: [
    "Thinking 🤔",
    "Hold on…",
    "Let me think…",
    "One sec…",
    "Working on it…",
  ],
};
function randomThinking(lang) {
  const arr = THINKING[lang] || THINKING.en;
  return arr[Math.floor(Math.random() * arr.length)];
}

// ====== ТЕКСТ ИНТРО ======
const INTRO = {
  ru: `🤖 CodBarBod — твой злобный (и полезный) AI для кода 😈

🛠 Дебаг — чиним ошибки и разбираем код  
👨‍🏫 Учитель — спокойно объясняю как новичку  
🧪 Задания — даю задачи: лёгкие, средние, сложные  
🚬 Философ — короткие размышления о жизни программиста  
😈 Разнеси мой код — оценка, комментарии и совет  
📂 Файлы — пришли .js / .py / .txt, я разберу  

Выбирай режим и погнали 👇`,

  en: `🤖 CodBarBod — your evil (but useful) AI for coding 😈

🛠 Debug — fix bugs and analyze code  
👨‍🏫 Teacher — explain calmly for beginners  
🧪 Tasks — get easy, medium, hard tasks  
🚬 Philosopher — short dev-life thoughts  
😈 Roast my code — score, comments and advice  
📂 Files — send .js / .py / .txt, I’ll analyze  

Choose a mode and let’s go 👇`,
};

const ENTER_MESSAGES = {
  ru: {
    debug: [
      "Ну, показывай код, где болит? 😈",
      "Окей, что сломалось на этот раз?",
      "Кидай ошибку, разберём по косточкам.",
      "Давай, удиви меня своим багом.",
    ],
    teacher: [
      "Что ты хочешь понять? Объясню спокойно 🙂",
      "С чего начнём обучение?",
      "Что сейчас непонятно?",
      "Давай разберём тему шаг за шагом.",
    ],
    philosopher: [
      "Ну что, как жизнь у программиста? 🚬",
      "Код или жизнь — что сегодня болит?",
      "О чём хочешь пофилософствовать?",
      "Иногда баги — это отражение души. Поговорим?",
    ],
  },
  en: {
    debug: [
      "Alright, show me where it hurts 😈",
      "So, what did you break this time?",
      "Drop the error, let's dissect it.",
      "Come on, surprise me with your bug.",
    ],
    teacher: [
      "What do you want to learn? I'll explain calmly 🙂",
      "Where should we start?",
      "What’s confusing you right now?",
      "Let’s go step by step.",
    ],
    philosopher: [
      "So… how’s the life of a developer? 🚬",
      "Code or life — what hurts today?",
      "What do you want to reflect about?",
      "Sometimes bugs are just mirrors of the soul. Let’s talk.",
    ],
  },
};

function randomFrom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ====== ПРОМПТЫ ======
const PROMPTS = {
  ru: {
    debug: `Ты — злой, остроумный программист-наставник. Ирония допустима, но по делу. В конце задай 1 вопрос.`,
    teacher: `Ты — спокойный и терпеливый учитель. Без мата. Объясняй как новичку. В конце задай вопрос для проверки понимания.`,
    philosopher: `Ты — программист-философ. Отвечай КОРОТКО, 1–2 предложения. В конце задай 1 вопрос.`,
    roast: `Ты — строгий код-ревьюер. Дай оценку 1–10, 1–2 коротких комментария и 1 конкретный совет.`,
    tasks: {
      easy: `Сгенерируй ЛЁГКОЕ задание по программированию (JS или Python). Дай полное описание и требования.`,
      medium: `Сгенерируй СРЕДНЕЕ задание по программированию (JS или Python). Дай полное описание и требования.`,
      hard: `Сгенерируй СЛОЖНОЕ задание по программированию (JS или Python). Дай полное описание и требования.`,
    },
  },
  en: {
    debug: `You are a witty, sarcastic programming mentor. Ask 1 question at the end.`,
    teacher: `You are a calm and patient teacher. Explain for a beginner. Ask a question at the end.`,
    philosopher: `You are a programmer-philosopher. Reply SHORT, 1–2 sentences. Ask 1 question.`,
    roast: `You are a strict code reviewer. Give score 1–10, 1–2 comments and 1 advice.`,
    tasks: {
      easy: `Generate an EASY programming task (JS or Python). Give full description and requirements.`,
      medium: `Generate a MEDIUM programming task (JS or Python). Give full description and requirements.`,
      hard: `Generate a HARD programming task (JS or Python). Give full description and requirements.`,
    },
  },
};

// ====== ВСПОМОГАТЕЛЬНОЕ ======
function splitText(text, chunkSize = 3500) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    chunks.push(text.slice(start, start + chunkSize));
    start += chunkSize;
  }
  return chunks;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function sendFormatted(ctx, text) {
  if (text.includes("```")) {
    const cleaned = text.replace(/```[\s\S]*?```/g, (block) => {
      const code = block.replace(/```[a-zA-Z]*\n?/, "").replace(/```$/, "");
      return `<pre><code>${escapeHtml(code)}</code></pre>`;
    });
    await ctx.reply(cleaned, { parse_mode: "HTML" });
  } else {
    await ctx.reply(text);
  }
}

// ====== МЕНЮ ======
function mainMenu(lang) {
  if (lang === "ru") {
    return Markup.keyboard([
      ["🛠 Дебаг", "👨‍🏫 Учитель"],
      ["🧪 Задания", "🚬 Философ"],
      ["🌍 Сменить язык"],
      ["😈 Разнос кода", "🛒 Магазин"],
    ]).resize();
  } else {
    return Markup.keyboard([
      ["🛠 Debug", "👨‍🏫 Teacher"],
      ["🧪 Tasks", "🚬 Philosophy"],
      ["🌍 Change language"],
      ["😈 Code review", "🛒 Shop"],
    ]).resize();
  }
}

function taskLangMenu(lang) {
  const buttons = [
    ["🟨 JavaScript", "🐍 Python"],
    ["☕ Java", "🔵 C#", "➕➕ C++"],
    ["⚙️ C", "🐹 Go", "🦀 Rust"],
    ["💎 Ruby", "🐘 PHP", "📱 Kotlin"],
    ["🍎 Swift", "🧠 TypeScript"],
    [lang === "ru" ? "⬅️ Назад" : "⬅️ Back"],
  ];

  return Markup.keyboard(buttons).resize();
}

function taskLevelMenu(lang) {
  if (lang === "ru") {
    return Markup.keyboard([
      ["🟢 Легко", "🟡 Средне", "🔴 Сложно"],
      ["⬅️ Назад"],
    ]).resize();
  } else {
    return Markup.keyboard([
      ["🟢 Easy", "🟡 Medium", "🔴 Hard"],
      ["⬅️ Back"],
    ]).resize();
  }
}

bot.hears(/⬅️ Назад|⬅️ Back/, (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;

  // Если мы в режиме заданий и еще не выбрали сложность — вернемся в главное меню
  if (user.mode === "tasks" && !user.taskLevel) {
    user.mode = "debug"; // или просто оставить текущий, но покажем главное меню
    saveUsers();
    return ctx.reply(
      user.lang === "ru" ? "Главное меню:" : "Main menu:",
      mainMenu(user.lang),
    );
  }

  // Если мы уже выбрали сложность и выбирали язык — вернемся к выбору сложности
  if (user.mode === "tasks" && user.taskLevel && !user.taskLang) {
    user.taskLevel = null;
    saveUsers();
    return ctx.reply(
      user.lang === "ru"
        ? "🧪 Выбери сложность задания:"
        : "🧪 Choose task difficulty:",
      taskLevelMenu(user.lang),
    );
  }

  // Если выбрали и сложность, и язык — вернемся к выбору языка
  if (user.mode === "tasks" && user.taskLevel && user.taskLang) {
    user.taskLang = null;
    saveUsers();
    return ctx.reply(
      user.lang === "ru"
        ? "Выбери язык программирования:"
        : "Choose programming language:",
      taskLangMenu(user.lang),
    );
  }

  // Фолбэк: просто в главное меню
  ctx.reply(
    user.lang === "ru" ? "Главное меню:" : "Main menu:",
    mainMenu(user.lang),
  );
});

// ====== START / LANGUAGE ======
bot.start((ctx) => {
  ctx.reply(
    "Выбери язык / Choose language",
    Markup.keyboard([["🇷🇺 Русский", "🇬🇧 English"]]).resize(),
  );
});

bot.hears(/Сменить язык|Change language/, (ctx) => {
  ctx.reply(
    "Выбери язык / Choose language",
    Markup.keyboard([["🇷🇺 Русский", "🇬🇧 English"]]).resize(),
  );
});

bot.hears("🇷🇺 Русский", (ctx) => {
  users[ctx.from.id] = {
    lang: "ru",
    mode: "debug",
    history: [],
    dailyCount: 0,
    lastDay: new Date().toDateString(),
    subUntil: 0,
    roastCredits: 0,
    hardCredits: 0,
  };
  saveUsers();
  ctx.reply(INTRO.ru);
  ctx.reply("Выбирай режим:", mainMenu("ru"));
});

bot.hears("🇬🇧 English", (ctx) => {
  users[ctx.from.id] = {
    lang: "en",
    mode: "debug",
    history: [],
    dailyCount: 0,
    lastDay: new Date().toDateString(),
    subUntil: 0,
    roastCredits: 0,
    hardCredits: 0,
  };
  saveUsers();
  ctx.reply(INTRO.en);
  ctx.reply("Choose mode:", mainMenu("en"));
});

function normalizeDaily(user) {
  const today = new Date().toDateString();
  if (user.lastDay !== today) {
    user.lastDay = today;
    user.dailyCount = 0;
  }
}

// ====== МАГАЗИН ======
bot.hears(/🛒 Магазин|🛒 Shop/, (ctx) => {
  const user = users[ctx.from.id];
  const isRu = user?.lang === "ru";
  ctx.reply(
    isRu
      ? "🛒 Магазин:\n\n⭐ Подписка 30 дней — 20⭐\n😈 Разнос кода (15) — 5⭐\n🔴 Hard задания (15) — 5⭐\n\nНапиши:\nbuy sub\nbuy roast\nbuy hard"
      : "🛒 Shop:\n\n⭐ 30 days sub — 20⭐\n😈 Code roast (15) — 5⭐\n🔴 Hard tasks (15) — 5⭐\n\nType:\nbuy sub\nbuy roast\nbuy hard",
  );
});

bot.hears(/^buy (sub|roast|hard)$/i, async (ctx) => {
  const key = ctx.match[1];
  const item = SHOP_ITEMS[key];
  await ctx.replyWithInvoice({
    title: item.title,
    description: item.title,
    payload: key,
  provider_token: "",   // ПУСТО
  currency: "XTR",      // ТОЛЬКО XTR
    prices: [{ label: item.title, amount: item.price }],
  });
});

bot.on("pre_checkout_query", (ctx) => ctx.answerPreCheckoutQuery(true));

bot.on("successful_payment", (ctx) => {
  const user = users[ctx.from.id];
  const payload = ctx.message.successful_payment.invoice_payload;

  if (payload === "sub") user.subUntil = Date.now() + 30 * 24 * 60 * 60 * 1000;
  if (payload === "roast") user.roastCredits += 15;
  if (payload === "hard") user.hardCredits += 15;

  saveUsers();
  ctx.reply(
    user.lang === "ru" ? "✅ Покупка успешна!" : "✅ Purchase successful!",
  );
});

// ====== РЕЖИМЫ ======
bot.hears(/🧪 Задания|🧪 Tasks/, (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;

  user.mode = "tasks";
  user.taskLevel = null;
  user.taskLang = null;
  saveUsers();

  ctx.reply(
    user.lang === "ru"
      ? "🧪 Выбери сложность задания:"
      : "🧪 Choose task difficulty:",
    taskLevelMenu(user.lang),
  );
});

bot.hears(/😈 Разнос кода|😈 Code review/, (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;
  user.mode = "roast";
  saveUsers();
  ctx.reply(
    user.lang === "ru"
      ? "Кидай код, сейчас разнесу 😈"
      : "Send code, I will roast it 😈",
  );
});

bot.hears(
  /JavaScript|Python|Java|C#|C\+\+|C\b|Go|Rust|Ruby|PHP|Kotlin|Swift|TypeScript/,
  (ctx) => {
    const user = users[ctx.from.id];
    if (!user || user.mode !== "tasks" || !user.taskLevel) return;

    const text = ctx.message.text;

    let lang = text
      .replace("🟨", "")
      .replace("🐍", "")
      .replace("☕", "")
      .replace("🔵", "")
      .replace("➕➕", "")
      .replace("⚙️", "")
      .replace("🐹", "")
      .replace("🦀", "")
      .replace("💎", "")
      .replace("🐘", "")
      .replace("📱", "")
      .replace("🍎", "")
      .replace("🧠", "")
      .trim();

    user.taskLang = lang;
    saveUsers();

    sendTask(ctx, user.taskLevel);
  },
);

// ====== ЗАДАНИЯ ======
bot.hears(/Легко|Easy/, (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;
  user.taskLevel = "easy";
  saveUsers();
  ctx.reply(
    user.lang === "ru"
      ? "Выбери язык программирования:"
      : "Choose programming language:",
    taskLangMenu(user.lang),
  );
});

bot.hears(/Средне|Medium/, (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;
  user.taskLevel = "medium";
  saveUsers();
  ctx.reply(
    user.lang === "ru"
      ? "Выбери язык программирования:"
      : "Choose programming language:",
    taskLangMenu(user.lang),
  );
});

bot.hears(/Сложно|Hard/, (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;
  user.taskLevel = "hard";
  saveUsers();
  ctx.reply(
    user.lang === "ru"
      ? "Выбери язык программирования:"
      : "Choose programming language:",
    taskLangMenu(user.lang),
  );
});

async function sendTask(ctx, level) {
  const user = users[ctx.from.id];
  if (!user) return;
  normalizeDaily(user);

  if (!user.taskLang) {
    return ctx.reply(
      user.lang === "ru"
        ? "❗ Сначала выбери язык программирования"
        : "❗ Please choose a programming language first",
    );
  }

  const isSub = user.subUntil > Date.now();
  const limit = isSub ? SUB_DAILY_LIMIT : FREE_DAILY_LIMIT;

  if (user.dailyCount >= limit) {
    return ctx.reply(
      user.lang === "ru" ? "⛔ Лимит исчерпан" : "⛔ Daily limit reached",
    );
  }
  user.dailyCount++;
  saveUsers();

  if (level === "hard") {
    if (user.hardCredits <= 0) {
      return ctx.reply(
        user.lang === "ru" ? "❌ Нет доступов к Hard" : "❌ No Hard credits",
      );
    }
    user.hardCredits--;
    saveUsers();
  }

  const systemPrompt =
    PROMPTS[user.lang].tasks[level] +
    `\nЯзык программирования: ${user.taskLang}`;

  await ctx.reply(randomThinking(user.lang));

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "system", content: systemPrompt }],
    temperature: 0.9,
    max_tokens: 2000,
  });

  const answer = response.choices[0].message.content;
  for (const p of splitText(answer)) await sendFormatted(ctx, p);
}

// ====== ОБЫЧНЫЙ ЧАТ ======
bot.on("text", async (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;

  normalizeDaily(user);

  if (user.mode === "tasks") {
    return ctx.reply(
      user.lang === "ru"
        ? "Выбери сложность кнопками ниже 👇"
        : "Choose difficulty using the buttons below 👇",
    );
  }

  const isSub = user.subUntil > Date.now();
  const limit = isSub ? SUB_DAILY_LIMIT : FREE_DAILY_LIMIT;

  if (user.dailyCount >= limit) {
    return ctx.reply(
      user.lang === "ru" ? "⛔ Лимит исчерпан" : "⛔ Daily limit reached",
    );
  }

  user.dailyCount++;
  saveUsers();

  if (user.mode === "roast") {
    if (user.roastCredits <= 0) {
      user.mode = "debug"; // выходим из режима разнеса
      saveUsers();
      return ctx.reply(
        user.lang === "ru"
          ? "❌ Нет кредитов. Зайди в 🛒 Магазин или выбери другой режим."
          : "❌ No credits. Open 🛒 Shop or choose another mode.",
        mainMenu(user.lang),
      );
    }
    user.roastCredits--;
    saveUsers();
  }

  await ctx.reply(randomThinking(user.lang));

  const systemPrompt =
    PROMPTS[user.lang][user.mode] || PROMPTS[user.lang].debug;

  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: ctx.message.text },
    ],
    temperature: 0.9,
    max_tokens: user.mode === "philosopher" ? 120 : 2000,
  });

  const answer = response.choices[0].message.content;
  for (const p of splitText(answer)) await sendFormatted(ctx, p);
});

// ====== ЗАПУСК ======
bot.launch();
console.log("Бот запущен 🚀");
process.on("SIGINT", () => bot.stop("SIGINT"));
process.on("SIGTERM", () => bot.stop("SIGTERM"));

const http = require("http");

const PORT = process.env.PORT || 3000;

http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("Bot is running");
}).listen(PORT, () => {
  console.log("HTTP server running on port", PORT);
});
