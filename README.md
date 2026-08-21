# Мини-приложения (GitHub Pages)

Репозиторий обслуживает корень домена `https://temon7001.github.io/` — это обязательное условие
для Digital Asset Links: TWA-обёртка проверяет файл строго по адресу
`https://temon7001.github.io/.well-known/assetlinks.json`, а репозиторий проекта
(вида `github.com/TEMON7001/что-угодно`) отдаёт страницы по пути `/что-угодно/` и корень домена
обслуживать не может.

## Структура

```
/                       корневая страница со списком мини-приложений
/.nojekyll              отключает Jekyll — без него Pages не публикует .well-known
/.well-known/assetlinks.json   связка сайта и Android-приложений (по одному блоку на приложение)
/electro/               «Расчёт сечения по ПУЭ» — PWA
```

Файл `.nojekyll` удалять нельзя. GitHub Pages по умолчанию прогоняет репозиторий через Jekyll,
а Jekyll не копирует в сборку файлы и папки, начинающиеся с точки, — то есть `.well-known/`
просто не попадёт на сайт и `assetlinks.json` отдаст 404. Пустой `.nojekyll` в корне выключает
эту обработку.

## Добавление следующего мини-приложения

1. Положить PWA в новую папку (`/can/`, `/sad/` и т. д.), `scope` и `start_url` в manifest.json — абсолютные,
   от корня домена.
2. Собрать APK в PWABuilder по адресу `https://temon7001.github.io/<папка>/`.
3. Добавить в `/.well-known/assetlinks.json` **ещё один блок** массива со своим `package_name`
   и своим SHA-256 (файл — массив, приложений в нём может быть сколько угодно).

## Проверка

- Манифест доступен: `https://temon7001.github.io/electro/manifest.json`
- Assetlinks отдаётся как JSON: `https://temon7001.github.io/.well-known/assetlinks.json`
- Проверка связки: `https://developers.google.com/digital-asset-links/tools/generator`
