import FTPTail from '../index.js';

const client = new FTPTail({
  host: 'xxx.xxx.xxx.xxx',
  port: 22,
  user: 'user',
  password: 'password',
  secure: undefined,
  timeout: undefined,
  verbose: true,
  encoding: 'utf8',

  path: '/path/to/file',
  fetchInterval: 0,
  maxTempFileSize: 5 * 1000 * 1000, // 5 MB
  tailLastBytes: 10 * 1000,
});

client.on('line', console.log);
