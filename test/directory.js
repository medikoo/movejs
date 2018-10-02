'use strict';

var deferred = require('deferred')
  , resolve  = require('path').resolve
  , rmdir    = require('fs2/rmdir')
  , readFile = require('fs2/read-file')
  , stat     = require('fs2/stat')
  , copy     = deferred.promisify(require('fs-extra').copy)

  , pgInitPath = resolve(__dirname, '__playground/test-package')
  , pgWorkingPath = resolve(__dirname, '__playground/test-package-work-dir');

module.exports = function (t, a, d, workingPath) {
	if (!workingPath) workingPath = pgWorkingPath;
	copy(pgInitPath, workingPath)(function () {
		var from = resolve(workingPath, 'inner');
		return t(from, resolve(workingPath, 'outer/deep'))(function () {
			return deferred(
				readFile(resolve(workingPath, 'outer/deep/twodepth/bar.js'))(function (code) {
					a(String(code), 'require(\'../../../foo\');\nrequire(\'./marko\');\n' +
						'require(\'./elo/miszka\');\n', "bar.js module");
				}),
				readFile(resolve(workingPath, 'foo.js'))(function (code) {
					a(String(code), 'require(\'./outer/deep/twodepth/bar\');\n' +
						'require(\'./outer/deep/twodepth/marko\');\n' +
						'require(\'./outer/deep/twodepth/bar\');\nrequire(\'./outer/deep/\');\n',
						"Root module");
				}),
				readFile(resolve(workingPath, 'outer/deep/twodepth/marko.js'))(function (code) {
					a(String(code), 'require(\'./bar\');\n', "marko.js module");
				}),
				readFile(resolve(workingPath, 'outer/deep/twodepth/elo/miszka.js'))(function (code) {
					a(String(code), 'require(\'../bar\');\nrequire(\'../../../../foo\');\n' +
						'require(\'../bar\');\n', "Deeper module");
				}),
				readFile(resolve(workingPath, 'outer/deep/twodepth/elo/some.txt'))(function (text) {
					a(String(text), 'foo-text\n', "Non module");
				}),
				stat(resolve(workingPath, 'inner'))(a.never, function (e) {
					a(e.code, 'ENOENT', "Original deleted");
				})
			);
		});
	})(function () {
		var from = resolve(workingPath, 'case-sensitive');
		return t(from, resolve(workingPath, 'CASE-SENSITIVE'))(function () {
			return deferred(
				readFile(resolve(workingPath, 'CASE-SENSITIVE/bar.js'))(function (code) {
					a(String(code), 'require(\'../../test.json\')\n');
				})
			);
		});
	})(function () {
		return rmdir(workingPath, { recursive: true, force: true });
	}).done(function () { d(); }, d);
};
