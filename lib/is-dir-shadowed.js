// Wether require for `./path/to/dir` actually requires `dir/index.js`
// or eventual `dir.js` module residing in upper path

'use strict';

var startsWith    = require('es5-ext/string/#/starts-with')
  , resolveModule = require('cjs-module/resolve')
  , path          = require('path')

  , basename = path.basename, dirname = path.dirname;

module.exports = function (dir) {
	return resolveModule(dirname(dir), './' + basename(dir))(function (modulePath) {
		if (!modulePath) return false;
		return !startsWith.call(modulePath, dir + '/');
	});
};
