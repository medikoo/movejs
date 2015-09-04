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
  , relative       = require('path2/posix/relative')
  , resolveModule  = require('cjs-module/resolve')
  , resolveRoot    = require('cjs-module/resolve-package-root')
  , isPathExternal = require('cjs-module/utils/is-path-external')
  , isModule       = require('./lib/is-module')
  , normalize      = require('./lib/normalize-local-path')
  , toPosix        = require('./lib/to-posix')

  , push = Array.prototype.push, stringify = JSON.stringify
  , basename = path.basename, extname = path.extname, sep = path.sep, dirname = path.dirname
  , resolve = path.resolve
  , findRequiresOpts = { raw: true };

var readdirOpts = { depth: Infinity, type: { file: true }, stream: true,
	dirFilter: function (path) { return (basename(path) !== 'node_modules'); },
	ignoreRules: 'git', pattern: new RegExp(escape(sep) + '(?:[^.]+|.+\\.js)$') };

module.exports = function (source, dest) {
	var sourcePosix, destPosix;
	source = resolve(ensureString(source));
	dest = resolve(ensureString(dest));
	sourcePosix = toPosix(source);
	destPosix = toPosix(dest);

	// Validate arguments and resolve initial data
	return deferred(stat(source), resolveRoot(dirname(source)), stat(dest).then(function () {
		throw new Error("Target path " + stringify(dest) + " is not empty");
	}, function (err) {
		if (err.code === 'ENOENT') return null;
		throw err;
	}))(function (data) {
		var fileStats = data[0], root = data[1], dirReader, filePromises, modulesToUpdate
		  , sourceExt = extname(source)
		  , rootPrefixLength = root.length + 1, trimmedPathStatus;

		if (!fileStats.isFile()) {
			throw new Error("Input module " + stringify(source) + " is not a file");
		}
		if (!root) {
			throw new Error("Unable to resolve package root (renamed module is expected to be placed " +
				"in scope of some package");
		}
		if (!startsWith.call(dest, root + sep)) {
			throw new Error("Cannot reliably move module out of current package");
		}

		// Find all JS modules in a package
		debug('%s -> %s', source.slice(rootPrefixLength), dest.slice(rootPrefixLength));
		debug('gather local modules at %s', root);
		dirReader = readdir(root, readdirOpts);
		filePromises = [];
		modulesToUpdate = [];
		dirReader.on('change', function (event) {
			push.apply(filePromises, event.added.map(function (path) {
				var filename = resolve(root, path);
				if (filename === source) return;
				return isModule(filename)(function (is) {
					if (!is) return;

					// Find if JS module contains a require to renamed module
					return readFile(filename)(function (code) {
						var dir = toPosix(dirname(filename)), expectedPathFull = relative(dir, sourcePosix)
						  , expectedPathTrimmed;
						if (expectedPathFull[0] !== '.') expectedPathFull = './' + expectedPathFull;
						expectedPathTrimmed = expectedPathFull.slice(0, -extname(expectedPathFull).length);
						code = String(code);
						return deferred.map(findRequires(code, findRequiresOpts), function (data) {
							var modulePath;
							// Ignore requires to external packages
							if (isPathExternal(data.value)) return;

							modulePath = normalize(data.value, dir);

							// Check full path match, e.g. ./foo/bar.js (for ./foo/bar.js file)
							if (expectedPathFull === modulePath) return data;
							// Check trimmed path match, e.g. ./foo/bar (for ./foo/bar.js file)
							if (expectedPathTrimmed !== modulePath) return;
							// Validate whether trimmed path matches
							// If input module is .js file, then it surely will be matched (.js has priority)
							if (sourceExt === '.js') return data;
							// Otherwise check whether some other module is not matched over moved one
							// e.g. if there's foo.json and foo.js, requiring './foo' will match foo.js
							// This check can be done once, therefore we keep once resolved value
							if (!trimmedPathStatus) trimmedPathStatus = resolveModule(dir, data.value);
							return trimmedPathStatus(function (requiredFilename) {
								if (source === requiredFilename) return data;
							});
						})(function (result) {
							result = result.filter(Boolean);
							if (!result.length) return;
							// Matching path(s) found, add module to rewrite queue
							modulesToUpdate.push({ filename: filename, dirname: dir,
								code: code, requires: result });
						});
					});
				});
			}));
		});
		return dirReader(function () {
			// Wait until all local modules are parsed
			return deferred.map(filePromises).aside(function () {
				debug('found %s dependents', modulesToUpdate.length);
			});
		})(function () {
			// Rename module, and update require paths within it
			return readFile(source)(function (code) {
				var sourceDir = toPosix(dirname(source)), ext = extname(source)
				  , destDir = toPosix(dirname(dest));
				code = String(code);
				// If not JS module, then no requires to parse
				if (ext && (ext !== '.js')) return code;
				// If module was renamed in same folder, then local paths will not change
				// (corner case would be requiring self module, but we assume nobody does that)
				if (sourceDir === destDir) return code;
				return isModule(source)(function (is) {
					var relPath;
					// If not JS module, then no requires to parse
					if (!is) return code;
					relPath = normalize(relative(destDir, sourceDir)) + '/';
					return deferred.map(findRequires(code, findRequiresOpts).filter(function (data) {
						// Ignore external package requires
						return !isPathExternal(data.value);
					}), function (data) {
						var oldPath = normalize(data.value)
						  , nuPath = normalize(destDir + '/' + relPath + oldPath, destDir);
						if (nuPath === oldPath) return;
						data.nuPath = nuPath;
						return data;
					})(function (requires) {
						var diff = 0;
						requires.filter(Boolean).forEach(function (reqData) {
							var nuPath = reqData.nuPath
							  , nuPathExt = extname(nuPath);
							var nuRaw = stringify((nuPathExt && !extname(reqData.value))
								? nuPath.slice(0, -nuPathExt.length) : nuPath).slice(1, -1);
							code = code.slice(0, reqData.point + diff) + nuRaw +
								code.slice(reqData.point + diff + reqData.raw.length - 2);
							diff += nuRaw.length - (reqData.raw.length - 2);
						});
						return code;
					});
				});
			})(function (nuCode) {
				debug('rewrite %s to %s', source.slice(rootPrefixLength), dest.slice(rootPrefixLength));
				return deferred(writeFile(dest, nuCode, { mode: fileStats.mode, intermediate: true }));
			});
		})(function () {
			if (!modulesToUpdate.length) return;

			// Update affected requires in modules that require renamed module
			return deferred.map(modulesToUpdate, function (data) {
				var nuPath = normalize(relative(data.dirname, destPosix))
				  , nuPathExt = extname(nuPath)
				  , diff = 0, code = data.code;

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
		});
	})(function () { return unlink(source); });
};
