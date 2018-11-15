"use strict";

module.exports = function (t, a) {
	a(t("/foo/bar/elo.js"), "/foo/bar/elo.js");
	a(t("C:\\\\"), "/");
	a(t("C:\\\\foo\\bar.js"), "/foo/bar.js");
};
