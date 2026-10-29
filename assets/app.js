const MARKETS = [
  { id: "TW", label: "台灣" },
  { id: "US", label: "美國" },
  { id: "JP", label: "日本" },
];

const state = {
  latest: null,
  manifest: null,
  backtest: null,
  analyzed: null,
  dailyList: null,
  dailyByDate: {},
  chart: null,
};

let renderToken = 0;

function h(tag, attrs, children) {
  const node = document.createElement(tag);
  const props = attrs || {};
  Object.keys(props).forEach(function (key) {
    const value = props[key];
    if (key === "class") node.className = value;
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (value === true) node.setAttribute(key, "");
    else if (value !== false && value != null) node.setAttribute(key, String(value));
  });
  const list = Array.isArray(children) ? children : children == null ? [] : [children];
  list.forEach(function (child) {
    if (child == null || child === false) return;
    node.append(child.nodeType ? child : document.createTextNode(String(child)));
  });
  return node;
}

function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function marketLabel(id) {
  const found = MARKETS.find(function (item) { return item.id === id; });
  return found ? found.label : id;
}

function sourceMeta(id) {
  return HeatRule.SOURCE_META.find(function (item) { return item.id === id; });
}

function sourceLabel(id) {
  const meta = sourceMeta(id);
  return meta ? meta.label : id;
}

function sourceColor(id) {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (id === "threads") return dark ? "#d6d3d1" : "#44403c";
  if (id === "x") return dark ? "#d4d4d8" : "#3f3f46";
  const meta = sourceMeta(id);
  return meta ? meta.color : "#78716c";
}

function formatDate(iso) {
  if (!iso) return "—";
  const parts = String(iso).split("-");
  if (parts.length !== 3) return String(iso);
  return parts[0] + "年" + Number(parts[1]) + "月" + Number(parts[2]) + "日";
}

function formatInt(value) {
  if (value == null || value === "" || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 0 });
}

