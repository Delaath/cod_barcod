const { Telegraf, Markup } = require("telegraf");
const OpenAI = require("openai");
const fs = require("fs");
const path = require("path");

// 🔑 КЛЮЧИ
const BOT_TOKEN = process.env.BOT_TOKEN;
const OPENAI_KEY = process.env.OPENAI_KEY;

const bot = new Telegraf(BOT_TOKEN);
const openai = new OpenAI({
  apiKey: OPENAI_KEY,
});

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

// ====== СЛУЧАЙНЫЕ "ДУМАЮ" ======
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
    ]).resize();
  } else {
    return Markup.keyboard([
      ["🛠 Debug", "👨‍🏫 Teacher"],
      ["🧪 Tasks", "🚬 Philosophy"],
      ["🌍 Change language"],
    ]).resize();
  }
}

function tasksMenu(lang) {
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

// ====== START ======
bot.start((ctx) => {
  ctx.reply(
    "Выбери язык / Choose language",
    Markup.keyboard([["🇷🇺 Русский", "🇬🇧 English"]]).resize(),
  );
});

// ====== СМЕНА ЯЗЫКА ======
bot.hears(/Сменить язык|Change language/, (ctx) => {
  ctx.reply(
    "Выбери язык / Choose language",
    Markup.keyboard([["🇷🇺 Русский", "🇬🇧 English"]]).resize(),
  );
});

// ====== ВЫБОР ЯЗЫКА ======
bot.hears("🇷🇺 Русский", (ctx) => {
  users[ctx.from.id] = { lang: "ru", mode: "debug", history: [] };
  saveUsers();
  ctx.reply(INTRO.ru);
  ctx.reply("Выбирай режим:", mainMenu("ru"));
});

bot.hears("🇬🇧 English", (ctx) => {
  users[ctx.from.id] = { lang: "en", mode: "debug", history: [] };
  saveUsers();
  ctx.reply(INTRO.en);
  ctx.reply("Choose mode:", mainMenu("en"));
});

// ====== НАЗАД (ПЕРЕХВАТ ДО text) ======
bot.hears("⬅️ Назад", (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;
  ctx.reply(
    user.lang === "ru" ? "Главное меню:" : "Main menu:",
    mainMenu(user.lang),
  );
});
bot.hears("⬅️ Back", (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;
  ctx.reply(
    user.lang === "ru" ? "Главное меню:" : "Main menu:",
    mainMenu(user.lang),
  );
});

// ====== РЕЖИМЫ ======
bot.hears(/Дебаг|Debug/, (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;
  user.mode = "debug";
  saveUsers();

  const msg = randomFrom(ENTER_MESSAGES[user.lang].debug);
  ctx.reply(msg);
});

bot.hears(/Учитель|Teacher/, (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;
  user.mode = "teacher";
  saveUsers();

  const msg = randomFrom(ENTER_MESSAGES[user.lang].teacher);
  ctx.reply(msg);
});

bot.hears(/Философ|Philosophy/, (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;
  user.mode = "philosopher";
  saveUsers();

  const msg = randomFrom(ENTER_MESSAGES[user.lang].philosopher);
  ctx.reply(msg);
});

bot.hears(/Задания|Tasks/, (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return;
  user.mode = "tasks";
  saveUsers();
  ctx.reply(
    user.lang === "ru"
      ? "🧪 Выбери сложность задания:"
      : "🧪 Choose task difficulty:",
    tasksMenu(user.lang),
  );
});

// ====== ВЫБОР СЛОЖНОСТИ ======
bot.hears(/Легко|Easy/, (ctx) => sendTask(ctx, "easy"));
bot.hears(/Средне|Medium/, (ctx) => sendTask(ctx, "medium"));
bot.hears(/Сложно|Hard/, (ctx) => sendTask(ctx, "hard"));

async function sendTask(ctx, level) {
  const user = users[ctx.from.id];
  if (!user) return;
  const systemPrompt = PROMPTS[user.lang].tasks[level];

  await ctx.reply(randomThinking(user.lang));

  try {
    const response = await openai.chat.completions.create({
      model: "mistralai/mistral-7b-instruct",
      messages: [{ role: "system", content: systemPrompt }],
      temperature: 0.9,
      max_tokens: 2000,
    });

    const answer = response.choices[0].message.content;
    const parts = splitText(answer);
    for (const p of parts) await sendFormatted(ctx, p);
  } catch (err) {
    console.error(err);
    await ctx.reply(
      user.lang === "ru"
        ? "Ошибка при генерации задания 😢"
        : "Error while generating task 😢",
    );
  }
}

// ====== ТЕКСТ → LLM ======
bot.on("text", async (ctx) => {
  const user = users[ctx.from.id];
  if (!user) return ctx.reply("Нажми /start");

  const blocked = [
    "Дебаг",
    "Debug",
    "Учитель",
    "Teacher",
    "Философ",
    "Philosophy",
    "Задания",
    "Tasks",
    "Сменить язык",
    "Change language",
    "Легко",
    "Easy",
    "Средне",
    "Medium",
    "Сложно",
    "Hard",
    "⬅️ Назад",
    "⬅️ Back",
  ];
  if (blocked.includes(ctx.message.text)) return;

  if (user.mode === "tasks") {
    return ctx.reply(
      user.lang === "ru"
        ? "Выбери сложность кнопками ниже 👇"
        : "Choose difficulty using the buttons below 👇",
    );
  }

  await handleLLM(ctx, user, ctx.message.text);
});

// ====== ОСНОВНАЯ ЛОГИКА ======
async function handleLLM(ctx, user, userText) {
  let systemPrompt = PROMPTS[user.lang][user.mode] || PROMPTS[user.lang].debug;

  await ctx.reply(randomThinking(user.lang));

  user.history.push({ role: "user", content: userText });
  if (user.history.length > 10) user.history = user.history.slice(-10);

  let maxTokens = user.mode === "philosopher" ? 120 : 2000;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",

      messages: [{ role: "system", content: systemPrompt }, ...user.history],
      temperature: 0.9,
      max_tokens: maxTokens,
    });

    const answer = response.choices[0].message.content;
    user.history.push({ role: "assistant", content: answer });
    if (user.history.length > 10) user.history = user.history.slice(-10);
    saveUsers();

    const parts = splitText(answer);
    for (const p of parts) await sendFormatted(ctx, p);
  } catch (err) {
    console.error(err);
    await ctx.reply(
      user.lang === "ru"
        ? "Ошибка при обращении к ИИ 😢"
        : "Error while contacting AI 😢",
    );
  }
}

// ====== ЗАПУСК ======
bot.launch();
console.log("Бот запущен 🚀");
process.on("SIGINT", () => bot.stop("SIGINT"));
process.on("SIGTERM", () => bot.stop("SIGTERM"));
