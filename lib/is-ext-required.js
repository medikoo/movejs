'use strict';

var deferred      = require('deferred')
  , resolveModule = require('cjs-module/resolve')
  , path          = require('path')

  , basename = path.basename, dirname = path.dirname;

module.exports = function (filename, ext) {
	if (!ext) return deferred(true);
	if (ext === '.js') return deferred(false);
	return resolveModule(dirname(filename), './' + basename(filename).slice(0, -ext.length))(
		function (modulePath) { return modulePath ?  (filename !== modulePath) : false; }
	);
};
