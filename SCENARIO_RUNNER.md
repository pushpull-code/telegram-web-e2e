# Scenario and Discovery Runner

This repository now has two higher-level runner modes on top of the existing Telegram Web helpers.

## Scenario Runner

Use this when the expected flow is known and should be repeatable.

```bash
npm run test:scenario -- --headed
```

Default scenario:

```text
scenarios/rate2cash-basic.json
```

Use another file:

```bash
SCENARIO_FILE=scenarios/rate2cash-basic.json npm run test:scenario -- --headed
```

Scenario format:

```json
{
  "name": "rate2cash-basic-smoke",
  "bot": "${BOT_USERNAME:-artp345_bot}",
  "continueOnFailure": true,
  "tailLimit": 120,
  "steps": [
    {
      "name": "open start payload",
      "openStartPayload": "${BOT_START_PAYLOAD:-adexium_us_1}",
      "expectComposer": true,
      "expectTextAny": ["Нажми \"Я готов\"", "I’m ready"],
      "requireFreshResponse": false
    },
    {
      "name": "join task",
      "send": "/join_task",
      "expectTextAny": ["Вы зарегистрировались", "There are no available tasks"]
    }
  ]
}
```

Supported step fields:

- `openBot`: open the configured bot chat.
- `openStartPayload`: open Telegram Web through a `t.me/<bot>?start=<payload>` deep link.
- `send`: send a chat message or command.
- `clickButton`: click an exact inline button.
- `clickButtonAny`: click the first available button from the list.
- `sendAttachment`: send a file attachment, with optional `mode` = `any`, `photo`, or `document`.
- `waitMs`: wait after actions.
- `expectComposer`: wait until Telegram composer is visible.
- `expectTextAny`: wait until one of the text anchors is visible in the chat tail.
- `expectButtonAny`: wait until one of the buttons is visible.
- `optional`: do not fail the whole scenario if the step fails.
- `requireFreshResponse`: require the chat tail to change before matching `expectTextAny`.

Artifacts:

```text
test-results/<run>/scenario-<name>/transcript.md
test-results/<run>/scenario-<name>/report.json
test-results/<run>/scenario-<name>/*.png
```

## Discovery Runner

Use this when the flow is not known yet. It opens the bot, records visible buttons, replays paths from the root, and writes a state graph.

```bash
npm run test:discover -- --headed
```

Environment variables:

- `DISCOVERY_OPEN_MODE`: `start-payload` by default; set `chat` to open the bot chat directly.
- `DISCOVERY_START_PAYLOAD`: optional start payload override.
- `DISCOVERY_MAX_DEPTH`: default `2`.
- `DISCOVERY_MAX_NODES`: default `12`.
- `DISCOVERY_MAX_BUTTONS_PER_NODE`: default `8`.
- `DISCOVERY_DENY_BUTTON_RE`: regex for buttons that must not be clicked. Defaults to destructive/payment labels.

Artifacts:

```text
test-results/<run>/discovery/discovery-report.json
test-results/<run>/discovery/transcript.md
test-results/<run>/discovery/*.png
```

## MTProto Discovery + Branch Analysis

Use this when Telegram bot structure should be explored without depending on Telegram Web selectors.
It starts the bot through the MTProto service, safely walks inline-button branches, writes the raw map, then adds branch/product analysis.

```bash
npm run test:discover:mtproto
```

Required environment variables:

- `MTPROTO_SERVICE_URL`
- `MTPROTO_SERVICE_TOKEN`

Optional AI enrichment:

- `OPENAI_API_KEY` or `AI_API_KEY`
- `OPENAI_MODEL` or `AI_MODEL`
- `OPENAI_BASE_URL` or `AI_BASE_URL` for OpenAI-compatible providers
- `MTPROTO_DISCOVERY_AI=0` to disable AI review and keep heuristic-only output

DeepSeek example:

```text
AI_BASE_URL=https://api.deepseek.com
AI_MODEL=deepseek-v4-flash
AI_API_KEY=<DeepSeek API key>
```

Discovery controls:

- `MTPROTO_DISCOVERY_START_PAYLOAD`
- `MTPROTO_DISCOVERY_MAX_DEPTH` default `2`
- `MTPROTO_DISCOVERY_MAX_NODES` default `14`
- `MTPROTO_DISCOVERY_MAX_BUTTONS_PER_NODE` default `8`
- `MTPROTO_DISCOVERY_CLICK_TIMEOUT_MS` default `3500`
- `MTPROTO_DISCOVERY_DENY_BUTTON_RE` for buttons that must not be clicked
- `MTPROTO_DISCOVERY_WEB_TARGETS=0` to disable URL/WebApp checks
- `MTPROTO_DISCOVERY_MAX_URL_AUDITS` default `5`
- `MTPROTO_DISCOVERY_WEB_TARGET_TIMEOUT_MS` default `20000`
- `MTPROTO_DISCOVERY_WEB_SAFE_CLICKS=1` to enable limited safe clicks inside URL/WebApp pages
- `MTPROTO_DISCOVERY_MAX_WEB_SAFE_CLICKS` default `2`
- `MTPROTO_DISCOVERY_WEB_UNSAFE_INTERACTION_RE` to override unsafe interaction labels

Artifacts:

```text
test-results/<run>/mtproto-discovery/bot-map.json
test-results/<run>/mtproto-discovery/bot-map.enriched.json
test-results/<run>/mtproto-discovery/web-target-audits.json
test-results/<run>/mtproto-discovery/web-targets/*.png
test-results/<run>/mtproto-discovery/qa-report.md
```

`bot-map.enriched.json` contains per-node purpose, expected behavior, risks, suggested tests, branch analysis, product summary, and optional staged AI review.
When AI is enabled, the review follows `telegram-bot-qa-v2`: overall bot view, branch-by-branch analysis, scenario plan, defects, coverage gaps, product questions, next-run recommendation, and short Telegram summary.
`qa-report.md` is the readable report built from the staged AI output, with heuristic fallback when AI is disabled or returns an invalid shape.
URL/WebApp checks open terminal URL buttons in Chromium, collect status/title/final URL, screenshot, page text sample, headings, visible links/buttons/inputs/forms, console messages, and failed requests. Full URL query/hash values are sanitized in AI/report artifacts.
Safe clicks are disabled by default. When `MTPROTO_DISCOVERY_WEB_SAFE_CLICKS=1`, the runner only clicks limited same-origin non-destructive link/button candidates and records after-click URL/title/screenshot/network evidence.

## GitHub Actions

The workflow suite input now supports:

```text
bot | mtproto | discover_mtproto | scenario | discover | autorun | freelancer | settings | all
```

The Telegram dispatch script also accepts:

```text
/run mtproto
/run discover_mtproto
/run scenario
/run discover
```

## MTProto Smoke

Use this when the chat flow should run through a Telegram user account without depending on Telegram Web selectors.

```bash
npm run test:mtproto
```

Required environment variables:

- `MTPROTO_SERVICE_URL`
- `MTPROTO_SERVICE_TOKEN`

Optional:

- `MTPROTO_START_PAYLOAD`
- `MTPROTO_WAIT_TIMEOUT_MS`
