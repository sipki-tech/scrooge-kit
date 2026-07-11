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
  <img alt="cross-agent" src="https://img.shields.io/badge/agents-8%20supported-5B8DEF?style=for-the-badge&labelColor=111827" />
  <img alt="token savings" src="https://img.shields.io/badge/terminal%20tokens-−60–90%25-F59E0B?style=for-the-badge&labelColor=111827" />
  <img alt="zero deps" src="https://img.shields.io/badge/dependencies-0-22C55E?style=for-the-badge&labelColor=111827" />
  <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-64748B?style=for-the-badge&labelColor=111827" />
</p>

<p align="center">
  <a href="README.md">English</a> | Русский
  &nbsp;·&nbsp; <a href="docs/GUIDE.ru.md">📖 Руководство</a>
</p>

> Скрудж Макдак ныряет в бассейн сэкономленных токенов.

**Scrooge Kit** — кросс-агентский кит экономии токенов. Одна установка подключает проверенные инструменты токен-экономии ко всем кодинг-агентам на машине — одна дисциплина, одни обходы, одна политика везде:

```
вывод терминала      ──► [rtk: rewrite-хук]        ──► контекст агента  (−60–90% токенов)
блобы / логи / файлы ──► [Headroom: MCP-сжатие]    ──► LLM API          (−60–95% токенов)
локальные логи агентов ─► [ccusage: отчёты]        ──► `scrooge-kit status`
```

- **[rtk](https://github.com/rtk-ai/rtk)** — сжимает вывод терминальных команд до попадания в контекст. Scrooge Kit ставит PreToolUse-хук, прозрачно переписывающий `git status` → `rtk git status`; агенту не нужно помнить про префикс.
- **[Headroom](https://github.com/headroomlabs-ai/headroom)** — обратимое сжатие больших блобов через MCP-инструменты (`headroom_compress` / `headroom_retrieve` / `headroom_stats`).
- **[ccusage](https://ccusage.com)** — отчёты о расходе токенов по агентам.

## Зачем

| Боль | Ответ Scrooge Kit |
| --- | --- |
| Квота сгорает на простынях `npm test` | rewrite-хук rtk: вывод входит в контекст сжатым на 60–90% |
| Каждому агенту — своя настройка экономии | Одна политика, 8 адаптеров: поставил раз — получили все |
| Лог на 5 МБ, вставленный в контекст | Скилл `scrooge-hygiene` + Headroom MCP: сжать, оригинал достать по требованию |
| Непонятно, куда ушли токены | `scrooge-kit status` — расход по агентам через ccusage |
| Страх, что тулинг сломает сессию | Fail-open хуки, неразрушающий merge конфигов, полный `--dry-run` |

## Поддерживаемые агенты

| Агент | Механизм | Перезапись команд |
|---|---|---|
| Claude Code | PreToolUse-хук + скилл + MCP + опциональный statusline | ✅ прозрачная |
| Gemini CLI | extension (хуки + GEMINI.md + MCP) | ✅ прозрачная |
| Antigravity | plugin (хуки + скилл + rules + MCP) | ⚠️ deny-подсказка |
| Codex CLI | маркер-блок в config.toml + AGENTS.md + скилл | ✅ прозрачная |
| OpenCode | JS-плагин (`tool.execute.before`) + MCP | ✅ in-process |
| Grok CLI | хуки в settings.json + MCP | ✅ best-effort |
| Cursor | нудж в beforeShellExecution + MCP + User Rule | ⚠️ только подсказка |
| Windsurf | глобальные rules + MCP | ⚠️ только rules |

Детали и оговорки по каждому агенту: [docs/agents.md](docs/agents.md).

## Установка

Прямо с GitHub (в npm не публикуется; добавьте `#main`, чтобы обойти кэш npx):

```bash
npx github:sipki-tech/scrooge-kit install            # все обнаруженные агенты
npx github:sipki-tech/scrooge-kit install --dry-run  # сначала посмотреть план действий
npx github:sipki-tech/scrooge-kit install --agent claude-code,codex
npx github:sipki-tech/scrooge-kit install --with-rtk --with-headroom  # заодно поставить бинарники
npx github:sipki-tech/scrooge-kit install --statusline  # (claude-code) ccusage-statusline, если не задан

npx github:sipki-tech/scrooge-kit verify             # проверки здоровья по агентам
npx github:sipki-tech/scrooge-kit status             # обнаруженные агенты + расход через ccusage
npx github:sipki-tech/scrooge-kit uninstall          # убирает ровно то, что добавили
```

Или из клона: `git clone https://github.com/sipki-tech/scrooge-kit && cd scrooge-kit && node bin/cli.mjs install`.

Требуется Node 18+. После установки перезапустите агентов — хуки загружаются на старте сессии.

## Гарантии

- **Fail-open**: сломанный хук отвечает no-op и exit 0 — сессию не ломает никогда.
- **Не переписывает вслепую**: нет перезаписи, если `rtk` не установлен, команда составная (`| ; && > $`), уже с префиксом или под обходом.
- **Обход**: префикс `SCROOGE_RAW=1` — сырой вывод одной команды; `SCROOGE_RTK=off` — отключить перезапись на сессию.
- **Неразрушающе**: конфиги мержатся, а не перезаписываются; uninstall убирает только записи, идентичные установленным. Дописывания в чужие файлы (config.toml, AGENTS.md, global_rules.md) живут между маркерами `# >>> scrooge-kit >>>`.
- **Dry-run для всего**: каждая мутация идёт через журнал; `--dry-run` печатает точный план.

## Замер

[docs/benchmark.md](docs/benchmark.md) — протокол приёмки: ≥50% сокращения токенов на выводе терминала на референс-сессии, ноль пропущенных из-за сжатия падающих тестов.

## Разработка

```bash
npm test    # node --test, ноль зависимостей
```

Структура: `core/` — машинерия инсталлера (журнал/dry-run, детект, MCP-merge, политика); `adapters/` — по тонкому модулю на агента; `payload/` — то, что ложится в `~/.scrooge-kit` (хук-скрипты, скилл, rules); `docs/` — матрица агентов, заметки по Headroom, протокол замера.

## Благодарности

- [antigravity-kit](https://github.com/sipki-tech/antigravity-kit) — Scrooge Kit вырос из его Antigravity-only токен-стека; киты компонуются.
- [rtk](https://github.com/rtk-ai/rtk), [Headroom](https://github.com/headroomlabs-ai/headroom), [ccusage](https://ccusage.com) — инструменты, которые и делают экономию.

## Лицензия

MIT
