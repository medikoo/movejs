// Moves either directory or module file to other location

'use strict';

var ensureString    = require('es5-ext/object/validate-stringifiable-value')
  , resolve         = require('path').resolve
  , lstat           = require('fs2/lstat')
  , renameDirectory = require('./directory')
  , renameModule    = require('./module');

module.exports = function (from, to) {
	return lstat(resolve(ensureString(from)))(function (stats) {
		if (stats.isDirectory()) return renameDirectory(from, to);
		if (stats.isFile()) return renameModule(from, to);
		throw new TypeError("Unsupported file type");
	});
};
