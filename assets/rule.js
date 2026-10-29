/* global globalThis, module */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.HeatRule = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SOURCE_META = [
    { id: "ptt", label: "PTT", color: "#15803d" },
    { id: "cmoney", label: "CMoney", color: "#d97706" },
    { id: "threads", label: "Threads", color: "#44403c" },
    { id: "5ch", label: "5ch", color: "#db2777" },
    { id: "reddit", label: "Reddit", color: "#ea580c" },
    { id: "x", label: "X", color: "#3f3f46" },
    { id: "youtube", label: "YouTube", color: "#dc2626" },
    { id: "news", label: "新聞", color: "#1d4ed8" },
  ];
  const SOURCE_ORDER = SOURCE_META.map(function (item) {
    return item.id;
  });
  const MARKETS = ["TW", "US", "JP"];

  function ratioOf(total, windowSum) {
    if (windowSum <= 0) return null;
    return Math.floor((total * 7 * 100) / windowSum + 0.5) / 100;
  }

  function parseCSV(text) {
    const src = String(text).replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const table = [];
    let row = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < src.length; i += 1) {
      const char = src[i];
      if (quoted) {
        if (char === '"') {
          if (src[i + 1] === '"') {
            cell += '"';
            i += 1;
          } else {
            quoted = false;
          }
        } else {
          cell += char;
        }
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        row.push(cell);
        cell = "";
      } else if (char === "\n") {
        row.push(cell);
        table.push(row);
        row = [];
        cell = "";
      } else {
        cell += char;
      }
    }
    if (cell.length || row.length) {
      row.push(cell);
      table.push(row);
    }
    const header = (table.shift() || []).map(function (item) {
      return item.trim();
    });
    return table
      .filter(function (cells) {
        return cells.some(function (value) {
          return String(value).trim() !== "";
        });
      })
      .map(function (cells) {
        const record = {};
        header.forEach(function (name, index) {
          record[name] = (cells[index] == null ? "" : String(cells[index])).trim();
        });
        return record;
      });
  }

  function addDays(iso, amount) {
    const parts = iso.split("-").map(Number);
    const utc = Date.UTC(parts[0], parts[1] - 1, parts[2] + amount);
    return new Date(utc).toISOString().slice(0, 10);
  }

  function analyzeHistory(rows) {
    const parsed = rows.map(function (row) {
      return {
        date: String(row.date),
        market: row.market,
        source: row.source,
        keyword: row.keyword,
        mentions: Number(row.mentions) || 0,
        authors: Number(row.authors) || 0,
      };
    });
    if (!parsed.length) return { calendar: [], series: [] };

    const start = parsed.reduce(function (min, row) {
      return row.date < min ? row.date : min;
    }, parsed[0].date);
    const end = parsed.reduce(function (max, row) {
      return row.date > max ? row.date : max;
    }, parsed[0].date);
    const calendar = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) calendar.push(cursor);

    const mentions = new Map();
    const authors = new Map();
    parsed.forEach(function (row) {
      const key = row.market + "\t" + row.keyword;
      if (!mentions.has(key)) {
        mentions.set(key, new Map());
        authors.set(key, new Map());
      }
      const dayMentions = mentions.get(key);
      const dayAuthors = authors.get(key);
      if (!dayMentions.has(row.date)) {
        dayMentions.set(row.date, new Map());
        dayAuthors.set(row.date, new Map());
      }
      const sourceMentions = dayMentions.get(row.date);
      const sourceAuthors = dayAuthors.get(row.date);
      sourceMentions.set(row.source, (sourceMentions.get(row.source) || 0) + row.mentions);
      sourceAuthors.set(row.source, (sourceAuthors.get(row.source) || 0) + row.authors);
    });

    const keys = Array.from(mentions.keys()).sort(function (a, b) {
      const am = a.split("\t");
      const bm = b.split("\t");
      const ai = MARKETS.indexOf(am[0]);
      const bi = MARKETS.indexOf(bm[0]);
      if (ai !== bi) return (ai < 0 ? 9 : ai) - (bi < 0 ? 9 : bi);
      return am[1] < bm[1] ? -1 : am[1] > bm[1] ? 1 : 0;
    });

    const series = keys.map(function (key) {
      const parts = key.split("\t");
      const market = parts[0];
      const keyword = parts[1];
      const dayMentions = mentions.get(key);
      const dayAuthors = authors.get(key);
      const days = [];
      const totals = [];
      calendar.forEach(function (current, index) {
        const sourceMap = dayMentions.get(current) || new Map();
        const authorMap = dayAuthors.get(current) || new Map();
        const bySource = {};
        let total = 0;
        SOURCE_ORDER.forEach(function (source) {
          const count = sourceMap.get(source) || 0;
          if (count > 0) {
            bySource[source] = count;
            total += count;
          }
        });
        let authorTotal = 0;
        authorMap.forEach(function (count) {
          authorTotal += count;
        });
        const historyOk = index >= 7;
        let windowSum = 0;
        if (historyOk) {
          for (let i = index - 7; i < index; i += 1) windowSum += totals[i];
        }
        const present = new Set();
        for (let back = Math.max(0, index - 2); back <= index; back += 1) {
          const windowMap = dayMentions.get(calendar[back]);
          if (!windowMap) continue;
          windowMap.forEach(function (count, source) {
            if (count > 0) present.add(source);
          });
        }
        const windowSources = SOURCE_ORDER.filter(function (source) {
          return present.has(source);
        });
        const absOk = total >= 5;
        const ratioOk = historyOk && (windowSum === 0 || total * 7 >= 5 * windowSum);
        const cross = windowSources.length >= 2;
        days.push({
          date: current,
          total: total,
          authors: authorTotal,
          avg7: historyOk ? windowSum / 7 : null,
          window_sum: historyOk ? windowSum : null,
          ratio: historyOk ? ratioOf(total, windowSum) : null,
          by_source: bySource,
          window_sources: windowSources,
          history_ok: historyOk,
          abs_ok: absOk,
          ratio_ok: ratioOk,
          cross: cross,
          triggered: historyOk && absOk && ratioOk && cross,
        });
        totals.push(total);
      });
      return { market: market, keyword: keyword, days: days };
    });

    return { calendar: calendar, series: series };
  }

  return {
    SOURCE_META: SOURCE_META,
    SOURCE_ORDER: SOURCE_ORDER,
    parseCSV: parseCSV,
    analyzeHistory: analyzeHistory,
    ratioOf: ratioOf,
  };
});
