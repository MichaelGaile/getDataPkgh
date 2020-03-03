const translit = require('cyrillic-to-translit-js');

function generateId(str) {
  return translit().transform((Array.from(str).filter((s) => /^([a-zа-яё]+|\d+)$/i.test(s))).join(''));
}

module.exports = generateId;
