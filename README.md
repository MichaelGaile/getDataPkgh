# getDataPkgh
Получение данных с сайта колледжа
Скрапинг + парсинг на nodejs
## Контент
+ [Инициализация](#Инициализация)
+ [Расписание](#Расписание)
  + [Структура вывода данных](#Структура-вывода-данных)
  + [Получить весь список](#Получить-весь-список)
  + [Получить конкретную группу](#Получить-конкретную-группу)
+ [Раздел преподаватели](#Раздел-преподаватели)
  + [Структура вывода данных](#Структура-вывода-данных)
  + [Получение всех постов](#Получение-всех-постов)

---
### Быстрый старт
```
npm install getDataPkgh
```
``` nodejs
    const dPkgh = require('getDataPkgh');
    const pkgh = new dPkgh();
    pkgh.getSchedule().then((r) => console.log(r));
```
---
## Инициализация
cache bool(true) - Кеш загрузки и обработки
timeCache(150000)ms - Время жизни кеша
``` nodejs
    const dPkgh = require('getDataPkgh');
    const cache = true;
    const timeCache = 30000;
    const pkgh = new dPkgh(cache, timeCache);
```
---

## Расписание
### Получить весь список
``` nodejs
    pkgh.getSchedule().then((r) => console.log(r));
```
### Получить конкретную группу
* При получении конкретной группы будет загружена и обработана вся страница колледжа *
``` nodejs
    const id = 'YuS1731kz'
    pkgh.getScheduleGroup(id).then((r) => console.log(r));
```

---
## Раздел преподаватели 

### Получение вывода данных
### Получение всех постов
* Будет загружено ~10 страниц с сайта *
```
  pkgh.getTeacher().then((r) => console.log(r));
```
