const minimatch = require('minimatch').Minimatch
  , convert = require('convert-source-map')
  , through = require('through')
  , path = require('path')
  , terser = require('terser')

module.exports = uglifyify

function uglifyify(file, opts) {
  opts = opts || {}

  let debug = opts._flags && opts._flags.debug

  if (ignore(file, opts.ignore)) {
    return through()
  }

  let buffer = ''
  const exts = []
    .concat(opts.exts || [])
    .concat(opts.x || [])
    .map(function(d) {
      if (d.charAt(0) === '.') return d
      return '.' + d
    })

  if (
    /\.json$/.test(file) ||
    exts.length &&
    exts.indexOf(path.extname(file)) === -1
  ) {
    return through()
  }

  return through(function write(chunk) {
    buffer += chunk
  }, capture(async function ready() {
    debug = opts.sourceMap !== false && debug
    const _opts = Object.assign({}, {
      compress: true,
      mangle: true,
      sourceMap: {
        filename: file
      }
    }, opts)

    // map out command line options to uglify compatible ones
    mapArgv(opts)

    // remove exts before passing opts to uglify
    delete _opts.global
    delete _opts.ignore
    delete _opts.exts
    delete _opts.x
    delete _opts._
    delete _opts._flags

    if (typeof _opts.compress === 'object') {
      delete _opts.compress._
    }

    if (debug) _opts.sourceMap.url = 'out.js.map'

    // Check if incoming source code already has source map comment.
    // If so, send it in to terser.minify as the inSourceMap parameter
    if (debug && buffer.indexOf('//# sourceMappingURL=data:') !== -1) {
      _opts.sourceMap.content = 'inline'
    }

    const min = await terser.minify(buffer, _opts)

    // Uglify leaves a source map comment pointing back to "out.js.map",
    // which we want to get rid of because it confuses browserify.
    min.code = min.code.replace(/\/\/[#@] ?sourceMappingURL=out.js.map$/, '')
    this.queue(min.code)

    if (min.map && min.map !== 'null') {
      const map = convert.fromJSON(min.map)

      this.queue('\n')
      this.queue(map.toComment())
    }

    this.queue(null)
  }))

  function capture(fn) {
    return async function() {
      try {
        await fn.apply(this, arguments)
      } catch (err) {
        this.emit('error', err)
      }
    }
  }
}

function ignore(file, list) {
  if (!list) return

  list = Array.isArray(list) ? list : [list]

  return list.some(function(pattern) {
    return minimatch(pattern).match(file)
  })
}

// uglify-es doesn't allow for command line options in javascript api, this
// remaps it
function mapArgv (opts) {
  if (opts._flags) {
    delete opts._flags
  }
  if (opts.c) {
    opts.compress = opts.c
    delete opts.c
  }
  if (opts.m) {
    opts.mangle = opts.m
    delete opts.m
  }
  if (opts.p) {
    opts.parse = opts.p
    delete opts.p
  }
  if (opts.b) {
    opts.beautify = opts.b
    delete opts.b
  }
  if (opts.o) {
    opts.output = opts.o
    delete opts.o
  }
  if (opts.d) {
    opts.define = opts.d
    delete opts.d
  }
  delete opts._
}
