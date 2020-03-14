const test = require('ava');

const dPkgh = require('./src/index.js');

const pkgh = new dPkgh();

test('Schedule', (t) => pkgh.getSchedule().then((r) => r.toArray()).then((r) => {
  t.is(true, (r instanceof Array && r.length !== 0));
}));

test('Teacher', (t) => pkgh.getTeacher().then((r) => r.toArray()).then((r) => {
  t.is(true, (r instanceof Array && r.length !== 0));
}));

test('Chess', (t) => pkgh.getChess().then((r) => {
  t.is(true, !!r);
}));
