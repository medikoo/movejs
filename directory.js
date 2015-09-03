'use strict';

var ensureString   = require('es5-ext/object/validate-stringifiable-value')
  , startsWith     = require('es5-ext/string/#/starts-with')
  , deferred       = require('deferred')
  , debug          = require('debug-ext')('rename-module:directory')
  , rename         = require('fs2/rename')
  , readdir        = require('fs2/readdir')
  , stat           = require('fs2/stat')
  , path           = require('path')
  , resolveRoot    = require('cjs-module/resolve-package-root')
  , moveModule     = require('./module')
  , isModule       = require('./lib/is-module')
  , rmdir          = require('./lib/rmdir')

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
		var root = data[0], rootPrefixLength = root.length + 1;
		if (!root) {
			throw new Error("Unable to resolve package root (renamed directory is expected to be " +
				"placed in scope of some package");
		}
		if (root === from) throw new Error("Renamed directory should not be package root directory");
		if (!startsWith.call(to, root + sep)) {
			throw new Error("Cannot reliably move modules out of current package");
		}

		debug('%s -> %s', from.slice(rootPrefixLength), to.slice(rootPrefixLength));
		return readdir(from, readdirOpts).reduce(function (ignore, file, index, files) {
			var filename = resolve(from, file), targetFilename = resolve(to, file);
			debug('%s/%s', index + 1, files.length);
			return isModule(filename)(function (is) {
				if (is) return moveModule(filename, targetFilename);
				debug('rename %s to %s', filename.slice(rootPrefixLength),
					targetFilename.slice(rootPrefixLength));
				return rename(filename, targetFilename, { intermediate: true });
			});
		}, null);
	})(function () { return rmdir(from); });
};
