# Тестирование без внешней базы данных

Готовый сайт на Node.js и Express для прохождения теста по QR-code. Проект не использует MySQL, SQLite, phpMyAdmin и внешнюю базу данных: все данные хранятся в JSON-файлах в папке `data`.

## Возможности

- пользовательская страница `/test` с тестом из 5 вопросов;
- ограничение прохождения одним устройством через `localStorage` и cookie;
- дополнительная проверка участника на сервере через `data/participants.json`;
- сохранение IP-адреса, user-agent, даты и времени прохождения;
- админ-панель с логином `admin` и паролем `admin123`;
- редактирование вопросов и вариантов ответа;
- генерация QR-code на страницу теста;
- статистика с диаграммами Chart.js;
- очистка результатов;
- включение и выключение теста;
- экспорт результатов в CSV.

## Структура данных

```text
data/questions.json      вопросы и варианты ответов
data/results.json        ответы пользователей
data/participants.json   участники, которые уже прошли тест
data/settings.json       настройки теста
data/admin.json          логин и пароль администратора
```

## Запуск на Windows

1. Установите Node.js, если он ещё не установлен: https://nodejs.org/
2. Откройте папку проекта.
3. Запустите файл `start.bat`.

Файл `start.bat` сам установит зависимости командой `npm install`, если папки `node_modules` ещё нет, затем выполнит `npm start` и откроет сайт в браузере.

## Онлайн-запуск через GitHub

GitHub Pages не подходит для этого проекта, потому что сайт использует Node.js/Express и записывает ответы в JSON-файлы. GitHub Pages публикует только статические HTML/CSS/JS-файлы и не запускает сервер.

Рабочая схема:

```text
GitHub repository -> Render Web Service -> онлайн-ссылка на сайт
```

### 1. Загрузите проект на GitHub

Создайте новый репозиторий на GitHub и загрузите в него все файлы проекта, кроме папки `node_modules`.

Если Git установлен, можно выполнить:

```bash
git init
git add .
git commit -m "Initial QR testing site"
git branch -M main
git remote add origin https://github.com/USERNAME/REPOSITORY.git
git push -u origin main
```

### 2. Подключите репозиторий к Render

1. Откройте https://render.com/
2. Войдите через GitHub.
3. Создайте новый сервис из GitHub-репозитория.
4. Render увидит файл `render.yaml` и сможет создать Node.js Web Service.
5. После деплоя сайт будет доступен по ссылке вида:

```text
https://qr-testing-json.onrender.com
```

QR-code на главной странице и в админ-панели автоматически будет вести на онлайн-адрес `/test`, а не на `localhost`.

### Важно про JSON-файлы онлайн

Проект по-прежнему не использует MySQL, SQLite, phpMyAdmin или внешнюю базу данных. Ответы сохраняются в JSON-файлы.

Для сохранения JSON-файлов между перезапусками на Render нужен persistent disk. В проект добавлен `render.yaml` с диском:

```text
/opt/render/project/src/data
```

Если запускать сервис без persistent disk, сайт будет работать, но результаты могут сбрасываться после redeploy/restart, потому что файловая система большинства облачных сервисов временная.

## Ручной запуск

```bash
npm install
npm start
```

После запуска сайт будет доступен по адресу:

```text
http://localhost:3000
```

## Страницы

- `/` — главная страница;
- `/test` — прохождение теста;
- `/admin/login` — вход администратора;
- `/admin` — главная админ-панель;
- `/admin/questions` — редактирование вопросов;
- `/admin/statistics` — статистика и диаграммы;
- `/admin/qr` — QR-code на страницу теста.

## API

- `GET /api/questions` — получить вопросы;
- `POST /api/submit` — сохранить ответы пользователя;
- `GET /api/statistics` — получить статистику;
- `POST /api/admin/questions` — сохранить вопросы;
- `POST /api/admin/clear-results` — очистить результаты;
- `POST /api/admin/toggle-test` — включить или выключить тест;
- `GET /api/export-csv` — скачать CSV.

## Настройка ссылки QR-code

По умолчанию QR-code ведёт на:

```text
http://localhost:3000/test
```

Локально используется `localhost`. Онлайн сайт автоматически определяет публичный домен из запроса. Если нужно вручную закрепить адрес, измените поле `testUrl` в файле `data/settings.json` или задайте переменную окружения `PUBLIC_URL`, например:

```json
{
  "testEnabled": true,
  "testTitle": "Тестирование",
  "testUrl": "https://your-site.onrender.com/test"
}
```
