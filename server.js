// *** SETUP ***
//
var crypto = require ('crypto');

var dale   = require ('dale');
var teishi = require ('teishi');
var lith   = require ('lith');
var cicek  = require ('cicek');

var type = teishi.type, clog = teishi.clog, eq = teishi.eq, last = teishi.last, inc = teishi.inc, reply = cicek.reply;

var CONFIG = require ('./config.js');

// *** HELPERS ***

var sleep = async function (ms) {
   return new Promise (function (resolve) {return setTimeout (resolve, ms)});
}

/*
 - Run async functions in sequence or in parallel (depending on options.concurrent)
 - Stop at the first error
*/
dale.async = async function (input, fun, options) {

   if (teishi.simple (input)) input = [input];

   var options = options || {};
   if (options.concurrent === undefined) options.concurrent = 1;

   var index = 0, done = 0, keys = dale.keys (input), results = [], errored;

   var next = async function () {
      if (errored) return;
      var i = index++;
      try {
         results [keys [i]] = await fun (input [keys [i]], keys [i]);
         done++;
         if (index < keys.length) next ();
      }
      catch (error) {
         if (errored) return;
         errored = true;
         if (options.catch) options.catch (error);
         else               throw new Error (error);
      }
   }

   dale.go (dale.times (Math.min (keys.length, options.concurrent)), next);

   while (done < keys.length) {
      await sleep (1);
   }

   return results;
}

var stop = function (rs, rules) {
   return teishi.stop (rules, function (error) {
      reply (rs, 400, {error: error});
   }, true);
}

var replyError = function (rs, error) {
   clog (error.stack);
   reply (rs, 500, {error: error.toString (), stack: error.stack});
}

var fatalError = function (type, error, origin) {
   // TODO: attempt log to self
   clog ({priority: 'critical', type: type, error: error, stack: error.stack, origin: origin});
   process.exit (1);
}


// *** DB SETUP ***

var db = {};

db.client = new (require ('pg').Client) (CONFIG.postgres);

db.client.connect (async function (error) {
   if (! error) {
      if (cicek.isMaster) await db.reset (process.argv [2] !== 'RESET_DB');
      return clog ({priority: 'normal', type: 'Postgres connection OK'});
   }

   fatalError ('Postgres connection error', error);
});

// *** DB SCHEMA ***

db.schema = {
   fourlite_log: {
      id:          'UUID',
      t:           'TIMESTAMPTZ NOT NULL',
      json:        'JSON',
      text:        'TEXT',
      tags:        'TEXT[]',
      CONSTRAINTS: 'PRIMARY KEY (id)'
   },
   fourlite_stat: {
      id:          'UUID',
      t:           'TIMESTAMPTZ NOT NULL',
      n:           'DECIMAL NOT NULL',
      tags:        'TEXT[]',
      CONSTRAINTS: 'PRIMARY KEY (id)'
   },
   INDEXES: [
      {name: 'fourlite_logT',  table: 'fourlite_log',  columns: 't'},
      {name: 'fourlite_statT', table: 'fourlite_stat', columns: 't'},
   ],
};

// *** DB METHODS ***

// This is not the join you're looking for.
db.join = function (array) {
   return array.join (', ');
}

db.query = async function (description, query, parameters) {
   if (type (query) === 'array') query = query.join (' ');
   if (query [query.length - 1] !== ';') query += ';';

   var startTime = Date.now ();
   clog ({type: 'Running query', description: description, query: query, parameters: parameters});
   var result = await db.client.query (query, parameters);
   clog ({type: 'Ran query OK!', description: description, ms: Date.now () - startTime, query: query, parameters: parameters});
   return result;
}

db.write = function (tableName, data) {
   return db.query ('Write row into ' + tableName, [
      'INSERT INTO',
      tableName,
      '(',
      db.join (dale.keys (data)),
      ')',
      'VALUES (',
      db.join (dale.go (dale.times (dale.keys (data).length), function (v) {
         return '$' + v;
      })),
      ')'
   ], Object.values (data));
};

