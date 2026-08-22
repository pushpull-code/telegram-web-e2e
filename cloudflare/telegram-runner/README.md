# Telegram E2E Runner Worker (Cloudflare)

Cloudflare Worker for Telegram bot orchestration:

- RU/EN language selection on `/start`
- language preference persisted in KV
- scenario menu (currently one scenario)
- starts Cloudflare Workflows MTProto runner or GitHub Actions fallback run
- receives completion callback and sends report to Telegram with duration, scenario, run link, screenshots
- asks user if a new test should be started
- accepts direct commands like `/run generated_scenarios safe`
- serves `/panel` web UI for Telegram bot and website/web-app QA runs

## 1) Create KV namespace

```bash
npx wrangler kv namespace create BOT_STATE_KV
npx wrangler kv namespace create BOT_STATE_KV --preview
```

Put returned `id` values into `wrangler.toml`.

## 2) Configure Worker secrets

Run these commands in `cloudflare/telegram-runner`:

```bash
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put GITHUB_PAT
npx wrangler secret put GITHUB_OWNER
npx wrangler secret put GITHUB_REPO
npx wrangler secret put REPORT_TOKEN
npx wrangler secret put MTPROTO_SERVICE_TOKEN
npx wrangler secret put AI_API_KEY
```

Optional secret (lock bot to one chat only):

```bash
npx wrangler secret put TELEGRAM_ALLOWED_CHAT_ID
```

Optional secret (if callback URL differs from current worker host):

```bash
npx wrangler secret put REPORT_CALLBACK_URL
```

The web panel is available without a separate panel token during active development.
Report callback and Telegram webhook routes still use their own secrets.

## 3) Deploy

```bash
npm install
npm run deploy
```

Во время активной разработки деплой должен идти через GitHub Actions: push в `main` запускает `.github/workflows/deploy-telegram-runner-worker.yml` и выполняет `wrangler deploy`.

Для автодеплоя в GitHub secrets нужны:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Локальный `wrangler login` подходит для ручной проверки, но не заменяет `CLOUDFLARE_API_TOKEN` в CI.

## 4) Set Telegram webhook

Replace `<worker-url>` and run:

```bash
curl -X POST "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook" \
  -d "url=https://<worker-url>/telegram/webhook" \
  -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

## 5) GitHub repo configuration

In repository secrets/variables:

- Secret `CLOUDFLARE_REPORT_TOKEN` = same value as Worker `REPORT_TOKEN`
- Variable `CLOUDFLARE_REPORT_URL` = `https://<worker-url>/github/report`

Workflow `telegram-web-e2e.yml` (updated in this repo) will send callback payload after each run with:

- run status
- duration
- scenario name/key
- run URL
- up to 3 screenshots in base64
- generated scenario suite summary when `generated_scenarios` was run

For `generated_scenarios`, the worker adds a short branch-check block to the Telegram report: total drafts, passed/flaky/failed/not-run counts, and one compact line per generated branch.

## Web panel / Веб-панель

Открыть:

```text
https://<worker-url>/panel
```

Панель умеет:

- запускать GitHub Actions прогон по username бота и опциональному `/start` payload;
- запускать Cloudflare MTProto прогон без расхода GitHub Actions minutes;
- запускать Cloudflare Browser прогон обычного сайта или веб-приложения по URL;
- передавать одноразовые инструкции авторизации для тестового аккаунта в Browser runner без показа их в панели после сохранения;
- держать Cloudflare-прогоны в Workflows, чтобы долгие карты/AI-разборы не зависели от `waitUntil`;
- показывать live-прогресс GitHub jobs/steps;
- показывать документы, которые создаются во время прогона;
- показывать компактное дерево логики из `generated-scenario-suite-report.json`;
- перезапускать одну или несколько выбранных веток.

Рекомендуемый режим для первого прохода:

```text
suite: generated_scenarios
engine: cloudflare
selector: smart
max drafts: 8
```

Для отдельного dev/test бота используй selector `dev`: он разрешает более глубокий проход и state-changing ветки согласно safety-настройкам workflow.

Cloudflare engine создаёт `PANEL_RUN_WORKFLOW`, выполняет MTProto discovery, строит карту веток, генерирует короткий AI/fallback-разбор и сохраняет результат в KV без создания GitHub Actions run. GitHub Actions engine нужен для полного Playwright-прогона со скриншотами/trace и тяжелыми WebApp-проверками, пока они не вынесены в Cloudflare Browser Run/Containers.

Для сайта или веб-приложения выбери в панели `Сайт или веб-приложение`, укажи URL, профиль устройства, цель проверки и, если нужно, тестовые инструкции авторизации. Пример:

```text
URL: https://rate2cash.com
Устройство: Мобильный браузер
Что проверить: авторизация, главный экран, меню, задачи, пополнение, ошибки форм.
Авторизация: войти тестовым аккаунтом; не делать оплату, вывод средств и необратимые действия.
```

Режим сайта использует `suite: website_audit` и Cloudflare Browser. Он сохраняет `website-audit-report.json`, `website-ai-review.json`, screenshot стартовой страницы и показывает статус авторизации, найденные flow, формы, блокеры и рекомендации.

## Telegram commands

```text
/run
/run ru
/run en
/run generated_scenarios
/run generated_scenarios safe
/run generated_scenarios dev
/run generated_scenario start-smoke
```

Selectors are accepted only for `generated_scenario` and `generated_scenarios`.
Use `dev` only for a dedicated dev/test bot: it clicks state-changing inline buttons and includes test-account branches.