function formatPct(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return (Number(value) * 100).toLocaleString("zh-TW", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

function formatRatio(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("zh-TW", { minimumFractionDigits: 1, maximumFractionDigits: 2 }) + "×";
}

function formatAvg(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("zh-TW", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatRet(value) {
  if (value == null || Number.isNaN(Number(value))) return null;
  const pct = Number(value) * 100;
  const sign = pct > 0 ? "+" : "";
  return sign + pct.toLocaleString("zh-TW", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
}

function formatLead(value) {
  if (value == null || value === "") return "—";
  return formatInt(value) + " 天";
}

function nameLabel(row) {
  if (row.zh_name && row.zh_name !== row.name) return row.zh_name + "（" + row.name + "）";
  return row.name;
}

function parseHash() {
  let raw = (location.hash || "#/today").replace(/^#/, "");
  if (!raw.startsWith("/")) raw = "/" + raw;
  const queryAt = raw.indexOf("?");
  const path = queryAt === -1 ? raw : raw.slice(0, queryAt);
  const params = new URLSearchParams(queryAt === -1 ? "" : raw.slice(queryAt + 1));
  const page = path.replace(/^\//, "") || "today";
  const known = ["today", "trend", "watchlist", "backtest"];
  return { page: known.indexOf(page) === -1 ? "today" : page, params: params };
}

function go(page, params) {
  const query = params && params.toString() ? params.toString() : "";
  const next = "#/" + page + (query ? "?" + query : "");
  if (decodeURIComponent(location.hash) === decodeURIComponent(next)) render();
  else location.hash = next;
}

function trendHref(market, keyword) {
  const params = new URLSearchParams();
  params.set("m", market);
  params.set("k", keyword);
  return "#/trend?" + params.toString();
}

function safeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.href : null;
  } catch (error) {
    return null;
  }
}

async function fetchJSON(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error("無法讀取 " + url + "（" + response.status + "）");
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-cache" });
  if (!response.ok) throw new Error("無法讀取 " + url + "（" + response.status + "）");
  return response.text();
}

function errorCard(error) {
  return h("section", { class: "card" }, [
    h("h2", {}, ["資料沒有讀到"]),
    h("p", {}, [error && error.message ? error.message : String(error)]),
    h("p", { class: "muted" }, ["請從網站根目錄開啟，例如 python3 -m http.server。不要直接用檔案協定點開 index.html。"]),
  ]);
}

function destroyChart() {
  if (state.chart) {
    state.chart.destroy();
    state.chart = null;
  }
}

function paintChrome() {
  document.getElementById("asof").textContent = "資料日期 " + formatDate(state.latest.date);
  const stamp = document.getElementById("stamp");
  if (state.latest.data_label) {
    stamp.hidden = false;
    stamp.textContent = state.latest.data_label;
  } else {
    stamp.hidden = true;
  }
  const banner = document.getElementById("banner");
  banner.replaceChildren();
  if (state.latest.data_label === "範例資料") {
    banner.hidden = false;
    banner.append(
      h("strong", {}, ["範例資料。"]),
      " 倉庫裡的 JSON 與 CSV 是展示用樣本，不是即時抓取。正式每日更新拿掉 data_label 之後，這條提示會消失。"
    );
  } else {
    banner.hidden = true;
  }
}

function updateNav(page) {
  document.querySelectorAll("[data-page]").forEach(function (link) {
    link.setAttribute("aria-current", link.dataset.page === page ? "page" : "false");
  });
  const titles = { today: "今日", trend: "趨勢", watchlist: "觀察名單", backtest: "回測" };
  document.title = titles[page] + "｜社群熱度";
}

function marketTabs(current, onSelect) {
  const tabs = MARKETS.map(function (market) {
    const selected = market.id === current;
    return h("button", {
      type: "button",
      role: "tab",
      id: "tab-" + market.id,
      "aria-selected": selected ? "true" : "false",
      tabindex: selected ? "0" : "-1",
      onclick: function () { onSelect(market.id); },
    }, [market.label]);
  });
  const list = h("div", { class: "tabs", role: "tablist", "aria-label": "市場" }, tabs);
  list.addEventListener("keydown", function (event) {
    const index = MARKETS.findIndex(function (market) { return market.id === current; });
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    const next = event.key === "ArrowRight" ? (index + 1) % MARKETS.length : (index + MARKETS.length - 1) % MARKETS.length;
    onSelect(MARKETS[next].id);
  });
  return list;
}

function linkChip(link) {
  const href = safeUrl(link && link.url);
  if (!href) return null;
  return h("a", { href: href, target: "_blank", rel: "noopener noreferrer" }, [link.title || sourceLabel(link.source)]);
}

function topicCard(topic, market) {
  return h("article", { class: "card", "data-market": market }, [
    h("h3", {}, [topic.keyword]),
    h("p", {}, [topic.summary]),
    h("div", { class: "links" }, (topic.links || []).map(linkChip).filter(Boolean).concat([
      h("a", { class: "textlink", href: trendHref(market, topic.keyword) }, ["看趨勢"]),
    ])),
  ]);
}

function heatCard(item, market) {
  return h("article", { class: "card heat-card", "data-market": market }, [
    h("div", { class: "heat-top" }, [
      h("h3", {}, [item.keyword]),
      h("p", { class: "ratio" }, [formatRatio(item.ratio_vs_7d)]),
    ]),
    h("p", { class: "muted" }, ["相對前 7 日均量 · " + formatInt(item.communities) + " 個來源"]),
    h("p", {}, [item.reason]),
    h("div", { class: "platforms" }, (item.platforms || []).map(function (id) {
      return h("span", { class: "pill" }, [sourceLabel(id)]);
    })),
    h("a", { class: "textlink", href: trendHref(market, item.keyword) }, ["看這檔的趨勢"]),
  ]);
}

function renderToday(main, params) {
  const market = ["TW", "US", "JP"].indexOf(params.get("m")) >= 0 ? params.get("m") : "TW";
  const block = (state.latest.markets && state.latest.markets[market]) || { topics: [], early_heating: [] };
  main.append(
    h("section", { class: "page-head" }, [
      h("h2", {}, ["今日"]),
      h("p", { class: "lede" }, [formatDate(state.latest.date) + " 的熱門話題，以及當天新出現的早期升溫。"]),
    ]),
    marketTabs(market, function (id) {
      const next = new URLSearchParams();
      next.set("m", id);
      go("today", next);
    })
  );
  const topics = h("section", {}, [
    h("div", { class: "section-title" }, [
      h("h3", {}, ["熱門話題"]),
      h("span", { class: "count" }, [String(block.topics.length)]),
    ]),
  ]);
  if (!block.topics.length) topics.append(h("p", { class: "empty" }, ["這一天沒有熱門話題。"]));
  else topics.append(h("div", { class: "stack" }, block.topics.map(function (topic) { return topicCard(topic, market); })));
  const heat = h("section", {}, [
    h("div", { class: "section-title" }, [
      h("h3", {}, ["早期升溫"]),
      h("span", { class: "count" }, [String(block.early_heating.length)]),
    ]),
    h("p", { class: "muted" }, ["話題摘要、原因與連結都標成範例，用來對齊每日檔的欄位。"]),
  ]);
  if (!block.early_heating.length) heat.append(h("p", { class: "empty" }, ["這一天沒有早期升溫標記。"]));
  else heat.append(h("div", { class: "heat-grid" }, block.early_heating.map(function (item) { return heatCard(item, market); })));
  main.append(topics, heat, h("aside", { class: "note" }, [state.latest.hit_rate_note]));
}

function resolveSeries(params) {
  const wantKeyword = params.get("k");
  const wantMarket = params.get("m");
  if (wantKeyword) {
    const hit = state.analyzed.series.find(function (series) {
      return series.keyword === wantKeyword && (!wantMarket || series.market === wantMarket);
    });
    if (hit) return hit;
  }
  return state.analyzed.series.find(function (series) {
    return series.market === "TW" && series.keyword === "南亞科";
  }) || state.analyzed.series[0] || null;
}

function recentTriggers() {
  const list = [];
  state.analyzed.series.forEach(function (series) {
    const hits = series.days.filter(function (day) { return day.triggered; });
    if (!hits.length) return;
    list.push({ market: series.market, keyword: series.keyword, last: hits[hits.length - 1].date });
  });
  list.sort(function (a, b) { return b.last.localeCompare(a.last); });
  return list.slice(0, 8);
}

function ratioText(day) {
  if (!day.history_ok) return "倍數要等滿 7 日才計算";
  if (day.window_sum === 0) return "前 7 日均量為 0；提及 ≥ 5 即視為達到 5 倍";
  return "前 7 日均量 " + formatAvg(day.avg7) + "，當天 " + formatRatio(day.ratio) + "（門檻 ≥ 5 倍）";
}

function detailView(series, day) {
  const items = [
    { ok: day.history_ok, text: day.history_ok ? "已有完整的前 7 日可當基準" : "未滿 7 日，不判定觸發" },
    { ok: day.abs_ok, text: "當日提及 " + formatInt(day.total) + "（門檻 ≥ 5）" },
    { ok: day.ratio_ok, text: ratioText(day) },
    {
      ok: day.cross,
      text: "3 日內來源：" + (day.window_sources.map(sourceLabel).join("、") || "沒有") + "（" + day.window_sources.length + " 個，門檻 ≥ 2，並視為跨平台）",
    },
  ];
  const breakdown = HeatRule.SOURCE_ORDER.filter(function (source) { return day.by_source[source]; }).map(function (source) {
    return sourceLabel(source) + " " + formatInt(day.by_source[source]);
  }).join(" · ");
  const snapLine = h("p", { class: "muted" }, ["正在對照當日快照…"]);
  getSnapshot(day.date).then(function (snap) {
    if (!snapLine.isConnected) return;
    if (!snap) {
      snapLine.textContent = "這一天沒有每日快照。";
      return;
    }
    const heating = (snap.markets[series.market] && snap.markets[series.market].early_heating) || [];
    const listed = heating.some(function (item) { return item.keyword === series.keyword; });
    snapLine.textContent = listed
      ? "當日快照的早期升溫名單有這個關鍵字。"
      : "當日快照沒有把這個關鍵字放進早期升溫。";
  }).catch(function () {
    if (snapLine.isConnected) snapLine.textContent = "對照每日快照時沒有讀到檔案。";
  });
  return h("div", {}, [
    h("div", { class: "heat-top" }, [
      h("h3", {}, [formatDate(day.date)]),
      h("span", { class: day.triggered ? "pill hot" : "pill" }, [day.triggered ? "規則觸發" : "未觸發"]),
    ]),
    h("p", {}, [day.total ? breakdown + " · 作者 " + formatInt(day.authors) : "這一天沒有提及。"]),
    h("ul", { class: "checks" }, items.map(function (item) {
      return h("li", {}, [
        h("span", { class: item.ok ? "mark ok" : "mark no" }, [item.ok ? "是" : "否"]),
        h("span", {}, [item.text]),
      ]);
    })),
    snapLine,
  ]);
}

function dayTable(days, selected, onSelect) {
  const rows = days.slice().reverse().map(function (day) {
    const tr = h("tr", { tabindex: "0", "aria-selected": day.date === selected ? "true" : "false" }, [
      h("td", {}, [day.date]),
      h("td", {}, [formatInt(day.total)]),
      h("td", {}, [formatAvg(day.avg7)]),
      h("td", {}, [String(day.window_sources.length)]),
      h("td", {}, [day.triggered ? "觸發" : ""]),
    ]);
    function choose() { onSelect(day.date); }
    tr.addEventListener("click", choose);
    tr.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose();
      }
    });
    return tr;
  });
  return h("div", { class: "table-wrap" }, [
    h("table", {}, [
      h("thead", {}, [h("tr", {}, ["日期", "提及", "前 7 日均量", "3 日來源數", "標記"].map(function (label) {
        return h("th", { scope: "col" }, [label]);
      }))]),
      h("tbody", {}, rows),
    ]),
  ]);
}

function getSnapshot(iso) {
  if (state.dailyList) {
    return Promise.resolve(state.dailyList.find(function (snap) { return snap.date === iso; }) || null);
  }
  const dates = (state.manifest && state.manifest.daily) || [];
  if (dates.indexOf(iso) === -1) return Promise.resolve(null);
  if (state.dailyByDate[iso]) return Promise.resolve(state.dailyByDate[iso]);
  return fetchJSON("data/daily/" + iso + ".json").then(function (snap) {
    state.dailyByDate[iso] = snap;
    return snap;
  });
}

let chartPromise = null;
function loadChartJs() {
  if (window.Chart) return Promise.resolve(window.Chart);
  if (!chartPromise) {
    chartPromise = new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js";
      script.async = true;
      script.onload = function () { resolve(window.Chart); };
      script.onerror = function () { chartPromise = null; reject(new Error("chart")); };
      document.head.appendChild(script);
    });
  }
  return chartPromise;
}

