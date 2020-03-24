const crypto = require('crypto');
const translit = require('cyrillic-to-translit-js');

/**
 * generate id with a string base, removing all characters except Russian and English
 *
 * @param {Object} hash use md5 to create an id
 * @returns {String} returns an id based on a string
 */
function generateId(str, hash = true) {
  const string = translit().transform((Array.from(str).filter((s) => /^([a-zа-яё]+|\d+)$/i.test(s))).join(''));
  return hash ? crypto.createHash('md5').update(string).digest('hex') : string;
}

module.exports = generateId;
