const test = require('ava');
const fs = require('fs');

const DataPkgh = require('./src/index.js');

const pkgh = new DataPkgh({
  cache: true,
  logLevel: 'debug',
  load: {
    schedule: fs.readFileSync('./test/schedule.html', 'utf-8'),
    teacher: fs.readFileSync('./test/teacher.html', 'utf-8'),
  },
});

test('Schedule to Array', (t) => pkgh.getSchedule().then((r) => r.toArray()).then((r) => {
  t.is(true, (Array.isArray(r) && r.length !== 0));
}));

test('Types schedule', (t) => pkgh.getSchedule().then((r) => r.toArray()).then((r) => {
  function check(val, type) {
    if (typeof val !== type && val !== null) {
      t.fail(`typeof ${typeof val} !== ${type}: \n ${val}`);
    }
    return true;
  }
  r.forEach((item) => {
    check(item.name, 'string');
    check(item.specialty, 'string');
    check(item.replace.timestamp, 'number');
    item.table.forEach((table) => {
      check(table.dayWeek, 'string');
      table.lesson.forEach((lesson) => {
        check(lesson.numSubject, 'string');
        check(lesson.numTeacher, 'string');
        check(lesson.denSubject, 'string');
        check(lesson.denTeacher, 'string');
      });
    });
    check(item.replace.timestamp, 'number');
    item.replace.lesson.forEach((cell) => {
      check(cell.numSubject, 'string');
      check(cell.numTeacher, 'string');
      check(cell.denNumber, 'string');
    });
  });

  t.pass('YES');
}));

test('Schedule firstIndex', (t) => pkgh.getSchedule().then((r) => r.firstIndex('id')).then((r) => {
  t.is(true, Object.keys(r).map((item) => item !== undefined)
    .filter((item, i, a) => a.indexOf(item) === i)[0]);
}));

test('Schedule groupIndex', (t) => pkgh.getSchedule().then((r) => r.groupIndex('spesialty')).then((r) => {
  t.is(true, Array.isArray(r[Object.keys(r)[0]]));
}));

test('Schedule getSingle', (t) => pkgh.getSchedule().then((r) => r.getSingle(r.toArray)).then((r) => {
  t.is(true, typeof r === 'object' && r !== null && Array.isArray(r.data) && !!r.single);
}));

test('Teacher', (t) => pkgh.getTeacher().then((r) => r.toArray()).then((r) => {
  t.is(true, (Array.isArray(r) && r.length !== 0));
}));

test('Chess', (t) => pkgh.getChess().then((r) => {
  t.is(true, !!r);
}));

test('Call', (t) => pkgh.getCall().then((r) => {
  t.is(true, !!r);
}));
