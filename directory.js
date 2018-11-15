// Moves directory of modules to other location

"use strict";

var copy           = require("es5-ext/object/copy")
  , isValue        = require("es5-ext/object/is-value")
  , ensureString   = require("es5-ext/object/validate-stringifiable-value")
  , reEscape       = require("es5-ext/reg-exp/escape")
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
  , isDirShadowed  = require("./lib/is-dir-shadowed");

var push = Array.prototype.push
  , create = Object.create
  , stringify = JSON.stringify
  , sep = path.sep
  , basename = path.basename
  , dirname = path.dirname
  , extname = path.extname
  , resolve = path.resolve
  , findRequiresOpts = { raw: true }
  , jsModulesPattern = new RegExp(reEscape(sep) + "(?:[^.]+|.+\\.js)$");

var readdirOpts = {
	depth: Infinity,
	type: { file: true },
	ignoreRules: "git",
	stream: true,
	dirFilter: function (dirPath) { return basename(dirPath) !== "node_modules"; }
};

module.exports = function (source, dest) {
	var sourcePosix, destPosix;
	source = resolve(ensureString(source));
	dest = resolve(ensureString(dest));
	sourcePosix = toPosix(source);
	destPosix = toPosix(dest);

	// Validate arguments and resolve initial data
	return deferred(
		resolveRoot(source),
		lstat(dest).then(
			function () { throw new Error("Target path " + stringify(dest) + " already exists"); },
			function (err) {
				if (err && err.code === "ENOENT") return null;
				throw err;
			}
		)
	)(function (data) {
		var root = data[0]
		  , rootPrefixLength = root.length + 1
		  , movedModules = create(null)
		  , dirReader
		  , filePromises = [];
		if (!root) {
			throw new Error(
				"Unable to resolve package root (renamed directory is expected to be " +
					"placed in scope of some package"
			);
		}
		if (root === source) {
			throw new Error("Renamed directory should not be package root directory");
		}
		if (!startsWith.call(dest, root + sep)) {
			throw new Error("Cannot reliably move modules out of current package");
		}

		dirReader = readdir(source, readdirOpts);
		dirReader.on("change", function (event) {
			push.apply(
				filePromises,
				event.added.map(function (file) {
					var sourceFilename = resolve(source, file), destFilename = resolve(dest, file);
					return isModule(sourceFilename)(function (is) {
						var ext;
						debug(
							"%s -> %s", sourceFilename.slice(rootPrefixLength),
							destFilename.slice(rootPrefixLength)
						);

						// If not a module, just rename file and exit
						if (!is) {
							return rename(sourceFilename, destFilename, { intermediate: true });
						}

						movedModules[sourceFilename] = destFilename;

						ext = extname(sourceFilename);
						if (ext && ext !== ".js") {
							// If module is not a JS module, then just register it and move along
							return rename(sourceFilename, destFilename, { intermediate: true });
						}

						// If directory was just renamed (stays in same location), we could probably
						// ignore checking of require paths, as logically they should stay same
						// still error happens when devs write "get out & get in" requires
						// e.g. in 'dwa/trzy.js' module '../dwa/other.js' will break if we
						// rename 'dwa' folder
						// It would be good to not leave such issues, therefore require paths are
						// unconditionally confirmed

						// Assure correct requires in moved files
						return readFile(sourceFilename)(function (code) {
							var sourceFilenameDir = toPosix(dirname(sourceFilename))
							  , destFilenameDir = toPosix(dirname(destFilename))
							  , deps;

							code = String(code);
							try {
								deps = findRequires(code, findRequiresOpts);
							} catch (e) {
								debug(
									"error %s: %s", sourceFilename.slice(rootPrefixLength),
									e.message
								);
								deps = [];
							}
							return deferred.map(
								deps.filter(function (depData) {
									// Ignore dynamic & external package requires
									return isValue(depData.value) && !isPathExternal(depData.value);
								}),
								function (depData) {
									var oldFullPath = resolvePosix(sourceFilenameDir, depData.value)
									  , oldPath
									  , nuPath;

									// If require doesn't reach out beyond moved folder ignore it
									if (startsWith.call(oldFullPath, sourcePosix + "/")) {
										return null;
									}

									oldPath = normalize(oldFullPath, sourceFilenameDir);
									nuPath = normalize(oldFullPath, destFilenameDir);

									// Path stays same (usual case when directory was just renamed)
									if (nuPath === oldPath) return null;
									depData.nuPath = nuPath;
									return depData;
								}
							)(function (requires) {
								var diff = 0;
								requires.filter(Boolean).forEach(function (reqData) {
									var nuPath = reqData.nuPath, nuPathExt = extname(nuPath);
									var nuRaw = stringify(
										nuPathExt && !extname(reqData.value)
											? nuPath.slice(0, -nuPathExt.length)
											: nuPath
									).slice(1, -1);
									code =
										code.slice(0, reqData.point + diff) +
										nuRaw +
										code.slice(reqData.point + diff + reqData.raw.length - 2);
									diff += nuRaw.length - (reqData.raw.length - 2);
								});
								return code;
							});
						})(function (nuCode) {
							return lstat(
								sourceFilename
							)(function (stats) {
								return deferred(
									writeFile(destFilename, nuCode, {
										mode: stats.mode,
										intermediate: true
									}),
									unlink(sourceFilename)
								);
							});
						});
					});
				})
			);
		});
		return deferred(
			dirReader(function () { return deferred.map(filePromises); }),
			deferred(isDirShadowed(source), isDirShadowed(dest))(function (dirData) {
				var customReaddirOpts = copy(readdirOpts)
				  , filePromises2 = []
				  , isSourceShadowed = dirData[0]
				  , isDestShadowed = dirData[1];
				customReaddirOpts.dirFilter = function (dirPath) {
					if (dirPath === source) return false;
					if (dirPath === dest) return false;
					return readdirOpts.dirFilter(dirPath);
				};
				customReaddirOpts.pattern = jsModulesPattern;

				// Find outer modules that require moved modules
				dirReader = readdir(root, customReaddirOpts);
				dirReader.on("change", function (event) {
					push.apply(
						filePromises2,
						event.added.map(function (file) {
							var filename = resolve(root, file);
							return isModule(filename)(function (is) {
								if (!is) return null;
								// Find if JS module contains a require to renamed module
								return readFile(filename)(function (code) {
									var dir = toPosix(dirname(filename)), deps;
									code = String(code);
									try {
										deps = findRequires(code, findRequiresOpts);
									} catch (e) {
										debug(
											"error %s: %s", filename.slice(rootPrefixLength),
											e.message
										);
										deps = [];
									}
									return deferred.map(deps, function (depData) {
										var modulePath, moduleFullPath;
										// Ignore dynamic & external packages requires
										if (
											!isValue(depData.value) ||
											isPathExternal(depData.value)
										) {
											return null;
										}

										modulePath = normalize(depData.value, dir);
										moduleFullPath = resolvePosix(dir, modulePath);

										if (sourcePosix === moduleFullPath) {
											if (isSourceShadowed) return null;
											// Require of moved directory
											depData.nuValue = normalize(destPosix, dir);
											if (isDestShadowed) depData.nuValue += "/";
											return depData;
										}
										// Ignore requires not directing to moved directory
										if (!startsWith.call(moduleFullPath, sourcePosix + "/")) {
											return null;
										}

										depData.nuValue = normalize(
											destPosix +
												"/" +
												moduleFullPath.slice(sourcePosix.length + 1),
											dir
										);
										return depData;
									})(function (result) {
										var diff;
										result = result.filter(Boolean);
										if (!result.length) return null;

										diff = 0;
										result.forEach(function (reqData) {
											var nuRaw = stringify(reqData.nuValue).slice(1, -1);
											code =
												code.slice(0, reqData.point + diff) +
												nuRaw +
												code.slice(
													reqData.point + diff + reqData.raw.length - 2
												);
											diff += nuRaw.length - (reqData.raw.length - 2);
										});
										debug("rewrite %s", filename.slice(rootPrefixLength));
										return writeFile(filename, code);
									});
								});
							});
						})
					);
				});
				return dirReader(function () { return deferred.map(filePromises2); });
			})
		);
	})(function () { return rmdir(source); });
};
