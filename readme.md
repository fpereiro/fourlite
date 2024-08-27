# Fourlite

> "[T]he incomprehensible should cause suspicion rather than admiration." -- Niklaus Wirth

Fourlite is an ultralight service that provides four things:

- `log`: a way to store **logs** and easily query them.
- `stat`: a way to store **stats** and easily query them.
- `beat`: a way to retrieve **CPU, memory & disk usage** from servers and store it as **stats**.
- `ping`: a way to send alerts based on incoming logs & stats.

Well, it was supposed to be four things, but I couldn't resist adding a simple queue system, so it's five.

- `queue`: a way to implement **queues**.

## Current status of the project

The current version of fourlite, v0.0.0, is considered to be *experimental*. Put on your hard hat!

## Rationale

### Why care about logs and stats?

We write software systems in order to store, modify and transmit data. This data usually lives inside databases and files. Any software system, no matter how hastily assembled, preserves its data in databases and/or files. This data comprises the "state" of the system at any given point. This data generally has a single access point (for structured data, the database(s); for files, a S3 storage or a functional equivalent of it).

However, the *execution* of our code also produces other data that sometimes is not preserved; and if it is preserved, it is usually not centralized. I'm referring to *logs* and *stats*. Logs can be simple strings printed (such as "DEBUG saving widget to DB") or more structured data such as `{"entity": "widget", "op": "save", "id": "abcdef"}`. They provide a way to get some feedback from the code that is being executed inside a software system. In the absence of interactive tools to build and run software systems, they represent crucial information both when developing and when maintaining the software system.

Stats are usually not captured. Those most useful are the ones indicating how much time an operation takes, or how many operations of a certain kind have happened on a certain time window.

Why don't we always have our logs and our stats collected and readily available? The answer is not because we don't have the tools. There is a plethora of tools for creating, storing and querying logs and statistics, many of them open source, many of them integrated with cloud providers, many of them incredibly powerful and flexible and full of features.

I'm of the minority opinion that this abundance of tools and features is exactly what *prevents* the proper collection of logs and stats. Choosing a combination of tools (because there's no single tool that gets the job done, apart from integrated (and expensive) services such as Datadog) is difficult; configuring them can be quite time-consuming. Which means that logs and stats get usually pushed until a production release is near; or even as an improvement point once the system is already in production.

Fourlite is not competing with the existing tools for storing and querying logs and stats; rather, it competes with `print` and `console.log`.

### What is different between Fourlite and (other tools|console.log)?

