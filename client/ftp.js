import Client from 'basic-ftp';

export class FTPClient {
  constructor(options) {
    this.client = new Client(options.timeout);
    this.client.ftp.encoding = options.encoding || this.client.ftp.encoding;
    this.client.ftp.log = options.logger;
  }

  async size(path) {
    return this.client.size(path);
  }

  async connect(options = {}) {
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
