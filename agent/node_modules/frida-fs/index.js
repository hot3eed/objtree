const stream = require('stream');

const {platform, pointerSize} = Process;

const universalConstants = {
  S_IFMT: 0xf000,
  S_IFREG: 0x8000,
  S_IFDIR: 0x4000,
  S_IFCHR: 0x2000,
  S_IFBLK: 0x6000,
  S_IFIFO: 0x1000,
  S_IFLNK: 0xa000,
  S_IFSOCK: 0xc000,

  S_IRWXU: 448,
  S_IRUSR: 256,
  S_IWUSR: 128,
  S_IXUSR: 64,
  S_IRWXG: 56,
  S_IRGRP: 32,
  S_IWGRP: 16,
  S_IXGRP: 8,
  S_IRWXO: 7,
  S_IROTH: 4,
  S_IWOTH: 2,
  S_IXOTH: 1,

  DT_UNKNOWN: 0,
  DT_FIFO: 1,
  DT_CHR: 2,
  DT_DIR: 4,
  DT_BLK: 6,
  DT_REG: 8,
  DT_LNK: 10,
  DT_SOCK: 12,
  DT_WHT: 14,
};
const platformConstants = {
  darwin: {
    O_RDONLY: 0x0,
    O_WRONLY: 0x1,
    O_RDWR: 0x2,
    O_CREAT: 0x200,
    O_EXCL: 0x800,
    O_NOCTTY: 0x20000,
    O_TRUNC: 0x400,
    O_APPEND: 0x8,
    O_DIRECTORY: 0x100000,
    O_NOFOLLOW: 0x100,
    O_SYNC: 0x80,
    O_DSYNC: 0x400000,
    O_SYMLINK: 0x200000,
    O_NONBLOCK: 0x4,
  },
  linux: {
    O_RDONLY: 0x0,
    O_WRONLY: 0x1,
    O_RDWR: 0x2,
    O_CREAT: 0x40,
    O_EXCL: 0x80,
    O_NOCTTY: 0x100,
    O_TRUNC: 0x200,
    O_APPEND: 0x400,
    O_DIRECTORY: 0x10000,
    O_NOATIME: 0x40000,
    O_NOFOLLOW: 0x20000,
    O_SYNC: 0x101000,
    O_DSYNC: 0x1000,
    O_DIRECT: 0x4000,
    O_NONBLOCK: 0x800,
  },
};
const constants = Object.assign({}, universalConstants, platformConstants[platform] || {});

const SEEK_SET = 0;
const SEEK_CUR = 1;
const SEEK_END = 2;

const EINTR = 4;

class ReadStream extends stream.Readable {
  constructor(path) {
    super({
      highWaterMark: 4 * 1024 * 1024
    });

    this._input = null;
    this._readRequest = null;

    const pathStr = Memory.allocUtf8String(path);
    const fd = getApi().open(pathStr, constants.O_RDONLY, 0);
    if (fd.value === -1) {
      this.emit('error', new Error(`Unable to open file (${getErrorString(fd.errno)})`));
      this.push(null);
      return;
    }

    this._input = new UnixInputStream(fd.value, { autoClose: true });
  }

  _read(size) {
    if (this._readRequest !== null)
      return;

    this._readRequest = this._input.read(size)
    .then(buffer => {
      this._readRequest = null;

      if (buffer.byteLength === 0) {
        this._closeInput();
        this.push(null);
        return;
      }

      if (this.push(Buffer.from(buffer)))
        this._read(size);
    })
    .catch(error => {
      this._readRequest = null;
      this._closeInput();
      this.push(null);
    });
  }

  _closeInput() {
    if (this._input !== null) {
      this._input.close();
      this._input = null;
    }
  }
}

class WriteStream extends stream.Writable {
  constructor(path) {
    super({
      highWaterMark: 4 * 1024 * 1024
    });

    this._output = null;
    this._writeRequest = null;

    const pathStr = Memory.allocUtf8String(path);
    const flags = constants.O_WRONLY | constants.O_CREAT;
    const mode = constants.S_IRUSR | constants.S_IWUSR | constants.S_IRGRP | constants.S_IROTH;
    const fd = getApi().open(pathStr, flags, mode);
    if (fd.value === -1) {
      this.emit('error', new Error(`Unable to open file (${getErrorString(fd.errno)})`));
      this.push(null);
      return;
    }

    this._output = new UnixOutputStream(fd.value, { autoClose: true });
    this.on('finish', () => this._closeOutput());
    this.on('error', () => this._closeOutput());
  }

