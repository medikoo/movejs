'use strict';

var deferred = require('deferred')
  , resolve = require('path').resolve

  , pgPath = resolve(__dirname, '../__playground');

module.exports = function (t, a, d) {
	deferred(
		t(resolve(pgPath, 'harko.css'))(function (value) { a(value, false); }),
		t(resolve(pgPath, 'node-module'))(function (value) { a(value, true); }),
		t(resolve(pgPath, 'not-node-module'))(function (value) { a(value, false); }),
		t(resolve(pgPath, 'test.js'))(function (value) { a(value, true); })
	).done(function () { d(); }, d);
};