function mountChart(canvas, days, token, onSelect) {
  loadChartJs().then(function () {
    if (token !== renderToken || !canvas.isConnected || !window.Chart) return;
    const ink = cssVar("--ink") || "#1c1915";
    const muted = cssVar("--muted") || "#5e584e";
    const grid = cssVar("--line") || "#e0d5c3";
    const present = HeatRule.SOURCE_ORDER.filter(function (source) {
      return days.some(function (day) { return day.by_source[source]; });
    });
    const peak = days.reduce(function (max, day) {
      return Math.max(max, day.total || 0, day.avg7 || 0);
    }, 1);
    const padded = Math.max(5, peak * 1.18);
    const step = padded > 80 ? 20 : padded > 30 ? 10 : padded > 12 ? 5 : 2;
    const yMax = Math.ceil(padded / step) * step;
    const datasets = present.map(function (source) {
      return {
        type: "bar",
        label: sourceLabel(source),
        data: days.map(function (day) { return day.by_source[source] || 0; }),
        backgroundColor: sourceColor(source),
        stack: "sources",
        yAxisID: "y",
        borderWidth: 0,
        maxBarThickness: 22,
        order: 2,
      };
    });
    datasets.push({
      type: "line",
      label: "前 7 日均量",
      data: days.map(function (day) { return day.history_ok ? day.avg7 : null; }),
      yAxisID: "y2",
      borderColor: ink,
      borderDash: [5, 4],
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.25,
      spanGaps: false,
      order: 1,
    });
    datasets.push({
      type: "line",
      label: "規則觸發",
      data: days.map(function (day) { return day.triggered ? day.total : null; }),
      yAxisID: "y2",
      showLine: false,
      pointStyle: "triangle",
      pointRadius: 7,
      pointHoverRadius: 9,
      pointBackgroundColor: "#ea580c",
      pointBorderColor: ink,
      pointBorderWidth: 1,
      order: 0,
    });
    window.Chart.defaults.font.family = '"Noto Sans TC", "PingFang TC", sans-serif';
    state.chart = new window.Chart(canvas, {
      data: { labels: days.map(function (day) { return day.date.slice(5); }), datasets: datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 350 },
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { color: muted, boxWidth: 12, padding: 12, font: { size: 12 } } },
          tooltip: {
            filter: function (item) { return item.dataset.label !== "規則觸發"; },
            callbacks: {
              title: function (items) {
                const day = days[items[0].dataIndex];
                return day.date + (day.triggered ? " · 規則觸發" : "");
              },
              label: function (context) {
                if (context.dataset.label === "前 7 日均量") return "前 7 日均量：" + formatAvg(context.parsed.y);
                return context.dataset.label + "：" + formatInt(context.parsed.y);
              },
              footer: function (items) {
                return "合計 " + formatInt(days[items[0].dataIndex].total);
              },
            },
          },
        },
        scales: {
          x: { stacked: true, grid: { display: false }, ticks: { color: muted, maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
          y: {
            stacked: true,
            min: 0,
            max: yMax,
            ticks: { color: muted, precision: 0 },
            title: { display: true, text: "提及次數", color: muted },
            grid: { color: grid },
          },
          y2: { min: 0, max: yMax, display: false, grid: { drawOnChartArea: false } },
        },
        onClick: function (event, _elements, chart) {
          const points = chart.getElementsAtEventForMode(event, "index", { intersect: false }, true);
          if (!points.length) return;
          onSelect(days[points[0].index].date);
        },
      },
    });
  }).catch(function () {
    if (token !== renderToken || !canvas.isConnected || canvas.parentElement.querySelector(".chart-fallback")) return;
    canvas.parentElement.append(h("p", { class: "muted chart-fallback" }, ["圖表程式庫沒有載入，仍可使用下面的表格。"]));
  });
}

