const test = require('ava');

const dPkgh = require('./src/index.js');

const pkgh = new dPkgh();

test('Schedule', (t) => {
  return pkgh.getSchedule().then((r) => {
    t.is(true, !!r[Object.keys(r)[0]].id);
  });
});

test('Teacher', (t) => {
  return pkgh.getTeacher().then((r) => {
    t.is(true, !!r[Object.keys(r)[0]].id);
  });
});

test('Chess', (t) => {
  return pkgh.getChess().then((r) => {
    t.is(true, !!r);
  });
});
