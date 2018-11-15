"use strict";

var deferred = require("deferred")
  , resolve  = require("path").resolve

  , pgPath = resolve(__dirname, "../__playground");

module.exports = function (t, a, d) {
	return deferred(
		t(resolve(pgPath, "test-package/inner"), "")(function (result) {
			a(result, false, "Dir with index");
		}),
		t(resolve(pgPath, "habla"), ".js")(function (result) {
			a(result, false, "Non existing dir");
		}),
		t(resolve(pgPath, "test"), ".json")(function (result) {
			a(result, true, "Shadowed dir");
		})
	).done(function () { d(); }, d);
};
