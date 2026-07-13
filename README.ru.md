<h1 align="center">Scrooge Kit</h1>

<table align="center">
<tr>
<td>
<pre><code>
███████╗ ██████╗██████╗  ██████╗  ██████╗  ██████╗ ███████╗
██╔════╝██╔════╝██╔══██╗██╔═══██╗██╔═══██╗██╔════╝ ██╔════╝
███████╗██║     ██████╔╝██║   ██║██║   ██║██║  ███╗█████╗
╚════██║██║     ██╔══██╗██║   ██║██║   ██║██║   ██║██╔══╝
███████║╚██████╗██║  ██║╚██████╔╝╚██████╔╝╚██████╔╝███████╗
╚══════╝ ╚═════╝╚═╝  ╚═╝ ╚═════╝  ╚═════╝  ╚═════╝ ╚══════╝
</code></pre>
</td>
</tr>
</table>

<p align="center">
  <img alt="native plugins" src="https://img.shields.io/badge/native%20plugins-6%20agents-5B8DEF?style=for-the-badge&labelColor=111827" />
  <img alt="token savings" src="https://img.shields.io/badge/terminal%20tokens-−60–90%25-F59E0B?style=for-the-badge&labelColor=111827" />
  <img alt="zero deps" src="https://img.shields.io/badge/dependencies-0-22C55E?style=for-the-badge&labelColor=111827" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-64748B?style=for-the-badge&labelColor=111827" />
</p>

<p align="center">
  <a href="README.md">English</a> | Русский
  &nbsp;·&nbsp; <a href="docs/GUIDE.ru.md">📖 Руководство</a>
</p>

> Скрудж Макдак ныряет в бассейн сэкономленных токенов.

**Scrooge Kit** — набор **нативных плагинов** (по одному на агента, все в этом монорепо), которые режут расход токенов проверенными инструментами. Никакого своего инсталлера и патчинга конфигов: каждый агент ставит плагин своим штатным менеджером плагинов.

```
вывод терминала      ──► [rtk: PreToolUse rewrite-хук] ──► контекст агента  (−60–90% токенов)
блобы / логи / файлы ──► [Headroom: MCP-сжатие]        ──► LLM API          (−60–95% токенов)
```

