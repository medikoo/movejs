'use strict';

var resolve        = require('path').resolve
  , moduleTests    = require('./module')
  , directoryTests = require('./directory')

  , pgWorkingPath = resolve(__dirname, '__playground/test-package-work-batch-');

module.exports = function (t, a, d) {
	var count = 2;
	moduleTests(t, a, function (value) {
		if (!--count) d(value);
	}, pgWorkingPath + 'module');
	directoryTests(t, a, function (value) {
		if (!--count) d(value);
	}, pgWorkingPath + 'directory');
};
