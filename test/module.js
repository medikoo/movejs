'use strict';

var deferred = require('deferred')
  , resolve  = require('path').resolve
  , rmdir    = require('fs2/rmdir')
  , readFile = require('fs2/read-file')
  , copy     = deferred.promisify(require('fs-extra').copy)

  , pgInitPath = resolve(__dirname, '__playground/test-package')
  , pgWorkingPath = resolve(__dirname, '__playground/test-package-work');

module.exports = function (t, a, d, workingPath) {
	if (!workingPath) workingPath = pgWorkingPath;
	copy(pgInitPath, workingPath)(function () {
		var from = resolve(workingPath, 'inner/twodepth/bar.js');
		return t(from, resolve(workingPath, 'top-bar.js'))(function () {
			return deferred(
				readFile(resolve(workingPath, 'top-bar.js'))(function (code) {
					a(String(code), 'require(\'./foo\');\nrequire(\'./inner/twodepth/marko\');\n' +
						'require(\'./inner/twodepth/elo/miszka\');\n', "Moved module");
				}),
				readFile(resolve(workingPath, 'foo.js'))(function (code) {
					a(String(code), 'require(\'./top-bar\');\nrequire(\'./inner/twodepth/marko\');\n' +
						'require(\'./top-bar\');\nrequire(\'./inner\');\n', "Root module");
				}),
				readFile(resolve(workingPath, 'inner/twodepth/marko.js'))(function (code) {
					a(String(code), 'require(\'../../top-bar\');\n', "Aside module");
				}),
				readFile(resolve(workingPath, 'inner/twodepth/elo/miszka.js'))(function (code) {
					a(String(code), 'require(\'../../../top-bar\');\nrequire(\'../../../foo\');\n' +
						'require(\'../../../top-bar\');\n', "Deeper module");
				}),
				readFile(resolve(workingPath, 'inner/twodepth/bar.js'))(a.never, function (e) {
					a(e.code, 'ENOENT', "Original deleted");
				})
			);
		})(function () {
			var from = resolve(workingPath, 'test-module-dir/index.js');
			return t(from, resolve(workingPath, 'moved-module-dir.js'))(function () {
				return readFile(resolve(workingPath, 'test-module.js'))(function (code) {
					a(String(code), 'require(\'./moved-module-dir\');\n', "Moved module dir");
				});
			});
		});
	})(function () {
		var from = resolve(workingPath, 'case-sensitive/bar.js');
		return t(from, resolve(workingPath, 'case-sensitive/BAR.js'))(function () {
			return deferred(
				readFile(resolve(workingPath, 'case-sensitive/BAR.js'))(function (code) {
					a(String(code), 'require(\'../../test.json\')\n');
				})
			);
		});
	})(function () {
		return rmdir(workingPath, { recursive: true, force: true });
	}).done(function () { d(); }, d);
};