- **[rtk](https://github.com/rtk-ai/rtk)** — хук прозрачно переписывает `git status` → `rtk git status`; вывод попадает в контекст сжатым, падения на месте.
- **[Headroom](https://github.com/headroomlabs-ai/headroom)** — обратимое сжатие блобов через MCP-инструменты (`headroom_compress` / `headroom_retrieve` / `headroom_stats`).
- **Скилл scrooge-hygiene + rules** — выборочное чтение, никаких сырых логов, этикет обходов.

Предусловие для экономии: `brew install rtk` (без бинаря хуки — тихий no-op) и опционально `pip install "headroom-ai[all]"`.

## Установка (нативно, по агентам)

Каждая команда ниже прогнана против реального CLI — матрица проверок в [docs/agents.md](docs/agents.md), песочный перепрогон — `npm run smoke`.

| Агент | Установка |
|---|---|
| **Claude Code** | `/plugin marketplace add sipki-tech/scrooge-kit` → `/plugin install scrooge-kit@scrooge-kit` (+ `scrooge-headroom@scrooge-kit`, если установлен бинарь headroom) |
| **Codex CLI** | `codex plugin marketplace add sipki-tech/scrooge-kit` → `codex plugin add scrooge-kit@scrooge-kit` |
| **Grok Build** | `grok plugin install sipki-tech/scrooge-kit#plugins/grok` |
| **Gemini CLI** | `gemini extensions install https://github.com/sipki-tech/scrooge-kit` (тянет Release-архив) |
| **Antigravity** | `git clone https://github.com/sipki-tech/scrooge-kit && agy plugin install ./scrooge-kit/plugins/antigravity` — никогда не давайте `agy plugin install` URL репозитория: agy bulk-установит каждую папку под `plugins/` |
| **OpenCode** | `opencode plugin @sipki-tech/scrooge-kit-opencode` (или добавьте `"plugin": ["@sipki-tech/scrooge-kit-opencode"]` в `opencode.json` сами) |

Удаление тем же путём: `/plugin uninstall`, `codex plugin remove scrooge-kit@scrooge-kit`, `grok plugin uninstall scrooge-kit`, `gemini extensions uninstall scrooge-kit`, `agy plugin uninstall scrooge-kit`, убрать запись из конфига (OpenCode). Обновление — командой update соответствующего менеджера (у `agy` update нет — переустановка).

## Зачем

| Боль | Ответ Scrooge Kit |
| --- | --- |
| Квота сгорает на простынях `npm test` | PreToolUse-хук: вывод входит в контекст сжатым на 60–90% |
| Каждому агенту — своя настройка экономии | Один репо, нативный плагин на агента, одна общая политика |
| Лог на 5 МБ, вставленный в контекст | Скилл `scrooge-hygiene` + Headroom MCP: сжать, оригинал достать по требованию |
| Страх, что тулинг сломает сессию | Fail-open хуки (всегда exit 0), нет перезаписи без бинаря rtk, MCP отдельным плагином/выключен там, где отсутствие бинаря могло бы сломать |

## Гарантии

- **Fail-open**: каждый хук ловит всё и выходит с 0 — баг стоит экономии, но не сессии.
- **Не переписывает вслепую**: нет перезаписи, если `rtk` не установлен, команда составная (`| ; && > $`), уже с префиксом или под обходом.
- **Обход**: `SCROOGE_RAW=1 <команда>` — одна команда сырьём; `SCROOGE_RTK=off` — на сессию.
- **Нативный жизненный цикл**: установка, обновление и удаление — через штатный менеджер плагинов агента; Scrooge Kit никогда не редактирует ваши конфиги.

## Структура репо

```
.claude-plugin/marketplace.json   # Claude Code-маркетплейс: scrooge-kit + scrooge-headroom (его читает и Grok)
.agents/plugins/marketplace.json  # Codex-нативный маркетплейс (те же два плагина, object-sources)
plugins/
  claude-code/           # .claude-plugin + PreToolUse-хук + скилл
  claude-code-headroom/  # MCP-only плагин (ставьте при наличии бинаря headroom)
  codex/                 # .codex-plugin + PreToolUse-хук + скилл
  gemini-cli/            # gemini-extension.json + BeforeTool-хук + GEMINI.md (релизится как tar.gz)
  antigravity/           # plugin.json + hooks.json (deny-подсказка) + mcp_config.json (disabled) + rules
  grok/                  # .claude-plugin манифест + хуки + скилл (Claude-совместимая раскладка)
  opencode/              # npm-пакет: in-process перезапись + условный headroom MCP
shared/                  # единственный источник правды: policy, rewriter, io, скилл, rules
scripts/sync.mjs         # разливает shared/ по плагинам (копии коммитятся; тест следит за синхронностью)
```

Политика перезаписи (список префиксов, обходы) живёт ровно в одном файле: `shared/scripts/lib/policy.mjs`.

## Замер

[docs/benchmark.md](docs/benchmark.md) — протокол приёмки: ≥50% сокращения токенов на выводе терминала, ноль пропущенных из-за сжатия падающих тестов. Для видимости расхода по агентам — [ccusage](https://ccusage.com): `npx ccusage`.

## Разработка

```bash
npm test        # node --test, ноль зависимостей: политика, диалекты хуков, манифесты, sync-проверка
npm run sync    # переразлить shared/ после правок
npm run smoke   # песочная нативная установка/удаление через каждый агентский CLI на машине
```

## Благодарности

- [antigravity-kit](https://github.com/sipki-tech/antigravity-kit) — Scrooge Kit вырос из его Antigravity-only токен-стека; они компонуются.
- [rtk](https://github.com/rtk-ai/rtk), [Headroom](https://github.com/headroomlabs-ai/headroom), [ccusage](https://ccusage.com) — инструменты, которые и делают экономию.

## Лицензия

MIT
