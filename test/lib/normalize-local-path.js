'use strict';

module.exports = function (t, a) {
	a(t('/foo/bar/elo', '/foo'), './bar/elo');
	a(t('../../elo.js', '/foo/bar.js'), '../../elo.js');
	a(t('./elo.js', '/foo/bar.js'), './elo.js');
	a(t('.//elo.js', '/foo/bar.js'), './elo.js');
	a(t('../.././elo.js', '/foo/bar.js'), '../../elo.js');
	a(t('../../marko/../elo.js', '/foo/bar.js'), '../../elo.js');
};
