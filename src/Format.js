
class Format {
  constructor() {
    this.single = '@single';
    this._now = null;
  }

  set now(data) {
    this._now = data;
  }

  get now() {
    const out = this._now;
    this._now = null;
    return out;
  }

  toArray(d = null) {
    const data = d === null ? this.now : d;
    if ('@single' in data) delete data['@single'];
    if (Array.isArray(data)) return data;
    return Object.keys(data).map((key) => data[key]);
  }

  getSingle(callback, d = null) {
    let data = d === null ? this.now : d;
    if (typeof data === 'object' && !('@single' in data)) {
      return callback(data);
    }
    const single = data['@single'];
    data = callback(data);
    return {
      '@single': single,
      data,
    };
  }

  firstIndex(index, d = null) {
    let data = d === null ? this.now : d;
    if ('@single' in data) delete data['@single'];
    const out = {};
    if (!(Array.isArray(data))) data = Object.keys(data).map((key) => data[key]);
    data.forEach((item) => {
      out[item[index]] = item;
    });
    return out;
  }

  groupIndex(index, d = null) {
    let data = d === null ? this.now : d;
    if ('@single' in data) delete data['@single'];
    if (!Array.isArray(data)) data = Object.keys(data).map((key) => data[key]);

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

module.exports = Format;
