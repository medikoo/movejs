"use strict";

var normalize = require("path2/posix/normalize")
  , relative  = require("path2/posix/relative");

module.exports = function (path, dir) {
	path = normalize(path);
	// If require to absolute path, resolve it to local
	if (path[0] === "/") path = relative(dir, path);
	// Ensure local CJS path
	if (path[0] !== ".") path = "./" + path;
	return path;
};
