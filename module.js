// Moves module to other location

"use strict";

var ensureString     = require("es5-ext/object/validate-stringifiable-value")
  , escape           = require("es5-ext/reg-exp/escape")
  , startsWith       = require("es5-ext/string/#/starts-with")
  , deferred         = require("deferred")
  , findRequires     = require("find-requires")
  , debug            = require("debug")("movejs")
  , readdir          = require("fs2/readdir")
  , lstat            = require("fs2/lstat")
  , readFile         = require("fs2/read-file")
  , writeFile        = require("fs2/write-file")
  , unlink           = require("fs2/unlink")
  , path             = require("path")
  , relative         = require("path2/posix/relative")
  , posixDirname     = require("path2/posix/dirname")
  , resolveRoot      = require("cjs-module/resolve-package-root")
  , isPathExternal   = require("cjs-module/utils/is-path-external")
  , isModule         = require("./lib/is-module")
  , normalize        = require("./lib/normalize-local-path")
  , toPosix          = require("./lib/to-posix")
  , isExtRequired    = require("./lib/is-ext-required")
  , isModuleDirIndex = require("./lib/is-module-dir-index")
  , isDirShadowed    = require("./lib/is-dir-shadowed");

var push = Array.prototype.push
  , stringify = JSON.stringify
  , basename = path.basename
  , extname = path.extname
  , sep = path.sep
  , dirname = path.dirname
  , resolve = path.resolve
  , findRequiresOpts = { raw: true };

var readdirOpts = {
	depth: Infinity,
	type: { file: true },
	stream: true,
	dirFilter: function (path) { return basename(path) !== "node_modules"; },
	ignoreRules: "git",
	pattern: new RegExp(escape(sep) + "(?:[^.]+|.+\\.js)$")
};

