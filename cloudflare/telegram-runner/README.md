# Telegram E2E Runner Worker (Cloudflare)

Cloudflare Worker for Telegram bot orchestration:

- RU/EN language selection on `/start`
- language preference persisted in KV
- scenario menu (currently one scenario)
- starts GitHub Actions workflow run
- receives completion callback and sends report to Telegram with duration, scenario, run link, screenshots
- asks user if a new test should be started

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
```

Optional secret (lock bot to one chat only):

```bash
npx wrangler secret put TELEGRAM_ALLOWED_CHAT_ID
```

Optional secret (if callback URL differs from current worker host):

```bash
npx wrangler secret put REPORT_CALLBACK_URL
```

## 3) Deploy

```bash
npm install
npm run deploy
```

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
