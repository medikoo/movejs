'use strict';

var deferred = require('deferred')
  , resolve  = require('path').resolve
  , rmdir    = require('fs2/rmdir')
  , readFile = require('fs2/read-file')
  , copy     = deferred.promisify(require('fs-extra').copy)

  , pgInitPath = resolve(__dirname, '__playground/test-package')
  , pgWorkingPath = resolve(__dirname, '__playground/test-package-work');

module.exports = function (t, a, d) {
	copy(pgInitPath, pgWorkingPath)(function () {
		var from = resolve(pgWorkingPath, 'inner/twodepth/bar.js');
		return t(from, resolve(pgWorkingPath, 'top-bar.js'))(function () {
			return deferred(
				readFile(resolve(pgWorkingPath, 'top-bar.js'))(function (code) {
					a(String(code), 'require(\'./foo\');\nrequire(\'./inner/twodepth/marko\');\n' +
						'require(\'./inner/twodepth/elo/miszka\');\n', "Moved module");
				}),
				readFile(resolve(pgWorkingPath, 'foo.js'))(function (code) {
					a(String(code), 'require(\'./top-bar\');\nrequire(\'./inner/twodepth/marko\');\n' +
						'require(\'./top-bar\');\n', "Root module");
				}),
				readFile(resolve(pgWorkingPath, 'inner/twodepth/marko.js'))(function (code) {
					a(String(code), 'require(\'../../top-bar\');\n', "Aside module");
				}),
				readFile(resolve(pgWorkingPath, 'inner/twodepth/elo/miszka.js'))(function (code) {
					a(String(code), 'require(\'../../../top-bar\');\nrequire(\'../../../foo\');\n' +
						'require(\'../../../top-bar\');\n', "Deeper module");
				}),
				readFile(resolve(pgWorkingPath, 'inner/twodepth/bar.js'))(a.never, function (e) {
					a(e.code, 'ENOENT', "Original deleted");
				})
			);
		});
	})(function () {
		return rmdir(pgWorkingPath, { recursive: true, force: true });
	}).done(function () { d(); }, d);
};
