class Format {
  constructor(data) {
    this.data = data;
  }

  toArray(d = null) {
    const data = d === null ? this.data : d;
    if ('@single' in data) delete data['@single'];
    if (Array.isArray(data)) return data;
    return Object.keys(data).map((key) => data[key]);
  }

  getSingle(callback, d = null) {
    let data = d === null ? this.data : d;
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
    let data = d === null ? this.data : d;
    if ('@single' in data) delete data['@single'];
    const out = {};
    if (!(Array.isArray(data))) data = Object.keys(data).map((key) => data[key]);
    data.forEach((item) => {
      out[item[index]] = item;
    });
    return out;
  }

  groupIndex(index, d = null) {
    let data = d === null ? this.data : d;
    if ('@single' in data) delete data['@single'];
    if (!Array.isArray(data)) data = Object.keys(data).map((key) => data[key]);

    const out = {};
    data.map((item) => item[index])
      .filter((item, i, self) => self.indexOf(item) === i)
      .forEach((ind) => {
        // ind is one index
        out[ind] = [];
        data.forEach((item) => {
          if(item[index] === ind) {
            out[ind].push(item);
          }
        });
      });
    return out;
  }
}

module.exports = Format;
