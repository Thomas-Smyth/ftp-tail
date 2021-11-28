<div align="center">

## ftp-tail

[![GitHub release](https://img.shields.io/github/release/Thomas-Smyth/ftp-tail.svg?style=flat-square)](https://github.com/Thomas-Smyth/ftp-tail/releases)
[![GitHub contributors](https://img.shields.io/github/contributors/Thomas-Smyth/ftp-tail.svg?style=flat-square)](https://github.com/Thomas-Smyth/ftp-tail/graphs/contributors)
[![GitHub release](https://img.shields.io/github/license/Thomas-Smyth/ftp-tail.svg?style=flat-square)](https://github.com/Thomas-Smyth/ftp-tail/blob/master/LICENSE)

<br>

[![GitHub issues](https://img.shields.io/github/issues/Thomas-Smyth/ftp-tail.svg?style=flat-square)](https://github.com/Thomas-Smyth/ftp-tail/issues)
[![GitHub pull requests](https://img.shields.io/github/issues-pr-raw/Thomas-Smyth/ftp-tail.svg?style=flat-square)](https://github.com/Thomas-Smyth/ftp-tail/pulls)
[![GitHub issues](https://img.shields.io/github/stars/Thomas-Smyth/ftp-tail.svg?style=flat-square)](https://github.com/Thomas-Smyth/ftp-tail/stargazers)
<br><br>
</div>

## **About**
Need to tail a file on a remote server? ftp-tail should be able to help!

## **Motivation**
To collect the data we needed to build [SquadJS](https://github.com/Thomas-Smyth/SquadJS), a scripting framework for [Squad](https://joinsquad.com/) servers, we found we needed to tail the Squad server's log files. As a result of this, it became a requirement that SquadJS must be installed on the same machine as the Squad server, however, this prevented anyone using rented Squad server instances from using SquadJS. Thus, we endeavoured to make it possible for these logs files to be streamed over the FTP servers provided by most hosts - ftp-tail is the outcome of this and we have opened-sourced it for others to benefit from.

## **Usage**
```js
import FTPTail from 'ftp-tail';

(async () => {
  // Initiate FTPTail...
  const tailer = new FTPTail(
    {
      ftp: {
        // basic-ftp's .access options.
        host: "xxx.xxx.xxx.xxx",
        user: "user",
        password: "password",
        
        // As well as...
        timeout: 5 * 1000, // Timeout (optional).
        encoding: 'utf8' // Encoding (optional).
      },

      mode: 'ftp' // Supports ftp and sftp
      fetchInterval: 0, // Delay between polls.
      log: true // Enable logging (also accepts logging function).
    }
  );

  // Do something with the lines, e.g. log them.
  tailer.on('line', console.log);

  // Watch the file...
  await tailer.watch('/SquadGame.log');
  
  // Unwatch the file...
  await tailer.unwatch();
})();
```

## **Credits**
The logic behind ftp-tail was originally proposed, designed and implemented by [awn.gg](https://awn.gg/) - ftp-tail is an open-sourced re-implementation of their efforts. 