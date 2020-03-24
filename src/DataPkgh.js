const cheerio = require('cheerio');
const tableToJson = require('html-table-to-json');
const fetch = require('node-fetch');
const excelToJson = require('convert-excel-to-json');
const moment = require('moment');
const { minify } = require('html-minifier');

const Console = require('./Console.js');
const generateId = require('./generateId.js');

const console = new Console();

// DataPkgh
// cache -> on / off load data from the http://pkgh
// To avoid loading servers you should enable the cache
// timecache - html data retention period
// load - allows you to load html,
// the object accepts both pages and URLs as values
// If your program is used without the Internet don't forget to disable the cache
// example:
//  load: { schedyle: 'HTML' }
//  load: { 'URL': 'HTML' }
class DataPkgh {
  constructor(userOpts = {}) {
    // Set default opts
    const opts = (() => {
      const defaultOpts = {
        cache: false,
        timeCache: 900000,
        logLevel: 'log',
        single: 'single',
        load: {},
      };
      return Object.assign(defaultOpts, userOpts);
    })();

    console.rechangeLevel(opts.logLevel);

    // Cache
    // Needed for needed to reduce requests to the main server
    // If there are errors your ip maybe blocked
    // Use dynamic proxies for guaranteed data retrieval
    this.cache = opts.cache;
    // The time when data will be updated
    // 15 minutes was chosen empirically as the optimal indicator
    // of site variability and minimal load
    // timeCache default 900000mls so 15min
    this.timeCache = opts.timeCache;

    // Data
    // Main data where are they stored
    // Page {
    //  timestamp (Date.now(), time)
    //  url (Array, absolute url)
    // }
    this._data = (() => {
      // Set template data
      // Fake url may have function
      const data = {
        schedule: {
          timestamp: 0,
          url: [
            'https://pkgh.edu.ru/obuchenie/shedule-of-classes.html',
            'https://pkgh.edu.ru/zaochnoe-otdelenie.html',
          ],
        },
        teacher: {
          timestamp: 0,
          url: [
            'https://pkgh.edu.ru/obuchenie/teachers.html?start=[[range(0,99,11)]]',
          ],
        },
        chess: {
          timestamp: 0,
          url: [
            'https://pkgh.edu.ru/obuchenie/shedule-of-classes.html',
          ],
        },
      };

      // Parsing url's
      // Replace all function url on Array from absolute url
      const updateUrl = (d) => {
        const out = d;
        Object.keys(out).forEach((page) => {
          const { url } = out[page];
          out[page].url = [];
          this.constructor.parseUrl(url).forEach((u) => {
            out[page].url.push(u);
          });
        });
        return out;
      };
      return updateUrl(data);
    })();

    // Save this final data
    // Properties:
    // Page (String) {
    //  timestamp (Date.now, time)
    //  data (Mixed data, some final data)
    // }
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

    // Save raw html (String)
    // Has properties:
    // timestamp (Date.now(), some time),
    // url (String, absolute url)
    // payload (String, some HTML)
    this._html = (() => {
      const out = {};
      const { data } = this;
      Object.keys(data).forEach((page) => {
        data[page].url.forEach((u) => {
          out[u] = {
            payload: null,
            timestamp: 0,
          };
        });
      });
      return out;
    })();

    // this.lockNet = false;
//
    // this.constructor.newLoad(opts.load);

    // Now!
    // For transmitting data via this
    // Only for using data formatting
    this.now = null;

    // Single
    // Name of the property for the final data
    // Is used to obtain a single data point
    // To get this data, use the method <<getSingle>>
    this._single = opts.single;

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

  get single() {
    return this._single;
  }

  set html(data) {
    this._html[data.url] = {
      payload: data.payload,
      timestamp: Date.now(),
    };
  }

  get html() {
    return this._html;
  }

  static newLoad(data) {
    // Load load
    // Install load in data html
    if (Object.keys(data).length !== 0) {
      Object.keys(data).forEach((index) => {
        if (index.indexOf('http') === 0) {
          this.html = { url: index, payload: data[index] };
        } else {
          this.html = {
            url: this.data[index].url[0],
            payload: data[index],
          };
        }
        this.lockNet = true;
      });
    } else {
      this.lockNet = false;
    }
  }

  /**
   * Check and execition function in string
   *
   * @static
   * @param {Array or String} url URL with or without a function
   * @returns {Array} Set of selected values
   */
  static parseUrl(url) {
    function parse(str) {
      if (str.indexOf('[[') === -1 || str.indexOf(']]') === -1) return str;
      const func = str.split('[[')[1].split(']]')[0];
      const title = func.split('(')[0];

      // Warning!!! Params default is string! be careful
      let params = func.split('(')[1].split(')')[0].split(',');
      if (title === 'range') {
        params = params.map((p) => Number(p));
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
      return [].concat(...url.map((u) => parse(u)));
    }

    return parse(url);
  }

  /**
   * Check html data storage time
   *
   * @param {String} page Page schedule, teacher... Multiple links linked to a page
   * @param {Array or Number} l Limit where is the first value skip and the last restriction
   * @returns {Boolean} Value allow cache
   */
  async checkCache(page, l = [0, 0]) {
    if (!(page in this.data)) throw new Error('page is not exists');
    if (this.lockNet) return false;

    const limit = (() => {
      const { length } = this.data[page].url;
      if (l instanceof Number) return [l, length];
      if (l.length === 1 || l[1] === 0) return [l[0], length];
      if (l[1] >= length) {
        console.warn('Warning not correct limit value in checkCache');
        return [l[0], length];
      }
      if (l[0] < 0 || l[1] < 0) {
        console.warn('Warning not correct limit value in checkCache');
        return [0, length];
      }
      return l;
    })();
    // promise
    // Load html file (String)
    let promise = {};
    let allowCache = true;
    for (let i = limit[0]; i < limit[1]; i++) {
      const url = this.data[page].url[i];
      if (!this.cache
        || (
          this.html[url].timestamp === 0
          || (Date.now() - this.html[url].timestamp) > this.timeCache)
      ) {
        promise[url] = { payload: fetch(url).then((r) => r.text()) };
        allowCache = false;
      }
    }
    const loadUrl = Object.keys(promise);
    promise = await Promise.all(loadUrl.map((url) => promise[url].payload)).then((data) => {
      const out = {};
      data.forEach((item, i) => {
        out[loadUrl[i]] = {
          payload: minify(item, {
            removeAttributeQuotes: true,
            removeComments: true,
            collapseWhitespace: true,
            collapseBooleanAttributes: true,
            minifyCSS: true,
            minifyJS: true,
          }),
          timestamp: Date.now(),
        };
      });
      return out;
    });

    this._html = promise;

    return allowCache;
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

  /**
   * Parsing and preparing data for use
   *
   * @param {Object} opts A set of possible options
   * @returns {This} Returns this with the ability to get data in a convenient form
   */
  async getSchedule(userOpts = {}) {
    const opts = (() => {
      const defaultOpts = {
        single: true, 
      }
      return Object.assign(defaultOpts, userOpts);
    })();
    const page = 'schedule';

    const cache = await this.checkCache(page);
    if (!cache) {
      const error = [];
      // Not cache
      const schedule = {};

      this.data[page].url.map((url) => this.html[url].payload).forEach((html) => {
        const $ = cheerio.load(html);
        const mainTag = 'h4';

        // Some receiving data
        let specialty = '';
        $(mainTag).each((numTag, tag) => {
          if ($(tag).hasClass('dotted')) specialty = $(tag).text();
          else if ($(tag).hasClass('expanded')) {
            if ($(tag).text().toLowerCase().indexOf('замен') !== -1) {
              // Replace in schedule
              const timestamp = new Date(moment($(tag).text().replace(/[^.0-9]/g, ''), 'dd.mm.yyyy').format());

              const tbody = $($(tag).parent()).find('tbody').get(0);
              const rows = $(tbody).find('tr');

              $(rows).each((numRow, row) => {
                const name = $($(row).find('.group').get(0)).text();
                const hash = generateId(name);

                const num = $($(row).find('.pnum').get(0)).text();
                const numSub = $($(row).find('.pnum').get(0)).text();
                const numTea = $($(row).find('.pteacher').get(0)).text();
                const denSub = $($(row).find('.pnum').get(1)).text();
                const denTea = $($(row).find('.pteacher').get(1)).text();

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
              const name = $(tag).text();
              const hash = generateId($(tag).text());

              schedule[hash] = {
                id: hash,
                table: [],
                name,
                specialty,
              };

              schedule[hash].name = name;

              const parent = $(tag).parent();
              const tables = $(parent).find('table');

              tables.each((numTable, table) => {
                const dayWeek = $($(table).find('.groupname').get(0)).text();
                const tableCells = $(table).find('tr');

                schedule[hash].table[numTable] = {
                  dayWeek,
                  lesson: [],
                };

                tableCells.each((cellNum, tableCell) => {
                  const numSubject = $($(tableCell).find('.pname').get(0)).text();
                  const numTeacher = $($(tableCell).find('.pteacher').get(0)).text();
                  const denSubject = $($(tableCell).find('.paltname').get(0)).text();
                  const denTeacher = $($(tableCell).find('.paltteacher').get(0)).text();

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
        const html = Array.from(
          Array.from(this.data[page].url.map((url) => this.html[url].payload))[0],
        )[1];
        const $ = cheerio.load(html);
        let out = null;
        $('script').each((i, script) => {
          const htmlScript = $(script).html().split(' ').join('')
            .toLowerCase();
          if (htmlScript.indexOf('weeknum=') !== -1) {
            out = Number(htmlScript.split('weeknum=')[1].split(';')[0]) % 2 === 0;
          }
        });
        if (!out) {
          out = Math.round((new Date().getTime() - new Date(new Date().getFullYear(),
            new Date().getMonth(), 0).getTime()) / (1000 * 60 * 60 * 24 * 7)) % 2 === 0;
          error.push('isDenominator is not correct');
          console.warn('Schedule: isDenominator is not correct')
        }
        return out;
      })();

      const payload = opts.single ? (() => {
        const o = schedule;
        o[this.single] = {
          timestamp: Date.now(),
          isDenominator,
          error: [],
        };
        return o;
      })() : schedule;

      this.completed = {
        page,
        payload,
      };

      this.now = payload;

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
  /**
   * Prepares data for convenient use
   * @param {Array or Number} limit Limit load page from 0 to 9
   * @returns {This} You can use the method to format data to the desired format
   */
  async getTeacher(limit = [0, 0]) {
    const page = 'teacher';
    const cache = await this.checkCache(page, limit);
    if (!cache) {
      const teacher = {};
      this.data[page].url.map((url) => this.html[url].payload).forEach((html) => {
        const $ = cheerio.load(html);
        const allBlock = $('.itemView');
        allBlock.each((_, block) => {
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
              const downloadText = $(link).text();
              out.push({
                link: href,
                text: downloadText,
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
  /**
   * Getting data call
   *
   * @returns {Object} Uisng tableToJson to format html into a json table
   */
  async getCall() {
    const page = 'schedule';
    const cache = await this.checkCache(page);
    if (!cache) {
      const html = this.data[page].url.map((url) => this.html[url].payload).values().next().value;
      const $ = cheerio.load(html);
      // Fix please
      // Cheerio cut parent tag
      const call = tableToJson.parse(`<table>${$($('.custom .simple-little-table').get(0)).html()}</table>`).results;
      const replaceCall = tableToJson.parse(`<table>${$($('.custom_max-attention .simple-little-table').get(0)).html()}</table>`).results;
      const payload = {
        id: generateId(JSON.stringify({call, replaceCall})),
        data: {
          call,
          replaceCall,
        },
      };
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
  /**
   * Getting data warning
   *
   * @returns {Object} Keys with id, timestamp, and data {String} are stored
   */
  async getWarning() {
    const page = 'schedule';
    const cache = await this.checkCache(page);
    if (!cache) {
      const html = this.data[page].url.map((url) => this.html[url].payload).values().next().value;
      const $ = cheerio.load(html);
      const warning = (() => {
        const w = $('.custom_max-attention').get(0);
        $(w).find('table').each((i, el) => {
          $(el).remove();
        });
        return $(w).text();
      })();
      const payload = {
        id: generateId(warning),
        timestamp: Date.now(),
        data: warning,
      };
      this.completed = {
        page: 'warning',
        payload,
      };
      return payload;
    }
    this.now = this.completed.warning.data;
    return this;
  }

  // No sort
  // return moment value
  /**
   * Getting xlsx formatted in json
   *
   * @returns {Object} XLSX to Json
   */
  async getChess() {
    const page = 'chess';
    const cache = await this.checkCache('schedule');
    if (!cache) {
      const html = this.data[page].url.map((url) => this.html[url].payload)[0];
      const $ = cheerio.load(html);
      const href = (() => {
        let url = null;
        $('aside').find('a').each((i, item) => {
          if ($(item).text().toLowerCase().indexOf('шахматка') !== -1) {
            url = $(item).attr('href');
            if (url.indexOf('http://') === -1) {
              url = `https://pkgh.edu.ru/${url}`;
            }
            return false;
          }
        });
        return url;
      })();

      const xl = excelToJson({
        source: await fetch(href).then((r) => r.buffer()),
      });
      const payload = {
        id: generateId(JSON.stringify(xl)),
        data: xl,
      };
      this.completed = {
        page,
        payload,
      };
      return payload;
    }
    return this.completed.chess.data;
  }

  /**
   * Returns the prepared data as an array
   *
   * @param {Object or Array} d Parameter data to bypass 'now' only for use inside other functions
   */
  async toArray(d = null) {
    const data = d === null ? await this.now : d;
    if (this.single in data) delete data[this.single];
    if (data instanceof Array) return data;
    return Object.keys(data).map((key) => data[key]);
  }

  /**
   * Returns object with the key 'single'. Where individual data is stored
   *
   * @param {Function} callback Used to represent data inside an object
   * @param {Object or Array} d=null Used only for internal functions
   * @returns {Object or Array} Returns data in a convenient format along with individual data
   */
  async getSingle(callback, d = null) {
    let data = await (d === null ? this.now : d);
    if (!(this.single in data)) {
      console.warn('Single not found');
      return await callback(data);
    }
    const { single } = data;
    data = await callback(data);
    return {
      single,
      data,
    };
  }

  /**
   * Formatting data
   *
   * @param {String} index The data sample with the same index. Attention!
   * Indexes must be unique otherwise use groupIndex
   * @param {Object or Array} d=null Data with the now crawl. Use inside other functions
   * @returns {Object} Object set with the selected index
   */
  async firstIndex(index, d = null) {
    let data = await (d === null ? this.now : d);
    if (this.single in data) delete data[this.single];
    const out = {};
    if (!(data instanceof Array)) data = Object.keys(data).map((key) => data[key]);
    data.forEach((item) => {
      out[item[index]] = item;
    });
    return out;
  }

  /**
   * Formatting data
   *
   * @param {String} index Index storage in array or object
   * @param {Object or Array} d=null Data with the 'now' crawl. Use inside other function
   * @returns {Object} Grouped data with an index selection
   */
  async groupIndex(index, d = null) {
    let data = d === null ? await this.now : d;
    if (this.single in data) delete data[this.single];
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
