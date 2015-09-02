'use strict';

var deferred = require('deferred')
  , fs       = require('fs')
  , extname  = require('path').extname

  , hasNodeSheBang = RegExp.prototype.test.bind(/^#![\u0021-\uffff]+(?:\/node|\/env node)\s/)
  , promisify = deferred.promisify
  , read = promisify(fs.read)
  , open = promisify(fs.open), close = promisify(fs.close);

module.exports = function (filename) {
	var ext = extname(filename);
	if (ext === '.js') return deferred(true);
	if (ext) return deferred(false);

	return open(filename, 'r')(function (fd) {
		var buffer = new Buffer(100);
		return read(fd, buffer, 0, 100, null)(function () {
			close(fd);
			return hasNodeSheBang(String(buffer));
		});
	});
};
