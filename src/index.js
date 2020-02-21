const got = require('got');
const translit = require('cyrillic-to-translit-js');
const cheerio = require('cheerio');
const nm = require('nanomatch');

function generateId(str) {
  return translit().transform((Array.from(str).filter((s) => /^([a-zа-яё]+|\d+)$/i.test(s))).join(''));
}

class DataPkgh {
  constructor(cache = true, timeCache = 900000) {
    // timeCache default 900000mls so 15min
    this.cache = cache;
    this.timeCache = timeCache;

    // Work with u not url
    // u is parsed url
    // url not parsed
    this._data = {
      schedule: {
        timestamp: 0,
        url: {
          'https://pkgh.edu.ru/obuchenie/shedule-of-classes.html': { html: '' },
          'https://pkgh.edu.ru/zaochnoe-otdelenie.html': { html: '' },
        },
      },
      teacher: {
        timestamp: 0,
        url: {
          'https://pkgh.edu.ru/obuchenie/teachers.html?start=[[range(0,99,11)]]': { html: '' },
        },
      },
    };

    // Parsing url's
    const updateUrl = () => {
      const data = this._data;
      Object.keys(data).forEach((page) => {
        // New url
        data[page].u = this.constructor.parseUrl(Object.keys(data[page].url)).map((u) => {
          const obj = {};
          obj[u] = { html: null };
          return obj;
        });
      });
      this._data = data;
    };

    updateUrl();
    console.log(this._data);

    this._completed = {
      schedule: {
        timestamp: 0,
        data: {
          url: { '': { html: '' } },
        },
      },
      teacher: {
        timestamp: 0,
        data: {
          url: { '': { html: '' } },
        },
      },
    };
  }

  set completed(data) {
    this._completed[data.page] = {
      timestamp: Date.now(),
      data: data.payload,
    };
  }

  get completed() {
    return this._completed;
  }

  // input { page url payload }
  set data(data) {
    this._data[data.page].timestamp = Date.now();
    this._data[data.page].url[data.url].html = data.payload;
  }

  get data() {
    return this._data;
  }

  static parseUrl(url) {
    function parse(url) {
      if (nm.isMatch(url, '*[[range(*)]]*')) {
        const plenty = [];
        const f = nm.capture('*]]*', nm.capture('*[[*', url)[1])[0];
        const params = f.replace('range(', '').slice(0, -1).split(',').map((el) => { return Number(el); });
        for (let i = params[0]; i <= params[1]; i += params[2]) {
          plenty.push(url.replace(`[[${f}]]`, i));
        }
        return plenty;
      }
      return [url];
    }

    if (url instanceof Array) {
      return url.map((u) => { return parse(u); });
    }

    return parse(url);
  }

  async checkCache(page) {
    if (!(page in this.data)) {
      throw new Error('page is not exists');
    }
    if (!this.cache || (Date.now() - this.data[page].timestamp) > this.timeCache) {
      for (const u in this.data[page].u) {
        const body = await got(u, { resolveBodyOnly: true });
        this.data = {
          page: page,
          url: u,
          payload: body,
        };
      }
      return false;
    }
    return true;
  }

  /* Struct data schedule
   * [ {
   * name: { type: String },
   * specialty: { type: String },
   * table: [ {
   *   dayWeek: { type: String },
   *   lesson: [ {
   *     numSubject: { type: String },
   *     numTeacher: { type: String },
   *     denSubject: { type: String },
   *     denTeacher: { type: String },
   *    } ]
   * } ],
   * replace: {
   *   timeStamp: '',
   *   lesson: [ {
   *     numSubject: { type: String },
   *     numTeacher: { type: String },
   *     denSubject: { type: String },
   *     denTeacher: { type: String },
   *   } ]
   * }
   *
   * } ]
   *
   */

