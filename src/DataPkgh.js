const got = require('got');
const cheerio = require('cheerio');
const path = require('path');
const generateId = require(path.join(__dirname, 'generateId.js'));

class DataPkgh {
  constructor(cache = true, timeCache = 900000) {
    // timeCache default 900000mls so 15min
    this.cache = cache;
    this.timeCache = timeCache;

    // Payload of Map string url => string html
    this._data = {
      schedule: {
        timestamp: 0,
        url: [
          'https://pkgh.edu.ru/obuchenie/shedule-of-classes.html',
          'https://pkgh.edu.ru/zaochnoe-otdelenie.html',
        ],
        payload: new Map(),
      },
      teacher: {
        timestamp: 0,
        url: [
          'https://pkgh.edu.ru/obuchenie/teachers.html?start=[[range(0,99,11)]]',
        ],
        payload: new Map(),
      },
    };
    this._completed = {
      schedule: {
        timestamp: 0,
        data: null,
      },
      teacher: {
        timestamp: 0,
        data: null,
      },
    };

    // Parsing url's
    const updateUrl = (data) => {
      const d = data;
      Object.keys(data).forEach((page) => {
        this.constructor.parseUrl(d[page].url).forEach((url) => {
          d[page].payload.set(url, '');
        });
      });
      return d;
    };
    this._data = updateUrl(this._data);

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
    this._data[data.page].payload.set(data.url, data.payload);
  }

  get data() {
    return this._data;
  }

  static parseUrl(url) {
    function parse(str) {
      if (str.indexOf('[[') === -1 || str.indexOf(']]') === -1) return str;
      const func = str.split('[[')[1].split(']]')[0];
      const title = func.split('(')[0];

      // Warning!!! Params default is string! be careful
      let params = func.split('(')[1].split(')')[0].split(',');
      if (title === 'range') {
        params = params.map((p) => { return Number(p); });
        const plenty = [];
        if (params.length <= 1) throw new Error('Not valid params in range function');
        if (params[2] === undefined) params[2] = 1;
        for (let i = params[0]; i <= params[1]; i += params[2]) {
          plenty.push(str.replace(`[[${func}]]`, i));
        }
        return plenty;
      }
      return str;
    }

    if (url instanceof Array) {
      return [].concat(...url.map((u) => { return parse(u); }));
    }

    return parse(url);
  }

  async checkCache(page) {
    if (!(page in this.data)) {
      throw new Error('page is not exists');
    }
    if (!this.cache || (Date.now() - this.data[page].timestamp) > this.timeCache) {
      for (const [url, html] of this.data[page].payload) {
        const body = await got(url, { resolveBodyOnly: true });
        this.data = {
          page: page,
          url: url,
          payload: body,
        };
      }
      return false;
    }
    return true;
  }

  /* Struct data schedule
   * {
   * name: name Group
   * specialty: specialty group
   * table: [ {
   *   dayWeek: day week
   *   lesson: [ {
   *     numSubject: numeration subject
   *     numTeacher: { type: String },
   *     denSubject: denominator subject
   *     denTeacher: { type: String },
   *    } ]
   * } ],
   * replace: {
   *   timeStamp: date replace,
   *   lesson: [ {
   *     numSubject: { type: String },
   *     numTeacher: { type: String },
   *     denSubject: { type: String },
   *     denTeacher: { type: String },
   *   } ]
   * }
   *
   * }
   *
   */

  async getSchedule() {
    const page = 'schedule';

    return this.checkCache(page).then((cache) => {
      if (!cache) {
        // Not cache
        const schedule = {};

        this.data[page].payload.forEach((html) => {
          const $ = cheerio.load(html);
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
                  const hash = generateId(name);

                  const num = $($(el).find('.pnum').get(0)).text();
                  const numSubject = $($(el).find('.pnum').get(0)).text();
                  const numTeacher = $($(el).find('.pteacher').get(0)).text();
                  const denSubject = $($(el).find('.pnum').get(1)).text();
                  const denTeacher = $($(el).find('.pteacher').get(1)).text();

                  if (!(hash in schedule)) {
                    schedule[hash] = {};
                  }
                  if (!('replace' in schedule)) {
                    schedule[hash].replace = {
                      timestamp: '',
                      lesson: [],
                    };
                  }
                  schedule[hash].replace.timestamp = timestamp;
                  schedule[hash].replace.lesson.push({
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
                const hash = generateId($(el).text());

                schedule[hash] = {
                  table: [],
                  name,
                  specialty,
                };

                schedule[hash].name = name;

                const parent = $(el).parent();
                const table = $(parent).find('table');

                table.each((numTable, el) => {
                  const dayWeek = $($(el).find('.groupname').get(0)).text();
                  const cellTable = $(el).find('tr');

                  schedule[hash].table[numTable] = {
                    dayWeek,
                    lesson: [],
                  };

                  cellTable.each((cellNum, el) => {
                    const numSubject = $($(el).find('.pname').get(0)).text();
                    const numTeacher = $($(el).find('.pteacher').get(0)).text();
                    const denSubject = $($(el).find('.paltname').get(0)).text();
                    const denTeacher = $($(el).find('.paltteacher').get(0)).text();

                    schedule[hash].table[numTable].lesson[cellNum] = {
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

  async getScheduleListGroup() {
    const page = 'schedule';
    return this.getSchedule().then((data) => Object.keys(data).map((hash) => {
      const obj = {};
      obj.id = hash;
      obj.name = this.completed[page].data[hash].name;
      return obj;
    }));
  }

  async getScheduleGroup(hash) {
    await this.getSchedule();
    return this.completed.schedule.data[hash];
  }

  // Struct data Teacher
  // [
  //   {
  //    id: hash(text+author+linkAuthor),
  //    text: text,
  //    author: {
  //      text: author,
  //      link: linkAuthor,
  //    },
  //    time: time,
  //    tag: {
  //      text: tag,
  //      link: linkTag,
  //    },
  //    downoload: linkDownolad
  //   }
  // ]
  async getTeacher() {
    const page = 'teacher';
    return this.checkCache(page).then((cache) => {
      if (!cache) {
        const teacher = [];
        this.data[page].payload.forEach((html, url) => {
          const $ = cheerio.load(html);
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
                  link: href,
                  text: text,
                });
              });
              return out;
            };

            teacher.push({
              id: generateId(`${time}-${author}-${linkAuthor}-`),
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
        return teacher;
      }

      return this.completed[page].data;
    });
  }

  async getTeacherPost(hash) {
    await this.getTeacher();
    return this.completed.teacher.data[hash];
  }
}

module.exports = DataPkgh;