const got = require('got');
const translit = require('cyrillic-to-translit-js');
const cheerio = require('cheerio');

class DataPkgh {
  constructor(cache = true, timeCache = 900000) {
    // timeCache default 900000mls so 15min
    this._cache = cache;
    this._timeCache = timeCache;
    this.data = {
      'schedule': {
        'timestamp': 0,
        'url': {
          'https://pkgh.edu.ru/obuchenie/shedule-of-classes.html': {'html': ''},
          'https://pkgh.edu.ru/zaochnoe-otdelenie.html': {'html': ''},
        },
      },
      'teacher': {
        'timestamp': 0,
        'url': [
          'https://pkgh.edu.ru/obuchenie/teachers.html'
        ],
        'html': '',
      }
    };
    this.completed = {
      'schedule': {
        'timestamp': 0,
        'data': {},
      },
      'teacher': {
        'timestamp': 0,
        'data': {},
      },
    };
  }

  static generateId(str) {
    return translit().transform((Array.from(str).filter((s) => { return /^([a-zа-яё]+|\d+)$/i.test(s)  })).join(''));
  }

  async checkCache(page) {
    try {
      if(!(page in this.data)) {
        throw 'page is not exists';
      }
      if(!this._cache || (Date.now() - this.data[page].timestamp) > this._timeCache) {
        for(let url in this.data[page].url) {
          const res = await got(url);

          this.data[page].url[url].html = res.body;
          this.data[page].timestamp = Date.now();
        }
      }
    } catch(err) {
      console.error(err);
    }
  }
  async getDataSchedule() {
    const page = 'schedule';
    if(!this._cache || (Date.now() - this.completed[page].timestamp) > this._timeCache) {
      // Not cache
      const schedule = {};
      await this.checkCache(page);
      for(let url in this.data[page].url) {
        const $ = cheerio.load(this.data[page].url[url].html);
        let textTag = 'h4';

        // Search tag
        if($(textTag).length === 0) {
          const findTag = {};
          $('.expanded', '.dotted').each((i, el) => {
            if(!findTag[el.tag]) findTag[el.tag] = 0;
            findTag[el.tag]++;
          });
          let max = {};
          for(let tag in findTag) {
            if(findTag[tag] > max.n) max.tag = tag;
          }
          textTag = max.tag;
        }

        // Some receiving data
        let specialty = '';
        $(textTag).each((numTag, el) => {
          if($(el).hasClass('dotted')) specialty = $(el).text();
          else if($(el).hasClass('expanded')) {
            if($(el).text().toLowerCase().indexOf('замен') != -1) {
              const timestamp = $(el).text(); //.replace(/[^.0-9]/g, '');

              const tbody = $($(el).parent()).find('tbody').get(0);
              const row = $(tbody).find('tr');

              $(row).each((numRow, el) => {

                const groupName  = $($(el).find('.group').get(0)).text();
                const id         = this.generateId(groupName);

                const num        = $($(el).find('.pnum').get(0)).text();
                const numSubject = $($(el).find('.pnum').get(0)).text();
                const numTeacher = $($(el).find('.pteacher').get(0)).text();
                const denSubject = $($(el).find('.pnum').get(1)).text();
                const denTeacher = $($(el).find('.pteacher').get(1)).text();

                if(!(id in schedule)) {
                  schedule[id] = {};
                }
                if(!('replace' in schedule)) {
                  schedule[id].replace = {
                    timestamp: '',
                    lesson: []
                  };
                }
                schedule[id].replace.timestamp = timestamp;
                schedule[id].replace.lesson.push({
                  num        : num,
                  numSubject : numSubject,
                  numTeacher : numTeacher,
                  denSubject : denSubject,
                  denTeacher : denTeacher,
                });
              });
            } else {
              const groupName    = $(el).text();
              const id           = this.generateId($(el).text());

              schedule[id] = {
                table: [],
                specialty: specialty,
                name: groupName,
              };

              const parent = $(el).parent();
              const table  = $(parent).find('table');

              table.each((numTable, el) => {
                const dayWeek   = $($(el).find('.groupname').get(0)).text();
                const cellTable = $(el).find('tr');

                schedule[id].table[numTable] = {
                  dayWeek: dayWeek,
                  lesson: [],
                }

                cellTable.each((cellNum, el) => {
                  const numSubject = $($(el).find('.pname').get(0)).text();
                  const numTeacher = $($(el).find('.pteacher').get(0)).text();
                  const denSubject = $($(el).find('.paltname').get(0)).text();
                  const denTeacher = $($(el).find('.paltteacher').get(0)).text();

                  schedule[id].table[numTable].lesson[cellNum] = {
                    numSubject: numSubject,
                    numTeacher: numTeacher,
                    denSubject: denSubject,
                    denTeacher: denTeacher,
                  };
                });
              });
            }
          }
        });
      }
      this.completed.schedule.timestamp = Date.now();
      this.completed.schedule.data = schedule;
      return schedule;
    } else {
      // Cache
      console.log('CACHE is WORK!');
      return this.completed['schedule'];
    }
  }
}

var g = new DataPkgh();
g.getDataSchedule().then((res) => console.log(res));