  async getSchedule() {
    const page = 'schedule';

    return this.checkCache(page).then((cache) => {
      if (!cache) {
        // Not cache
        const schedule = {};

        Object.keys(this.data[page].u).forEach((url) => {
          if (this.data[page].u[url].html === '') {
            throw new Error('html is not valid');
          }
          const $ = cheerio.load(this.data[page].u[url].html);
          let textTag = 'h4';

          // Search tag
          if ($(textTag).length === 0) {
            const findTag = {};
            $('.expanded', '.dotted').each((i, el) => {
              if (!findTag[el.tag]) findTag[el.tag] = 0;
              findTag[el.tag] += 1;
            });
            const max = {};
            for (const tag in findTag) {
              if (findTag[tag] > max.n) max.tag = tag;
            }
            textTag = max.tag;
          }

          // Some receiving data
          let specialty = '';
          $(textTag).each((numTag, el) => {
            if ($(el).hasClass('dotted')) specialty = $(el).text();
            else if ($(el).hasClass('expanded')) {
              if ($(el).text().toLowerCase().indexOf('замен') !== -1) {
                // Replace in schedule
                const timestamp = $(el).text().replace(/[^.0-9]/g, '');

                const tbody = $($(el).parent()).find('tbody').get(0);
                const row = $(tbody).find('tr');

                $(row).each((numRow, el) => {
                  const name = $($(el).find('.group').get(0)).text();
                  const id = generateId(name);

                  const num = $($(el).find('.pnum').get(0)).text();
                  const numSubject = $($(el).find('.pnum').get(0)).text();
                  const numTeacher = $($(el).find('.pteacher').get(0)).text();
                  const denSubject = $($(el).find('.pnum').get(1)).text();
                  const denTeacher = $($(el).find('.pteacher').get(1)).text();

                  if (!(id in schedule)) {
                    schedule[id] = {};
                  }
                  if (!('replace' in schedule)) {
                    schedule[id].replace = {
                      timestamp: '',
                      lesson: [],
                    };
                  }
                  schedule[id].replace.timestamp = timestamp;
                  schedule[id].replace.lesson.push({
                    num,
                    numSubject,
                    numTeacher,
                    denSubject,
                    denTeacher,
                  });
                });
              } else {
                // Some schedule
                const name = $(el).text();
                const id = generateId($(el).text());

                schedule[id] = {
                  table: [],
                  name,
                  specialty,
                };

                schedule[id].name = name;

                const parent = $(el).parent();
                const table = $(parent).find('table');

                table.each((numTable, el) => {
                  const dayWeek = $($(el).find('.groupname').get(0)).text();
                  const cellTable = $(el).find('tr');

                  schedule[id].table[numTable] = {
                    dayWeek,
                    lesson: [],
                  };

                  cellTable.each((cellNum, el) => {
                    const numSubject = $($(el).find('.pname').get(0)).text();
                    const numTeacher = $($(el).find('.pteacher').get(0)).text();
                    const denSubject = $($(el).find('.paltname').get(0)).text();
                    const denTeacher = $($(el).find('.paltteacher').get(0)).text();

                    schedule[id].table[numTable].lesson[cellNum] = {
                      numSubject,
                      numTeacher,
                      denSubject,
                      denTeacher,
                    };
                  });
                });
              }
            }
          });
        });
        this.completed = { page: page, payload: schedule };
        return schedule;
      }
      return this.completed.schedule;
    });
  }

  async getListGroup() {
    const page = 'schedule';
    return this.getSchedule().then((data) => Object.keys(data).map((id) => {
      const obj = {};
      obj.id = id;
      obj.name = this.completed[page].data[id].name;
      return obj;
    }));
  }

  async getGroup(id) {
    await this.getSchedule();
    return this.completed.schedule.data[id];
  }

  async getTeacher() {
    const page = 'teacher';
    return this.checkCache(page).then((cache) => {
      if (!cache) {
        const teacher = [];
        Object.keys(this.data[page].u).forEach((url) => {
          if (this.data[page].u[u].html === '') {
            throw new Error('html is not valid');
          }
          const $ = cheerio.load(this.data[page].u[u].html);
          const allBlock = $('.itemView');
          allBlock.each((i, block) => {
            const author = $($(block).find('[rel="author"]').get(0)).text();
            const linkAuthor = $($(block).find('[rel="author"]').get(0)).attr('href');
            const time = $($(block).find('time').get(0)).attr('datetime');
            const tag = $($(block).find('.tag-body').get(0)).text();
            const linkTag = $($(block).find('.tag-body').get(0)).attr('href');
            const text = $($(block).find('.itemIntroText').get(0)).text();

            const downoload = () => {
              const allLink = $($(block).find('.itemAttachments')).find('a');
              const out = [];
              allLink.each((i, link) => {
                const href = $(link).attr('href');
                const text = $(link).text();
                out.push({
                  href: href,
                  text: text,
                });
              });
              return out;
            };

            teacher.push({
              text: text,
              author: {
                text: author,
                link: linkAuthor,
              },
              time: time,
              tag: {
                text: tag,
                link: linkTag ? linkTag : '',
              },
              downoload: downoload(),
            });
          });
        });
        this.completed = { page: page, payload: teacher };
        console.log('not cache');
        return teacher;
      }

      return this.completed[page].data;
    });
  }
}

const g = new DataPkgh();
g.getTeacher((r) => console.log(r));
