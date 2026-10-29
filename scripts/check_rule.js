const fs = require("fs");
const path = require("path");
const { analyzeHistory, parseCSV } = require("../assets/rule.js");

const text = fs.readFileSync(path.join(__dirname, "..", "data", "history.csv"), "utf8");
const analyzed = analyzeHistory(parseCSV(text));
const triggers = [];
analyzed.series.forEach(function (series) {
  series.days.forEach(function (day) {
    if (!day.triggered) return;
    triggers.push({
      date: day.date,
      market: series.market,
      keyword: series.keyword,
      mentions: day.total,
      ratio: day.ratio,
      communities: day.window_sources.length,
      platforms: day.window_sources,
    });
  });
});
triggers.sort(function (a, b) {
  return (
    a.date.localeCompare(b.date) ||
    a.market.localeCompare(b.market) ||
    a.keyword.localeCompare(b.keyword)
  );
});
process.stdout.write(JSON.stringify(triggers));
