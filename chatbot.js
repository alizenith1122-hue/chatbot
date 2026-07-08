const API_URL = "/chat"; // relative path — works locally and once deployed

const chatBox = document.getElementById("chatBox");
const msgInput = document.getElementById("msgInput");
const sendBtn = document.getElementById("sendBtn");

const STORAGE_KEY = "chat_history_v1";
const SYSTEM_MESSAGE = { role: "system", content: "You are a professional adviser, motivator, and decision-making helper. Return clear, encouraging, and practical guidance." };

// Load saved history from localStorage, or start fresh with just the system message
let history = loadHistory();

function loadHistory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error("Failed to load saved history:", e);
  }
  return [SYSTEM_MESSAGE];
}

function saveHistory() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch (e) {
    console.error("Failed to save history:", e);
  }
}

// Re-render any previously saved messages on page load
function renderSavedMessages() {
  for (const msg of history) {
    if (msg.role === "user") addMessage(msg.content, "user");
    if (msg.role === "assistant") addMessage(msg.content, "bot");
  }
}
renderSavedMessages();

function clearHistory() {
  history = [SYSTEM_MESSAGE];
  localStorage.removeItem(STORAGE_KEY);
  chatBox.innerHTML = "";
}

function addMessage(text, sender) {
  const div = document.createElement("div");
  div.className = "msg " + sender;
  div.innerText = text;
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendMessage() {
  const message = msgInput.value.trim();
  if (!message) return;

  addMessage(message, "user");
  history.push({ role: "user", content: message });
  saveHistory();
  msgInput.value = "";
  sendBtn.disabled = true;
  addMessage("Thinking...", "bot");

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history })
    });

    const data = await response.json();
    chatBox.removeChild(chatBox.lastChild);

    if (data.error) {
      addMessage("Error: " + data.error, "bot");
      console.error(data.error);
      return;
    }

    addMessage(data.reply, "bot");
    history.push({ role: "assistant", content: data.reply });
    saveHistory();

  } catch (err) {
    chatBox.removeChild(chatBox.lastChild);
    addMessage("Error: " + err.message, "bot");
    console.error(err);
  } finally {
    sendBtn.disabled = false;
  }
}