function renderTrend(main, params, token) {
  const series = resolveSeries(params);
  main.append(
    h("section", { class: "page-head" }, [
      h("h2", {}, ["趨勢"]),
      h("p", { class: "lede" }, ["選一個關鍵字，看各來源堆疊的提及量、前 7 日均量，以及規則觸發的日子。"]),
    ])
  );
  if (!series) {
    main.append(h("p", { class: "empty" }, ["history.csv 裡還沒有關鍵字。"]));
    return;
  }
  const view = params.get("r") === "21" ? 21 : "all";
  const days = view === 21 ? series.days.slice(-21) : series.days.slice();
  const triggers = series.days.filter(function (day) { return day.triggered; });
  const visibleTriggers = days.filter(function (day) { return day.triggered; });
  const defaultDay = visibleTriggers[visibleTriggers.length - 1] || days[days.length - 1];
  let selected = defaultDay.date;
  const detail = h("div", { id: "trend-detail" });
  const tableHost = h("div");
  const canvas = h("canvas", { role: "img", "aria-label": series.keyword + " 的提及量圖" });

  function paint(fromChart) {
    const day = series.days.find(function (item) { return item.date === selected; }) || defaultDay;
    detail.replaceChildren(detailView(series, day));
    tableHost.replaceChildren(dayTable(days, selected, function (date) {
      selected = date;
      paint(false);
    }));
    const selectedRow = tableHost.querySelector('[aria-selected="true"]');
    if (fromChart && selectedRow && selectedRow.scrollIntoView) selectedRow.scrollIntoView({ block: "nearest" });
  }

  const results = h("div", { class: "results", id: "search-results" });
  const input = h("input", {
    class: "search",
    type: "search",
    placeholder: "搜尋關鍵字，例如 南亞科、美光、鎧俠",
    "aria-label": "搜尋關鍵字",
    autocomplete: "off",
  });
  function showResults() {
    const query = input.value.trim().toLowerCase();
    const matches = state.analyzed.series.filter(function (item) {
      return !query || item.keyword.toLowerCase().indexOf(query) >= 0;
    }).slice(0, 20);
    results.replaceChildren.apply(results, matches.map(function (item) {
      return h("button", {
        type: "button",
        onclick: function () {
          const next = new URLSearchParams();
          next.set("m", item.market);
          next.set("k", item.keyword);
          if (view === 21) next.set("r", "21");
          go("trend", next);
        },
      }, [h("span", { class: "pill" }, [marketLabel(item.market)]), " ", item.keyword]);
    }));
    if (!matches.length) results.append(h("p", { class: "muted" }, ["沒有這個關鍵字。"]));
  }
  input.addEventListener("input", showResults);
  input.addEventListener("focus", showResults);
  input.addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      const first = results.querySelector("button");
      if (first) first.click();
    } else if (event.key === "Escape") results.replaceChildren();
  });

  const total = series.days.reduce(function (sum, day) { return sum + day.total; }, 0);
  const peak = series.days.reduce(function (best, day) { return day.total > best.total ? day : best; }, series.days[0]);
  const rangeButtons = h("div", { class: "seg", role: "group", "aria-label": "圖表區間" }, [
    h("button", {
      type: "button",
      "aria-pressed": view === "all" ? "true" : "false",
      onclick: function () {
        const next = new URLSearchParams();
        next.set("m", series.market);
        next.set("k", series.keyword);
        go("trend", next);
      },
    }, ["全部"]),
    h("button", {
      type: "button",
      "aria-pressed": view === "21" ? "true" : "false",
      onclick: function () {
        const next = new URLSearchParams();
        next.set("m", series.market);
        next.set("k", series.keyword);
        next.set("r", "21");
        go("trend", next);
      },
    }, ["近 21 日"]),
  ]);

  main.append(
    h("div", { class: "search-box" }, [input, results]),
    h("div", { class: "chips" }, recentTriggers().map(function (item) {
      return h("a", { class: "chip", href: trendHref(item.market, item.keyword) }, [
        marketLabel(item.market) + " " + item.keyword,
      ]);
    })),
    h("section", { class: "card", "data-market": series.market }, [
      h("div", { class: "heat-top" }, [
        h("h3", {}, [series.keyword]),
        h("span", { class: "pill" }, [marketLabel(series.market)]),
      ]),
      rangeButtons,
      h("div", { class: "stats" }, [
        stat("全期間提及", formatInt(total)),
        stat("最高的一天", formatInt(peak.total) + " · " + peak.date.slice(5)),
        stat("觸發天數", String(triggers.length)),
      ]),
      h("p", { class: "rule-line" }, ["橘色三角：當日提及 ≥ 5 倍前 7 日均量，而且 ≥ 5；含當日的 3 天內至少 2 個來源。這份資料裡來源就是平台，所以同時算跨平台。"]),
      triggers.length > visibleTriggers.length
        ? h("p", { class: "muted" }, ["這段區間之外還有 " + (triggers.length - visibleTriggers.length) + " 次觸發。"])
        : null,
      h("div", { class: "chart-scroll" }, [h("div", { class: "chart-box" }, [canvas])]),
    ]),
    h("section", { class: "card" }, [detail]),
    h("section", {}, [
      h("h3", {}, ["每日數字"]),
      tableHost,
    ])
  );
  paint(false);
  mountChart(canvas, days, token, function (date) {
    selected = date;
    paint(true);
  });
}

