/* =====================================================================
   Новогодний чат-консультант
   Общается с n8n Chat Trigger по webhook.

   НАСТРОЙКИ — при необходимости поменяйте здесь:
   ===================================================================== */
const N8N_BASE_URL = 'https://n8n.edu.myitsupport.io';
const N8N_WEBHOOK_ID = '9cee9672-ed37-4329-8f81-f20386625bc4';

// Chat Trigger регистрирует вебхук по пути `{webhookId}/chat` (см. CHAT_TRIGGER_PATH_SUFFIX в n8n).
// Это production-URL: работает, когда workflow активен (Active).
const CHAT_WEBHOOK_URL = `${N8N_BASE_URL}/webhook/${N8N_WEBHOOK_ID}/chat`;
/* ===================================================================== */

const SESSION_KEY = 'ny_consultant_session_id';

const openBtn = document.getElementById('openChat');
const modal = document.getElementById('chatModal');
const messages = document.getElementById('messages');
const form = document.getElementById('chatForm');
const input = document.getElementById('chatInput');
const sendBtn = form.querySelector('.chat__send');

let greeted = false;
let sending = false;

/* ---------- year ---------- */
document.getElementById('year').textContent = new Date().getFullYear();

/* ---------- session id ---------- */
function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = (crypto.randomUUID && crypto.randomUUID()) ||
      (`sess-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

/* ---------- UI helpers ---------- */
function addMessage(text, role) {
  const el = document.createElement('div');
  el.className = `msg msg--${role}`;
  el.textContent = text;
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  return el;
}

function addTyping() {
  const el = document.createElement('div');
  el.className = 'msg msg--bot';
  el.innerHTML = '<span class="typing"><span></span><span></span><span></span></span>';
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  return el;
}

/* ---------- open / close ---------- */
function openChat() {
  modal.classList.remove('hidden');
  if (!greeted) {
    greeted = true;
    addMessage(
      'Здравствуйте! Меня зовут Морозко, я консультант магазина новогодних подарков. ' +
        'Спросите меня об услугах, доставке или ассортименте — или расскажите, ' +
        'для кого выбираете подарок и на какой бюджет ориентироваться?',
      'bot'
    );
  }
  setTimeout(() => input.focus(), 60);
}

function closeChat() {
  modal.classList.add('hidden');
}

openBtn.addEventListener('click', openChat);
modal.addEventListener('click', (e) => {
  if (e.target.hasAttribute('data-close')) closeChat();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeChat();
});

/* ---------- sending ---------- */
form.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessage(input.value);
});

async function sendMessage(rawText) {
  const text = (rawText || '').trim();
  if (!text || sending) return;

  sending = true;
  sendBtn.disabled = true;
  input.value = '';

  addMessage(text, 'user');
  const typing = addTyping();

  try {
    const answer = await askConsultant(text);
    typing.remove();
    addMessage(answer && answer.trim() ? answer.trim() : '…', 'bot');
  } catch (err) {
    typing.remove();
    addMessage(
      `Не удалось связаться с консультантом.\n${err && err.message ? err.message : ''}`.trim(),
      'error'
    );
  } finally {
    sending = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

/* ---------- n8n webhook ---------- */
async function askConsultant(text) {
  const res = await fetch(CHAT_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'text/plain',
    },
    body: JSON.stringify({
      action: 'sendMessage',
      sessionId: getSessionId(),
      chatInput: text,
    }),
  });

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const raw = await res.text();

  if (!res.ok) {
    let msg = `Ошибка ${res.status}`;
    try {
      const data = JSON.parse(raw);
      msg = data.message || data.hint || data.error || msg;
    } catch (_) {
      if (raw) msg = raw;
    }
    throw new Error(msg);
  }

  // n8n может ответить стримом (SSE) или обычным JSON — поддерживаем оба.
  if (contentType.includes('text/event-stream') || /^\s*data:/m.test(raw)) {
    return parseStream(raw);
  }

  try {
    const data = JSON.parse(raw);
    if (typeof data.output === 'string') return data.output;
    if (typeof data.text === 'string') return data.text;
    if (typeof data.message === 'string') return data.message;
    return raw;
  } catch (_) {
    return raw;
  }
}

function parseStream(raw) {
  let out = '';
  for (const block of raw.split(/\n\n/)) {
    for (const line of block.split('\n')) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      let obj;
      try {
        obj = JSON.parse(payload);
      } catch (_) {
        out += payload;
        continue;
      }
      if (obj.type === 'error') {
        out += `Ошибка: ${chunkText(obj.content) || 'неизвестная ошибка'}`;
      } else if (obj.type === 'item' || obj.type === undefined) {
        out += chunkText(obj.content !== undefined ? obj.content : obj);
      }
    }
  }
  return out || raw;
}

function chunkText(content) {
  if (content == null) return '';
  if (typeof content === 'string') return content;
  if (typeof content === 'object') {
    if (typeof content.text === 'string') return content.text;
    if (typeof content.content === 'string') return content.content;
    const delta = content.choices && content.choices[0] && content.choices[0].delta;
    if (delta && typeof delta.content === 'string') return delta.content;
  }
  return '';
}
