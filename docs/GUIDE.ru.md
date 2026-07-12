# Scrooge Kit — руководство пользователя

[English](GUIDE.md) | Русский

Как работают плагины, как ставить их нативно по агентам, как обходить перезапись, когда нужен сырой вывод, и как замерить экономию.

---

## 1. Идея за 60 секунд

Кодинг-агенты сжигают контекст в основном на выводе терминала и больших блобах. Scrooge Kit поставляет **нативный плагин для каждого агента**, бьющий по обоим:

```
вы: «прогони тесты»
агент вызывает Bash("npm test")
        │
        ▼
[PreToolUse-хук scrooge-kit]  ── переписывает ──►  Bash("rtk npm test")
        │
        ▼
rtk запускает настоящую команду, срезает шум
        │
        ▼
в контекст агента попадает ~10–40% исходного вывода — падения на месте
```

Три слоя:

1. **rtk** (терминал) — хук выше; прозрачный там, где хост умеет переписывать input, совещательный в остальных.
2. **Headroom** (блобы) — MCP-инструменты `headroom_compress` / `headroom_retrieve` / `headroom_stats`; скилл `scrooge-hygiene` учит агента ими пользоваться. Обратимо — оригиналы кэшируются.
3. **Скилл + rules** — выборочное чтение, никаких сырых логов, этикет обходов.

Каждый слой мягко деградирует: нет бинаря rtk → хуки тихо бездействуют; нет headroom → его MCP-плагин просто не ставится (или идёт выключенным).

## 2. Предусловия

```bash
brew install rtk                     # или: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
pip install "headroom-ai[all]"       # опционально, Python 3.10+; или uv tool install / pipx install
```

## 3. Установка по агентам

### Claude Code
```
/plugin marketplace add sipki-tech/scrooge-kit
/plugin install scrooge-kit@scrooge-kit
/plugin install scrooge-headroom@scrooge-kit    # только если `headroom` на PATH
```
Неинтерактивно: `claude plugin install scrooge-kit@scrooge-kit --scope user`. Headroom MCP — **отдельный плагин**, потому что MCP-серверы в плагинах Claude Code нельзя шипнуть выключенными: установка без бинаря показывала бы ошибки подключения.

### Codex CLI (≥0.144)
```bash
codex plugin marketplace add https://github.com/sipki-tech/scrooge-kit
codex plugin add scrooge-kit@scrooge-kit
```
Codex читает тот же `.claude-plugin/marketplace.json`; выделенный `plugins/codex/` (`.codex-plugin`) тоже есть — используйте то, что резолвит ваш билд.

### Grok Build
```
grok plugin marketplace add sipki-tech/scrooge-kit
```
затем установка из панели `/plugin` (Grok читает Claude-маркетплейсы). Ручной фолбэк: скопировать `plugins/grok/` в `~/.grok/plugins/scrooge-kit/`.

### Gemini CLI
```bash
gemini extensions install https://github.com/sipki-tech/scrooge-kit
```
Тянет ассет `scrooge-kit.gemini-extension.tar.gz` из последнего GitHub Release. Dev/локально: `gemini extensions link ./plugins/gemini-cli`. Хук использует событие Gemini `BeforeTool`; расширения с хуками спрашивают согласие при установке.

### Antigravity (agy)
```bash
git clone https://github.com/sipki-tech/scrooge-kit
agy plugin install ./scrooge-kit/plugins/antigravity
```
Хук работает в режиме **deny-подсказки** (хуки Antigravity не умеют менять args): в причине отказа — готовая команда `rtk …`, агент тут же повторяет с ней. Headroom прописан в `mcp_config.json` с `"disabled": true` — уберите ключ после установки бинаря.

### OpenCode
```jsonc
// opencode.json
{ "plugin": ["@sipki-tech/scrooge-kit-opencode"] }
```
Автоматически ставится из npm на старте. Плагин переписывает in-process (`tool.execute.before`) и регистрирует Headroom MCP **только при наличии бинаря** (проверка на старте через `config`-хук).