- *Almost* zero config, whether you run it locally or remotely. You should be up and running in less than 90 seconds.
- Comes with an integrated web client.
- Stores **everything** in a relational database, so you can query the DB directly if the client doesn't support the query that you want -- or if you hate the client.
- Very very few moving parts, so you can always understand what Fourlite is doing.
- No need to configure "boxes" for certain logs or stats; once Fourlite is running, you can directly send logs or stats to it and then query them.
- You can tag logs and stats, so you can do useful things like marking them as "read", "resolved", or "CRITICAL".
- You can send logs/stats to Fourlite, or Fourlite can retrieve them for you reading a local file, connecting through SSH or even through an *intake* that you can define (like `kubectl`). Fourlite is proudly [agentless](https://en.wikipedia.org/wiki/Software_agent).

- You can send multiple types of logs, such as unstructured logs, structured logs in a single line, JSON logs; you can later query them separately or together.
- There's only a single type of stat: a number. Depending on how you query it, you can treat it like a [stock variable](https://en.wikipedia.org/wiki/Stock_and_flow) or a [flow variable](https://en.wikipedia.org/wiki/Stock_and_flow).
- Stats that represent server metrics are stored together with the other stats, avoiding the dreaded "monitoring stats silo".
- A notification is a single HTTP(S) request sent whenever a log or stat matching a certain set of condition arrives. That's it.

## Quick start

1. To install dependencies, run `npm i fourlite`
2. Modify `config.js` with the configuration details (host, port, user, password) of the Postgres DB that Fourlite will use to store its data.

If you want to create a Postgres that matches what's already in `config.js`, an easy way to do it is with Docker, just running:

```
docker run --env=POSTGRES_PASSWORD=REPLACE_ME -p 2627:5432 --name=fourlite-db -d postgres
```

But it'd probably be a good idea to change `REPLACE_ME` with a better password, unless you're running Fourlite locally (in which case, to the best of my knowledge, it doesn't matter).

3. To run Fourlite, run `node server`.

4. If for some reason you want to delete all Fourlite data and recreate the tables, run `node server DB_RESET`. This will completely destroy all the data you had in your Fourlite DB.

## Logs

### Sending logs to fourlite through monkey-patching

**Monkey patching your frontend application**

If `FOURLITE_CONFIG` is defined and its value is the path to Fourlite (for example, `localhost:2626`), you can send all the browser traffic that goes through the `fetch` function, like this:

```javascript
  if (FOURLITE_CONFIG) {
    const originalFetch = fetch;

    const fourlite = async function (body: object) {
      await originalFetch (FOURLITE_CONFIG, {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify (body),
      });
    }

    window.fetch = async function (req, options) {

      const path = req instanceof Request ? req.url : req;
      let requestBody: any;

      if (req instanceof Request) {
        requestBody = await req.clone().text();
      } else if (typeof req === "string") {
        if (options && options.body) {
            if (typeof options.body === "string") {
                requestBody = options.body;
            } else {
                requestBody = await new Response(options.body).text();
            }
        }
      }

      if (requestBody) {
        try {
          requestBody = JSON.parse (requestBody);
        }
        catch (error) {
          console.log ('Ignore');
        }
      }

      const t = Date.now ();
      const reqId = parseInt ((Math.random () + '').slice (2, 8)).toString (16);

      if (path !== FOURLITE_CONFIG) fourlite ({
        t: Date.now (),
        logs: [
          {
            reqId,
            method: options ? options.method : 'GET',
            path,
            reqHeaders: req instanceof Request ? req.headers : (options ? options.headers : undefined),
            reqBody: requestBody,
          }
        ],
        tags: ['UI'],
      });

      const res = await originalFetch (req, options);

      const clonedResponse = res.clone ();
      let responseBody = await clonedResponse.text ();
      if (responseBody) {
        try {
          responseBody = JSON.parse (responseBody);
        }
        catch (error) {
          console.log ('Ignore');
        }
      }

      if (path !== FOURLITE_CONFIG) fourlite ({
        t: Date.now (),
        logs: [
          {
            reqId,
            method: options ? options.method : 'GET',
            path,
            code: res.status,
            resHeaders: res.headers,
            resBody: responseBody,
            duration: Date.now () - t,
          }
        ],
        tags: ['UI'],
      });
      return res;
    }
  }
```

### Store logs

This is how logs look in the DB:

```
{
   id: '88d4d59c-f549-47b6-bf28-5308987bf146',
   t: '2024-07-08T13:14:33.056Z',
   json: undefined|{
   },
   text: undefined|'...',
   tags: [
      ...
   ],
}
```

This is how you can post logs to Fourlite:

```
POST /logs

{
   logs: [
      {...},
      '...',
   ],
   tags: undefined|[
      '...'
   ],
   override: undefined|{
   }|'...',
   t: undefined|INT|{
      from: '<field_name>'|'/regex/',
      tzMinutes: undefined|<integer between -840 and 720>
   },
}
```

- `logs` must be an array with zero or more log entries. Each log entry can either be a JSON log **or** a text log. You can mix JSON and text log entries in the same request.
- `tags` must be either `undefined` or an array of zero or more strings.
- `override` must be either `undefined` or a JSON log or a text log. If it is a JSON log, it will be spreaded onto each JSON log inside `logs` and will not affect text logs. If it is a text log, it will be appended (after a space) to each text log.
- `t`: must be either `undefined`, an integer (representing UTC time in milliseconds after the epoch) or an object. If `t.from` is present, it will represent either the field name from which to extract the time entry from each log; or a regex that, when matched, will yield a parseable date string. `t.tzMinutes`, if present, applies a timezone offset to convert the extracted date to UTC.

Design FAQ:
- Why multiple logs per call? To save requests if we're sending multiple logs at the same time.
- Why allow mixing log types (JSON vs text) per call? To make data imports trivial.

Parseable date strings are (for now):
- Anything that you can stick into `new Date (...)` and will return a date. For example, milliseconds from the unix epoch, or an ISO date string.
- Default nginx dates.

Example 1:

```
POST /logs

{
   logs: [
      {type: 'req', path: '/', time: '2024-07-08T13:14:33.056Z'},
      {type: 'res', path: '/', time: '2024-07-08T13:14:33.058Z', code: 200},
   ],
   override: {server: 'server3'},
   tags: ['http'],
   t: {from: 'time'}
}
```

Will generate these two log entries in the DB:

```
[
   {
      id: ...,
      t: '2024-07-08T13:14:33.056Z',
      json: {type: 'req', path: '/', time: '2024-07-08T13:14:33.056Z', server: 'server3'},
      tags: ['http'],
   },
   {
      id: ...,
      t: '2024-07-08T13:14:33.058Z',
      json: {type: 'res', path: '/', time: '2024-07-08T13:14:33.058Z', code: 200, server: 'server3'},
      tags: ['http'],
   },
]
```

Example 2:

```
POST /logs

{
   logs: [
      '100.200.200.100 - - [08/Jul/2024:02:16:15 +0000] "GET /wp-content/.env HTTP/1.1" 404 197 "-" "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36"',
      '100.200.200.100 - - [08/Jul/2024:02:16:15 +0000] "GET /wp-admin/.env HTTP/1.1" 404 197 "-" "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36"',
   ],
   override: 'access.log',
   tags: ['nginx'],
   t: {
      from: '(?<=\[)(.*?)(?=\])'
   },
}
```

Will generate these two log entries in the DB:

```
[
   {
      id: ...,
      t: '2024-07-08T02:16:15.000Z',
      text: '100.200.200.100 - - [08/Jul/2024:02:16:15 +0000] "GET /wp-content/.env HTTP/1.1" 404 197 "-" "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36" access.log',
      json: {type: 'req', path: '/', time: '2024-07-08T13:14:33.056Z'},
      tags: ['nginx'],
   },
   {
      id: ...,
      t: '2024-07-08T02:16:15.000Z',
      text: '100.200.200.100 - - [08/Jul/2024:02:16:15 +0000] "GET /wp-admin/.env HTTP/1.1" 404 197 "-" "Mozilla/5.0 (Windows NT 6.1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.183 Safari/537.36" access.log',
      tags: ['nginx'],
   },
]
```

### Query logs

To query logs:

```
POST /logs/query

{
   id: undefined|<uuid>,
   t: {
       min: undefined|<date>,
       max: undefined|<date>,
   },
   log: [
      ['user', {eq: 'foo'}], // eqin: case insensitive
      ['user', {match: 'foo'}], // matchin: case insensitive
      ['count', {min: 3, max: 4}],
      [['items', 0], {eq: 'foo'}],
      [['items', '*'], {eq: 'foo'}],
   ],
   tags: [
      ...
   ],
}
```

TODO: complete query example

## TODO

- mongroup
- Logs
   - Extend query
   - Expand/compact large entries
   - Group by (eg: reqId)
   - Sampling conditional to query
   - Delete
   - Implement nested key lookup for time
- Stat
   - Send
   - Query
   - Delete
- Tag/untag log/stat
- General
   - Add API key
   - Enter API key on client to unblock
   - Wipe all data
   - Export/import data like upsert
- The other three
   - Add ping
   - Add beat
   - Add queue

## License

Fourlite is written by [Federico Pereiro](fpereiro@gmail.com) and released into the public domain.