  _write(chunk, encoding, callback) {
    if (this._writeRequest !== null)
      return;

    this._writeRequest = this._output.writeAll(chunk)
    .then(size => {
      this._writeRequest = null;

      callback();
    })
    .catch(error => {
      this._writeRequest = null;

      callback(error);
    });
  }

  _closeOutput() {
    if (this._output !== null) {
      this._output.close();
      this._output = null;
    }
  }
}

const direntSpecs = {
  'linux-32': {
    'd_name': [11, 'Utf8String'],
    'd_type': [10, 'U8']
  },
  'linux-64': {
    'd_name': [19, 'Utf8String'],
    'd_type': [18, 'U8']
  },
  'darwin-32': {
    'd_name': [21, 'Utf8String'],
    'd_type': [20, 'U8']
  },
  'darwin-64': {
    'd_name': [21, 'Utf8String'],
    'd_type': [20, 'U8']
  }
};

const direntSpec = direntSpecs[`${platform}-${pointerSize * 8}`];

function readdirSync(path) {
  const entries = [];
  enumerateDirectoryEntries(path, entry => {
    const name = readDirentField(entry, 'd_name');
    entries.push(name);
  });
  return entries;
}

function list(path) {
  const entries = [];
  enumerateDirectoryEntries(path, entry => {
    entries.push({
      name: readDirentField(entry, 'd_name'),
      type: readDirentField(entry, 'd_type')
    });
  });
  return entries;
}

function enumerateDirectoryEntries(path, callback) {
  const {opendir, opendir$INODE64, closedir, readdir, readdir$INODE64} = getApi();

  const opendirImpl = opendir$INODE64 || opendir;
  const readdirImpl = readdir$INODE64 || readdir;

  const dir = opendirImpl(Memory.allocUtf8String(path));
  const dirHandle = dir.value;
  if (dirHandle.isNull())
    throw new Error(`Unable to open directory (${getErrorString(dir.errno)})`);

  try {
    let entry;
    while (!((entry = readdirImpl(dirHandle)).isNull())) {
      callback(entry);
    }
  } finally {
    closedir(dirHandle);
  }
}

function readDirentField(entry, name) {
  const [offset, type] = direntSpec[name];

  const read = (typeof type === 'string') ? Memory['read' + type] : type;

  const value = read(entry.add(offset));
  if (value instanceof Int64 || value instanceof UInt64)
    return value.valueOf();

  return value;
}

function readFileSync(path, options = {}) {
  if (typeof options === 'string')
    options = { encoding: options };
  const {encoding = null} = options;

  const {open, close, lseek, read} = getApi();

  const pathStr = Memory.allocUtf8String(path);
  const openResult = open(pathStr, constants.O_RDONLY, 0);
  const fd = openResult.value;
  if (fd === -1)
    throw new Error(`Unable to open file (${getErrorString(openResult.errno)})`);

  try {
    const fileSize = lseek(fd, 0, SEEK_END).valueOf();

    lseek(fd, 0, SEEK_SET);

    const buf = Memory.alloc(fileSize);
    let readResult, n, readFailed;
    do {
      readResult = read(fd, buf, fileSize);
      n = readResult.value.valueOf();
      readFailed = n === -1;
    } while (readFailed && readResult.errno === EINTR);

    if (readFailed)
      throw new Error(`Unable to read ${path} (${getErrorString(readResult.errno)})`);

    if (n !== fileSize.valueOf())
      throw new Error('Short read');

    if (encoding === 'utf8') {
      return buf.readUtf8String(fileSize);
    }

    const value = Buffer.from(buf.readByteArray(fileSize));
    if (encoding !== null) {
      return value.toString(encoding);
    }

    return value;
  } finally {
    close(fd);
  }
}

function readlinkSync(path) {
  const api = getApi();

  const pathStr = Memory.allocUtf8String(path);

  const linkSize = lstatSync(path).size.valueOf();
  const buf = Memory.alloc(linkSize);

  const result = api.readlink(pathStr, buf, linkSize);
  const n = result.value.valueOf();
  if (n === -1)
    throw new Error(`Unable to read link (${getErrorString(result.errno)})`);

  return buf.readUtf8String(n);
}

function unlinkSync(path) {
  const {unlink} = getApi();

  const pathStr = Memory.allocUtf8String(path);

  const result = unlink(pathStr);
  if (result.value === -1)
    throw new Error(`Unable to unlink (${getErrorString(result.errno)})`);
}

