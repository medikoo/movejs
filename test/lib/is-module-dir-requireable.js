'use strict';

var deferred = require('deferred')
  , resolve  = require('path').resolve

  , pgPath = resolve(__dirname, '../__playground');

module.exports = function (t, a, d) {
	return deferred(
		t(pgPath + 'some-dir/foo.js')(function (result) {
			a(result, false, "Index: Non index");
		}),
		t(resolve(pgPath, 'some-dir/index.js'))(function (result) {
			a(result, true, "Index: index");
		}),
		t(pgPath + 'some-dir-2/miszka.js')(function (result) {
			a(result, false, "Package main: Non main");
		}),
		t(resolve(pgPath, 'some-dir-2/elo.js'))(function (result) {
			a(result, true, "Package main: main");
		})
	).done(function () { d(); }, d);
};
