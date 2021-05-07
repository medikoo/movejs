"use strict";

var deferred      = require("deferred")
  , resolveModule = require("cjs-module/resolve")
  , path          = require("path");

var basename = path.basename
  , dirname = path.dirname
  , extname = path.extname
  , order = { ".js": 1, ".json": 2, ".node": 3 };

module.exports = function (filename, ext) {
	var filePath;
	if (!ext) return deferred(true);
	if (ext === ".js") return deferred(false);
	filePath = basename(filename).slice(0, -ext.length);
	return resolveModule(
		dirname(filename), "./" + filePath
	)(function (modulePath) {
		if (!modulePath) return false;
		if (filename === modulePath) return false;
		if (basename(modulePath) === filePath) return true;
		return order[extname(modulePath)] < order[ext];
	});
};