const statFields = new Set([
  'dev',
  'mode',
  'nlink',
  'uid',
  'gid',
  'rdev',
  'blksize',
  'ino',
  'size',
  'blocks',
  'atimeMs',
  'mtimeMs',
  'ctimeMs',
  'birthtimeMs',
  'atime',
  'mtime',
  'ctime',
  'birthtime',
]);
const statSpecs = {
  'darwin-32': {
    size: 108,
    fields: {
      'dev': [ 0, 'S32' ],
      'mode': [ 4, 'U16' ],
      'nlink': [ 6, 'U16' ],
      'ino': [ 8, 'U64' ],
      'uid': [ 16, 'U32' ],
      'gid': [ 20, 'U32' ],
      'rdev': [ 24, 'S32' ],
      'atime': [ 28, readTimespec32 ],
      'mtime': [ 36, readTimespec32 ],
      'ctime': [ 44, readTimespec32 ],
      'birthtime': [ 52, readTimespec32 ],
      'size': [ 60, 'S64' ],
      'blocks': [ 68, 'S64' ],
      'blksize': [ 76, 'S32' ],
    }
  },
  'darwin-64': {
    size: 144,
    fields: {
      'dev': [ 0, 'S32' ],
      'mode': [ 4, 'U16' ],
      'nlink': [ 6, 'U16' ],
      'ino': [ 8, 'U64' ],
      'uid': [ 16, 'U32' ],
      'gid': [ 20, 'U32' ],
      'rdev': [ 24, 'S32' ],
      'atime': [ 32, readTimespec64 ],
      'mtime': [ 48, readTimespec64 ],
      'ctime': [ 64, readTimespec64 ],
      'birthtime': [ 80, readTimespec64 ],
      'size': [ 96, 'S64' ],
      'blocks': [ 104, 'S64' ],
      'blksize': [ 112, 'S32' ],
    }
  },
  'linux-32': {
    size: 88,
    fields: {
      'dev': [ 0, 'U64' ],
      'mode': [ 16, 'U32' ],
      'nlink': [ 20, 'U32' ],
      'ino': [ 12, 'U32' ],
      'uid': [ 24, 'U32' ],
      'gid': [ 28, 'U32' ],
      'rdev': [ 32, 'U64' ],
      'atime': [ 56, readTimespec32 ],
      'mtime': [ 64, readTimespec32 ],
      'ctime': [ 72, readTimespec32 ],
      'size': [ 44, 'S32' ],
      'blocks': [ 52, 'S32' ],
      'blksize': [ 48, 'S32' ],
    }
  },
  'linux-64': {
    size: 144,
    fields: {
      'dev': [ 0, 'U64' ],
      'mode': [ 24, 'U32' ],
      'nlink': [ 16, 'U64' ],
      'ino': [ 8, 'U64' ],
      'uid': [ 28, 'U32' ],
      'gid': [ 32, 'U32' ],
      'rdev': [ 40, 'U64' ],
      'atime': [ 72, readTimespec64 ],
      'mtime': [ 88, readTimespec64 ],
      'ctime': [ 104, readTimespec64 ],
      'size': [ 48, 'S64' ],
      'blocks': [ 64, 'S64' ],
      'blksize': [ 56, 'S64' ],
    },
  },
};
const statSpec = statSpecs[`${platform}-${pointerSize * 8}`] || null;
const statBufSize = 256;

function Stats() {
}

function statSync(path) {
  const api = getApi();
  const impl = api.stat64 || api.stat;
  return performStat(impl, path);
}

function lstatSync(path) {
  const api = getApi();
  const impl = api.lstat64 || api.lstat;
  return performStat(impl, path);
}

function performStat(impl, path) {
  if (statSpec === null)
    throw new Error('Current OS is not yet supported; please open a PR');

  const buf = Memory.alloc(statBufSize);
  const result = impl(Memory.allocUtf8String(path), buf);
  if (result.value !== 0)
    throw new Error(`Unable to stat ${path} (${getErrorString(result.errno)})`);

  return new Proxy(new Stats(), {
    has(target, property) {
      return statsHasField(property);
    },
    get(target, property, receiver) {
      switch (property) {
        case 'prototype':
        case 'constructor':
        case 'toString':
          return target[property];
        case 'hasOwnProperty':
          return statsHasField;
        case 'valueOf':
          return receiver;
        case 'buffer':
          return buf;
        default:
          const value = statsReadField.call(receiver, property);
          return (value !== null) ? value : undefined;
      }
    },
    set(target, property, value, receiver) {
      return false;
    },
    ownKeys(target) {
      return Array.from(statFields);
    },
    getOwnPropertyDescriptor(target, property) {
      return {
        writable: false,
        configurable: true,
        enumerable: true
      };
    },
  });
}

