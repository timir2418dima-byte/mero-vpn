# MERO VPN

Telegram-бот [@mero_vpn_bot](https://t.me/mero_vpn_bot) и мини-приложение.

- `index.html`, `fonts/` — мини-апп (GitHub Pages, ветка `main`, корень).
- `bot/` — бот на Node.js 18+ без зависимостей.

## Запуск бота

```bash
cd bot
cp .env.example .env   # вписать BOT_TOKEN, WEBAPP_URL, ADMIN_IDS
node bot.js
```

Команды админа: `/admin`, `/addkey`, `/give ID дни тариф`, `/user ID`, `/broadcast текст`.
Ключи выдаются из пула (`/addkey`), оплата: `PAYMENT_MODE=manual` (заявка админу) или `stars` (Telegram Stars).
