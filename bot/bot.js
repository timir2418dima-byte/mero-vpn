// MERO VPN Telegram bot. Node 18+, no dependencies: `node bot.js`.
// Settings live in .env next to this file (see .env.example).
'use strict';
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------- config
loadEnv(path.join(__dirname, '.env'));
const TOKEN = process.env.BOT_TOKEN;
if (!TOKEN) { console.error('BOT_TOKEN is missing: copy .env.example to .env and fill it in'); process.exit(1); }
const WEBAPP_URL = process.env.WEBAPP_URL || '';
const ADMIN_IDS = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean).map(Number);
const TRIAL_DAYS = +(process.env.TRIAL_DAYS || 1);
// 1 день, 2 дня, 5 дней
const days = n => n + ' ' + (n % 10 === 1 && n % 100 !== 11 ? 'день' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'дня' : 'дней');
const TRIAL = days(TRIAL_DAYS);
const PAYMENT_MODE = (process.env.PAYMENT_MODE || 'manual').toLowerCase(); // manual | stars
const BANNER = path.join(__dirname, 'assets', 'banner.png');
const DB_FILE = path.join(__dirname, 'data', 'db.json');
const API = `https://api.telegram.org/bot${TOKEN}/`;

// Prices: rubles are shown to people, stars are charged in PAYMENT_MODE=stars.
const PLANS = {
  lite:   { name: 'Лайт',  devices: 1, m: 69,  y: 690,  starsM: 50,  starsY: 500 },
  mero:   { name: 'MERO',  devices: 3, m: 129, y: 1290, starsM: 95,  starsY: 950 },
  family: { name: 'Семья', devices: 6, m: 199, y: 1990, starsM: 150, starsY: 1500 },
};
const PERIOD = { m: { label: '1 месяц', days: 30 }, y: { label: '12 месяцев', days: 365 } };

// ---------------------------------------------------------------- storage
let db = { users: {}, keys: [], orders: [], seq: 0 };
try { db = Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE, 'utf8'))); } catch { /* first run */ }
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
    const tmp = DB_FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db, null, 1));
    fs.renameSync(tmp, DB_FILE);
  }, 200);
}
function user(from) {
  const u = db.users[from.id] || (db.users[from.id] = { id: from.id, joined: Date.now(), trialUsed: false, expires: 0, key: null, plan: null });
  u.name = [from.first_name, from.last_name].filter(Boolean).join(' ');
  u.username = from.username || null;
  save();
  return u;
}
const isAdmin = id => ADMIN_IDS.includes(id);
const active = u => u.expires > Date.now();

