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

    this.closed = true;

    this.client.on('close', this.closedConnection);
    this.client.on('end', this.closedConnection);
  }

  async size(path) {
    return (await this.client.stat(path)).size;
  }

  async connect(options = {}) {
    // ssh2-sftp-client requires username instead of user.
    options.username = options.user;
    options.readyTimeout = this.timeout;
    options.debug = this.log;

    await this.client.connect(options);
    this.closed = false;
  }

  async downloadTo(destination, fromRemotePath, startAt = 0) {
    this.readOptions.readStreamOptions.start = startAt;

    return this.client.get(fromRemotePath, destination, this.readOptions);
  }

  close() {
    this.client.end();
  }

  closedConnection() {
    this.closed = true;
  }
}
