// *** SETUP ***

var dale = window.dale, teishi = window.teishi, lith = window.lith, c = window.c, B = window.B;

var type = teishi.type, clog = teishi.clog;

// *** VIEWS ***

var views = {};

views.css = ['style', [
   ['html', {
      padding: 10
   }],
   ['table', {
      width: '1px', // https://stackoverflow.com/questions/1183676/how-do-i-prevent-my-html-table-from-stretching
      'border-collapse': 'collapse',
      'font-size': 18,
      'text-align': 'left'
   }],
   ['tr:nth-child(even)', {'background-color': '#f2f2f2'}],
   ['th', {
      padding: '12px 15px',
      border: '1px solid #ddd',
      'background-color': '#4CAF50',
      color: 'white',
   }],
   ['td', {
      padding: '12px 15px',
      border: '1px solid #4CAF50',
      color: '#333',
   }],
]];

views.main = function () {
   return [
      views.css,
      views.logQuery (),
      views.logTotal (),
      views.logResult (),
   ];
};

views.snackbar = function () {
   return [
      ['style', [
         ['.snackbar', {
            position: 'fixed',
            bottom: 70,
            left: 0,
            'z-index': '1000',
            display: 'flex',
            'align-items, justify-content': 'center',
            width: 1,
            'min-height': 50,
            'padding-top, padding-bottom': 10,
            'padding-left, padding-right': 60,
         }],
         ['.snackbar__close', {
            position: 'absolute',
            top: 0.5,
            right: CSS.vars ['padding--s'],
            transform: 'translateY(-50%)',
         }],
      ]],
      B.view (['State', 'snackbar'], function (snackbar) {
         if (! snackbar) return ['div'];
         var bcolor = 'rgba(' + CSS.toRGBA (snackbar.color) + ', 0.9)';
         return ['div', {class: 'snackbar', style: style ({bottom: 0, 'background-color': bcolor})}, [
            ['p', {class: 'snackbar__text'}, [
               ['span', {class: 'snackbar__text-concept'}, snackbar.message],
            ]],
            ['div', {class: 'snackbar__close', onclick: B.ev ('clear', 'snackbar')}, [
               ['div', {class: 'close-button close-button--snackbar'}, [
                  ['div', {class: 'close-button__inner'}, [
                     ['span', {class: 'close-button__line'}],
                     ['span', {class: 'close-button__line'}],
                  ]],
               ]],
            ]],
         ]];
      })
   ];
}

views.logQuery = function () {
   return B.view (['State', 'query'], function (query) {
      query = query || '';
      return ['div', [
         ['input', {
            class: 'pa3 input-reset ba b--black-20 bg-lightest-blue hover-bg-light-blue w-50',
            placeholder: 'Query',
            onchange: B.ev ('set', ['State', 'query']),
            oninput:  B.ev ('set', ['State', 'query']),
            value: query,
         }],
      ]];
   });
}

views.logTotal = function () {
   return B.view ([['Data', 'logs'], ['Data', 'total'], ['Data', 'perf']], function (logs, total, perf) {
      if (! logs || ! perf) return ['p', 'Loading...'];
      return ['p', [
         'Showing ',
         logs.length,
         '/',
         total,
         ' logs ',
         '(' + perf.t + 'ms, ',
         Math.round (perf.bytes / 1000) + 'kb)',
      ]];
   });
}

