// *** SETUP ***

var dale   = require ('dale');
var teishi = require ('teishi');
var h      = require ('hitit');

var type   = teishi.type, clog = teishi.clog, eq = teishi.eq, last = teishi.last, inc = teishi.inc;

var CONFIG = require ('./config.js');

// *** TEST SUITE ***

var suite = [
   ['reset DB', 'post', 'reset', {}, {}, 200],
   ['post JSON logs', 'post', 'logs', {}, {
      logs: [
         {type: 'req', path: '/', time: '2024-07-08T13:14:33.056Z'},
         {type: 'res', path: '/', time: '2024-07-08T13:14:33.058Z', code: 200},
      ],
      override: {server: 'server3'},
      tags: ['http'],
      t: {from: 'time'}
   }, 200],
   ['post text logs', 'post', 'logs', {}, {
      logs: [
         '100.200.200.100 - - [08/Jul/2024:02:16:15 +0000] "GET /wp-content/.env HTTP/1.1" 404 197 "-" "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36"',
         '100.200.200.100 - - [08/Jul/2024:02:16:15 +0000] "GET /wp-admin/.env HTTP/1.1" 404 197 "-" "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36"',
      ],
      override: 'access.log',
      tags: ['nginx'],
      t: {
         from: '\\[[^\\[]+\\]'
      },
   }, 200],
   ['query all logs', 'post', 'logs/query', {}, {}, 200, function (s, rq, rs) {
      clog (rs.body);
      return true;
   }],

];

// *** RUN ***

h.seq ({port: CONFIG.port}, suite, function (error) {
   if (error) return clog ('Error when running tests', error);
   clog ('Tests successful!');
}, h.stdmap);
