# Telegram Bot Test Matrix (Artem)

Source:
- Telegram dialog log from user (freelancer flow for `@artp345_bot`, app `Roulette`)
- Discovery log: `FLOW_DISCOVERY_2026-02-22.md`

Date locked: 2026-02-22

## Goal

Cover the freelancer bot flow end-to-end with stable text anchors now, and keep step IDs ready for migration when backend starts sending explicit step identifiers.

## Test Layers

1. `L1 Unit`
   Validate command routing and step transitions from incoming updates to outgoing bot messages.
2. `L2 Integration`
   Validate webhook/getUpdates handling, persistence of task state, and command idempotency with real update payloads.
3. `L3 E2E (Telegram Web)`
   Validate real user path in browser: commands, inline buttons, attachments, and visible bot messages.

## Scenario Matrix

| Case ID | Scenario | Trigger | Expected anchor(s) | Layer | Priority | Status |
|---|---|---|---|---|---|---|
| ARTP-001 | Intro message appears | `/start` | `Привет, чемпион!`, `Нажми "Я готов"` | L3 | P0 | Automated |
| ARTP-002 | Anti-bot step after ready | Click `Я готов!` | `Мы платим реальные деньги`, `Я не бот` | L3 | P0 | Automated |
| ARTP-003 | Join task returns state | `/join_task` | `Вы зарегистрировались для выполнения задания` OR `Заказ уже взят другим фрилансером или завершен` OR `К сожалению, в данный момент нет доступных задач` | L3 | P0 | Automated |
| ARTP-004 | Open-app warning text | Assigned task branch | `Пожалуйста, обратите внимание на этот шаг`, `Ваш рейтинг для мобильного приложения` | L3 | P0 | Partially automated (anchor coverage) |
| ARTP-005 | Multi-app disambiguation hint | Assigned task branch | `Если приложений с одинаковым названием несколько`, `Искать по запросу` | L3 | P1 | Partially automated (anchor coverage) |
| ARTP-006 | Review confirmation reminder | Assigned task branch | `Вы оценили приложение?` | L3 | P1 | Partially automated (anchor coverage) |
| ARTP-007 | Screenshot requirement prompt | Assigned task branch | `Чтобы подтвердить, что вы действительно установили и открыли приложение` | L3 | P0 | Partially automated (anchor coverage) |
| ARTP-008 | Invalid screenshot is rejected | Send wrong image/file | `Некорректное значение` + screenshot requirement text repeats | L1/L2/L3 | P0 | Automated (conditional by active task) |
| ARTP-009 | Valid screenshot accepted and task success | Send valid app screenshot | `Поздравляем, вы успешно выполнили задание!` | L1/L2/L3 | P0 | Not automated (environment-dependent) |
| ARTP-010 | Earnings command response | `/view_earnings` | `Общий заработок:`, `Ожидающие одобрения:` | L3 | P0 | Automated |
| ARTP-011 | Withdraw threshold response | `/withdraw` | `Минимальная сумма для вывода 20 USD` (or payout prompt variants) | L3 | P0 | Automated |
| ARTP-012 | Re-join blocked when unavailable | `/join_task` after active/ended state | `Заказ уже взят другим фрилансером или завершен!` | L3 | P1 | Automated (covered by join-state case) |
| ARTP-013 | Repeated commands are stable | `/start`, `/join_task`, `/view_earnings` repeated | No crashes, valid anchors returned each time | L2/L3 | P1 | Partially automated |
| ARTP-FR-001 | Deep-link opens onboarding or verified state (`us_1`) | Open `tgaddr` `adexium_us_1` | `Нажми "Я готов"` OR `Всё готово` | L3 | P0 | Automated |
| ARTP-FR-002 | Ready + anti-bot branch is handled when present | Click `Я готов!`, then `Я не бот` if visible | `Мы платим реальные деньги` and/or verification success anchors | L3 | P0 | Automated |
| ARTP-FR-003 | Realistic join_task branch in freelancer flow | `/join_task` | assigned OR no-task anchors, no crash | L3 | P0 | Automated |
| ARTP-FR-004 | Active task controls and external open-app modal | Assigned task branch + click `Открыть приложение` | Task instruction anchors, `Отменить задачу`, `Завершить задачу`, `Open Link` modal | L3 | P0 | Automated (conditional on active task) |
| ARTP-FR-005 | Submit can loop warning/open-app or move to review/screenshot | Click `Завершить задачу` | Warning/open-app loop anchors OR review/screenshot anchors | L3 | P0 | Automated (conditional on active task) |
| ARTP-FR-006 | Service commands in freelancer flow + final cleanup | `/view_earnings`, `/withdraw`, `/deleteme` | Earnings/withdraw anchors + final cleanup command sent | L3 | P0 | Automated |

