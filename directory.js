'use strict';

var ensureString   = require('es5-ext/object/validate-stringifiable-value')
  , startsWith     = require('es5-ext/string/#/starts-with')
  , deferred       = require('deferred')
  , readdir        = require('fs2/readdir')
  , stat           = require('fs2/stat')
  , rmdir          = require('fs2/rmdir')
  , path           = require('path')
  , resolveRoot    = require('cjs-module/resolve-package-root')
  , moveModule     = require('./module')

  , stringify = JSON.stringify
  , sep = path.sep, basename = path.basename, resolve = path.resolve
  , readdirOpts = { depth: Infinity, type: { file: true },
		ignoreRules: 'git',
		dirFilter: function (path) { return (basename(path) !== 'node_modules'); } };

module.exports = function (from, to) {
	from = resolve(ensureString(from));
	to = resolve(ensureString(to));

	// Validate arguments and resolve initial data
	return deferred(resolveRoot(from), stat(to).then(function (stats) {
		if (!stat.isDirectory()) {
			throw new Error("Target path " + stringify(to) + " is taken and it's not a directory");
		}
	}, function (err) {
		if (err.code === 'ENOENT') return null;
		throw err;
	}))(function (data) {
		var root = data[0];
		if (!root) {
			throw new Error("Unable to resolve package root (renamed directory is expected to be " +
				"placed in scope of some package");
		}
		if (root === from) throw new Error("Reanamed directory should not be package root directory");
		if (!startsWith.call(to, root + sep)) {
			throw new Error("Cannot reliably move modules out of current package");
		}

		return readdir(from, readdirOpts).reduce(function (ignore, file) {
			return moveModule(resolve(from, file), resolve(to, file));
		}, null);
	})(function () {
		return rmdir(from, { recursive: true }).catch(function (e) {
			if (e.code !== 'ENOTEMPTY') throw e;
			throw new Error("All applicabble modules moved. However original directory could not be " +
				" removed due to other (non applicable) files " +
				"(e.g. symlinks, ignored by git, or node_modules content) residing in it");
		});
	});
};
