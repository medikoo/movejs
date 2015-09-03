'use strict';

var deferred = require('deferred')
  , resolve  = require('path').resolve
  , rmdir    = require('fs2/rmdir')
  , stat     = require('fs2/stat')
  , copy     = deferred.promisify(require('fs-extra').copy)

  , pgInitPath = resolve(__dirname, '../__playground/test-dir')
  , pgWorkingPath = resolve(__dirname, '../__playground/test-dir-work');

module.exports = function (t, a, d, workingPath) {
	if (!workingPath) workingPath = pgWorkingPath;
	copy(pgInitPath, workingPath)(function () {
		return t(workingPath)(a.never, function (e) {
			a(e.code, 'CANNOT_CLEAR_DIR', "Error");
			return deferred(
				stat(resolve(workingPath, 'inner'))(a.never, function (e) {
					a(e.code, 'ENOENT', "Empty deleted");
				}),
				stat(resolve(workingPath, 'foo/biba'))(function (stat) {
					a(stat.isDirectory(), true, "Non empty #1");
				}, a.never),
				stat(resolve(workingPath, 'foo/elo'))(a.never, function (e) {
					a(e.code, 'ENOENT', "Nested empty deleted #2");
				}),
				stat(resolve(workingPath, 'marko'))(function (stat) {
					a(stat.isDirectory(), true, "Non empty #2");
				}, a.never),
				stat(resolve(workingPath, 'marko/muszka'))(a.never, function (e) {
					a(e.code, 'ENOENT', "Nested empty deleted #2");
				})
			);
		});
	})(function () {
		return rmdir(workingPath, { recursive: true, force: true });
	}).done(function () { d(); }, d);
};