## Settings Flow Case Matrix (ARTP-SET)

Source: user-provided scenario (2026-03-04).
Bot: `@artp345_bot`. Spec: `tests/bot-settings-flow.spec.ts`.

| Case ID | Scenario | Trigger | Expected anchor(s) | Priority | Status |
|---|---|---|---|---|---|
| ARTP-SET-000 | Open bot, pass onboarding if needed | Deep-link + click ready button | `START_ANCHORS` | P0 | Automated |
| ARTP-SET-001 | /settings → change country → Belarus | `/settings` → click "Изменить страну" → click "Belarus" | `Ваша страна Belarus` | P0 | Automated |
| ARTP-SET-002 | /settings → change platform → Android (with error recovery) | `/settings` → click "Сменить платформу" → click "Android" | `Платформа: Android` OR error → recovery | P0 | Automated |
| ARTP-SET-003 | /settings state shows Belarus + Android | `/settings` | `Страна: 🇧🇾 Belarus` + `Платформа: Android` | P0 | Automated |
| ARTP-SET-004 | /join_task → task assigned → wait Step 2 (~1 min) | `/join_task` | `Вы зарегистрировались для выполнения задания` → `Следующий шаг для выполнения задачи` | P0 | Automated (skipped if no task available) |
| ARTP-SET-005 | Click "Завершить задачу" → confirm "Да" | Inline button → "Да" | `Вы оставили отзыв?` → bot asks for screenshot | P0 | Automated (conditional on active task) |
| ARTP-SET-006 | Send fixture screenshot → negative branch | `sendFileAttachment` | `Некорректное значение` OR repeated screenshot prompt | P0 | Automated (conditional) |
| ARTP-SET-007 | Click "Finish" → success message | Inline button "Finish" | `Поздравляем, вы успешно выполнили задание!` | P0 | Automated (conditional, environment-dependent) |
| ARTP-SET-008 | /deleteme resets all state | `/deleteme` | `Пользователь удален` OR `Привет` | P0 | Automated |

### Key Design Decisions

- `test.describe.serial` — tests run in order; state (`taskWasAssigned`, `reachedStep2`, `reachedScreenshotStep`) flows between tests.
- Tests ARTP-SET-004..007 use `test.skip` when no task is assigned — this is expected and documented.
- ARTP-SET-004 uses 150-second timeout for Step 2 (bot sends it after ~1 minute).
- ARTP-SET-002 has error recovery: if bot returns "Произошла ошибка", re-sends `/settings` and verifies state.
- `beforeAll` / `afterAll` run `/deleteme` for clean state isolation.

---

## Current Mapping To Code

- `tests/bot-flow.spec.ts`
  - covers: ARTP-001, ARTP-002, ARTP-003, ARTP-010, ARTP-011
  - includes assignment-dependent branch check with task buttons (`Открыть приложение`, `Завершить задачу`)
  - includes attachment smoke (`sendFileAttachment`)
- `tests/bot-freelancer.spec.ts`
  - covers: ARTP-FR-001..006
  - starts from `adexium_us_1` deep-link only
  - uses one-step recovery (`E2E_RECOVERY_ATTEMPTS`, default `1`) for critical steps
  - validates realistic button-driven flow including external open-link modal branch
- `tests/helpers/telegram-web.ts`
  - encapsulates Telegram Web actions and attachment flow.

## Gaps To Implement Next

1. Make `ARTP-008` deterministic without skip:
   seed an active dev task and force screenshot step before sending invalid fixture.
2. Add deterministic `ARTP-009` positive test:
   requires controlled valid screenshot + stable test task in dev environment.
3. Add L2 integration suite for update payloads:
   - `/start`, `/join_task`, `/view_earnings`, `/withdraw`
   - duplicated updates / repeated commands
   - task state transitions and validation branches.
4. Introduce step-key abstraction:
   keep anchors as fallback, but support direct step IDs immediately once backend provides them.

## Acceptance Criteria For “100% Cases Covered”

1. All P0 cases (`ARTP-001`, `002`, `003`, `004`, `007`, `008`, `009`, `010`, `011`) are automated.
2. At least one automated test exists in non-UI layer (L1 or L2) for each P0 case.
3. E2E suite remains smoke-oriented and stable (`<= 10 min`, flaky rate < 2% over 20 runs).
4. Every case has exact anchor or step-id assertion and a unique case ID.
