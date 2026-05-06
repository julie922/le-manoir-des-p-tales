require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

if (!process.env.GROQ_API_KEY && !process.env.OPENROUTER_API_KEY) {
  console.error('Erreur : aucune clé API trouvée. Ajoute GROQ_API_KEY ou OPENROUTER_API_KEY dans ton .env.local');
  process.exit(1);
}
console.log('Clés chargées :', {
  groq: process.env.GROQ_API_KEY ? '✓' : '✗',
  openrouter: process.env.OPENROUTER_API_KEY ? '✓' : '✗'
});
if (!process.env.DISCORD_TOKEN) {
  console.error('Erreur : DISCORD_TOKEN manquant.');
  process.exit(1);
}

const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const characters = require('./characters');
const { getUserHistory, isFirstTime, addMessage } = require('./memory');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const ollama = new OpenAI({
  apiKey: 'ollama',
  baseURL: 'http://localhost:11434/v1'
});

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY || 'none',
  baseURL: 'https://api.groq.com/openai/v1'
});

const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim())
  : null;

async function callGemini(messages) {
  const systemMsg = messages.find(m => m.role === 'system');
  const rest = messages.filter(m => m.role !== 'system');
  const lastMsg = rest[rest.length - 1];
  const history = rest.slice(0, -1);

  const geminiHistory = history.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }]
  }));
  while (geminiHistory.length > 0 && geminiHistory[0].role !== 'user') {
    geminiHistory.shift();
  }

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-lite',
    systemInstruction: systemMsg?.content
  });

  const chat = model.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(lastMsg.content);
  return result.response.text().trim();
}

const GOOD_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'deepseek/deepseek-chat-v3-0324:free',
  'qwen/qwen3-30b-a3b:free',
  'qwen/qwen3-14b:free',
  'mistralai/mistral-7b-instruct:free',
  'google/gemma-3-12b-it:free',
  'meta-llama/llama-3.2-11b-vision-instruct:free'
];

let openRouterModels = [...GOOD_FREE_MODELS];

async function loadOpenRouterModels() {
  if (!process.env.OPENROUTER_API_KEY) return;
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { 'Authorization': `Bearer ${key}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const available = new Set(data.data.map(m => m.id));
    openRouterModels = GOOD_FREE_MODELS.filter(m => available.has(m));
    console.log(`OpenRouter: ${openRouterModels.length} bons modèles disponibles : ${openRouterModels.join(', ')}`);
  } catch (e) {
    console.log('OpenRouter: utilisation de la liste par défaut');
  }
}

async function callOpenRouter(messages) {
  const key = (process.env.OPENROUTER_API_KEY || '').trim();
  const models = openRouterModels.length > 0 ? openRouterModels : ['mistralai/mistral-7b-instruct:free'];
  for (const model of models) {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${key}`,
        'HTTP-Referer': 'https://discord.com',
        'X-Title': 'Le Manoir des Pétales'
      },
      body: JSON.stringify({ model, messages, max_tokens: 400, temperature: 0.85 })
    });
    if (res.ok) {
      const data = await res.json();
      const content = data.choices?.[0]?.message?.content;
      if (content) {
        console.log(`OpenRouter: modèle utilisé → ${model}`);
        return content.trim();
      }
      console.log(`OpenRouter: ${model} réponse vide, essai suivant...`);
    }
    console.log(`OpenRouter: ${model} indispo (${res.status}), essai suivant...`);
    await res.text();
  }
  throw new Error('Tous les modèles OpenRouter sont indisponibles');
}

async function callAI(messages) {
  try {
    const response = await ollama.chat.completions.create({
      model: 'llama3.2', messages, max_tokens: 400, temperature: 0.85
    });
    const content = response.choices?.[0]?.message?.content;
    if (content) {
      console.log('Ollama: réponse reçue');
      return content.trim();
    }
  } catch {
    console.log('⚠ Ollama indisponible — bascule sur Groq...');
  }

  if (process.env.GROQ_API_KEY) {
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile', messages, max_tokens: 400, temperature: 0.85
      });
      return response.choices[0].message.content.trim();
    } catch (error) {
      if (error.status === 429) {
        console.log('⚠ Groq quota dépassé — bascule sur Gemini...');
      } else {
        throw error;
      }
    }
  }
  if (genAI) {
    try {
      return await callGemini(messages);
    } catch (error) {
      console.log('⚠ Gemini indispo — bascule sur OpenRouter...', error.message);
    }
  }
  if (!process.env.OPENROUTER_API_KEY) throw new Error('Aucune API disponible');
  return await callOpenRouter(messages);
}

client.once('ready', async () => {
  await loadOpenRouterModels();
  console.log(`✦ Le Manoir des Pétales est ouvert. Connecté en tant que ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.mentions.has(client.user)) return;

  const channelName = message.channel.name;
  const character = characters[channelName];
  if (!character) return;

  const userId = message.author.id;
  const userMessage = message.content.replace(`<@${client.user.id}>`, '').trim();
  if (!userMessage) return;

  try {
    await message.channel.sendTyping();

    const firstTime = isFirstTime(channelName, userId);
    const history = getUserHistory(channelName, userId);

    const messages = [{ role: 'system', content: character.systemPrompt }];

    if (firstTime) {
      messages.push({ role: 'assistant', content: character.presentation });
    }

    for (const entry of history) {
      messages.push(entry);
    }

    messages.push({ role: 'user', content: userMessage });

    const raw = await callAI(messages);
    const reply = raw.replace(/<@[!&]?\d+>/g, '').replace(/@(everyone|here)/g, '').trim();

    if (firstTime) {
      await message.reply(`**${character.name} :** ${character.presentation}`);
      addMessage(channelName, userId, 'assistant', character.presentation);
    }

    await message.reply(`**${character.name} :** ${reply}`);

    addMessage(channelName, userId, 'user', userMessage);
    addMessage(channelName, userId, 'assistant', reply);

  } catch (error) {
    console.error(`Erreur pour ${character.name} dans #${channelName}:`, error.message);
    await message.reply('*Un voile de silence tombe sur le pavillon. Reviens me parler dans un instant.*');
  }
});

client.login(process.env.DISCORD_TOKEN);