function statsHasField(name) {
  return statFields.has(name);
}

function statsReadField(name) {
  let field = statSpec.fields[name];
  if (field === undefined) {
    if (name === 'birthtime') {
      return statsReadField.call(this, 'ctime');
    }

    const msPos = name.lastIndexOf('Ms');
    if (msPos === name.length - 2) {
      return statsReadField.call(this, name.substr(0, msPos)).getTime();
    }

    return undefined;
  }

  const [offset, type] = field;

  const read = (typeof type === 'string') ? Memory['read' + type] : type;

  const value = read(this.buffer.add(offset));
  if (value instanceof Int64 || value instanceof UInt64)
    return value.valueOf();

  return value;
}

function readTimespec32(address) {
  const sec = address.readU32();
  const nsec = address.add(4).readU32();
  const msec = nsec / 1000000;
  return new Date((sec * 1000) + msec);
}

function readTimespec64(address) {
  // FIXME: Improve UInt64 to support division
  const sec = address.readU64().valueOf();
  const nsec = address.add(8).readU64().valueOf();
  const msec = nsec / 1000000;
  return new Date((sec * 1000) + msec);
}

function getErrorString(errno) {
  return getApi().strerror(errno).readUtf8String();
}

function callbackify(original) {
  return function (...args) {
    const numArgsMinusOne = args.length - 1;

    const implArgs = args.slice(0, numArgsMinusOne);
    const callback = args[numArgsMinusOne];

    process.nextTick(function () {
      try {
        const result = original(...implArgs);
        callback(null, result);
      } catch (e) {
        callback(e);
      }
    });
  };
}

const SF = SystemFunction;
const NF = NativeFunction;

const ssizeType = (pointerSize === 8) ? 'int64' : 'int32';
const sizeType = 'u' + ssizeType;
const offsetType = (platform === 'darwin' || pointerSize === 8) ? 'int64' : 'int32';

const apiSpec = [
  ['open', SF, 'int', ['pointer', 'int', '...', 'int']],
  ['close', NF, 'int', ['int']],
  ['lseek', NF, offsetType, ['int', offsetType, 'int']],
  ['read', SF, ssizeType, ['int', 'pointer', sizeType]],
  ['opendir', SF, 'pointer', ['pointer']],
  ['opendir$INODE64', SF, 'pointer', ['pointer']],
  ['closedir', NF, 'int', ['pointer']],
  ['readdir', NF, 'pointer', ['pointer']],
  ['readdir$INODE64', NF, 'pointer', ['pointer']],
  ['readlink', SF, ssizeType, ['pointer', 'pointer', sizeType]],
  ['unlink', SF, 'int', ['pointer']],
  ['stat', SF, 'int', ['pointer', 'pointer']],
  ['stat64', SF, 'int', ['pointer', 'pointer']],
  ['lstat', SF, 'int', ['pointer', 'pointer']],
  ['lstat64', SF, 'int', ['pointer', 'pointer']],
  ['strerror', NF, 'pointer', ['int']],
];

let cachedApi = null;
function getApi() {
  if (cachedApi === null) {
    cachedApi = apiSpec.reduce((api, entry) => {
      addApiPlaceholder(api, entry);
      return api;
    }, {});
  }
  return cachedApi;
}

function addApiPlaceholder(api, entry) {
  const [name] = entry;

  Object.defineProperty(api, name, {
    configurable: true,
    get() {
      const [, Ctor, retType, argTypes] = entry;

      let impl = null;
      const address = Module.findExportByName(null, name);
      if (address !== null)
        impl = new Ctor(address, retType, argTypes);

      Object.defineProperty(api, name, { value: impl });

      return impl;
    }
  });
}

module.exports = {
  constants,
  createReadStream(path) {
    return new ReadStream(path);
  },
  createWriteStream(path) {
    return new WriteStream(path);
  },
  readdir: callbackify(readdirSync),
  readdirSync,
  list,
  readFile: callbackify(readFileSync),
  readFileSync,
  readlink: callbackify(readlinkSync),
  readlinkSync,
  unlink: callbackify(unlinkSync),
  unlinkSync,
  stat: callbackify(statSync),
  statSync,
  lstat: callbackify(lstatSync),
  lstatSync,
};
