// Moves directory of modules to other location

"use strict";

var copy           = require("es5-ext/object/copy")
  , ensureString   = require("es5-ext/object/validate-stringifiable-value")
  , escape         = require("es5-ext/reg-exp/escape")
  , startsWith     = require("es5-ext/string/#/starts-with")
  , deferred       = require("deferred")
  , debug          = require("debug")("movejs")
  , findRequires   = require("find-requires")
  , rename         = require("fs2/rename")
  , readdir        = require("fs2/readdir")
  , readFile       = require("fs2/read-file")
  , writeFile      = require("fs2/write-file")
  , lstat          = require("fs2/lstat")
  , unlink         = require("fs2/unlink")
  , path           = require("path")
  , resolvePosix   = require("path2/posix/resolve")
  , resolveRoot    = require("cjs-module/resolve-package-root")
  , isPathExternal = require("cjs-module/utils/is-path-external")
  , isModule       = require("./lib/is-module")
  , normalize      = require("./lib/normalize-local-path")
  , rmdir          = require("./lib/rmdir")
  , toPosix        = require("./lib/to-posix")
  , isDirShadowed  = require("./lib/is-dir-shadowed")

  , push = Array.prototype.push, create = Object.create, stringify = JSON.stringify
  , sep = path.sep, basename = path.basename, dirname = path.dirname, extname = path.extname
  , resolve = path.resolve
  , findRequiresOpts = { raw: true }
  , jsModulesPattern = new RegExp(escape(sep) + "(?:[^.]+|.+\\.js)$");

var readdirOpts = { depth: Infinity,
type: { file: true },
ignoreRules: "git",
stream: true,
	dirFilter: function (path) { return (basename(path) !== "node_modules"); } };