function stat(label, value) {
  return h("div", {}, [h("span", {}, [label]), h("strong", {}, [value])]);
}

async function loadDaily() {
  if (state.dailyList) return state.dailyList;
  const dates = state.manifest.daily || [];
  const list = await Promise.all(dates.map(function (iso) { return fetchJSON("data/daily/" + iso + ".json"); }));
  list.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  state.dailyList = list;
  return list;
}

function classifyFlag(flag, snaps) {
  let first = null;
  let later = null;
  snaps.forEach(function (snap) {
    const topics = (snap.markets[flag.market] && snap.markets[flag.market].topics) || [];
    const present = topics.some(function (topic) { return topic.keyword === flag.keyword; });
    if (!present) return;
    if (!first) first = snap.date;
    if (!later && snap.date > flag.date) later = snap.date;
  });
  return { later: Boolean(later), laterDate: later, firstHot: first, already: Boolean(first && first <= flag.date) };
}

function watchCard(flag) {
  const status = flag.status;
  let pill;
  let extra;
  if (status.later && status.already) {
    pill = h("span", { class: "pill ok" }, ["其後仍是熱門"]);
    extra = "標記時已在熱門話題（最早 " + status.firstHot + "），之後的快照還在。";
  } else if (status.later) {
    pill = h("span", { class: "pill ok" }, ["其後列入熱門"]);
    extra = "其後列入熱門（" + status.laterDate + "）。";
  } else {
    pill = h("span", { class: "pill hot" }, ["尚未列入熱門"]);
    extra = "標記之後的快照還沒有把它放進熱門話題。";
  }
  return h("article", { class: "card", "data-market": flag.market }, [
    h("div", { class: "heat-top" }, [h("h3", {}, [flag.keyword]), pill]),
    h("p", { class: "muted" }, [
      formatDate(flag.date) + " · " + marketLabel(flag.market) + " · " + formatRatio(flag.ratio_vs_7d) + " · " + formatInt(flag.communities) + " 個來源",
    ]),
    h("p", {}, [flag.reason]),
    h("div", { class: "platforms" }, (flag.platforms || []).map(function (id) {
      return h("span", { class: "pill" }, [sourceLabel(id)]);
    })),
    h("p", {}, [extra]),
    h("a", { class: "textlink", href: trendHref(flag.market, flag.keyword) }, ["看趨勢"]),
  ]);
}

