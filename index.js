require('dotenv').config({ path: '.env.local' });
require('dotenv').config();

if (!process.env.GROQ_API_KEY) {
  console.error('Erreur : GROQ_API_KEY manquante. Crée un fichier .env avec GROQ_API_KEY=ta_cle');
  process.exit(1);
}
if (!process.env.DISCORD_TOKEN) {
  console.error('Erreur : DISCORD_TOKEN manquant. Crée un fichier .env avec DISCORD_TOKEN=ton_token');
  process.exit(1);
}

const { Client, GatewayIntentBits } = require('discord.js');
const OpenAI = require('openai');
const characters = require('./characters');
const { getUserHistory, isFirstTime, addMessage } = require('./memory');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1'
});

const GROQ_MODEL = 'llama-3.3-70b-versatile';

client.once('ready', () => {
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

    const messages = [
      { role: 'system', content: character.systemPrompt }
    ];

    if (firstTime) {
      messages.push({
        role: 'assistant',
        content: character.presentation
      });
    }

    for (const entry of history) {
      messages.push(entry);
    }

    messages.push({ role: 'user', content: userMessage });

    const response = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages,
      max_tokens: 400,
      temperature: 0.85
    });

    const reply = response.choices[0].message.content.trim();

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
