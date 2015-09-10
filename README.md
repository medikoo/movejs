# rename-module
## Rename/Move CJS module(s) and update all affected requires

Rename/Move module or directory of modules within given package to different location.
All requires within moved module(s) and within files that require moved module(s)
will be accordingly updated.

- Package root is intelligently detected
- Content of eventual _node\_modules_ (external dependencies) folder is not touched
- All files as ignored by _.gitignore_ rules are not touched (it is assumed they're most likely generated files, which will automatically fixed by regeneration).

Constraints:
- Moved module must reside in some package  
_otherwise root of a system is perceived as root of a package,
	and operation is aborted to not proceed with whole system files search (of affected modules)_
- Modules can be moved only within a scope of same package.
  For obvious reasons move across different packages will fail

### Installation

	$ npm install -g rename-module

### Usage

	$ rename-module sourcePath destPath

`sourcePath` can be either module file path or directory path. `destPath` must not be taken.

Verbose logging of taken operations is possible with additional setting of `DEBUG` variable:

	$ DEBUG=rename-module rename-module sourcePath destPath

### Programatical API

#### rename-module

Move/rename single module file or directory of modules

```javascript
var mv = require('rename-module');

mv(sourcePath, destPath).done(function () {
	// Module(s) successfully moved
});
```

#### rename-module/module

Move/rename single module file

```javascript
var mvModule = require('rename-module/module');

mvModule(sourcePath, destPath).done(function () {
	// Module successfully moved
});
```

#### rename-module/directory

Move/rename directory of modules

```javascript
var mvDir = require('rename-module/directory');

mvDir(sourcePath, destPath).done(function () {
	// Modules successfully moved
});
```

## Tests [![Build Status](https://travis-ci.org/medikoo/rename-module.svg)](https://travis-ci.org/medikoo/rename-module)

	$ npm test