db.read = async function (tableName, query) {
   if (type (query.sort) === 'array' && query.sort.length === 0) delete query.sort;

   var result = await db.query ('Read rows from ' + tableName, [
      'SELECT * FROM',
      tableName,
      query.sort ? 'ORDER BY' : '',
      dale.go (query.sort, function (sort) {
         return dale.keys (sort) [0] + ' ' + Object.values (sort) [0];
      }).join (', '),
   ]);
   return result.rows;
};

db.reset = async function (onlyIfEmpty) {

   if (onlyIfEmpty) {
      var exists = await db.query ('Check if logs DB exists', ['SELECT EXISTS (', 'SELECT FROM pg_tables', 'WHERE schemaname = \'public\'', 'AND tablename = \'fourlite_log\'', ')']);
      if (exists.rows [0].exists === true) return;
   }
   // DELETE TABLES
   await dale.async (db.schema, async function (columns, tableName) {
      if (tableName !== 'INDEXES') return db.query ('Delete table ' + tableName, ['DROP TABLE IF EXISTS', tableName]);
   });

   // CREATE TABLES
   await dale.async (db.schema, async function (columns, tableName) {
      if (tableName !== 'INDEXES') return db.query ('Create table ' + tableName, [
         'CREATE TABLE',
         tableName,
         '(',
         db.join (dale.fil (columns, undefined, function (type, name) {
            if (name !== 'CONSTRAINTS') return name + ' ' + type;
         })),
         columns.CONSTRAINTS ? ', ' + columns.CONSTRAINTS : '',
         ')',
      ]);
   });

   // CREATE INDEXES
   await dale.async (db.schema.INDEXES, function (index) {
      return db.query ('Create index ' + index.name, [
         'CREATE INDEX',
         index.name,
         'ON',
         index.table,
         '(',
         db.join ([...index.columns]),
         ')'
      ]);
   });
}

// *** ROUTES ***

