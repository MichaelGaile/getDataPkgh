const cheerio = require('cheerio');
const tableToJson = require('html-table-to-json');
const fetch = require('got');
const excelToJson = require('convert-excel-to-json');
const moment = require('moment');

const Console = require('./Console.js');
const Format = require('./Format.js');
const generateId = require('./generateId.js');

const console = new Console();

const fetchCache = new Map();

moment.locale('ru');

class DataPkgh {
  constructor(userOpts = {}) {
    // Set default opts
    const opts = (() => {
      const defaultOpts = {
        logLevel: 'warn',
        load: {},
      };
      return Object.assign(defaultOpts, userOpts);
    })();

    console.rechangeLevel(opts.logLevel);

    // Data
    // Main data where are they stored
    // Page {
    //  timestamp (Date.now(), time)
    //  url (Array, absolute url)
    // }
    const data = this.constructor.initData();
    this.data = data;
    // Now!
    // For transmitting data via this
    // Only for using data formatting
    this.now = null;

    const load = this.constructor.newLoad(opts.load, data);
    this.load = load;

    this.lockNet = Array.from(load).length !== 0;


    // OOPS in js
    // not work this in closure method
    // Single
    // Name of the property for the final data
    // Is used to obtain a single data point
    // To get this data, use the method <<getSingle>>
    // this._single = opts.single;
  }

  static initData() {
    function parseUrl(url) {
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

      if (Array.isArray(url)) {
        return [].concat(...url.map((u) => parse(u)));
      }

      return parse(url);
    }

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
        parseUrl(url).forEach((u) => {
          out[page].url.push(u);
        });
      });
      return out;
    };
    return updateUrl(data);
  }

  static newLoad(load, data) {
    const out = new Map();
    const keysData = Object.keys(load);
    if (keysData.length !== 0) {
      // Index may url or page name
      keysData.forEach((index) => {
        // Check url
        if (index.indexOf('http') === 0) {
          // index is url
          out.set(index, load[index]);
        } else if (Array.isArray(load[index])) {
          // index is page name
          // load is Array
          load[index].forEach((l, i) => {
            out.set(data[index].url[i], l);
          });
        } else {
          // index is page name
          // load is string
          out.set(data[index].url[0], load[index]);
        }
      });
    }
    return out;
  }

  /**
   * Check and execition function in string
   *
   * @static
   * @param {Array or String} url URL with or without a function
   * @returns {Array} Set of selected values
   */
  async request(page, l = [0, 0]) {
    if (!(page in this.data)) throw new Error('page is not exists');
    if (this.lockNet) {
      return (() => {
        const out = [];
        this.data[page].url.forEach((url) => {
          if (this.load.get(url)) out.push(this.load.get(url));
        });
        return out;
      })();
    }

    const limit = (() => {
      const { length } = this.data[page].url;
      if (typeof l === 'number') return [l, length];
      if (l.length === 1 || l[1] === 0) return [l[0], length];
      if (l[1] >= length) {
        console.warn('Warning not correct limit value in request');
        return [l[0], length];
      }
      if (l[0] < 0 || l[1] < 0) {
        console.warn('Warning not correct limit value in request');
        return [0, length];
      }
      return l;
    })();
    // promise
    // Load html file (String)
    let multiStore = [];
    for (let i = limit[0]; i < limit[1]; i++) {
      multiStore.push(fetch(this.data[page].url[i], { cache: fetchCache }).text());
    }
    multiStore = await Promise.all(multiStore);

    return multiStore;
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
      };
      return Object.assign(defaultOpts, userOpts);
    })();
    const page = 'schedule';

    const error = [];

    const schedule = { };

    const arrayHtml = await this.request(page);
    arrayHtml.forEach((html) => {
      const $ = cheerio.load(html);
      const mainTag = 'h4';

      let specialty = '';

      let tagReplace = null;

      $(mainTag).each((numTag, tag) => {
        if ($(tag).hasClass('dotted')) specialty = $(tag).text();
        else if ($(tag).hasClass('expanded')) {
          if ($(tag).text().toLowerCase().indexOf('замен') !== -1) tagReplace = tag;
          else {
            // Some schedule
            const name = $(tag).text();
            const hash = generateId($(tag).text());

            schedule[hash] = {
              id: hash,
              table: [],
              name,
              specialty,
              replace: {
                timestamp: null,
                lesson: [],
              },
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

      // Completion replace
      // Execution is always the last
      if (tagReplace !== null) {
        const timestamp = new Date(moment($(tagReplace).text().replace(/[^.0-9]/g, ''), 'dd.mm.yyyy').format()).getTime();

        const tbody = $($(tagReplace).parent()).find('tbody').get(0);
        const rows = $(tbody).find('tr');

        $(rows).each((numRow, row) => {
          const name = $($(row).find('.group').get(0)).text();
          const hash = generateId(name);

          const number = Number($($(row).find('.pnum').get(0)).text());
          const numSubject = $($(row).find('.pnum').get(0)).text();
          const numTeacher = $($(row).find('.pteacher').get(0)).text();
          const denSubject = $($(row).find('.pnum').get(1)).text();
          const denTeacher = $($(row).find('.pteacher').get(1)).text();

          // We ensure execution even if there is an error on the College's website
          if (!(hash in schedule)) {
            return false;
          }

          schedule[hash].replace.timestamp = timestamp;
          schedule[hash].replace.lesson.push({
            number,
            numSubject,
            numTeacher,
            denSubject,
            denTeacher,
          });
          return true;
        });
      }
    });
    const isDenominator = opts.single ? (() => {
      const html = arrayHtml[0];
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
        console.warn('Schedule: isDenominator is not correct');
      }
      return out;
    })() : null;

    const payload = opts.single ? {
      '@single': {
        timestamp: Date.now(),
        isDenominator,
        error,
      },
      ...schedule,
    } : schedule;

    return new Format(payload);
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
    const arrayHtml = await this.request(page, limit);
    const teacher = {};
    arrayHtml.forEach((html) => {
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
    return new Format(teacher);
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
    const arrayHtml = await this.request(page);

    const call = new Map();

    arrayHtml.forEach((html, i) => {
      const $ = cheerio.load(html);
      // Fix please
      // Cheerio cut parent tag
      call.set(i, {
        main: tableToJson.parse(`<table>${$($('.custom .simple-little-table').get(0)).html()}</table>`).results,
        replace: tableToJson.parse(`<table>${$($('.custom_max-attention .simple-little-table').get(0)).html()}</table>`).results,
      });
    });
    return call;
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
    const arrayHtml = await this.request(page);
    const warning = new Map();
    arrayHtml.forEach((html, i) => {
      const $ = cheerio.load(html);
      warning.set(i, (() => {
        const w = $('.custom_max-attention').get(0);
        $(w).find('table').each((_, el) => {
          $(el).remove();
        });
        return $(w).text();
      })());
    });
    return warning;
  }

  // No sort
  // return moment value
  /**
   * Getting xlsx formatted in json
   *
   * @returns {Object} XLSX to Json
   */
  async getChess() {
    const html = (await this.request('schedule'))[0];
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
        return true;
      });
      return url;
    })();

    const xl = excelToJson({
      source: await fetch(href, { cache: fetchCache }).buffer(),
    });
    return xl;
  }
}

module.exports = DataPkgh;
