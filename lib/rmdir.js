"use strict";

var customError = require("es5-ext/error/custom")
  , resolve     = require("path").resolve
  , readdir     = require("fs2/readdir")
  , rmdir       = require("fs2/rmdir")

  , opts = { recursive: true };

module.exports = function self(path) {
	return rmdir(path, opts).catch(function (e) {
		if (e.code !== "ENOTEMPTY") throw e;
		return readdir(path, { type: { directory: true } }).map(function (dir) {
			return self(resolve(path, dir));
		})(function () {
			throw customError("All Modules were moved, but original directory could not be deleted, " +
				"due to other (non applicable) files (e.g. symlinks, ignored by git, or " +
				"node_modules content) residing in it", "CANNOT_CLEAR_DIR");
		});
	});
};
