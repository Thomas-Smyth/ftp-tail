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

      useListForSize: options.useListForSize || false,
    };

    this.tempFilePath = path.join(
      process.cwd(),
      crypto
        .createHash('md5')
        .update(`${this.options.host}:${this.options.port}:${this.options.path}`)
        .digest('hex') + '.tmp'
    );

    if (this.options.useListForSize) this.log('Using SIZE workaround');

    this.lastByteReceived = null;
  }

  async fetchLoop() {
    while (this.fetchInterval !== -1) {
      try {
        const fetchStartTime = Date.now();

        // reconnect the client if not connected already
        if (this.client.closed) {
          this.log('Reconnecting...');
          await this.client.access({
            host: this.options.host,
            port: this.options.port,
            user: this.options.user,
            password: this.options.password,
            secure: this.options.secure,
          });
          this.emit('reconnect');
          this.log('Reconnected.');
        }

        // get size of file on remote
        this.log('Fetching size of file...');
        const fileSize = this.options.useListForSize
          ? await this.listSize(this.options.path)
          : await this.client.size(this.options.path);
        this.log(`File size is ${fileSize}.`);

        // if file has not been tailed before then download last few bytes
        if (this.lastByteReceived === null || fileSize < this.lastByteReceived) {
          this.log('Tailing new file.');
          this.lastByteReceived = Math.max(0, fileSize - this.options.tailLastBytes);
        } else if (this.lastByteReceived === fileSize) {
          this.log('File has not changed.');
          await this.sleep();
          continue;
        }

        // Download the data to a temp file, overwrite any previous data
        // overwrite previous data to calculate how much data we've received
        this.log(`Downloading file with offset of ${this.lastByteReceived}...`);
        await this.client.downloadTo(
          fs.createWriteStream(this.tempFilePath, { flags: 'w' }),
          this.options.path,
          this.lastByteReceived
        );
        this.log(`Downloaded file.`);

        // update the last byte marker - this is so we can get data since this position on the next ftp download
        const downloadSize = fs.statSync(this.tempFilePath).size;
        this.lastByteReceived += downloadSize;
        this.log(`Downloaded file size if ${downloadSize}.`);

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
        if (this.options.verbose) this.log(`FTP Fetch took ${fetchTime} ms.`);

        // wait for next fetch
        await this.sleep();
      } catch (err) {
        this.log(`Error: ${err.message}`);
        this.emit('error', err);
      }
    }

    // disconnect
    if (!this.client.closed) {
      await this.client.close();
      this.emit('disconnect');
      this.log('Disconnected.');
    }

    // delete temp file
    if (fs.existsSync(this.tempFilePath)) {
      this.log(`Deleting temp file ${this.tempFilePath}...`);
      fs.unlinkSync(this.tempFilePath);
    }
  }

  async sleep() {
    if (this.fetchInterval > 0) {
      this.log(`Sleeping ${this.fetchInterval} ms...`);
      await new Promise((resolve) => setTimeout(resolve, this.fetchInterval));
    }
  }

  async watch() {
    // setup client
    this.log('Initialising client...');
    this.client = new ftp.Client(this.options.timeout);
    if (this.options.verbose && this.options.verbose >= 2)
      this.client.ftp.verbose = this.options.verbose;
    if (this.options.encoding) this.client.ftp.encoding = this.options.encoding;

    // connect
    this.log('Connecting...');
    await this.client.access({
      host: this.options.host,
      port: this.options.port,
      user: this.options.user,
      password: this.options.password,
      secure: this.options.secure,
    });
    this.emit('connect');
    this.log('Connected.');

    // start fetch loop
    this.log('Commencing fetch loop...');
    this.fetchInterval = this.options.fetchInterval;
    this.fetchLoop();
  }

  async unwatch() {
    this.fetchInterval = -1;
  }

  log(msg) {
    if (this.options.verbose >= 1) console.log(`[${Date.now()}] FTPTail (Verbose): ${msg}`);
  }

  async listSize(remotePath) {
    const parsedPath = path.parse(remotePath);
    const fileInfos = await this.client.list(parsedPath.dir);

    const matches = fileInfos.filter((info) => info.name === parsedPath.base);

    if (matches.length === 0) {
      throw new Error('unable to get file size: no matching files');
    }

    if (matches.length > 1) {
      throw new Error(`unable to get file size: multiple matching files: ${matches.length}`);
    }

    return matches[0].size;
  }
}