views.logResult = function () {
   return B.view ([['Data', 'logs'], ['State', 'expand']], function (logs, expand) {

      // TODO: move this to a query
      // Group logs by `reqId`
      var groupedLogs = {};
      dale.go (logs, function (log) {
         if (! log.json || ! log.json.reqId) return;
         if (! groupedLogs [log.json.reqId]) groupedLogs [log.json.reqId] = log;
         else groupedLogs [log.json.reqId].json = {...groupedLogs [log.json.reqId].json, ...log.json};
      });
      logs = dale.fil (logs, undefined, function (log) {
         if (! log.json || ! log.json.reqId) return log;
         if (! groupedLogs [log.json.reqId]) return;
         log = groupedLogs [log.json.reqId];
         delete groupedLogs [log.json.reqId];
         return log;
      });

      return ['table', [
         ['tr', dale.go (['#', 't', 'tags', 'log'], function (v) {return ['th', v]})],

         dale.go (logs, function (log, logIndex) {
            return ['tr', dale.go (['#', 't', 'tags', 'log'], function (k) {

               if (k === '#') return ['td', logs.length - logIndex];

               if (k === 'tags') return ['td', dale.go (log.tags, function (tag) {return ['span', {class: 'dib pa2 br3 bg-blue white'}, tag]})];

               if (k === 't') return B.view (['State', 'now'], function (now) {
                  var ago = Math.round ((now - new Date (log.t).getTime ()) / 1000);
                  if (ago < 60)                ago += 's';
                  else if (ago < 60 * 60)      ago = Math.round (ago / 60) + 'm';
                  else if (ago < 60 * 60 * 24) ago = Math.round (ago / (60 * 60)) + 'h';
                  else                         ago = Math.round (ago / (60 * 60 * 24)) + 'd';

                  var t = dale.go ([log.t.slice (0, 10), log.t.slice (11, 23) + ' UTC'], function (v) {return [['span', v], ['br']]});

                  return ['td', [t, ' (' + ago + ' ago)']];
               });
               if (k === 'log') {
                  if (log.text) return ['td', log.text];

                  // JSON log
                  var nestedTable = function (obj) {
                     var columns = dale.keys (obj).sort ();
                     return ['table', [
                        ['tr', dale.go (columns, function (k) {return ['th', k]})],
                        ['tr', dale.go (columns, function (k) {
                           var v = obj [k];
                           if (teishi.simple (v)) {
                              v = v + '';
                              if (v.length === 0) v = '""';
                              if (v.length > 1000) v = v.slice (0, 1000) + ' [' + (v.length - 1000) + ' CHARACTERS OMITTED]';
                              return ['td', dale.go (v.match (/.{1,50}/g), function (v2) {
                                 return [['span', v2], ['br']];
                              })];
                           }
                           if (dale.keys (v).length === 0) return ['td', JSON.stringify (v)];
                           if (JSON.stringify (v).length > 500 && ! (expand || []).includes (log.id)) return ['td', ['a', {class: 'blue fw7 underline pointer', onclick: B.ev ('add', ['State', 'expand'], log.id)}, 'Expand']];
                           return ['td', nestedTable (v)];
                        })],
                     ]];
                  }
                  return ['td', nestedTable (log.json)];
               }
               return ['td', JSON.stringify (log [k])];
            })];
         }),
      ]];
   });
}

// *** RESPONDERS ***

B.mrespond ([
   ['clear', 'snackbar', function (x) {
      var existing = B.get ('State', 'snackbar');
      if (! existing) return;
      if (existing.timeout) clearTimeout (existing.timeout);
      B.call (x, 'rem', 'State', 'snackbar');
   }],
   ['snackbar', '*', function (x, message, noTimeout) {
      B.call (x, 'clear', 'snackbar');
      var colors = {green: '#04E762', red: '#D33E43', yellow: '#ffff00'};
      if (noTimeout) return B.call (x, 'set', ['State', 'snackbar'], {color: colors [x.path [0]], message: message});
      var timeout = setTimeout (function () {
         B.call (x, 'rem', 'State', 'snackbar');
      }, 4000);
      B.call (x, 'set', ['State', 'snackbar'], {color: colors [x.path [0]], message: message, timeout: timeout});
   }],
   [/^(get|post)$/, '*', function (x, headers, body, cb) {
      var t = Date.now (), verb = x.verb, path = x.path [0];

      c.ajax (verb, path, headers, body, function (error, rs) {
         if (cb) cb (x, error, rs);
      });
   }],
   ['read', 'logs', function (x) {
      var t = Date.now ();
      B.call (x, 'post', 'logs/query', {}, {query: B.get ('State', 'query'), limit: 50}, function (x, error, rs) {
         if (error) console.log (error);
         if (error) return B.call (x, 'snackbar', 'red', 'There was an error getting logs.');
         B.call (x, 'set', ['Data', 'logs'], rs.body.logs);
         B.call (x, 'set', ['Data', 'total'], rs.body.total);
         B.call (x, 'set', ['Data', 'perf'], {t: Date.now () - t, bytes: JSON.stringify (rs.body.logs).length});
      });
   }],
]);

// *** INITIALIZATION ***

// Don't store more than 1k log entries
B.r.addLog = function (log) {
   if (B.log.length > 1000) B.log.shift ();
   B.log.push (log);
}

// Update loop
B.set (['State', 'readLoop'], setInterval (function () {
   B.call ('read', 'logs');
   B.call ('set', ['State', 'now'], Date.now ());
}, 1000));

B.mount ('body', views.main);
