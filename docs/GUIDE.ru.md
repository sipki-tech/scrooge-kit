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

Четыре слоя:

1. **rtk** (терминал) — хук выше; прозрачный там, где хост умеет переписывать input, совещательный в остальных.
2. **Headroom** (блобы) — MCP-инструменты `headroom_compress` / `headroom_retrieve` / `headroom_stats`; скилл `scrooge-hygiene` учит агента ими пользоваться. Обратимо — оригиналы кэшируются.
3. **codebase-memory** (навигация по коду) — граф-навигация через MCP: проиндексировать репозиторий один раз, затем запрашивать символы, референсы и call-цепочки (158 языков, tree-sitter + hybrid LSP) вместо чтения целых файлов. Ноль настройки на язык, монорепо тоже.
4. **Скилл + rules** — выборочное чтение, никаких сырых логов, этикет обходов.

Каждый слой мягко деградирует: нет бинаря rtk → хуки тихо бездействуют; нет headroom/codebase-memory-mcp → соответствующий MCP-плагин просто не ставится (или идёт выключенным).

## 2. Предусловия

```bash
brew install rtk                     # или: curl -fsSL https://raw.githubusercontent.com/rtk-ai/rtk/refs/heads/master/install.sh | sh
pip install "headroom-ai[all]"       # опционально, Python 3.10+; или uv tool install / pipx install
npm install -g codebase-memory-mcp         # опционально: codebase-memory граф-навигация (`codebase-memory-mcp` на PATH)
```

## 3. Установка по агентам

Каждая команда ниже прогнана вживую против реального CLI (матрица проверок — в [agents.md](agents.md)); перепроверить на своей машине можно в любой момент: `npm run smoke`.

Каждый плагин несёт MCP-сервера Headroom + codebase-memory, **включёнными**. Если бинаря нет на PATH — хост покажет однострочную ошибку подключения MCP, а всё остальное продолжит работать; поставьте бинари (шаг 2), чтобы её убрать.

### Claude Code
```
/plugin marketplace add sipki-tech/scrooge-kit
/plugin install scrooge-kit@scrooge-kit
```
Неинтерактивно: `claude plugin install scrooge-kit@scrooge-kit --scope user`. Headroom + codebase-memory идут внутри `.mcp.json` самого плагина — отдельная установка не нужна.

### Codex CLI (≥0.144)
```bash
codex plugin marketplace add sipki-tech/scrooge-kit
codex plugin add scrooge-kit@scrooge-kit
```
Codex резолвит нативный `.agents/plugins/marketplace.json` репозитория (выделенный `plugins/codex/` с манифестом `.codex-plugin`); старые снапшоты падают назад на legacy `.claude-plugin/marketplace.json`. Удаление: `codex plugin remove scrooge-kit@scrooge-kit`. (MCP для Codex пока не встроен — добавьте серверы `headroom` / `codebase-memory-mcp` в его собственный MCP-конфиг вручную, когда бинари заработают.)

### Grok Build
```bash
grok plugin install sipki-tech/scrooge-kit#plugins/grok
```
Ставит выделенный Grok-плагин прямо из поддиректории репозитория. `grok plugin marketplace add sipki-tech/scrooge-kit` тоже работает (Grok читает Claude-маркетплейс), но резолвит Claude Code-сборку плагина — предпочитайте subdir-установку. Хук работает в режиме **deny-подсказки** (хуки Grok умеют только allow/deny, но не переписать команду): блокирует сырую dev-команду, а в причине отказа — готовая `rtk …` для повтора. Удаление: `grok plugin uninstall scrooge-kit`.

### Antigravity (agy)
```bash
git clone https://github.com/sipki-tech/scrooge-kit
agy plugin install ./scrooge-kit/plugins/antigravity
```
**Никогда** не запускайте `agy plugin install https://github.com/sipki-tech/scrooge-kit` — agy bulk-установит каждую папку под `plugins/` репозитория, то есть все агентские payload'ы. Команды `agy plugin update` нет; для обновления — pull и переустановка. Хук работает в режиме **deny-подсказки** (хуки Antigravity не умеют менять args): в причине отказа — готовая команда `rtk …`, агент тут же повторяет с ней. Headroom и codebase-memory прописаны и **включены** в `mcp_config.json`.

### OpenCode
```bash
opencode plugin @sipki-tech/scrooge-kit-opencode      # или -g для глобального конфига
```
Штатная команда OpenCode сама добавит запись в `opencode.json`; ручное добавление `{ "plugin": ["@sipki-tech/scrooge-kit-opencode"] }` тоже работает. Автоматически ставится из npm на старте. Плагин переписывает in-process (`tool.execute.before`) и регистрирует MCP-серверы Headroom и codebase-memory **только при наличии соответствующего бинаря** (проверка на старте через `config`-хук).

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

- Расход по агентам: `npx ccusage` (читает локальные логи Claude Code, Codex, OpenCode и других). Statusline для Claude Code: `npx ccusage statusline` в `statusLine` вашего `settings.json`, если хочется всегда видимой цифры.
- Протокол замера: [benchmark.md](benchmark.md) — те же три задачи с `SCROOGE_RTK=off` и с включённым китом; приёмка при ≥50% экономии на выводе терминала и **нуле** пропущенных падений тестов. `rtk gain` / `headroom_stats` дают цифры по инструментам.

## 7. Решение проблем

| Симптом | Причина / решение |
| --- | --- |
| Команды не переписываются | rtk не установлен (`which rtk`), или сессия стартовала до плагина — перезапустите агента. |
| headroom / codebase-memory-mcp MCP «Failed to connect» | Нет бинаря — `pip install "headroom-ai[all]"` / `npm install -g codebase-memory-mcp` (сервера идут включёнными; до установки ошибка безвредна). Либо запись не `headroom mcp serve`. |
| Нужен сырой вывод один раз | `SCROOGE_RAW=1 <команда>`. На сессию: `SCROOGE_RTK=off`. |
| Подозрение на хук | Он fail-open (всегда exit 0); `SCROOGE_RTK=off` нейтрализует без удаления. |
| Убрать всё | Удаление через менеджер плагинов каждого агента (см. §3) — больше ничего не трогалось. |

## 8. Модель безопасности

- **Закон fail-open**: каждый хук обёрнут в catch-all и выходит с 0.
- **Никаких слепых перезаписей**: четыре условия отказа из §4 проверяются на каждом вызове.
- **Нативный жизненный цикл**: плагины не редактируют пользовательские конфиги; установка/обновление/удаление — менеджер плагинов хоста.
- **Один источник правды**: `shared/` разливается по плагинам скриптом `scripts/sync.mjs`; тест падает при любом дрейфе копий.
