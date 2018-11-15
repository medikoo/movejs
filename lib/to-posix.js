// Ensure absolute path is represented *nix style
// It's neeed if path is supposed to be used for require path resolution

"use strict";

module.exports = function (path) {
	if (path[0] === "/") return path;
	return path.replace(/^[A-Z]+:\\/, "/").replace(/\\/g, "/");
};
