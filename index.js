// Moves either directory or module file to other location

'use strict';

var ensureString    = require('es5-ext/object/validate-stringifiable-value')
  , resolve         = require('path').resolve
  , deferred        = require('deferred')
  , lstat           = require('fs2/lstat')
  , renameDirectory = require('./directory')
  , renameModule    = require('./module');

module.exports = function (from, to) {
	return lstat(resolve(ensureString(from)))(function (stats) {

		// Dealing with case sensitive move by moving the original to a temporary location
		// then move the temporary location to the destination.
		// @Method: Temporary rename target to .movejstmp folder
		// then rename it again to the original target name
		var temporaryTo;
		var promise;

		if (from !== to && from.toLowerCase() === to.toLowerCase()) {
			temporaryTo = resolve(to, '../.movejstmp');
			if (stats.isDirectory()) promise = deferred(renameDirectory(from, temporaryTo));
			if (stats.isFile()) promise = deferred(renameModule(from, temporaryTo));
		}

		if (stats.isDirectory()) {
			return deferred(promise)(function () {
				return renameDirectory(temporaryTo || from, to);
			});
		}
		if (stats.isFile()) {
			return deferred(promise)(function () {
				return renameModule(temporaryTo || from, to);
			});
		}

		throw new TypeError("Unsupported file type");
	});
};
