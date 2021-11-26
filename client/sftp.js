import sftp from 'ssh2-sftp-client';

export class SFTPClient {
  constructor(timeout, logger, encoding) {
    this.encoding = encoding;
    this.timeout = timeout;
    this.log = logger;

    this.readOptions = {
      readStreamOptions: {
        flags: 'r',
        encoding: this.encoding,
      },
      pipeOptions: {
        end: false
      }
    };

    this.client = new sftp();

    this.connectionClosed = true;

    this.client.on('close', this.closedConnection);
    this.client.on('end', this.closedConnection);
  }

  async size(path) {
    if (this.connectionClosed) throw Exception('Connect first in order to use this function');

    this.log(`Getting size for file ${path}`);

    return this.connection
      .then(() => {
        return this.client.stat(path);
      })
      .then((data) => {
        this.log(`File size ${data.size}`);
        return data.size;
      })
      .catch((err) => {
        console.error(err.message);
      });
  }

  async access(options = {}) {
    // ssh2-sftp-client requires username instead of user.
    options.username = options.user;
    options.readyTimeout = this.timeout;

    this.log('Setting up sftp connection');
    this.connection = this.client.connect(options);
    this.connectionClosed = false;
  }

  async downloadTo(destination, fromRemotePath, startAt = 0) {
    if (this.connectionClosed) throw Exception('Connect first in order to use this function');

    this.log(`Reading file starting from ${startAt}`);
    this.readOptions.readStreamOptions.start = startAt;

    return this.connection
      .then(() => {
        return this.client.get(fromRemotePath, destination, this.readOptions);
      })
      .catch((err) => {
        console.error(err.message);
      });
  }

  close() {
    this.log('Closing connection');
    this.client.end();
  }

  get closed() {
    return this.connectionClosed;
  }

  closedConnection() {
    this.connectionListenerAdded = true;
    this.connectionClosed = true;
  }
}