async function renderWatch(main, params, token) {
  main.append(h("p", { class: "muted" }, ["正在讀取每日快照…"]));
  const snaps = await loadDaily();
  if (token !== renderToken) return;
  main.replaceChildren();
  const market = params.get("m") || "ALL";
  const outcome = params.get("o") || "all";
  const flags = [];
  snaps.forEach(function (snap) {
    MARKETS.forEach(function (item) {
      const heating = (snap.markets[item.id] && snap.markets[item.id].early_heating) || [];
      heating.forEach(function (entry) {
        flags.push(Object.assign({ date: snap.date, market: item.id }, entry));
      });
    });
  });
  const decorated = flags.map(function (flag) {
    return Object.assign({}, flag, { status: classifyFlag(flag, snaps) });
  }).sort(function (a, b) {
    return b.date.localeCompare(a.date) || a.keyword.localeCompare(b.keyword);
  });
  const inMarket = decorated.filter(function (flag) { return market === "ALL" || flag.market === market; });
  const laterCount = inMarket.filter(function (flag) { return flag.status.later; }).length;

  function setWatch(nextMarket, nextOutcome) {
    const next = new URLSearchParams();
    if (nextMarket && nextMarket !== "ALL") next.set("m", nextMarket);
    if (nextOutcome && nextOutcome !== "all") next.set("o", nextOutcome);
    go("watchlist", next);
  }

  const filtered = decorated.filter(function (flag) {
    if (market !== "ALL" && flag.market !== market) return false;
    if (outcome === "later" && !flag.status.later) return false;
    if (outcome === "pending" && flag.status.later) return false;
    return true;
  });

  main.append(
    h("section", { class: "page-head" }, [
      h("h2", {}, ["觀察名單"]),
      h("p", { class: "lede" }, ["過去的早期升溫標記，以及它們後來有沒有出現在熱門話題。"]),
    ]),
    h("div", { class: "seg", role: "group", "aria-label": "市場" }, [
      ["ALL", "全部"],
      ["TW", "台灣"],
      ["US", "美國"],
      ["JP", "日本"],
    ].map(function (item) {
      return h("button", {
        type: "button",
        "aria-pressed": market === item[0] ? "true" : "false",
        onclick: function () { setWatch(item[0], outcome); },
      }, [item[1]]);
    })),
    h("div", { class: "seg", role: "group", "aria-label": "結果" }, [
      ["all", "全部 " + inMarket.length],
      ["later", "其後出現在熱門 " + laterCount],
      ["pending", "尚未列入熱門 " + (inMarket.length - laterCount)],
    ].map(function (item) {
      return h("button", {
        type: "button",
        "aria-pressed": outcome === item[0] ? "true" : "false",
        onclick: function () { setWatch(market, item[0]); },
      }, [item[1]]);
    }))
  );
  if (!filtered.length) main.append(h("p", { class: "empty" }, ["沒有符合的標記。"]));
  else main.append(h("div", { class: "card-grid" }, filtered.map(watchCard)));
}

