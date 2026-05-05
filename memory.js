const fs = require('fs');
const path = require('path');

const MEMORY_FILE = path.join(__dirname, 'memory.json');
const MAX_HISTORY = 20;

function loadMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveMemory(data) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(data, null, 2), 'utf8');
}

function getKey(channelName, userId) {
  return `${channelName}_${userId}`;
}

function getUserHistory(channelName, userId) {
  const memory = loadMemory();
  return memory[getKey(channelName, userId)] || [];
}

function isFirstTime(channelName, userId) {
  const history = getUserHistory(channelName, userId);
  return history.length === 0;
}

function addMessage(channelName, userId, role, content) {
  const memory = loadMemory();
  const key = getKey(channelName, userId);
  if (!memory[key]) memory[key] = [];

  memory[key].push({ role, content });

  if (memory[key].length > MAX_HISTORY) {
    memory[key] = memory[key].slice(memory[key].length - MAX_HISTORY);
  }

  saveMemory(memory);
}

module.exports = { getUserHistory, isFirstTime, addMessage };
