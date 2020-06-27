import crypto from 'crypto';
import EventEmitter from 'events';
import fs from 'fs';
import path from 'path';

import ftp from 'basic-ftp';

export default class FTPTail extends EventEmitter {
  constructor(options) {
    super();

    this.options = {
      host: options.host,
      port: options.port,
      user: options.user,
      password: options.password,
      secure: options.secure,
      timeout: options.timeout,
      verbose: options.verbose,
      encoding: options.encoding || 'utf8',

      path: options.path,
      fetchInterval: options.fetchInterval || 0,
      maxTempFileSize: options.maxTempFileSize || 5 * 1000 * 1000, // 5 MB
      tailLastBytes: 10 * 1000,
    };

    this.tempFilePath = path.join(
      process.cwd(),
      crypto
        .createHash('md5')
        .update(`${this.options.host}:${this.options.port}:${this.options.path}`)
        .digest('hex') + '.tmp'
    );

    this.lastByteReceived = null;
  }

  async fetchLoop() {
    while (this.fetchInterval !== -1) {
      const fetchStartTime = Date.now();

      // reconnect the client if not connected already
      if (this.client.closed) {
        await this.client.access({
          host: this.options.host,
          port: this.options.port,
          user: this.options.user,
          password: this.options.password,
          secure: this.options.secure,
        });
      }

      // get size of file on remote
      const fileSize = await this.client.size(this.options.path);

      // if file has not been tailed before then download last few bytes
      if (this.lastByteReceived === null || fileSize < this.lastByteReceived) {
        this.lastByteReceived = Math.max(0, fileSize - this.options.tailLastBytes);
      }

      // Download the data to a temp file, overwrite any previous data
      // overwrite previous data to calculate how much data we've received
      await this.client.downloadTo(
        fs.createWriteStream(this.tempFilePath, { flags: 'w' }),
        this.options.path,
        this.lastByteReceived
      );

      // update the last byte marker - this is so we can get data since this position on the next ftp download
      const downloadSize = fs.statSync(this.tempFilePath).size;
      this.lastByteReceived += downloadSize;

      // get contents of file
      const data = await fs.promises.readFile(this.tempFilePath, 'utf8');

      // only continue if something was fetched
      if (data.length > 0) {
        data
          // strip tailing new lines
          .replace(/\r\n$/, '')
          // split on the lines
          .split('\r\n')
          // emit each line
          .forEach((line) => this.emit('line', line));
      }

      // log fetch time
      const fetchEndTime = Date.now();
      const fetchTime = fetchEndTime - fetchStartTime;
      if (this.options.verbose) console.log(`FTP Fetch took: ${fetchTime} ms`);

      // wait for next fetch
      if (this.fetchInterval > 0)
        await new Promise((resolve) => setTimeout(resolve, this.fetchInterval));
    }
  }

  async watch() {
    // setup client
    this.client = new ftp.Client(this.options.timeout);
    if (this.options.verbose) this.client.ftp.verbose = this.options.verbose;
    if (this.options.encoding) this.client.ftp.encoding = this.options.encoding;

    // connect
    await this.client.access({
      host: this.options.host,
      port: this.options.port,
      user: this.options.user,
      password: this.options.password,
      secure: this.options.secure,
    });

    // start fetch loop
    this.fetchInterval = this.options.fetchInterval;
    this.fetchLoop();
  }

  async unwatch() {
    this.fetchInterval = -1;

    // disconnect
    if (!this.client.closed) await this.client.close();

    // delete temp file
    if (fs.existsSync(this.tempFilePath)) fs.unlinkSync(this.tempFilePath);
  }
}
