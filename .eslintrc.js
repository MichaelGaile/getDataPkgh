module.exports = {
  env: {
    es6: true,
    node: true,
  },
  extends: [
    'airbnb-base',
  ],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
  },
  parserOptions: {
    ecmaVersion: 2018,
    sourceType: 'module',
  },
  rules: {
    "import/no-unresolved": [
      2, 
      { "caseSensitive": false },
    ],
    "no-plusplus": [ 
      2,
      { "allowForLoopAfterthoughts": true, },
    ],
    "no-underscore-dangle": [
      2,
      { 
        "allowAfterThis": true,
        "enforceInMethodNames": true,
      },
    ],
  },
};
