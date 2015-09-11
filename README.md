# movejs
## Rename/Move CJS module(s) and update all affected requires

- Package root is intelligently detected
- Content of eventual _node\_modules_ (external dependencies) folder is not affected
- All files as ignored by _.gitignore_ rules are not touched (it is assumed they're most likely generated files, which will automatically be fixed by regeneration).

Constraints:
- Moved module must reside in some package  
_otherwise root of a system is perceived as a root of a package,
	and operation is aborted (to not proceed with whole system files search for affected modules)_
- Modules can be moved only within a scope of same package.
  For obvious reasons move across different packages will fail

### Installation

	$ npm install -g movejs

### Usage

	$ movejs sourcePath destPath

`sourcePath` can be either module file path or directory path. `destPath` must not be taken.

Verbose logging of underlying operations is possible with additional setting of `DEBUG` variable:

	$ DEBUG=movejs movejs sourcePath destPath

### Programatical API

#### movejs

Move/rename single module file or directory of modules

```javascript
var mv = require('movejs');

mv(sourcePath, destPath).done(function () {
	// Module(s) successfully moved
});
```

#### movejs/module

Move/rename single module file

```javascript
var mvModule = require('movejs/module');

mvModule(sourcePath, destPath).done(function () {
	// Module successfully moved
});
```

#### movejs/directory

Move/rename directory of modules

```javascript
var mvDir = require('movejs/directory');

mvDir(sourcePath, destPath).done(function () {
	// Modules successfully moved
});
```

## Tests [![Build Status](https://travis-ci.org/medikoo/movejs.svg)](https://travis-ci.org/medikoo/movejs)

	$ npm test
