# Bot Flow Discovery Log (2026-02-22)

Source: Telegram API message history for `@artp345_bot` (same test account).

## Completed full path (UTC from message timestamps)

- 2026-02-22 01:20:31
  - Task assigned
  - Anchor: `Вы зарегистрировались для выполнения задания`
  - Example data: `ID: 487`, app `YouTube Kids`, reward `6,5 USD`

- 2026-02-22 01:20:41
  - Next step
  - Anchor: `Следующий шаг для выполнения задачи`

- 2026-02-22 01:22:13
  - Open app reminder branch
  - Anchor: `Пожалуйста, обратите внимание на этот шаг`

- 2026-02-22 01:22:27 / 01:22:28
  - Cannot-find branch
  - Anchors: `Вы оставили отзыв?`, `Если приложений с одинаковым названием несколько...`

- 2026-02-22 01:22:42
  - Cancel branch
  - Anchor: `Задача отменена`

- 2026-02-22 01:23:00
  - Submit on canceled/unavailable task
  - Anchor: `Задача недоступна`

- 2026-02-22 01:23:54
  - New task assigned
  - Example data: `ID: 447`, app `Roulette`, reward `4,55 USD`

- 2026-02-22 01:24:04
  - Next step for new task
  - Anchor: `Следующий шаг для завершения задачи`

- 2026-02-22 01:31:16
  - Confirmation question
  - Anchor: `Вы оценили приложение?`

- 2026-02-22 01:31:18 .. 01:32:57
  - Screenshot validation branch
  - Anchors: `Чтобы подтвердить...`, `Некорректное значение`

- 2026-02-22 01:33:03
  - Successful finish
  - Anchor: `Поздравляем, вы успешно выполнили задание!`

- 2026-02-22 01:33:23 / 01:33:30
  - Earnings check
  - Anchor: `Общий заработок: ... Ожидающие одобрения: $4 ¢55`

- 2026-02-22 01:33:32
  - Withdraw check
  - Anchor: `Минимальная сумма для вывода 20 USD.`

- 2026-02-22 01:33:35
  - Re-join check
  - Anchor: `Заказ уже взят другим фрилансером или завершен!`

## Start/anti-bot check anchors

- `Привет, чемпион!`
- `Нажми "Я готов" чтобы начать!`
- `Мы платим реальные деньги ...` (anti-bot verification)

## Note

These anchors are the ones used in the current Playwright E2E suite under `tests/bot-flow.spec.ts`.
