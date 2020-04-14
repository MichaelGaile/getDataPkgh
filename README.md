# get-data-pkgh 
Получение данных с сайта колледжа
Скрапинг + парсинг на nodejs

+ [Быстрый старт](#Быстрый-старт)
+ [Инициализация](#Инициализация)
+ [Генерация индификатора](#Генерация-индификатора)
+ [Расписание](#Расписание)
  + [Получить весь список](#Получить-весь-список)
  + [Структура данных расписания](#Cтруктура-даных-расписания)
  + [Получить конкретную группу](#Получить-конкретную-группу)
+ [Раздел преподаватели](#Раздел-преподаватели)
  + [Получение всех постов](#Получение-всех-постов)
  + [Структура данных раздела преподаватели](#Cтруктура-даных-преподаватели)

---
### Быстрый старт
```
npm install get-data-pkgh
```
``` node
    const DataPkgh = require('get-data-pkgh');
    const pkgh = new DataPkgh();
    pkgh.getSchedule().then((r) => r.toArray()).then(console.log)
  // Вывод расписание
```
---
## Инициализация
Аргументы:
  logLevel - уровень логгирования данных (log, warn, error, debug)
  load - загрузка данных из другого источника. Ключ может быть как шаблоном(schedule, teacher) так и absolute url.
  При установки аргумента load подключения к интернету не будет! 
``` node
  const DataPkgh = require('get-data-pkgh');
  const load = {
    'schedule': fs.readFileSync('./schedule.html'),
    'https://pkgh.edu.ru/obuchenie/teachers.html?start=00': fs.readFileSync('./first-teacher.html'),
  };
  const logLevel = 'debug';
  const pkgh = DataPkgh({load, logLevel});
```
---
## Генерация индификатора
Позволяет получить хеш сумму на основе строки убирая спец символы.
Аргументы:
  str - База
  hash - boolean value. Включение md5 хеширование конечной строки.
``` node
  const generateId = require('get-data-pkgh').generateId;
  console.log(generateId('МР-18-6', false));
  // => 'MR186'
```
---
## Расписание
### Получить весь список в виде массива
``` node
    pkgh.getSchedule().then((r) => r.toArray()).then((r) => console.log(r));
```
### Структура данных расписания
``` node
{
  ID: Индификатор группы {
    name: Имя группы
    specialty: Специальность группы
    table: Массив дней расписания [
      dayWeek: День недели
      lesson: [
        {
          numSubject: Предмет по числителю,
          numTeacher: Преподователь по числителю,
          denSubject: Предмет по знаменятилю,
          denTeacher: Преподователь по знаменатилю,
        }
        ...
      ]
      ...
    ]
  }
  EE1934kz: {
    table: [ [Object]  ],
    name: 'ЭЭ-19-34кз',
    specialty: 'Информация Заочного отделения'
  },
  YuS1731kz: {
    table: [ [Object]  ],
    name: 'ЮС-17-31кз',
    specialty: 'Информация Заочного отделения'
  },
  ...
}
```
### Получить конкретную группу
** При получении конкретной группы будет загружена и обработана вся страница колледжа **
``` node
  const generateId = require('get-data-pkgh').generateId;
  pkgh.getSchedule((r) => r.firstIndex('id')).then((r) => { console.log(r[generateId('МР-18-6')]) })
```

---
## Раздел преподаватели 

### Получение всех постов
** Будет загружено ~10 страниц с сайта колледжа **
``` node
  pkgh.getTeacher().then((r) => console.log(r));
```
### Структура данных раздела преподаватели 
``` node 
[
  {
    id: Индификатор,
    text: Текст к посту,
    author: {
      text: ФИО автора,
      link: Ссылка на автора,
    },
    time: Время публикации,
    tag: {
      text: Текст тега,
      link: Ссылка на все посты с данным тегом,
    },
    downoload: [
      {
        link: Ссылка на скачивание,
        text: Текст ссылки,
      },
      ...
    ]
  }
  ...
]
```
