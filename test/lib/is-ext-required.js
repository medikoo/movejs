"use strict";

var deferred = require("deferred")
  , resolve  = require("path").resolve

  , pgPath = resolve(__dirname, "../__playground");

module.exports = function (t, a, d) {
	return deferred(
		t(resolve(pgPath, "muszka"), "")(function (result) {
			a(result, true, "No ext");
		}),
		t(resolve(pgPath, "muszka.js"), ".js")(function (result) {
			a(result, false, "JS ext");
		}),
		t(resolve(pgPath, "muszka.json"), ".json")(function (result) {
			a(result, false, "Non existing");
		}),
		t(resolve(pgPath, "test.json"), ".json")(function (result) {
			a(result, true, "Existing non JS");
		})
	).done(function () { d(); }, d);
};
