// Whether module at given path (e.g. ./foo/bar.js) can be required just via its dir path (./foo)

"use strict";

var dirname       = require("path").dirname
  , resolveModule = require("cjs-module/resolve");

module.exports = function (path) {
	return resolveModule(dirname(path), "./")(function (result) { return result === path; });
};
