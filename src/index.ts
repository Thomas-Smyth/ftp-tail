import { Client, StringEncoding } from 'basic-ftp';
import { createHash } from 'node:crypto';
import EventEmitter from 'node:events';
import { createWriteStream, existsSync, statSync, unlinkSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { StrictEventEmitter } from 'strict-event-emitter-types';

interface FtpTailEvents {
  line: (data: string) => void;
  error: (error: unknown) => void;
  connected: void;
  disconnect: void;
}

type FtpTailEventEmitter = StrictEventEmitter<EventEmitter, FtpTailEvents>;

interface FtpOptions {
  host?: string;
  port?: number;
  timeout?: number;
  encoding?: StringEncoding;
}

type Logger = (message?: any, ...optionalParams: any[]) => void;

export interface FtpTailOptions {
  ftp: FtpOptions;
  fetchInterval: number;
  tailLastBytes: number;
  log: Logger | boolean;
}

export default class FtpTail extends (EventEmitter as { new (): FtpTailEventEmitter }) {
  private options: FtpTailOptions;
  private client: Client;
  private log: Logger;

  // Setup internal properties.
  private lastByteReceived: number | null = null;

  private fetchLoopActive = false;
  private fetchLoopPromise: Promise<void> | null = null;

  constructor(options: Partial<FtpTailOptions>) {
    // eslint-disable-next-line constructor-super
    super();

    // Set default options.
    this.options = {
      ftp: {},
      fetchInterval: 0,
      tailLastBytes: 10 * 1000,
      log: false,
      ...options
    };

    // Setup basic-ftp client.
    this.client = new Client(this.options.ftp.timeout);
    if (this.options.ftp.encoding) this.client.ftp.encoding = this.options.ftp.encoding;

    // Setup logger.
    if (typeof this.options.log === 'function') {
      this.log = this.options.log;
      this.client.ftp.log = this.options.log;
    } else if (this.options.log) {
      this.log = console.log;
      this.client.ftp.log = console.log;
    } else {
      this.log = () => {};
      this.client.ftp.log = () => {};
    }
  }

  async watch(filePath: string) {
    // Setup temp file.
    const tmpFilePath = join(
      process.cwd(),
      createHash('md5')
        .update(`${this.options.ftp.host}:${this.options.ftp.port}:${filePath}`)
        .digest('hex') + '.tmp'
    );

    // Connect.
    await this.connect();

    // Start fetch loop.
    this.log('Starting fetch loop...');
    this.fetchLoopActive = true;
    this.fetchLoopPromise = this.fetchLoop(filePath, tmpFilePath);
  }

  async unwatch() {
    this.log('Stopping fetch loop...');
    this.fetchLoopActive = false;
    await this.fetchLoopPromise;
  }

  async fetchLoop(filePath: string, tmpFilePath: string): Promise<void> {
    while (this.fetchLoopActive) {
      try {
        // Store the start time of the loop.
        const fetchStartTime = Date.now();

        // Reconnect the FTP client in case it has disconnected.
        await this.connect();

        // Get the size of the file on the FTP server.
        this.log('Fetching size of file...');
        const fileSize = await this.client.size(filePath);
        this.log(`File size is ${fileSize}.`);

        // If the file size has not changed then skip this loop iteration.
        if (fileSize === this.lastByteReceived) {
          this.log('File has not changed.');
          await this.sleep(this.options.fetchInterval);
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
          createWriteStream(tmpFilePath, { flags: 'w' }),
          filePath,
          this.lastByteReceived
        );

        // Update the last byte marker - this is so we can get data since this position on the next
        // FTP download.
        const downloadSize = statSync(tmpFilePath).size;
        this.lastByteReceived += downloadSize;
        this.log(`Downloaded file of size ${downloadSize}.`);

        // Get contents of download.
        const data = await readFile(tmpFilePath, 'utf8');

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
        this.log(`Error in fetch loop: ${err instanceof Error ? err.stack : err}`);
      }
    }

    if (existsSync(tmpFilePath)) {
      unlinkSync(tmpFilePath);
      this.log('Deleted temp file.');
    }

    await this.disconnect();
  }

  async connect() {
    if (!this.client.closed) return;

    this.log('Connecting to FTP server...');
    await this.client.access(this.options.ftp);
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

  async sleep(ms: number) {
    this.log(`Sleeping for ${ms} seconds...`);
    await new Promise((resolve) => setTimeout(resolve, ms));
  }
}