module.exports = function (source, dest) {
	var sourcePosix, destPosix;
	source = resolve(ensureString(source));
	dest = resolve(ensureString(dest));
	sourcePosix = toPosix(source);
	destPosix = toPosix(dest);

	// Validate arguments and resolve initial data
	return deferred(resolveRoot(source), lstat(dest).then(function (stats) {
		throw new Error("Target path " + stringify(dest) + " already exists");
	}, function (err) {
		if (err && (err.code === "ENOENT")) return null;
		throw err;
	}))(function (data) {
		var root = data[0], rootPrefixLength = root.length + 1
		  , movedModules = create(null), dirReader, filePromises = [];
		if (!root) {
			throw new Error("Unable to resolve package root (renamed directory is expected to be " +
				"placed in scope of some package");
		}
		if (root === source) throw new Error("Renamed directory should not be package root directory");
		if (!startsWith.call(dest, root + sep)) {
			throw new Error("Cannot reliably move modules out of current package");
		}

		dirReader = readdir(source, readdirOpts);
		dirReader.on("change", function (event) {
			push.apply(filePromises, event.added.map(function (file) {
				var sourceFilename = resolve(source, file), destFilename = resolve(dest, file);
				return isModule(sourceFilename)(function (is) {
					var ext;
					debug("%s -> %s", sourceFilename.slice(rootPrefixLength),
						destFilename.slice(rootPrefixLength));

					// If not a module, just rename file and exit
					if (!is) return rename(sourceFilename, destFilename, { intermediate: true });

					movedModules[sourceFilename] = destFilename;

					ext = extname(sourceFilename);
					if (ext && (ext !== ".js")) {
						// If module is not a JS module, then just register it and move along
						return rename(sourceFilename, destFilename, { intermediate: true });
					}

					// If directory was just renamed (stays in same location), we could probably
					// ignore checking of require paths, as logically they should stay same
					// still error happens when devs write "get out & get in" requires
					// e.g. in 'dwa/trzy.js' module '../dwa/other.js' will break if we rename 'dwa' folder
					// It would be good to not leave such issues, therefore require paths are
					// unconditionally confirmed

					// Assure correct requires in moved files
					return readFile(sourceFilename)(function (code) {
						var sourceFilenameDir = toPosix(dirname(sourceFilename))
						  , destFilenameDir = toPosix(dirname(destFilename)), deps;

						code = String(code);
						try {
							deps = findRequires(code, findRequiresOpts);
						} catch (e) {
							debug("error %s: %s", sourceFilename.slice(rootPrefixLength), e.message);
							deps = [];
						}
						return deferred.map(deps.filter(function (data) {
							// Ignore dynamic & external package requires
							return ((data.value != null) && !isPathExternal(data.value));
						}), function (data) {
							var oldFullPath = resolvePosix(sourceFilenameDir, data.value)
							  , oldPath, nuPath;

							// If require doesn't reach out beyond moved folder ignore it
							if (startsWith.call(oldFullPath, sourcePosix + "/")) return;

							oldPath = normalize(oldFullPath, sourceFilenameDir);
							nuPath = normalize(oldFullPath, destFilenameDir);

							// Path stays same (usual case when directory was just renamed)
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
					})(function (nuCode) {
						return lstat(sourceFilename)(function (stats) {
							return deferred(writeFile(destFilename, nuCode,
								{ mode: stats.mode, intermediate: true }), unlink(sourceFilename));
						});
					});
				});
			}));
		});
		return deferred(
			dirReader(function () { return deferred.map(filePromises); }),
			deferred(isDirShadowed(source), isDirShadowed(dest))(function (data) {
				var customReaddirOpts = copy(readdirOpts), filePromises = []
				  , isSourceShadowed = data[0], isDestShadowed = data[1];
				customReaddirOpts.dirFilter = function (path) {
					if (path === source) return false;
					if (path === dest) return false;
					return readdirOpts.dirFilter(path);
				};
				customReaddirOpts.pattern = jsModulesPattern;

				// Find outer modules that require moved modules
				dirReader = readdir(root, customReaddirOpts);
				dirReader.on("change", function (event) {
					push.apply(filePromises, event.added.map(function (file) {
						var filename = resolve(root, file);
						return isModule(filename)(function (is) {
							if (!is) return;
							// Find if JS module contains a require to renamed module
							return readFile(filename)(function (code) {
								var dir = toPosix(dirname(filename)), deps;
								code = String(code);
								try {
									deps = findRequires(code, findRequiresOpts);
								} catch (e) {
									debug("error %s: %s", filename.slice(rootPrefixLength), e.message);
									deps = [];
								}
								return deferred.map(deps, function (data) {
									var modulePath, moduleFullPath;
									// Ignore dynamic & external packages requires
									if ((data.value == null) || isPathExternal(data.value)) return;

									modulePath = normalize(data.value, dir);
									moduleFullPath = resolvePosix(dir, modulePath);

									if (sourcePosix === moduleFullPath) {
										if (isSourceShadowed) return;
										// Require of moved directory
										data.nuValue = normalize(destPosix, dir);
										if (isDestShadowed) data.nuValue += "/";
										return data;
									}
									// Ignore requires not directing to moved directory
									if (!startsWith.call(moduleFullPath, sourcePosix + "/")) return;

									data.nuValue = normalize(destPosix + "/" +
										moduleFullPath.slice(sourcePosix.length + 1), dir);
									return data;
								})(function (result) {
									var diff;
									result = result.filter(Boolean);
									if (!result.length) return;

									diff = 0;
									result.forEach(function (reqData) {
										var nuRaw = stringify(reqData.nuValue).slice(1, -1);
										code = code.slice(0, reqData.point + diff) + nuRaw +
											code.slice(reqData.point + diff + reqData.raw.length - 2);
										diff += nuRaw.length - (reqData.raw.length - 2);
									});
									debug("rewrite %s", filename.slice(rootPrefixLength));
									return writeFile(filename, code);
								});
							});
						});
					}));
				});
				return dirReader(function () { return deferred.map(filePromises); });
			})
		);
	})(function () { return rmdir(source); });
};
