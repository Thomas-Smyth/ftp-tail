import crypto from 'crypto';
import EventEmitter from 'events';
import fs from 'fs';
import { readFile } from 'fs/promises';
import path from 'path';

import { FTPClient, SFTPClient } from './client/index.js';

export default class FTPTail extends EventEmitter {
  constructor(options) {
    super();

    // Set default options.
    this.options = {
      ftp: {},
      fetchInterval: 0,
      tailLastBytes: 10 * 1000,
      log: false,
      mode: 'ftp',
      ...options
    };

    // Setup logger.
    if (typeof this.options.log === 'function') {
      this.log = this.options.log;
    } else if (this.options.log) {
      this.log = console.log;
    } else {
      this.log = () => {};
    }

    // Client dfeault parameters
    let clientOptions = {
      timeout: this.options.ftp.timeout,
      log: this.log,
      encoding: this.options.ftp.encoding
    };

    switch (options.mode) {
      case 'ftp':
        this.client = new FTPClient(clientOptions);
        break;
      case 'sftp':
        this.client = new SFTPClient(clientOptions);
        break;
      default:
        throw new Error('Invalid mode.');
    }

    // Setup internal properties.
    this.filePath = null;
    this.lastByteReceived = null;

    this.fetchLoopActive = false;
    this.fetchLoopPromise = null;
  }

  async watch(filePath) {
    this.filePath = filePath;

    // Setup temp file.
    this.tmpFilePath = path.join(
      process.cwd(),
      crypto
        .createHash('md5')
        .update(`${this.options.ftp.host}:${this.options.ftp.port}:${this.filePath}`)
        .digest('hex') + '.tmp'
    );

    // Connect.
    await this.connect();

    // Start fetch loop.
    this.log('Starting fetch loop...');
    this.fetchLoopActive = true;
    this.fetchLoopPromise = this.fetchLoop();
  }

  async unwatch() {
    this.log('Stopping fetch loop...');
    this.fetchLoopActive = false;
    await this.fetchLoopPromise;
  }

  async fetchLoop() {
    while (this.fetchLoopActive) {
      try {
        // Store the start time of the loop.
        const fetchStartTime = Date.now();

        // Reconnect the FTP client in case it has disconnected.
        await this.connect();

        // Get the size of the file on the FTP server.
        this.log('Fetching size of file...');
        const fileSize = await this.client.size(this.filePath);
        this.log(`File size is ${fileSize}.`);

        // If the file size has not changed then skip this loop iteration.
        if (fileSize === this.lastByteReceived) {
          this.log('File has not changed.');
          await this.sleep(this.options.fetchInterval);
          continue;
        }

        // If the file has not been tailed before or it has been decreased in size download the last
        // few bytes.
        if (this.lastByteReceived === null || this.lastByteReceived > fileSize) {
          this.log('File has not been tailed before or has decreased in size.');
          this.lastByteReceived = Math.max(0, fileSize - this.options.tailLastBytes);
        }

        // Download the data to a temp file overwritting any previous data.
        this.log(`Downloading file with offset of ${this.lastByteReceived}...`);
        await this.client.downloadTo(
          fs.createWriteStream(this.tmpFilePath, { flags: 'w' }),
          this.filePath,
          this.lastByteReceived
        );

        // Update the last byte marker - this is so we can get data since this position on the next
        // FTP download.
        const downloadSize = fs.statSync(this.tmpFilePath).size;
        this.lastByteReceived += downloadSize;
        this.log(`Downloaded file of size ${downloadSize}.`);

        // Get contents of download.
        const data = await readFile(this.tmpFilePath, 'utf8');

        // Only continue if something was fetched.
        if (data.length === 0) {
          this.log('No data was fetched.');
          await this.sleep(this.options.fetchInterval);
          continue;
        }

        data
          // Remove trailing new lines.
          .replace(/\r\n$/, '')
          // Split the data on the lines.
          .split('\r\n')
          // Emit each line.
          .forEach((line) => this.emit('line', line));

        // Log the loop runtime.
        const fetchEndTime = Date.now();
        const fetchTime = fetchEndTime - fetchStartTime;
        this.log(`Fetch loop took ${fetchTime}ms.`);

        await this.sleep(this.options.fetchInterval);
      } catch (err) {
        this.emit('error', err);
        this.log(`Error in fetch loop: ${err.stack}`);
      }
    }

    if (fs.existsSync(this.tmpFilePath)) {
      fs.unlinkSync(this.tmpFilePath);
      this.log('Deleted temp file.');
    }

    await this.disconnect();
  }

  async connect() {
    if (!this.client.closed) return;

    this.log('Connecting to FTP server...');
    await this.client.connect(this.options.ftp);
    this.emit('connected');
    this.log('Connected to FTP server.');
  }

  async disconnect() {
    if (this.client.closed) return;

    this.log('Disconnecting from FTP server...');
    await this.client.close();
    this.emit('disconnect');
    this.log('Disconnected from FTP server.');
  }

  async sleep(ms) {
    this.log(`Sleeping for ${ms} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
