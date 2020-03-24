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
  t.is(true, (r instanceof Array && r.length !== 0));
}));

test('Schedule firstIndex', (t) => pkgh.getSchedule().then((r) => r.firstIndex('id')).then((r) => {
  t.is(true, Object.keys(r).map((item) => item !== undefined)
    .filter((item, i, a) => a.indexOf(item) === i)[0]);
}));

test('Schedule groupIndex', (t) => pkgh.getSchedule().then((r) => r.groupIndex('spesialty')).then((r) => {
  t.is(true, r[Object.keys(r)[0]] instanceof Array);
}));

test('Schedule getSingle', (t) => pkgh.getSchedule().then((r) => r.getSingle(r.toArray)).then((r) => {
  t.is(true, r instanceof Object && r.data instanceof Array);
}));

test('Teacher', (t) => pkgh.getTeacher().then((r) => r.toArray()).then((r) => {
  t.is(true, (r instanceof Array && r.length !== 0));
}));

test('Chess', (t) => pkgh.getChess().then((r) => {
  t.is(true, !!r);
}));

test('Call', (t) => pkgh.getCall().then((r) => {
  t.is(true, !!r);
}));