module.exports = function (source, dest) {
	var sourcePosix, destPosix;
	source = resolve(ensureString(source));
	dest = resolve(ensureString(dest));
	sourcePosix = toPosix(source);
	destPosix = toPosix(dest);

	// Validate arguments and resolve initial data
	return deferred(
		lstat(source),
		resolveRoot(dirname(source)),
		lstat(dest).then(
			function () { throw new Error("Target path " + stringify(dest) + " is not empty"); },
			function (err) {
				if (err && err.code === "ENOENT") return null;
				throw err;
			}
		)
	)(function (data) {
		var fileStats = data[0], root = data[1];

		if (!fileStats.isFile()) {
			throw new Error("Input module " + stringify(source) + " is not a file");
		}
		if (!root) {
			throw new Error(
				"Unable to resolve package root (renamed module is expected to be placed " +
					"in scope of some package"
			);
		}
		if (!startsWith.call(dest, root + sep)) {
			throw new Error("Cannot reliably move module out of current package");
		}

		return isModuleDirIndex(source)(function (isSourceDirIndex) {
			var sourceExt = extname(source)
			  , sourceDir = dirname(source)
			  , rootPrefixLength = root.length + 1
			  , dirReader
			  , filePromises
			  , isSourceExtRequired
			  , isDestExtRequired
			  , isSourceDirShadowed;

			return deferred(
				// 1. Rename module, and update require paths within it
				readFile(source)(function (code) {
					var sourceDirPosix = toPosix(sourceDir)
					  , ext = extname(source)
					  , destDir = toPosix(dirname(dest));
					code = String(code);
					// If not JS module, then no requires to parse
					if (ext && ext !== ".js") return code;
					// If module was renamed in same folder, then local paths will not change
					// (corner case would be requiring self module, but we assume nobody does that)
					if (sourceDirPosix === destDir) return code;
					return isModule(source)(function (is) {
						var relPath, deps;
						// If not JS module, then no requires to parse
						if (!is) return code;
						relPath = normalize(relative(destDir, sourceDirPosix)) + "/";
						try {
							deps = findRequires(code, findRequiresOpts);
						} catch (e) {
							debug("error %s: %s", source.slice(rootPrefixLength), e.message);
							deps = [];
						}
						return deferred.map(
							deps.filter(function (data) {
								// Ignore dynamic & external package requires
								return data.value != null && !isPathExternal(data.value);
							}),
							function (data) {
								var oldPath = normalize(data.value)
								  , nuPath = normalize(destDir + "/" + relPath + oldPath, destDir);
								if (nuPath === oldPath) return;
								data.nuPath = nuPath;
								return data;
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
					});
				})(function (nuCode) {
					debug("%s -> %s", source.slice(rootPrefixLength), dest.slice(rootPrefixLength));
					return writeFile(dest, nuCode, { mode: fileStats.mode, intermediate: true });
				}),
				// 2. Find all JS modules in a package and update paths of renamed file

				// In new location module may not be requireable with no extension provided
				// we need to assure that in such cases requires are not broken
				deferred(
					isExtRequired(dest, sourceExt)(function (result) {
						isDestExtRequired = result;
					}),
					isSourceDirIndex &&
						isDirShadowed(sourceDir)(function (result) {
							isSourceDirShadowed = result;
						})
				)(function () {
					dirReader = readdir(root, readdirOpts);
					filePromises = [];
					dirReader.on("change", function (event) {
						push.apply(
							filePromises,
							event.added.map(function (path) {
								var filename = resolve(root, path);
								if (filename === source) return;
								if (filename === dest) return;
								return isModule(filename)(function (is) {
									if (!is) return;

									// Find if JS module contains a require to renamed module
									return readFile(filename)(function (code) {
										var dir = toPosix(dirname(filename))
										  , expectedPathFull = relative(dir, sourcePosix)
										  , expectedPathTrimmed
										  , expectedDir
										  , deps;

										if (expectedPathFull[0] !== ".") expectedPathFull = "./" + expectedPathFull;
										expectedPathTrimmed = expectedPathFull.slice(
											0, -extname(expectedPathFull).length
										);
										if (isSourceDirIndex) expectedDir = posixDirname(expectedPathTrimmed);
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
										return deferred.map(deps, function (data) {
											var modulePath;
											// Ignore dynamic & external package requires
											if (data.value == null || isPathExternal(data.value)) return;

											modulePath = normalize(data.value, dir);

											// Check full path match, e.g. ./foo/bar.js (for ./foo/bar.js file)
											if (expectedPathFull === modulePath) {
												data.nuValue = normalize(relative(dir, destPosix));
												return data;
											}
											// Check trimmed path match, e.g. ./foo/bar (for ./foo/bar.js file)
											if (expectedPathTrimmed !== modulePath) {
												if (!isSourceDirIndex) return;
												if (expectedDir + "/" !== modulePath) {
													if (isSourceDirShadowed) return;
													if (expectedDir !== modulePath) return;
												}
												data.nuValue = normalize(relative(dir, destPosix));
												if (!isDestExtRequired) {
													data.nuValue = data.nuValue.slice(
														0, -sourceExt.length
													);
												}
												return data;
											}
											// Validate whether trimmed path matches
											if (isSourceExtRequired == null) {
												isSourceExtRequired = isExtRequired(
													source, sourceExt
												);
											}
											return isSourceExtRequired(function (is) {
												if (!is) {
													data.nuValue = normalize(
														relative(dir, destPosix)
													);
													if (!isDestExtRequired) {
														data.nuValue = data.nuValue.slice(
															0, -sourceExt.length
														);
													}
													return data;
												}
											});
										})(function (result) {
											var diff;
											result = result.filter(Boolean);
											if (!result.length) return;

											diff = 0;
											result.forEach(function (reqData) {
												var nuRaw = stringify(reqData.nuValue).slice(1, -1);
												code =
													code.slice(0, reqData.point + diff) +
													nuRaw +
													code.slice(
														reqData.point +
															diff +
															reqData.raw.length -
															2
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
					return dirReader(function () { return deferred.map(filePromises); });
				})
			);
		});
	})(function () { return unlink(source); });
};
