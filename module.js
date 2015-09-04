'use strict';

var ensureString   = require('es5-ext/object/validate-stringifiable-value')
  , escape         = require('es5-ext/reg-exp/escape')
  , startsWith     = require('es5-ext/string/#/starts-with')
  , deferred       = require('deferred')
  , findRequires   = require('find-requires')
  , debug          = require('debug-ext')('rename-module:module')
  , readdir        = require('fs2/readdir')
  , stat           = require('fs2/stat')
  , readFile       = require('fs2/read-file')
  , writeFile      = require('fs2/write-file')
  , unlink         = require('fs2/unlink')
  , path           = require('path')
  , normalize      = require('path2/posix/normalize')
  , relative       = require('path2/posix/relative')
  , resolveModule  = require('cjs-module/resolve')
  , resolveRoot    = require('cjs-module/resolve-package-root')
  , isPathExternal = require('cjs-module/utils/is-path-external')
  , isModule       = require('./lib/is-module')

  , push = Array.prototype.push, stringify = JSON.stringify
  , basename = path.basename, extname = path.extname, sep = path.sep, dirname = path.dirname
  , resolve = path.resolve
  , findRequiresOpts = { raw: true };

var readdirOpts = { depth: Infinity, type: { file: true }, stream: true,
	dirFilter: function (path) { return (basename(path) !== 'node_modules'); },
	ignoreRules: 'git', pattern: new RegExp(escape(sep) + '(?:[^.]+|.+\\.js)$') };

module.exports = function (from, to) {
	from = resolve(ensureString(from));
	to = resolve(ensureString(to));

	// Validate arguments and resolve initial data
	return deferred(stat(from), resolveRoot(dirname(from)), stat(to).then(function () {
		throw new Error("Target path " + stringify(to) + " is not empty");
	}, function (err) {
		if (err.code === 'ENOENT') return null;
		throw err;
	}))(function (data) {
		var fileStats = data[0], root = data[1], dirReader, filePromises, modulesToUpdate
		  , rootPrefixLength = root.length + 1;

		if (!fileStats.isFile()) throw new Error("Input module " + stringify(from) + " is not a file");
		if (!root) {
			throw new Error("Unable to resolve package root (renamed module is expected to be placed " +
				"in scope of some package");
		}
		if (!startsWith.call(to, root + sep)) {
			throw new Error("Cannot reliably move module out of current package");
		}

		// Find all JS modules in a package
		debug('%s -> %s', from.slice(rootPrefixLength), to.slice(rootPrefixLength));
		debug('gather local modules at %s', root);
		dirReader = readdir(root, readdirOpts);
		filePromises = [];
		modulesToUpdate = [];
		dirReader.on('change', function (event) {
			push.apply(filePromises, event.added.map(function (path) {
				var filename = resolve(root, path);
				if (filename === from) return;
				return isModule(filename)(function (is) {
					if (!is) return;

					// Find if JS module contains a require to renamed module
					return readFile(filename)(function (code) {
						var dir = dirname(filename), expectedPathFull = relative(dir, from)
						  , expectedPathTrimmed;
						if (expectedPathFull[0] !== '.') expectedPathFull = './' + expectedPathFull;
						expectedPathTrimmed = expectedPathFull.slice(0, -extname(expectedPathFull).length);
						code = String(code);
						return deferred.map(findRequires(code, findRequiresOpts), function (data) {
							var modulePath;
							if (isPathExternal(data.value)) return;
							modulePath = normalize(data.value);
							if (modulePath[0] === '/') modulePath = relative(filename, modulePath);
							else if (modulePath[0] !== '.') modulePath = './' + modulePath;
							if (expectedPathFull === modulePath) return data;
							if (expectedPathTrimmed !== modulePath) return;
							return resolveModule(dir, data.value)(function (requiredFilename) {
								if (from === requiredFilename) return data;
							});
						})(function (result) {
							result = result.filter(Boolean);
							if (!result.length) return;
							modulesToUpdate.push({ filename: filename, dirname: dir,
								code: code, requires: result });
						});
					});
				});
			}));
		});
		return dirReader(function () { return deferred.map(filePromises); })(function () {
			debug('found %s dependents', modulesToUpdate.length);
			if (!modulesToUpdate.length) return;

			// Update affected requires in modules that require renamed module
			return deferred.map(modulesToUpdate, function (data) {
				var nuPath = relative(data.dirname, to)
				  , nuPathExt = extname(nuPath)
				  , diff = 0
				  , code = data.code;
				if (nuPath[0] !== '.') nuPath = './' + nuPath;
				data.requires.forEach(function (reqData) {
					var nuRaw = stringify((nuPathExt && !extname(reqData.value))
						? nuPath.slice(0, -nuPathExt.length) : nuPath).slice(1, -1);
					code = code.slice(0, reqData.point + diff) + nuRaw +
						code.slice(reqData.point + diff + reqData.raw.length - 2);
					diff += nuRaw.length - (reqData.raw.length - 2);
				});
				debug('rewrite %s', data.filename.slice(rootPrefixLength));
				return writeFile(data.filename, code);
			});
		})(function () {
			// Rename module, and update require paths within it
			return readFile(from)(function (code) {
				var dir = dirname(from), ext = extname(from);
				code = String(code);
				if (ext && (ext !== '.js')) return code;
				return isModule(from)(function (isJs) {
					if (!isJs) return code;
					return deferred.map(findRequires(code, findRequiresOpts).filter(function (data) {
						return !isPathExternal(data.value);
					}), function (data) {
						return resolveModule(dir, data.value)(function (path) {
							if (!path) return; // required module doesn't exist
							data.modulePath = path;
							return data;
						});
					})(function (requires) {
						var diff = 0, dir = dirname(to);
						requires.filter(Boolean).forEach(function (reqData) {
							var nuPath = relative(dir, reqData.modulePath)
							  , nuPathExt = extname(nuPath);
							if (nuPath[0] !== '.') nuPath = './' + nuPath;
							var nuRaw = stringify((nuPathExt && !extname(reqData.value))
								? nuPath.slice(0, -nuPathExt.length) : nuPath).slice(1, -1);
							code = code.slice(0, reqData.point + diff) + nuRaw +
								code.slice(reqData.point + diff + reqData.raw.length - 2);
							diff += nuRaw.length - (reqData.raw.length - 2);
						});
						return code;
					});
				});
			});
		})(function (nuCode) {
			debug('rewrite %s to %s', from.slice(rootPrefixLength), to.slice(rootPrefixLength));
			return deferred(writeFile(to, nuCode, { mode: fileStats.mode, intermediate: true }),
				unlink(from));
		});
	});
};