// ---------------------------------------------------------------- telegram api
async function call(method, body = {}) {
  const r = await fetch(API + method, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}
async function callForm(method, fields, fileField, filePath) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.append(k, typeof v === 'object' ? JSON.stringify(v) : String(v));
  fd.append(fileField, new Blob([fs.readFileSync(filePath)]), path.basename(filePath));
  const j = await (await fetch(API + method, { method: 'POST', body: fd })).json();
  if (!j.ok) throw new Error(`${method}: ${j.description}`);
  return j.result;
}
const send = (chat_id, text, extra = {}) => call('sendMessage', { chat_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
const kb = rows => ({ reply_markup: { inline_keyboard: rows } });
const esc = s => String(s ?? '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
const rub = n => n.toLocaleString('ru-RU') + ' ₽';
const date = t => new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

// edit the message a button sits on; fall back to a new one (photos cannot become text)
async function show(q, text, extra) {
  try {
    if (q.message.photo) throw new Error('photo');
    await call('editMessageText', { chat_id: q.message.chat.id, message_id: q.message.message_id, text, parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
  } catch (e) {
    if (!/not modified/.test(e.message)) await send(q.message.chat.id, text, extra);
  }
}

// ---------------------------------------------------------------- screens
const appBtn = (text = '⚡ Открыть MERO VPN') => (WEBAPP_URL ? [{ text, web_app: { url: WEBAPP_URL } }] : []);
const back = [{ text: '← В меню', callback_data: 'menu' }];

function menuScreen(u) {
  const status = active(u)
    ? `Подписка <b>${esc(PLANS[u.plan]?.name || 'активна')}</b> до <b>${date(u.expires)}</b>.`
    : `Подписки пока нет. Начните с бесплатного пробного периода: ${TRIAL}.`;
  const text =
    `<b>MERO VPN</b>\n` +
    `Быстрый VPN на протоколе VLESS Reality. Один ключ на все устройства, ноль логов.\n\n` +
    `${status}`;
  const rows = [
    appBtn(),
    [{ text: '💳 Тарифы', callback_data: 'plans:m' }, { text: '🔑 Мой ключ', callback_data: 'profile' }],
    [{ text: `🎁 ${TRIAL} бесплатно`, callback_data: 'trial' }, { text: '📖 Инструкции', callback_data: 'guide' }],
    [{ text: '💬 Поддержка', callback_data: 'support' }],
  ].filter(r => r.length);
  return { text, extra: kb(rows) };
}

function plansScreen(b) {
  const lines = Object.entries(PLANS).map(([, p]) =>
    `<b>${p.name}</b> · ${p.devices} ${p.devices === 1 ? 'устройство' : p.devices < 5 ? 'устройства' : 'устройств'}\n` +
    `${rub(b === 'y' ? p.y : p.m)} за ${PERIOD[b].label}` + (b === 'y' ? ` (≈ ${rub(Math.round(p.y / 12))} в месяц)` : ''));
  const text = `<b>Тарифы MERO</b>\nБезлимитный трафик в каждом тарифе.\n\n${lines.join('\n\n')}`;
  return {
    text,
    extra: kb([
      [{ text: (b === 'm' ? '● ' : '') + 'Месяц', callback_data: 'plans:m' }, { text: (b === 'y' ? '● ' : '') + 'Год, −17%', callback_data: 'plans:y' }],
      Object.entries(PLANS).map(([id, p]) => ({ text: `${p.name} · ${rub(b === 'y' ? p.y : p.m)}`, callback_data: `buy:${id}:${b}` })),
      back,
    ]),
  };
}

function orderScreen(id, b) {
  const p = PLANS[id];
  const price = b === 'y' ? p.y : p.m;
  const text =
    `<b>Оформление: ${p.name}</b>\n\n` +
    `Срок: ${PERIOD[b].label}\nУстройств: ${p.devices}\nК оплате: <b>${rub(price)}</b>` +
    (PAYMENT_MODE === 'stars' ? ` (${b === 'y' ? p.starsY : p.starsM} ⭐)` : '') +
    `\n\nКлюч придёт в этот чат сразу после подтверждения оплаты.`;
  return { text, extra: kb([[{ text: '✅ Оплатить', callback_data: `pay:${id}:${b}` }], [{ text: '← Другой тариф', callback_data: `plans:${b}` }]]) };
}

function profileScreen(u) {
  if (!u.key) {
    return {
      text: `<b>Мой ключ</b>\n\nУ вас пока нет ключа. Возьмите пробный период или оформите подписку.`,
      extra: kb([[{ text: '🎁 Пробный период', callback_data: 'trial' }, { text: '💳 Тарифы', callback_data: 'plans:m' }], back]),
    };
  }
  const st = active(u) ? `активна до <b>${date(u.expires)}</b>` : `<b>закончилась</b> ${date(u.expires)}`;
  const text =
    `<b>Мой ключ</b>\n\nТариф: ${esc(PLANS[u.plan]?.name || 'Пробный')}\nПодписка: ${st}\n\n` +
    `Ссылка для подключения:\n<code>${esc(u.key)}</code>\n\n` +
    `Нажмите на ссылку, чтобы скопировать, и добавьте её в Happ или v2RayTun.`;
  return {
    text,
    extra: kb([
      [{ text: '📋 Скопировать ключ', copy_text: { text: u.key } }],
      [{ text: '🔄 Продлить', callback_data: 'plans:m' }, { text: '📖 Как подключить', callback_data: 'guide' }],
      back,
    ]),
  };
}

const GUIDES = {
  ios: ['iPhone и iPad', '1. Установите <b>Happ</b> или <b>v2RayTun</b> из App Store.\n2. Скопируйте ключ в разделе «Мой ключ».\n3. Откройте приложение, нажмите «+» и выберите «Импорт из буфера».\n4. Разрешите добавить VPN-конфигурацию и включите подключение.'],
  android: ['Android', '1. Установите <b>Happ</b> или <b>v2RayTun</b> из Google Play.\n2. Скопируйте ключ в разделе «Мой ключ».\n3. В приложении нажмите «+», затем «Импорт из буфера обмена».\n4. Нажмите кнопку подключения и разрешите VPN.'],
  win: ['Windows', '1. Установите <b>Happ</b> для Windows или <b>Hiddify</b>.\n2. Скопируйте ключ в разделе «Мой ключ».\n3. В приложении выберите «Добавить из буфера».\n4. Включите режим системного прокси или TUN и подключитесь.'],
  mac: ['macOS', '1. Установите <b>Happ</b> или <b>v2RayTun</b> из Mac App Store.\n2. Скопируйте ключ в разделе «Мой ключ».\n3. Нажмите «+» и импортируйте ключ из буфера.\n4. Разрешите VPN-конфигурацию в настройках системы и подключитесь.'],
  tv: ['Android TV', '1. Установите <b>v2RayTun</b> или <b>Happ</b> из Google Play на телевизоре.\n2. Удобнее всего: откройте ключ на телефоне и отправьте его на ТВ через QR-код в приложении.\n3. Нажмите кнопку подключения.'],
};
function guideScreen(k) {
  if (!k) {
    return {
      text: '<b>Инструкции</b>\n\nВыберите устройство, и мы покажем, как подключиться за минуту.',
      extra: kb([
        [{ text: 'iPhone / iPad', callback_data: 'guide:ios' }, { text: 'Android', callback_data: 'guide:android' }],
        [{ text: 'Windows', callback_data: 'guide:win' }, { text: 'macOS', callback_data: 'guide:mac' }],
        [{ text: 'Android TV', callback_data: 'guide:tv' }],
        back,
      ]),
    };
  }
  const [title, body] = GUIDES[k];
  return { text: `<b>${title}</b>\n\n${body}`, extra: kb([[{ text: '🔑 Мой ключ', callback_data: 'profile' }, { text: '← Устройства', callback_data: 'guide' }]]) };
}

// ---------------------------------------------------------------- keys and access
function takeKey() { const k = db.keys.shift() || null; save(); return k; }

async function grant(u, plan, days, note) {
  if (!u.key) {
    u.key = takeKey();
    if (!u.key) return false;
  }
  u.plan = plan;
  u.expires = Math.max(Date.now(), u.expires) + days * 864e5;
  u.reminded = false; u.expiredNotified = false;
  save();
  await send(u.id,
    `<b>${note}</b>\n\nПодписка активна до <b>${date(u.expires)}</b>.\n\nВаш ключ:\n<code>${esc(u.key)}</code>`,
    kb([[{ text: '📋 Скопировать ключ', copy_text: { text: u.key } }], [{ text: '📖 Как подключить', callback_data: 'guide' }], appBtn('Открыть MERO VPN')].filter(r => r.length)));
  return true;
}

async function notifyAdmins(text, extra) {
  for (const id of ADMIN_IDS) await send(id, text, extra).catch(e => console.warn('admin notify:', e.message));
}

async function startTrial(chatId, u) {
  if (u.trialUsed) return send(chatId, 'Пробный период уже был использован. Выберите тариф, чтобы продолжить.', kb([[{ text: '💳 Тарифы', callback_data: 'plans:m' }]]));
  if (active(u)) return send(chatId, 'У вас уже есть активная подписка.', kb([[{ text: '🔑 Мой ключ', callback_data: 'profile' }]]));
  if (await grant(u, 'trial', TRIAL_DAYS, `Пробный период на ${TRIAL} включён`)) { u.trialUsed = true; save(); return; }
  u.trialUsed = true; save();
  await send(chatId, 'Заявка на пробный период принята. Ключ придёт в этот чат, как только администратор его выдаст.');
  await notifyAdmins(`Пробный период: нет свободных ключей.\nПользователь: ${esc(u.name)} ${u.username ? '@' + u.username : ''}\nID: <code>${u.id}</code>\n\nДобавьте ключи: /addkey ключ\nВыдать: /give ${u.id} ${TRIAL_DAYS} trial`);
}

async function startPayment(chatId, u, id, b) {
  const p = PLANS[id];
  if (!p || !PERIOD[b]) return;
  const order = { n: ++db.seq, user: u.id, plan: id, bill: b, price: b === 'y' ? p.y : p.m, at: Date.now(), status: 'new' };
  db.orders.push(order); save();
  if (PAYMENT_MODE === 'stars') {
    return call('sendInvoice', {
      chat_id: chatId, title: `MERO VPN · ${p.name}`, description: `${PERIOD[b].label}, до ${p.devices} устройств, безлимитный трафик`,
      payload: `order:${order.n}`, currency: 'XTR', prices: [{ label: `${p.name}, ${PERIOD[b].label}`, amount: b === 'y' ? p.starsY : p.starsM }],
    });
  }
  await send(chatId,
    `<b>Заявка №${order.n} создана</b>\n\n${p.name}, ${PERIOD[b].label}: <b>${rub(order.price)}</b>\n\n` +
    `Администратор пришлёт реквизиты в этот чат. После оплаты ключ придёт автоматически.`,
    kb([[{ text: '💬 Написать в поддержку', callback_data: 'support' }]]));
  await notifyAdmins(
    `<b>Новая заявка №${order.n}</b>\n${p.name}, ${PERIOD[b].label}, ${rub(order.price)}\n` +
    `Пользователь: ${esc(u.name)} ${u.username ? '@' + u.username : ''}\nID: <code>${u.id}</code>\n\nОтветьте на это сообщение, чтобы написать пользователю.`,
    kb([[{ text: '✅ Оплата получена', callback_data: `paid:${order.n}` }, { text: '✖ Отменить', callback_data: `cancel:${order.n}` }]]));
}

async function confirmOrder(n, by) {
  const o = db.orders.find(x => x.n === n);
  if (!o || o.status !== 'new') return 'Заявка уже обработана';
  const u = db.users[o.user];
  const ok = await grant(u, o.plan, PERIOD[o.bill].days, `Оплата получена, спасибо`);
  if (!ok) return 'Нет свободных ключей: добавьте /addkey и нажмите ещё раз';
  o.status = 'paid'; o.by = by; save();
  return `Заявка №${n} подтверждена`;
}

// ---------------------------------------------------------------- handlers
async function onStart(msg, u, param) {
  if (param === 'trial') return startTrial(msg.chat.id, u);
  if (param === 'profile') { const s = profileScreen(u); return send(msg.chat.id, s.text, s.extra); }
  if (param === 'guide') { const s = guideScreen(); return send(msg.chat.id, s.text, s.extra); }
  if (param === 'support') return askSupport(msg.chat.id, u);
  const m = /^buy_(lite|mero|family)_(m|y)$/.exec(param || '');
  if (m) { const s = orderScreen(m[1], m[2]); return send(msg.chat.id, s.text, s.extra); }
  const s = menuScreen(u);
  if (fs.existsSync(BANNER)) {
    return callForm('sendPhoto', { chat_id: msg.chat.id, caption: s.text, parse_mode: 'HTML', reply_markup: s.extra.reply_markup }, 'photo', BANNER)
      .catch(() => send(msg.chat.id, s.text, s.extra));
  }
  return send(msg.chat.id, s.text, s.extra);
}

async function askSupport(chatId, u) {
  u.support = true; save();
  return send(chatId, '<b>Поддержка MERO</b>\n\nОпишите проблему одним сообщением: устройство, приложение и что именно не работает. Можно приложить скриншот.',
    kb([[{ text: 'Отмена', callback_data: 'menu' }]]));
}

async function onMessage(msg) {
  if (msg.chat.type !== 'private' || !msg.from) return;
  const u = user(msg.from);
  const text = msg.text || '';

  if (msg.successful_payment) {
    const n = +String(msg.successful_payment.invoice_payload).split(':')[1];
    const o = db.orders.find(x => x.n === n);
    if (o) { o.status = 'paid'; o.charge = msg.successful_payment.telegram_payment_charge_id; save(); }
    const ok = o && await grant(u, o.plan, PERIOD[o.bill].days, 'Оплата прошла, спасибо');
    if (!ok) {
      await send(u.id, 'Оплата получена. Ключ пришлём в течение нескольких минут.');
      await notifyAdmins(`Оплата Stars по заявке №${n}, но нет свободных ключей.\nID: <code>${u.id}</code>\nВыдать: /give ${u.id} ${o ? PERIOD[o.bill].days : 30} ${o ? o.plan : 'mero'}`);
    }
    return;
  }

  // admin replies to a forwarded support message or order: deliver to the user
  if (isAdmin(u.id) && msg.reply_to_message && !text.startsWith('/')) {
    const src = msg.reply_to_message.text || msg.reply_to_message.caption || '';
    const id = (/ID: (\d+)/.exec(src) || [])[1];
    if (id) {
      await call('copyMessage', { chat_id: +id, from_chat_id: msg.chat.id, message_id: msg.message_id });
      return send(u.id, 'Отправлено пользователю.');
    }
  }

  if (text.startsWith('/')) {
    const [cmd, ...args] = text.split(/\s+/);
    const c = cmd.replace(/@\w+$/, '').toLowerCase();
    if (c === '/start') { u.support = false; save(); return onStart(msg, u, args[0]); }
    if (c === '/app') return send(msg.chat.id, 'Откройте приложение MERO VPN:', kb([appBtn()].filter(r => r.length)));
    if (c === '/plans') { const s = plansScreen('m'); return send(msg.chat.id, s.text, s.extra); }
    if (c === '/profile' || c === '/key') { const s = profileScreen(u); return send(msg.chat.id, s.text, s.extra); }
    if (c === '/trial') return startTrial(msg.chat.id, u);
    if (c === '/help' || c === '/guide') { const s = guideScreen(); return send(msg.chat.id, s.text, s.extra); }
    if (c === '/support') return askSupport(msg.chat.id, u);
    if (isAdmin(u.id)) return onAdmin(msg, c, args, text);
    return send(msg.chat.id, 'Не знаю такой команды. Откройте меню: /start');
  }

  if (u.support) {
    u.support = false; save();
    const head = `<b>Поддержка</b> от ${esc(u.name)} ${u.username ? '@' + u.username : ''}\nID: ${u.id}\n` +
      `Подписка: ${active(u) ? 'до ' + date(u.expires) : 'нет'}\n\n${esc(text || '[вложение]')}`;
    await notifyAdmins(head);
    if (!text) for (const a of ADMIN_IDS) await call('copyMessage', { chat_id: a, from_chat_id: msg.chat.id, message_id: msg.message_id }).catch(() => {});
    return send(msg.chat.id, 'Сообщение передано в поддержку. Ответ придёт в этот чат.', kb([back]));
  }

  const s = menuScreen(u);
  return send(msg.chat.id, s.text, s.extra);
}

async function onAdmin(msg, c, args, text) {
  const chat = msg.chat.id;
  if (c === '/admin') {
    const users = Object.values(db.users);
    return send(chat,
      `<b>MERO · админ</b>\nПользователей: ${users.length}\nАктивных: ${users.filter(active).length}\n` +
      `Свободных ключей: ${db.keys.length}\nОткрытых заявок: ${db.orders.filter(o => o.status === 'new').length}\n\n` +
      `/addkey ключ1 ключ2 ... добавить ключи (можно столбиком)\n/give ID дни [lite|mero|family|trial] выдать доступ\n/user ID карточка пользователя\n/broadcast текст рассылка всем`);
  }
  if (c === '/addkey') {
    const keys = text.replace(/^\/addkey(@\w+)?/i, '').split(/\s+/).filter(Boolean);
    db.keys.push(...keys); save();
    return send(chat, `Добавлено ключей: ${keys.length}. В запасе: ${db.keys.length}.`);
  }
  if (c === '/give') {
    const [id, days = '30', plan = 'mero'] = args;
    const u = db.users[id];
    if (!u) return send(chat, 'Пользователь не найден (он должен хотя бы раз нажать /start).');
    const ok = await grant(u, plan, +days, 'Доступ выдан');
    return send(chat, ok ? `Готово: ${esc(u.name)} до ${date(u.expires)}.` : 'Нет свободных ключей: сначала /addkey.');
  }
  if (c === '/user') {
    const u = db.users[args[0]];
    if (!u) return send(chat, 'Не найден.');
    return send(chat, `<b>${esc(u.name)}</b> ${u.username ? '@' + u.username : ''}\nID: <code>${u.id}</code>\nТариф: ${u.plan || 'нет'}\nДо: ${u.expires ? date(u.expires) : '-'}\nКлюч: <code>${esc(u.key || '-')}</code>`);
  }
  if (c === '/broadcast') {
    const body = text.replace(/^\/broadcast(@\w+)?\s*/i, '');
    if (!body) return send(chat, 'Использование: /broadcast текст');
    let sent = 0;
    for (const id of Object.keys(db.users)) {
      try { await send(+id, body); sent++; } catch { /* blocked the bot */ }
      await sleep(40);
    }
    return send(chat, `Разослано: ${sent}.`);
  }
  return send(chat, 'Неизвестная команда. /admin');
}

async function onCallback(q) {
  const u = user(q.from);
  const d = q.data || '';
  let answer = '';
  try {
    if (d === 'menu') { u.support = false; save(); const s = menuScreen(u); await show(q, s.text, s.extra); }
    else if (d.startsWith('plans:')) { const s = plansScreen(d.split(':')[1] === 'y' ? 'y' : 'm'); await show(q, s.text, s.extra); }
    else if (d.startsWith('buy:')) { const [, id, b] = d.split(':'); if (PLANS[id]) { const s = orderScreen(id, b); await show(q, s.text, s.extra); } }
    else if (d.startsWith('pay:')) { const [, id, b] = d.split(':'); await startPayment(q.message.chat.id, u, id, b); }
    else if (d === 'profile') { const s = profileScreen(u); await show(q, s.text, s.extra); }
    else if (d === 'trial') await startTrial(q.message.chat.id, u);
    else if (d === 'guide') { const s = guideScreen(); await show(q, s.text, s.extra); }
    else if (d.startsWith('guide:')) { const k = d.split(':')[1]; if (GUIDES[k]) { const s = guideScreen(k); await show(q, s.text, s.extra); } }
    else if (d === 'support') await askSupport(q.message.chat.id, u);
    else if (d.startsWith('paid:') && isAdmin(u.id)) answer = await confirmOrder(+d.split(':')[1], u.id);
    else if (d.startsWith('cancel:') && isAdmin(u.id)) {
      const o = db.orders.find(x => x.n === +d.split(':')[1]);
      if (o && o.status === 'new') { o.status = 'cancelled'; save(); await send(o.user, `Заявка №${o.n} отменена. Если это ошибка, напишите в поддержку.`); answer = 'Отменено'; }
      else answer = 'Заявка уже обработана';
    }
  } catch (e) { console.error('callback', d, e.message); }
  await call('answerCallbackQuery', { callback_query_id: q.id, text: answer || undefined }).catch(() => {});
}

// ---------------------------------------------------------------- reminders
async function reminders() {
  const now = Date.now();
  for (const u of Object.values(db.users)) {
    if (!u.expires) continue;
    try {
      if (u.plan !== 'trial' && u.expires > now && u.expires - now < 864e5 && !u.reminded) {
        u.reminded = true; save();
        await send(u.id, `Подписка MERO заканчивается ${date(u.expires)}. Продлите заранее, ключ останется тем же.`, kb([[{ text: '🔄 Продлить', callback_data: 'plans:m' }]]));
      } else if (u.expires <= now && !u.expiredNotified) {
        u.expiredNotified = true; save();
        await send(u.id, 'Подписка MERO закончилась. Продлите её, чтобы снова подключиться.', kb([[{ text: '💳 Тарифы', callback_data: 'plans:m' }]]));
      }
    } catch { /* user blocked the bot */ }
  }
}

// ---------------------------------------------------------------- setup + polling
async function setup() {
  const me = await call('getMe');
  await call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Главное меню' },
      { command: 'app', description: 'Открыть приложение MERO VPN' },
      { command: 'plans', description: 'Тарифы' },
      { command: 'profile', description: 'Мой ключ и подписка' },
      { command: 'trial', description: `${TRIAL} бесплатно` },
      { command: 'help', description: 'Инструкции по подключению' },
      { command: 'support', description: 'Написать в поддержку' },
    ],
  });
  if (WEBAPP_URL) await call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'MERO VPN', web_app: { url: WEBAPP_URL } } });
  await call('setMyShortDescription', { short_description: 'Быстрый VPN на VLESS Reality. Ключ за минуту, оплата и поддержка прямо в Telegram.' }).catch(() => {});
  await call('setMyDescription', { description: `MERO VPN: быстрый и стабильный VPN на протоколе VLESS Reality.\n\nОдин ключ на все устройства, ноль логов. Нажмите «Старт» и получите ${TRIAL} бесплатно.` }).catch(() => {});
  console.log(`@${me.username} is running. Mini app: ${WEBAPP_URL || '(WEBAPP_URL not set)'}. Admins: ${ADMIN_IDS.join(', ') || 'none'}`);
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function poll() {
  let offset = 0;
  for (;;) {
    try {
      const updates = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] });
      for (const up of updates) {
        offset = up.update_id + 1;
        try {
          if (up.message) await onMessage(up.message);
          else if (up.callback_query) await onCallback(up.callback_query);
          else if (up.pre_checkout_query) await call('answerPreCheckoutQuery', { pre_checkout_query_id: up.pre_checkout_query.id, ok: true });
        } catch (e) { console.error('update', up.update_id, e.message); }
      }
    } catch (e) {
      console.error('poll:', e.message);
      await sleep(3000);
    }
  }
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

setup().then(() => { setInterval(reminders, 60 * 60 * 1000); reminders(); return poll(); })
  .catch(e => { console.error(e.message); process.exit(1); });
