class StreamHandle {
  constructor() {
    this.owner = null;
    this.onconnection = null;
    this.onread = null;
    this.closed = false;
    this.reading = false;

    this._listener = null;
    this._connection = null;
    this._reading = false;
    this._queuedRead = null;
  }

  close(callback) {
    if (this.closed) {
      onSuccess();
      return;
    }
    this.closed = true;

    const resource = this._listener || this._connection;
    if (resource === null) {
      onSuccess();
      return;
    }

    resource.close().then(onSuccess, onSuccess);

    function onSuccess() {
      if (callback)
        process.nextTick(callback);
    }
  }

  listen(address, port, backlog, callback) {
    let options;
    if (port === -1) {
      options = {
        path: address,
        backlog: backlog
      };
    } else {
      options = {
        host: address,
        port: port,
        backlog: backlog
      };
    }

    Socket.listen(options)
    .then(listener => {
      if (this.closed) {
        listener.close().then(noop, noop);
        callback(new Error('Handle is closed'));
        return;
      }

      this._listener = listener;
      this._acceptNext();

      callback(null);
    })
    .catch(error => {
      callback(error);
    });
  }

  _acceptNext() {
    this._listener.accept()
    .then(connection => {
      this.onconnection(null, this._create(connection));

      process.nextTick(() => {
        if (!this.closed) {
          this._acceptNext();
        }
      });
    })
    .catch(error => {
      if (this.closed) {
        return;
      }

      this.onconnection(error, null);
    });
  }

  getsockname(result) {
    if (this._listener !== null) {
      result.port = this._listener.port;
      // TODO
      result.family = 'IPv4';
      result.address = '0.0.0.0';
    }

    if (this._connection !== null) {
      // TODO
      result.port = 1234;
      result.family = 'IPv4';
      result.address = '127.0.0.1';
    }
  }

  connect(req, address, port) {
    Socket.connect({
      host: address,
      port: port,
    })
    .then(connection => {
      if (this.closed) {
        connection.close().then(noop, noop);
        req.oncomplete(new Error('Handle is closed'), this, req, false, false);
        return;
      }

      this._connection = connection;

      req.oncomplete(null, this, req, true, true);
    })
    .catch(error => {
      req.oncomplete(error, this, req, false, false);
    });
  }

  readStart() {
    const read = this._queuedRead;
    if (read !== null) {
      const [error, data] = read;
      if (error !== null) {
        return error;
      }

      this._queuedRead = null;
      process.nextTick(() => {
        this.onread(null, data.length, data);
      });
    }

    this._reading = true;
    this._readNext();
  }

  _readNext() {
    this._connection.input.read(512)
    .then(rawData => {
      const data = Buffer.from(rawData);
      if (this._reading) {
        this.onread(null, data.length, data);

        const isEof = data.length === 0;
        if (!isEof) {
          process.nextTick(() => {
            if (this._reading) {
              this._readNext();
            }
          });
        }
      } else {
        this._queuedRead = [null, data];
      }
    })
    .catch(error => {
      if (this._reading) {
        this.onread(error, -1, null);
      } else {
        this._queuedRead = [error, null];
      }
    });
  }

  readStop() {
    this._reading = false;
  }

  writeBuffer(req, data) {
    req.bytes = data.length;

    this._connection.output.writeAll(data.buffer)
    .then(connection => {
      req.oncomplete(null, this, req);
    })
    .catch(error => {
      req.oncomplete(error, this, req);
    });
  }
}

class TCP extends StreamHandle {
  _create(connection) {
    const handle = new TCP();
    handle._connection = connection;
    return handle;
  }
}

class Pipe extends StreamHandle {
  constructor() {
    super();

    throw new Error('Pipe not yet implemented');
  }

  _create(connection) {
    const handle = new Pipe();
    handle._connection = connection;
    return handle;
  }
}

class TCPConnectWrap {
  constructor() {
    this.address = '';
    this.port = 0;
    this.localAddress = null;
    this.localPort = null;
    this.oncomplete = null;
  }
}

class PipeConnectWrap {
  constructor() {
    this.address = '';
    this.oncomplete = null;
  }
}

class ShutdownWrap {
  constructor() {
    this.handle = null;
    this.oncomplete = null;
  }
}

class WriteWrap {
  constructor() {
    this.handle = null;
    this.oncomplete = null;
    this.bytes = 0;
    this.error = null;
  }
}

function noop() {}

module.exports = {
  TCP: TCP,
  Pipe: Pipe,
  TCPConnectWrap: TCPConnectWrap,
  PipeConnectWrap: PipeConnectWrap,
  ShutdownWrap: ShutdownWrap,
  WriteWrap: WriteWrap,
};