function resultPill(row) {
  if (row.group === "control") {
    return row.n_flags > 0
      ? h("span", { class: "pill hot" }, ["對照組被標記"])
      : h("span", { class: "pill ok" }, ["對照組未標記"]);
  }
  return h("span", { class: row.hit ? "pill ok" : "pill" }, [row.hit ? "命中" : "未命中"]);
}

function metaItem(label, value) {
  return h("div", {}, [h("span", {}, [label]), document.createTextNode(value == null || value === "" ? "—" : String(value))]);
}

function nameCard(row, channel) {
  const linked = state.analyzed.series.find(function (series) {
    return series.keyword === row.zh_name || series.keyword === row.name;
  });
  const ret = formatRet(row.ret);
  const cells = [
    metaItem("市場", marketLabel(row.market)),
    metaItem("組別", row.group === "hot" ? "熱門股" : row.group === "control" ? "對照組" : row.group),
    metaItem("hit", row.hit ? "是" : "否"),
    metaItem("旗標", formatInt(row.n_flags) + " 次"),
    metaItem("確認", formatInt(row.n_conf) + " 次"),
    metaItem("首次旗標", row.first_flag || "—"),
    metaItem("討論領先", formatLead(row.lead_attn)),
    metaItem("價格領先", formatLead(row.lead_price)),
    metaItem(channel.mentions_label || "提及量", formatInt(row.mentions)),
  ];
  if (ret) cells.splice(2, 0, metaItem("區間報酬", ret));
  if (row.price_peak) cells.push(metaItem("價格高點", row.price_peak));
  if (row.attn_peak) cells.push(metaItem("討論高點", row.attn_peak));
  const children = [
    h("div", { class: "heat-top" }, [h("h3", {}, [nameLabel(row)]), resultPill(row)]),
    h("div", { class: "meta" }, cells),
  ];
  if (Array.isArray(row.flags) && row.flags.length) {
    children.push(h("details", {}, [
      h("summary", {}, ["旗標日期"]),
      h("p", {}, [row.flags.join("、")]),
    ]));
  }
  if (linked) children.push(h("a", { class: "textlink", href: trendHref(linked.market, linked.keyword) }, ["看樣本趨勢"]));
  return h("article", { class: "card", "data-market": row.market }, children);
}

