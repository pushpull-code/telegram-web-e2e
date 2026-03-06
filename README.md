# Telegram Web E2E (@artp345_bot)

Browser E2E tests for freelancer bot flow in Telegram Web.

## What is covered

- `/start <payload>` response has stable intro text anchors.
- Payload mode bypasses WebApp anti-bot verification (country/platform provided in start payload).
- `/join_task` returns either task assignment or no-task state.
- When task is assigned, action buttons are validated (`Отменить задачу` + `Завершить задачу` or `Открыть приложение`).
- `/deleteme` reset is validated: user can be reset and then started from scratch with payload start.
- Realistic freelancer chat flow for `us_1` is covered in a separate serial suite (`tests/bot-freelancer.spec.ts`) with one-step recovery.

## Setup

```bash
npm install
npx playwright install chromium
```

## Auth session (one time)

```bash
npm run auth -- --headed
```

If `playwright/.auth/user.json` already exists, auth step is skipped.

## Run tests

```bash
npm run test:bot -- --headed
```

or full suite:

```bash
npm test -- --headed
```

Transcript-evidence run (step-by-step screenshots + chat tail transcript):

```bash
npx playwright test tests/bot-transcript.spec.ts --project=chromium
```

Freelancer-like scenario (`us_1`, separate suite):

```bash
npm run test:freelancer
```

Freelancer-like scenario in headed mode:

```bash
npm run test:freelancer -- --headed
```

Artifacts after run:
- `test-results/<run-folder>/evidence/transcript.md`
- `test-results/<run-folder>/evidence/*.png`
- `test-results/<run-folder>/video.webm`
- `test-results/<run-folder>/trace.zip`

## Environment variables

- `BOT_USERNAME` (default: `artp345_bot`)
- `BOT_COUNTRY_CODE` (default: `us`)
- `BOT_PLATFORM` (default: `1`) where `1=android`, `2=ios`
- `BOT_START_PAYLOAD` (optional override; default is `adexium_<country>_<platform>`)
- `BOT_EXPECT_NO_WEBAPP_ANTIBOT` (default: `1`; set `0` to allow anti-bot flow handling)
- `BOT_CHAT_TITLE` (optional fallback chat title for opening chat from list; default internal fallback: `Applications Reviews Test Performer`)
- `TELEGRAM_WEB_URL` (default: `https://web.telegram.org/k/`)
- `E2E_FREELANCER_FAST` (default: `0`; set `1` for shorter timeouts in `bot-freelancer.spec.ts`)
- `E2E_RECOVERY_ATTEMPTS` (default: `1`; retries per critical freelancer step after recovery rearm)

Example:

```bash
BOT_USERNAME=artp345_bot BOT_COUNTRY_CODE=us BOT_PLATFORM=1 npm run test:bot -- --headed
```

## Telegram Web Deep Links

Canonical bot link with payload pattern:

```text
https://t.me/artp345_bot?start=adexium_<country_code>_<platform>
```

Payload rules:
- First parameter is fixed: `adexium` (do not change).
- Second parameter is country code, for example `us`, `mx`, `ng`.
- Third parameter is platform: `1` = Android, `2` = iOS.

Telegram Web (`/k`) deeplink template:

```text
https://web.telegram.org/k/#?tgaddr=https%3A%2F%2Ft.me%2Fartp345_bot%3Fstart%3Dadexium_<country_code>_<platform>
```

Saved links for `us`:

```text
Android (1):
https://web.telegram.org/k/#?tgaddr=https%3A%2F%2Ft.me%2Fartp345_bot%3Fstart%3Dadexium_us_1

iOS (2):
https://web.telegram.org/k/#?tgaddr=https%3A%2F%2Ft.me%2Fartp345_bot%3Fstart%3Dadexium_us_2
```

## GitHub Actions (Free Tier)

Workflow file:
- `.github/workflows/telegram-web-e2e.yml`

Before first CI run:

1. Create local auth state:

```bash
npm run auth -- --headed
```

2. Convert `playwright/.auth/user.json` to base64.

PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("playwright/.auth/user.json"))
```

Bash:

```bash
base64 -w 0 playwright/.auth/user.json
```

3. Add repository secret:
- `TELEGRAM_STORAGE_STATE_B64` = base64 from previous step

Optional repository variables:
- `BOT_USERNAME` (default already `artp345_bot`)
- `BOT_COUNTRY_CODE` (for example: `us`, `mx`, `ng`)
- `BOT_PLATFORM` (`1` android, `2` ios)
- `BOT_EXPECT_NO_WEBAPP_ANTIBOT` (`1` by default)
- `TELEGRAM_WEB_URL` (default already `https://web.telegram.org/k/`)

Run:
- GitHub -> `Actions` -> `Telegram Web E2E` -> `Run workflow`
- `suite` input supports: `bot`, `autorun`, `freelancer`, `settings`, `all`
- Artifacts: `playwright-report` and `playwright-test-results`

Strict autorun suite (text-guard + photo upload loop):

```bash
npm run test:autorun:text -- --project=chromium
```

For Linux CI, `xclip` is required for clipboard-based photo fallback (installed in workflow).

## Notes

- Tests are tied to message text anchors (as requested), not hardcoded step IDs.
- Bot state is dynamic: if no task is available, task-action assertion test is auto-skipped.
- `/deleteme` flow is intentionally tolerant to text variations in deletion confirmation.
- Scenario runs start from Telegram Web deep-link (`tgaddr` with start payload), not from plain `/k/`.
- Scenario cleanup ends with `/deleteme` as the final command.
- Keep this test account dedicated for automation to reduce noise in chat history.
- Scenario-level coverage plan is documented in `BOT_TEST_MATRIX_2026-02-22.md`.
