const chalk = require('chalk');

class Console {
  constructor(level = 'log') {
    const e = ['log', 'warn', 'error', 'debug', 'none'];
    if (e.indexOf(level) === -1) throw new Error(`No exists log level ${level}`);
    this.level = level;
  }

  rechangeLevel(level) {
    this.level = level;
  }

  log(...args) {
    if (this.level === 'log' || this.level === 'debug') console.log(...args);
  }

  warn(...args) {
    if (this.level !== 'error' || this.level === 'debug') console.warn(chalk.yellow(...args));
  }

  error(...args) {
    if (this.level !== 'none') console.error(chalk.red(...args));
  }

  debug(...args) {
    if (this.level === 'debug') console.log(...args);
  }
}

module.exports = Console;
