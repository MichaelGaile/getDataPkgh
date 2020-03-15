const translit = require('cyrillic-to-translit-js');
const cheerio = require('cheerio');
const tableToJson = require('html-table-to-json');
const fetch = require('node-fetch');
const excelToJson = require('convert-excel-to-json');
const moment = require('moment');
const crypto = require('crypto');

function generateId(str) {
  return translit().transform((Array.from(str).filter((s) => /^([a-zа-яё]+|\d+)$/i.test(s))).join(''));
}

class DataPkgh {
  constructor(opts = {
    cache: true,
    timeCache: 900000,
  }) {
    // timeCache default 900000mls so 15min
    this.cache = opts.cache;
    this.timeCache = opts.timeCache;

    this.domain = 'https://pkgh.edu.ru';

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

    this.now = null;

    moment.locale('ru');
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

  set now(data) {
    this._now = data;
  }

  get now() {
    const data = this._now;
    this._now = null;
    return data;
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
        const payload = await fetch(url).then((r) => r.text()).then((body) => body);
        this.data = {
          page,
          url,
          payload,
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

    const cache = await this.checkCache(page);
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
              const timestamp = new Date(moment($(el).text().replace(/[^.0-9]/g, ''), 'dd.mm.yyyy').format());

              const tbody = $($(el).parent()).find('tbody').get(0);
              const row = $(tbody).find('tr');

              $(row).each((numRow, el) => {
                const name = $($(el).find('.group').get(0)).text();
                const hash = generateId(name);

                const num = $($(el).find('.pnum').get(0)).text();
                const numSub = $($(el).find('.pnum').get(0)).text();
                const numTea = $($(el).find('.pteacher').get(0)).text();
                const denSub = $($(el).find('.pnum').get(1)).text();
                const denTea = $($(el).find('.pteacher').get(1)).text();

                if (!(hash in schedule)) {
                  schedule[hash] = {};
                }
                if (!('replace' in schedule)) {
                  schedule[hash].replace = {
                    timestamp: null,
                    lesson: [],
                  };
                }
                schedule[hash].replace.timestamp = timestamp;
                schedule[hash].replace.lesson.push({
                  number: num,
                  numSubject: numSub,
                  numTeacher: numTea,
                  denSubject: denSub,
                  denTeacher: denTea,
                });
              });
            } else {
              // Some schedule
              const name = $(el).text();
              const hash = generateId($(el).text());

              schedule[hash] = {
                id: hash,
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
      const isDenominator = (() => {
        const html = Array.from(Array.from(this.data[page].payload)[0])[1];
        const $ = cheerio.load(html);
        let out = null;
        $('script').each((i, script) => {
          const htmlScript = $(script).html().split(' ').join('')
            .toLowerCase();
          if (htmlScript.indexOf('weeknum=') !== -1) {
            out = Number(htmlScript.split('weeknum=')[1].split(';')[0]) % 2 === 0;
          }
        });
        return out;
      })();
      this.completed = {
        page,
        payload: {
          schedule,
          isDenominator,
        },
      };
      this.now = schedule;
      return this;
    }
    this.now = this.completed.schedule.data;
    return this;
  }

  // Struct data Teacher
  //   id: {
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
  async getTeacher() {
    const page = 'teacher';
    const cache = await this.checkCache(page);
    if (!cache) {
      const teacher = {};
      this.data[page].payload.forEach((html, url) => {
        const $ = cheerio.load(html);
        const allBlock = $('.itemView');
        allBlock.each((i, block) => {
          const author = $($(block).find('[rel="author"]').get(0)).text();
          const linkAuthor = $($(block).find('[rel="author"]').get(0)).attr('href');
          // new Date(a('08 дек 2019 09:50', 'DD MMMM yyyy HH:mm').format())
          const time = new Date(moment($($(block).find('time').get(0)).attr('datetime'), 'DD MMMM yyyy HH:mm').format());
          const tag = $($(block).find('.tag-body').get(0)).text();
          const linkTag = $($(block).find('.tag-body').get(0)).attr('href');
          const text = $($(block).find('.itemIntroText').get(0)).text();

          const download = () => {
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
          const hash = generateId(`${time}-${author}-${linkAuthor}-`);

          teacher[hash] = {
            id: hash,
            text,
            author: {
              text: author,
              link: linkAuthor,
            },
            time,
            tag: {
              text: tag,
              link: linkTag,
            },
            downoload: download(),
          };
        });
      });
      this.completed = {
        page,
        payload: teacher,
      };
      this.now = teacher;
      return this;
    }

    this.now = this.completed[page].data;
    return this;
  }

  // No sort
  // return moment value
  async getCall() {
    const page = 'schedule';
    const cache = await this.checkCache(page);
    if (!cache) {
      const html = this.data[page].payload.values().next().value;
      const $ = cheerio.load(html);
      // Fix please
      // Cheerio cut parent tag
      const call = tableToJson.parse(`<table>${$($('.custom .simple-little-table').get(0)).html()}</table>`).results;
      const replaceCall = tableToJson.parse(`<table>${$($('.custom_max-attention .simple-little-table').get(0)).html()}</table>`).results;
      const payload = {
        call,
        replaceCall,
      };
      payload.id = crypto.createHash('md5').update(JSON.stringify(payload)).digest('hex');
      this.completed = {
        page: 'call',
        payload,
      };
      return payload;
    }
    return this.completed.call;
  }

  // No sort
  // return moment value
  async getWarning() {
    const page = 'schedule';
    const cache = await this.checkCache(page);
    if (!cache) {
      const html = this.data[page].payload.values().next().value;
      const $ = cheerio.load(html);
      const warning = (() => {
        const w = $('.custom_max-attention').get(0);
        $(w).find('table').each((i, el) => {
          $(el).remove();
        });
        return $(w).text();
      })();
      warning.id = crypto.createHash('md5').update(JSON.stringify(warning)).digest('hex');
      this.completed = {
        page: 'warning',
        payload: warning,
      };
      return warning;
    }
    this.now = this.completed.warning.data;
    return this;
  }

  // No sort
  // return moment value
  async getChess() {
    const page = 'schedule';
    const cache = await this.checkCache(page);
    if (!cache) {
      const html = this.data[page].payload.values().next().value;
      const $ = cheerio.load(html);
      const href = (() => {
        let url = null;
        $('aside').find('a').each((i, el) => {
          if ($(el).text().toLowerCase().indexOf('шахматка') !== -1) {
            url = $(el).attr('href');
            if (url.indexOf('http://') === -1) {
              url = `${this.domain}/${url}`;
            }
          }
        });
        return url;
      })();

      const xl = excelToJson({
        source: await fetch(href).then((r) => r.buffer()).then((body) => { return body; }),
      });
      xl.id = crypto.createHash('md5').update(JSON.stringify(xl)).digest('hex');
      this.completed = {
        page: 'chess',
        payload: xl,
      };
      return xl;
    }
    return this.completed.chess.data;
  }

  async toArray() {
    const data = await this.now;
    if (data instanceof Array) return data;
    return Object.keys(data).map((key) => data[key]);
  }

  async firstIndex(index) {
    let data = await this.now;
    const out = {};
    if (!(data instanceof Array)) data = Object.keys(data).map((key) => data[key]);
    data.forEach((item) => {
      out[item[index]] = item;
    });
    return out;
  }

  async groupIndex(index) {
    let data = await this.now;
    if (!(data instanceof Array)) data = Object.keys(data).map((key) => data[key]);

    const out = {};
    data.map((item) => item[index])
      .filter((item, i, self) => self.indexOf(item) === i)
      .forEach((spec) => {
        out[spec] = [];
        data.forEach((item) => {
          out[spec].push(item);
        });
      });
    return out;
  }
}

module.exports = DataPkgh;
module.exports.generateId = generateId;
