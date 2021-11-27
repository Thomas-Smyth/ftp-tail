import sftp from 'ssh2-sftp-client';

export class SFTPClient {
  constructor(options) {
    this.encoding = options.encoding;
    this.timeout = options.timeout;
    this.log = options.logger;

    this.readOptions = {
      readStreamOptions: {
        flags: 'r',
        encoding: this.encoding
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
    return this.connection
      .then(() => {
        return this.client.stat(path);
      })
      .then((data) => {
        return data.size;
      })
      .catch((err) => {
        console.error(err.message);
      });
  }

  async connect(options = {}) {
    // ssh2-sftp-client requires username instead of user.
    options.username = options.user;
    options.readyTimeout = this.timeout;
    options.debug = this.log;

    this.connection = this.client.connect(options);
    this.connectionClosed = false;
  }

  async downloadTo(destination, fromRemotePath, startAt = 0) {
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
