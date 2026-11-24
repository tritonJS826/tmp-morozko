# «Морозко» — демо-магазин новогодних подарков с чатом-консультантом (n8n)

Демо интернет-магазина новогодних подарков: шапка с навигацией, каталог
наборов с ценами и бейджами, блок преимуществ и контакты. Кнопка
**«Связаться с консультантом»** открывает попап с чатом, который общается
с вашим n8n-workflow через **Chat Trigger**.

## Файлы

| Файл | Описание |
| --- | --- |
| `index.html` | Витрина магазина: промо-полоса, шапка, hero, каталог из 6 наборов (инлайн-SVG), преимущества, подвал, попап чата |
| `style.css` | Новогодняя тема: снег, стекло, градиенты, анимации |
| `script.js` | Логика чата: открытие попапа, отправка в n8n, разбор ответа |
| `n8n-workflow.json` | Importable workflow: Chat Trigger → AI Agent (+ LLM, Memory), Telegram как **инструмент** агента (`ai_tool`, `disabled`) |

## Быстрый старт (сайт)

Не открывайте через `file://` — браузер заблокирует CORS-запрос к n8n.
Поднимите локальный сервер:

```bash
cd webinar20261124
python3 -m http.server 8000
# затем откройте http://localhost:8000
```

Подключение к n8n задаётся вверху `script.js`:

```js
const N8N_BASE_URL   = 'https://n8n.edu.myitsupport.io';
const N8N_WEBHOOK_ID = '9cee9672-ed37-4329-8f81-f20386625bc4';
// → https://n8n.edu.myitsupport.io/webhook/9cee9672-ed37-4329-8f81-f20386625bc4/chat
```

> Важно: Chat Trigger регистрирует вебхук по пути **`{webhookId}/chat`**
> (суффикс `/chat` обязателен). Без него — 404, который браузер показывает как
> ошибку CORS. Production-URL работает только когда workflow **активен** (Active).

## n8n: workflow

Схема потока:

```
Chat Trigger → AI Agent (OpenAI Chat Model + Simple Memory) → «Ответ в чат» (Set)
                     └── ai_tool → Telegram (tool): уведомить менеджера   [disabled]
Telegram Trigger                                                          [disabled]
```

Нейронка (`AI Agent`) ведёт диалог, отвечает клиенту в чате, узнаёт имя и
контакт для связи — и через инструмент **Telegram (tool)** отправляет заявку
менеджеру. Последней нодой цепочки идёт **«Ответ в чат»** (нода `Set`, отдаёт
`{ output: ... }`) — это нужно, потому что Chat Trigger в режиме `lastNode`
отдаёт в чат вывод **последней** ноды. Поэтому Telegram подключён как `ai_tool`,
а не «в хвост». Знания о магазине (услуги, доставка, упаковка, возврат,
ассортимент, контакты) заданы прямо в `systemMessage` агента.

1. Импортируйте `n8n-workflow.json` (Workflows → … → Import from File).
2. **OpenAI Chat Model** — подключите credential (или замените модель).
3. **Telegram (tool): уведомить менеджера** и **Telegram Trigger** — намеренно
   `disabled`. Подключите Telegram-credential, укажите `chatId` менеджера и
   включите ноды, когда будете готовы.
4. Активируйте workflow (**Active**) — иначе production-webhook не отвечает.
5. В **Chat Trigger → Options → Allowed Origins (CORS)** укажите домен сайта
   (по умолчанию `*` — разрешены все).

Что делает бот: здоровается и мягко узнаёт у клиента, **для кого подарок,
бюджет, пожелания, имя и контакт** (см. `systemMessage` в ноде AI Agent),
затем передаёт заявку менеджеру и предлагает подходящие наборы.

## Контракт webhook

Сайт шлёт POST:

```json
{
  "action": "sendMessage",
  "sessionId": "<uuid, хранится в localStorage>",
  "chatInput": "текст сообщения"
}
```

Ответ n8n — либо JSON `{ "output": "..." }`, либо SSE-стрим (если в Chat
Trigger включён «Streaming response»). `script.js` поддерживает **оба**
варианта и корректно показывает ошибки (например, 428 «credentials missing»).

## Проверка через curl

```bash
curl -i -X POST https://n8n.edu.myitsupport.io/webhook/9cee9672-ed37-4329-8f81-f20386625bc4/chat \
  -H "Origin: http://localhost:8000" \
  -H "Content-Type: application/json" \
  -d '{"action":"sendMessage","sessionId":"test-1","chatInput":"Привет!"}'
```

Успешный ответ — JSON `{ "output": "..." }` (плюс CORS-заголовки в ответе).
Если приходит `{"message":"Error in workflow"}` — смотрите **Executions** в n8n:
какая нода упала (обычно это не подключённый credential к OpenAI Chat Model).