function renderBacktest(main, params) {
  const backtest = state.backtest || {};
  const channels = backtest.channels || [];
  const channel = channels.find(function (item) { return item.id === params.get("c"); }) || channels.find(function (item) { return item.id === "best"; }) || channels[0];
  const market = params.get("m") || "ALL";
  const group = params.get("g") || "all";
  const metrics = backtest.metrics || {};
  const parameters = backtest.parameters || {};

  function setBacktest(updates) {
    const next = new URLSearchParams(parseHash().params);
    Object.keys(updates).forEach(function (key) {
      const value = updates[key];
      if (value == null || value === "" || value === "ALL" || value === "all" || (key === "c" && value === "best")) next.delete(key);
      else next.set(key, value);
    });
    go("backtest", next);
  }

  main.append(
    h("section", { class: "page-head" }, [
      h("h2", {}, ["回測"]),
      h("p", { class: "lede" }, ["摘要來自 data/backtest.json，頁面沒有重算報酬或命中。"]),
    ]),
    h("section", { class: "callout callout-scope" }, [
      h("strong", {}, ["驗證範圍。"]),
      " " + (backtest.scope_note || "此回測僅在美股驗證；台股與日股仍在累積資料。"),
    ])
  );

  main.append(h("div", { class: "kpis" }, [
    kpi("熱門股命中率", formatPct(metrics.hit_rate)),
    kpi("精準度", formatPct(metrics.precision)),
    kpi("旗標次數", formatInt(metrics.flags)),
    kpi("對照組旗標", formatInt(metrics.control_flags)),
    kpi("中位領先天數", formatLead(metrics.median_lead_days)),
    kpi("綜合分數", metrics.score == null ? "—" : Number(metrics.score).toLocaleString("zh-TW", { minimumFractionDigits: 3, maximumFractionDigits: 3 })),
  ]));

  main.append(h("p", { class: "rule-line" }, [
    "主結果參數 k = " + formatParam(parameters.k) + "、minabs = " + formatParam(parameters.minabs) + "、tk = " + formatParam(parameters.tk) + "。",
    "線上趨勢圖用的是同一組門檻：提及 ≥ 5 倍前 7 日均量且 ≥ 5，3 日內至少 2 個來源。tk 只沿用結果檔，頁面不換算。",
  ]));

  if (backtest.us_slice) {
    main.append(h("section", { class: "card" }, [
      h("div", { class: "heat-top" }, [
        h("h3", {}, ["只看美股熱門股"]),
        h("p", { class: "ratio" }, [formatPct(backtest.us_slice.hot_hit_rate)]),
      ]),
      h("p", {}, [backtest.us_slice.note || ""]),
    ]));
  }

  if (!channel) {
    main.append(h("p", { class: "empty" }, ["backtest.json 沒有管道資料。"]));
    return;
  }

  main.append(h("div", { class: "channel-row", role: "group", "aria-label": "回測管道" }, channels.map(function (item) {
    const rate = item.rollup && item.rollup.names ? formatPct(item.rollup.hot_hit_rate) : "無資料";
    return h("button", {
      type: "button",
      "aria-pressed": item.id === channel.id ? "true" : "false",
      onclick: function () { setBacktest({ c: item.id }); },
    }, [item.label + " " + rate]);
  })));

  if (!channel.validated) {
    main.append(h("p", { class: "callout callout-scope" }, ["這不是已驗證的主結果。" + (channel.note || "")]));
  } else if (channel.note) {
    main.append(h("p", { class: "note" }, [channel.note]));
  }

  main.append(
    h("div", { class: "seg", role: "group", "aria-label": "篩選市場" }, ["ALL", "TW", "US", "JP"].map(function (id) {
      return h("button", {
        type: "button",
        "aria-pressed": market === id ? "true" : "false",
        onclick: function () { setBacktest({ m: id }); },
      }, [id === "ALL" ? "全部市場" : marketLabel(id)]);
    })),
    h("div", { class: "seg", role: "group", "aria-label": "篩選組別" }, [
      ["all", "全部組別"],
      ["hot", "熱門股"],
      ["control", "對照組"],
    ].map(function (item) {
      return h("button", {
        type: "button",
        "aria-pressed": group === item[0] ? "true" : "false",
        onclick: function () { setBacktest({ g: item[0] }); },
      }, [item[1]]);
    }))
  );

  let rows = channel.rows || [];
  if (market !== "ALL") rows = rows.filter(function (row) { return row.market === market; });
  if (group === "hot" || group === "control") rows = rows.filter(function (row) { return row.group === group; });
  if (!rows.length) main.append(h("p", { class: "empty" }, [channel.id === "gdelt" ? "這個管道在結果檔裡沒有列。" : "沒有符合的標的。"]));
  else main.append(h("div", { class: "card-grid" }, rows.map(function (row) { return nameCard(row, channel); })));

  const notes = [backtest.source_note, backtest.ret_note].filter(Boolean);
  if (notes.length) main.append(h("aside", { class: "note" }, [notes.join("")]));
}

function formatParam(value) {
  if (value == null || Number.isNaN(Number(value))) return "—";
  return Number(value).toLocaleString("zh-TW", { maximumFractionDigits: 1 });
}

function kpi(label, value) {
  return h("div", { class: "kpi" }, [h("span", {}, [label]), h("strong", {}, [value])]);
}

async function render() {
  const token = ++renderToken;
  const restoreTab = document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("role") === "tab";
  destroyChart();
  const parsed = parseHash();
  updateNav(parsed.page);
  const main = document.getElementById("main");
  main.replaceChildren();
  try {
    if (parsed.page === "today") renderToday(main, parsed.params);
    else if (parsed.page === "trend") renderTrend(main, parsed.params, token);
    else if (parsed.page === "watchlist") await renderWatch(main, parsed.params, token);
    else renderBacktest(main, parsed.params);
  } catch (error) {
    if (token !== renderToken) return;
    main.replaceChildren(errorCard(error));
  }
  if (restoreTab) {
    const selected = document.querySelector('.tabs [aria-selected="true"]');
    if (selected) selected.focus();
  }
}

async function boot() {
  try {
    const latest = await fetchJSON("data/latest.json");
    const manifest = await fetchJSON("data/manifest.json");
    const backtest = await fetchJSON("data/backtest.json");
    const csv = await fetchText("data/history.csv");
    state.latest = latest;
    state.manifest = manifest;
    state.backtest = backtest;
    state.analyzed = HeatRule.analyzeHistory(HeatRule.parseCSV(csv));
  } catch (error) {
    document.getElementById("main").replaceChildren(errorCard(error));
    return;
  }
  paintChrome();
  if (!location.hash) history.replaceState(null, "", "#/today");
  window.addEventListener("hashchange", function () { render(); });
  document.addEventListener("click", function (event) {
    if (event.target.closest && event.target.closest(".search-box")) return;
    const results = document.getElementById("search-results");
    if (results) results.replaceChildren();
  });
  const theme = window.matchMedia("(prefers-color-scheme: dark)");
  if (theme.addEventListener) theme.addEventListener("change", function () { render(); });
  render();
}

boot();
