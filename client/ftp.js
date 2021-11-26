import Client from 'basic-ftp';

export class FTPClient {
  constructor(timeout, logger, encoding) {
    this.client = new Client(timeout);
    this.client.ftp.encoding = encoding || this.client.ftp.encoding;
    this.client.ftp.log = logger;
  }

  async size(path) {
    return this.client.size(path);
  }

  async access(options = {}) {
    return this.client.access(options);
  }

  async downloadTo(destination, fromRemotePath, startAt = 0) {
    return this.client.downloadTo(destination, fromRemotePath, startAt);
  }

  close() {
    this.client.close();
  }

  get closed() {
    return this.client.closed;
  }
}