var routes = [

   // *** STATIC ASSETS ***

   ['get', '/', reply, lith.g ([
      ['!DOCTYPE HTML'],
      ['html', [
         ['head', [
            ['meta', {name: 'viewport', content: 'width=device-width,initial-scale=1'}],
            ['meta', {charset: 'utf-8'}],
            ['title', 'Fourlite'],
            ['link', {rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/normalize/8.0.1/normalize.min.css'}],
            ['link', {rel: 'stylesheet', href: 'https://cdnjs.cloudflare.com/ajax/libs/tachyons/4.11.1/tachyons.min.css'}],
         ]],
         ['body', [
            dale.go (['gotoB.min.js'], function (v) {
               return ['script', {src: 'assets/' + v}];
            }),
            ['script', {src: 'client.js'}],
         ]]
      ]]
   ])],

   ['get', 'client.js', cicek.file, 'client.js'],

   ['get', 'assets/gotoB.min.js', cicek.file, 'node_modules/gotob/gotoB.min.js'],

   // *** PREFLIGHT ***

   ['options', '*', function (rq, rs) {
      reply (rs, 204);
   }],

   // *** RESET DB ***

   ['post', 'reset', async function (rq, rs) {
      await db.reset ();
      reply (rs, 200);
   }],

   // *** WRITE LOGS ***

   ['post', 'logs', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['logs', 'tags', 'override', 't'], 'eachOf', teishi.test.equal],
         ['logs', rq.body.logs, 'array'],
         ['logs', rq.body.logs, ['object', 'string'], 'eachOf'],
         ['tags', rq.body.tags, 'array'],
         ['tags', rq.body.tags, 'string', 'each'],
         ['override', rq.body.override, ['undefined', 'object', 'string'], 'oneOf'],
         ['t', rq.body.t, ['undefined', 'integer', 'object'], 'oneOf'],
         type (rq.body.t) === 'object' ? [
            ['t.from', rq.body.t.from, 'string'],
            ['t.tzMinutes', rq.body.t.tzMinutes, ['undefined', 'integer'], 'oneOf'],
            rq.body.t.tzMinutes !== undefined ? ['t.tzMinutes', rq.body.t.tzMinutes, {min: -840, max: 720}, teishi.test.range] : [],
         ] : [],
      ])) return;

      var pad = function (n) {
         return n >= 10 ? n : '0' + n;
      }

      var parseDate = function (date) {
         var d = new Date (date);
         if (! isNaN (d.getTime ())) return d.toISOString ();
         // If we're here, we need to parse a shoe.
         // Let's try the nginx date format.
         if (date.match (/\[\d{2}\/[a-z]{3}\/\d{4}:\d{2}:\d{2}:\d{2} [+-]\d{4}\]/i)) {
            var isoDate = [
               date.slice (8, 12),
               '-',
               pad (['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].indexOf (date.slice (4, 7)) + 1),
               '-',
               date.slice (1, 3),
               'T',
               date.slice (13, 15),
               ':',
               date.slice (16, 18),
               ':',
               date.slice (19, 21),
               '.000Z'
            ].join ('');

            var tzMinutes = ((date.slice (22, 23) === '+' ? 1 : -1) * parseInt (date.slice (23, 25)) * 60) + parseInt (date.slice (25, 27));

            return new Date (new Date (isoDate).getTime () + tzMinutes * 60000).toISOString ();
         }

         // If we cannot get a date out of here, we'll just use the current time.
         return new Date ().toISOString ();

      }

      await dale.async (rq.body.logs, async function (log) {
         var t;
         if (type (rq.body.t) === 'integer') t = rq.body.t;
         else if (rq.body.t && rq.body.t.from) {
            if (type (log) === 'object') {
               t = log [rq.body.t.from];
               // TODO: implement nested key lookup
            }
            if (type (log) === 'string') {
               var match = log.match (new RegExp (rq.body.t.from, 'gi'));
               if (match) t = match [0];
            }
         }

         if (type (rq.body.override) === type (log)) {
            if (type (log) === 'object') log = {
               ...log,
               ...rq.body.override
            };
            if (type (log) === 'string') log += ' ' + rq.body.override;
         }

         await db.write ('fourlite_log', {
            id: crypto.randomUUID (),
            t:  parseDate (t),
            [type (log) === 'object' ? 'json' : 'text']: type (log) === 'object' ? JSON.stringify (log) : log,
            tags: rq.body.tags,
         });

      }, {concurrent: 10, catch: function (error) {
         replyError (rs, error);
      }});

      reply (rs, 200);

   }],

   // *** QUERY LOGS ***

   ['post', 'logs/query', async function (rq, rs) {

      if (stop (rs, [
         ['keys of body', dale.keys (rq.body), ['query', 'limit'], 'eachOf', teishi.test.equal],
         ['query', rq.body.query, ['undefined', 'string'], 'oneOf'],
         //['limit', rq.body.limit, ['undefined', 'integer'], 'oneOf'],
         //rq.body.limit !== undefined ? ['limit', rq.body.limit, teishi.test.range, {min: 1, max: 1000}] : [],
      ])) return;

      var logs = await db.read ('fourlite_log', {sort: [{t: 'DESC'}, {id: 'ASC'}]});

      // Filter out `null` values in `text` or `json`
      logs = dale.go (logs, function (log) {
         return dale.obj (log, function (v, k) {
            if (v !== null) return [k, v];
         });
      });

      // TODO: add DB-powered filtering
      logs = dale.fil (logs, undefined, function (log) {
         if (rq.body.query !== undefined && ! JSON.stringify (log).toLowerCase ().match (rq.body.query.toLowerCase ())) return;
         return log;
      });

      var total = logs.length;

      // TODO: add DB-powered pagination
      if (rq.body.limit) logs = logs.slice (0, rq.body.limit);

      reply (rs, 200, {logs: logs, total: total});
   }],

];

// *** SERVER ***

process.on ('uncaughtException', function (error, origin) {
   fatalError ('Uncaught exception', error, origin);
});

// CORS HEADERS
cicek.options.headers = {
   'Access-Control-Allow-Origin': '*',
   'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
   'Access-Control-Allow-Headers': 'Content-Type'
};

cicek.cluster ();

var server = cicek.listen ({port: CONFIG.port}, routes);