### Cursor
Плагин (`plugins/cursor/`: always-applied правило + скилл) готов к маркетплейсу, но публично пока не листится. Варианты сейчас: добавить этот репо как **team-маркетплейс** или скопировать `plugins/cursor/rules/token-hygiene.mdc` в `.cursor/rules/` проекта. Хуки Cursor не переписывают команды, поэтому механизм — правило (агент сам ставит префикс `rtk`).

### Windsurf / Devin Desktop (вручную)
Формата плагинов нет. Ручная настройка:
1. Rules: дописать `shared/rules/token-hygiene.md` в `~/.codeium/windsurf/memories/global_rules.md` (или `.devin/rules/` в проекте).
2. MCP (опционально, нужен бинарь): в `~/.codeium/windsurf/mcp_config.json`:
   `{"mcpServers": {"headroom": {"command": "headroom", "args": ["mcp", "serve"]}}}`

## 4. Повседневность: перезапись и обходы

Команды вроде `git status`, `npm test`, `cargo build`, `docker ps` тихо становятся `rtk …`. Список префиксов живёт в одном файле: `shared/scripts/lib/policy.mjs` (внутри каждого плагина — `scripts/lib/policy.mjs`).

Хук **отказывается переписывать**, когда это может навредить:

- `rtk` нет на PATH (перезапись уронила бы команду)
- команда составная или с редиректами: `| ; & > < $ \`` или многострочная
- команда уже начинается с `rtk`
- активен обход

**Обходы** (их же уважает скилл `scrooge-hygiene`):

```bash
SCROOGE_RAW=1 npm test     # одна команда сырьём (KIT_RAW=1 тоже работает)
SCROOGE_RTK=off            # переменная окружения: отключить перезапись на сессию
```

## 5. Headroom

Когда агенту нужен огромный лог или файл, скилл велит вызвать `headroom_compress` вместо вставки блоба, а `headroom_retrieve` — вернуть оригинал. Важно: команда сервера — `headroom mcp serve` (в Headroom ≥0.28 голый `headroom mcp` — группа команд, а не сервер).

## 6. Мониторинг и замер

- Расход по агентам: `npx ccusage` (читает локальные логи Claude Code, Codex, Gemini CLI, OpenCode и других). Statusline для Claude Code: `npx ccusage statusline` в `statusLine` вашего `settings.json`, если хочется всегда видимой цифры.
- Протокол замера: [benchmark.md](benchmark.md) — те же три задачи с `SCROOGE_RTK=off` и с включённым китом; приёмка при ≥50% экономии на выводе терминала и **нуле** пропущенных падений тестов. `rtk gain` / `headroom_stats` дают цифры по инструментам.

## 7. Решение проблем

| Симптом | Причина / решение |
| --- | --- |
| Команды не переписываются | rtk не установлен (`which rtk`), или сессия стартовала до плагина — перезапустите агента. |
| headroom MCP «Failed to connect» | Нет бинаря (удалите `scrooge-headroom` до его установки) или запись не `headroom mcp serve`. |
| Нужен сырой вывод один раз | `SCROOGE_RAW=1 <команда>`. На сессию: `SCROOGE_RTK=off`. |
| Подозрение на хук | Он fail-open (всегда exit 0); `SCROOGE_RTK=off` нейтрализует без удаления. |
| Убрать всё | Удаление через менеджер плагинов каждого агента (см. §3) — больше ничего не трогалось. |

## 8. Модель безопасности

- **Закон fail-open**: каждый хук обёрнут в catch-all и выходит с 0.
- **Никаких слепых перезаписей**: четыре условия отказа из §4 проверяются на каждом вызове.
- **Нативный жизненный цикл**: плагины не редактируют пользовательские конфиги; установка/обновление/удаление — менеджер плагинов хоста.
- **Один источник правды**: `shared/` разливается по плагинам скриптом `scripts/sync.mjs`; тест падает при любом дрейфе копий.
