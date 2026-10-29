"""Build the committed 範例資料 under data/.

Running this overwrites history.csv, the daily snapshots, latest.json,
manifest.json, and backtest.json. Do not run it after real daily files exist.
"""

from __future__ import annotations

import csv
import json
import math
import sys
from datetime import date, timedelta
from pathlib import Path
from urllib.parse import quote

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rule import analyze, triggers_of

ROOT = Path(__file__).resolve().parents[1]
BEST_PATH = Path("/home/ubuntu/.cursor/projects/workspace/uploads/results_best_a240.json")
EXT_PATH = Path("/home/ubuntu/.cursor/projects/workspace/uploads/results_ext_db5c.json")

START = date(2026, 9, 14)
END = date(2026, 10, 28)
SNAPSHOT_START = date(2026, 9, 21)

AUTHOR_RATIO = {
    "ptt": 0.62,
    "cmoney": 0.55,
    "threads": 0.7,
    "5ch": 0.5,
    "reddit": 0.4,
    "x": 0.75,
    "youtube": 0.35,
    "news": 0.8,
}

PROFILES = [
    {"market": "TW", "keyword": "台積電", "baseline": [("ptt", 28, 3), ("news", 12, 0), ("cmoney", 6, 0)], "phase": 1, "spikes": {}},
    {"market": "TW", "keyword": "南亞科", "baseline": [("ptt", 2, 1)], "phase": 2, "spikes": {"2026-10-08": [("ptt", 8), ("cmoney", 6), ("threads", 4)]}},
    {"market": "TW", "keyword": "聯發科", "baseline": [("ptt", 3, 1)], "phase": 3, "spikes": {"2026-09-28": [("ptt", 12), ("cmoney", 7), ("news", 5)]}},
    {"market": "TW", "keyword": "世芯-KY", "baseline": [("ptt", 2, 1)], "phase": 4, "spikes": {"2026-10-25": [("ptt", 12), ("threads", 8)]}},
    {"market": "TW", "keyword": "奇鋐", "baseline": [("ptt", 2, 1)], "phase": 5, "spikes": {"2026-10-28": [("ptt", 10), ("cmoney", 7), ("threads", 5)]}},
    {"market": "TW", "keyword": "中華電", "baseline": [("ptt", 2, 1)], "phase": 6, "spikes": {}},
    {"market": "US", "keyword": "蘋果", "baseline": [("reddit", 14, 2), ("news", 7, 0), ("x", 5, 0)], "phase": 1, "spikes": {}},
    {"market": "US", "keyword": "美光", "baseline": [("reddit", 4, 1)], "phase": 2, "spikes": {
        "2026-09-22": [("reddit", 22), ("x", 12), ("news", 6)],
        "2026-10-16": [("reddit", 18), ("x", 11), ("news", 7)],
    }},
    {"market": "US", "keyword": "英特爾", "baseline": [("reddit", 3, 1)], "phase": 3, "spikes": {"2026-10-12": [("reddit", 14), ("youtube", 9), ("news", 7)]}},
    {"market": "US", "keyword": "輝達", "baseline": [("reddit", 2, 1)], "phase": 4, "spikes": {"2026-10-18": [("reddit", 24), ("x", 18), ("youtube", 13)]}},
    {"market": "US", "keyword": "超微", "baseline": [("reddit", 3, 1)], "phase": 5, "spikes": {"2026-10-28": [("reddit", 16), ("x", 9), ("youtube", 7)]}},
    {"market": "US", "keyword": "AST SpaceMobile", "baseline": [("reddit", 3, 1)], "phase": 6, "spikes": {"2026-10-11": [("reddit", 28)]}},
    {"market": "US", "keyword": "可口可樂", "baseline": [("reddit", 1, 1)], "phase": 7, "spikes": {}},
    {"market": "JP", "keyword": "軟銀", "baseline": [("x", 8, 2), ("news", 7, 0), ("5ch", 4, 0)], "phase": 1, "spikes": {}},
    {"market": "JP", "keyword": "愛德萬測試", "baseline": [("5ch", 2, 1)], "phase": 2, "spikes": {"2026-09-30": [("5ch", 8), ("x", 6), ("youtube", 4)]}},
    {"market": "JP", "keyword": "鎧俠", "baseline": [("5ch", 2, 1)], "phase": 3, "spikes": {"2026-10-05": [("5ch", 11), ("x", 6), ("news", 4)]}},
    {"market": "JP", "keyword": "藤倉", "baseline": [("5ch", 2, 1)], "phase": 4, "spikes": {"2026-10-28": [("5ch", 10), ("x", 8)]}},
    {"market": "JP", "keyword": "東京電子", "baseline": [("5ch", 2, 1)], "phase": 5, "spikes": {}},
]

HOT_FROM = {
    ("TW", "台積電"): "2026-09-21",
    ("TW", "聯發科"): "2026-10-15",
    ("TW", "南亞科"): "2026-10-22",
    ("US", "蘋果"): "2026-09-21",
    ("US", "美光"): "2026-10-01",
    ("US", "英特爾"): "2026-10-20",
    ("US", "輝達"): "2026-10-28",
    ("JP", "軟銀"): "2026-09-21",
    ("JP", "愛德萬測試"): "2026-10-18",
    ("JP", "鎧俠"): "2026-10-20",
}

TOPIC_ORDER = ["台積電", "聯發科", "南亞科", "蘋果", "美光", "英特爾", "輝達", "軟銀", "愛德萬測試", "鎧俠"]

SUMMARIES = {
    "台積電": "討論多半圍繞先進製程、資本支出與封裝產能。PTT、CMoney 與新聞每天都有聲量，但沒有相對七日均量的突然跳升。（範例）",
    "南亞科": "記憶體報價與庫存天期是主要話題。早期升溫之後，這檔出現在熱門話題裡。（範例）",
    "聯發科": "手機與邊緣運算晶片的訂單討論升溫後，持續留在熱門話題。（範例）",
    "蘋果": "財報與服務業務的討論維持高檔，Reddit、X 與新聞都有聲量，但沒有達到五倍均量。（範例）",
    "美光": "資料中心記憶體與 HBM 供應是討論核心。第一次放量之後，後續快照把它列進熱門話題。（範例）",
    "英特爾": "製程進度與代工客戶的討論，在跨平台放量之後升上熱門話題。（範例）",
    "輝達": "加速器出貨與供應鏈的討論在樣本期末進入熱門話題。（範例）",
    "軟銀": "投資部位與旗下公司的討論維持穩定，沒有出現五倍均量的早期升溫。（範例）",
    "愛德萬測試": "半導體測試設備的訂單討論，在標記日之後被列入熱門話題。（範例）",
    "鎧俠": "NAND 報價與產能利用率的討論升溫後，出現在熱門話題。（範例）",
}

REASONS = {
    ("美光", "2026-09-22"): "Reddit、X 與新聞同一天放量，內容集中在資料中心記憶體，提及高於前七日均量數倍。（範例）",
    ("美光", "2026-10-16"): "當時已經在熱門話題裡，這天 Reddit、X 與新聞又同時跳升。（範例）",
    ("南亞科", "2026-10-08"): "PTT、CMoney 與 Threads 在三天內一起出現，當天提及達到五倍均量門檻。（範例）",
    ("聯發科", "2026-09-28"): "PTT 與 CMoney 討論變厚，新聞同一天跟上。（範例）",
    ("世芯-KY", "2026-10-25"): "PTT 與 Threads 同時放量，之後的快照還沒有把它列進熱門話題。（範例）",
    ("奇鋐", "2026-10-28"): "散熱與伺服器供應鏈在 PTT、CMoney、Threads 放量。這是樣本最後一天，還沒有更晚的快照。（範例）",
    ("英特爾", "2026-10-12"): "Reddit、YouTube 與新聞同一天增加。（範例）",
    ("輝達", "2026-10-18"): "Reddit、X 與 YouTube 提及一起跳升。（範例）",
    ("超微", "2026-10-28"): "Reddit、X 與 YouTube 當天放量。沒有更晚的快照可確認是否進入熱門。（範例）",
    ("鎧俠", "2026-10-05"): "5ch、X 與新聞同步增加 NAND 相關討論。（範例）",
    ("愛德萬測試", "2026-09-30"): "5ch、X 與 YouTube 同一天出現測試設備話題。（範例）",
    ("藤倉", "2026-10-28"): "5ch 與 X 當天跳升。沒有更晚的快照。（範例）",
}

EXPECTED = {
    ("TW", "南亞科"): ["2026-10-08"],
    ("TW", "聯發科"): ["2026-09-28"],
    ("TW", "世芯-KY"): ["2026-10-25"],
    ("TW", "奇鋐"): ["2026-10-28"],
    ("US", "美光"): ["2026-09-22", "2026-10-16"],
    ("US", "英特爾"): ["2026-10-12"],
    ("US", "輝達"): ["2026-10-18"],
    ("US", "超微"): ["2026-10-28"],
    ("JP", "鎧俠"): ["2026-10-05"],
    ("JP", "愛德萬測試"): ["2026-09-30"],
    ("JP", "藤倉"): ["2026-10-28"],
}

CODES = {"台積電": "2330", "南亞科": "2408", "聯發科": "2454", "世芯-KY": "3661", "中華電": "2412", "奇鋐": "3017"}
EN_QUERY = {
    "美光": "Micron MU",
    "英特爾": "Intel",
    "輝達": "NVIDIA",
    "超微": "AMD",
    "蘋果": "Apple AAPL",
    "AST SpaceMobile": "AST SpaceMobile ASTS",
    "可口可樂": "Coca-Cola",
}
JP_QUERY = {"鎧俠": "キオクシア", "愛德萬測試": "アドバンテスト", "軟銀": "ソフトバンク", "藤倉": "フジクラ", "東京電子": "東京エレクトロン"}

ZH = {
    "Micron": "美光",
    "SanDisk": "晟碟",
    "Western Digital": "威騰",
    "Intel": "英特爾",
    "Oklo": "Oklo",
    "Rigetti": "Rigetti",
    "AST SpaceMobile": "AST SpaceMobile",
    "Rocket Lab": "火箭實驗室",
    "TSMC": "台積電",
    "Nanya Tech": "南亞科",
    "Winbond": "華邦電",
    "Advantest": "愛德萬測試",
    "Kioxia": "鎧俠",
    "SoftBank": "軟銀",
    "Fujikura": "藤倉",
    "Coca-Cola": "可口可樂",
    "Procter & Gamble": "寶僑",
    "Verizon": "威瑞森",
    "Chunghwa Telecom": "中華電",
    "NTT": "日本電信",
}


def dump(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def mentions_for(profile, iso: str, index: int):
    if iso in profile["spikes"]:
        return list(profile["spikes"][iso])
    rows = []
    for source, base, amp in profile["baseline"]:
        count = max(0, base + round(amp * math.sin((index + profile["phase"]) * 0.85)))
        if count:
            rows.append((source, count))
    return rows


def build_history():
    rows = []
    cursor = START
    index = 0
    while cursor <= END:
        iso = cursor.isoformat()
        for profile in PROFILES:
            for source, count in mentions_for(profile, iso, index):
                authors = max(1, int(round(count * AUTHOR_RATIO[source])))
                rows.append(
                    {
                        "date": iso,
                        "market": profile["market"],
                        "source": source,
                        "keyword": profile["keyword"],
                        "mentions": count,
                        "authors": authors,
                    }
                )
        cursor += timedelta(days=1)
        index += 1
    rows.sort(key=lambda row: (row["date"], row["market"], row["keyword"], row["source"]))
    return rows


def write_history(rows) -> None:
    path = ROOT / "data" / "history.csv"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="\n") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["date", "market", "source", "keyword", "mentions", "authors"])
        for row in rows:
            writer.writerow([row["date"], row["market"], row["source"], row["keyword"], row["mentions"], row["authors"]])


def google(query: str) -> str:
    return "https://www.google.com/search?q=" + quote(query)


def links_for(keyword: str, market: str):
    query = EN_QUERY.get(keyword, keyword)
    items = []
    if market == "TW":
        items.append(("ptt", f"PTT 相關討論搜尋：{keyword}（範例連結）", google(f"site:ptt.cc/bbs/Stock {keyword}")))
        if keyword in CODES:
            items.append(("cmoney", f"CMoney 討論：{CODES[keyword]}（範例連結）", f"https://www.cmoney.tw/forum/stock/{CODES[keyword]}"))
        items.append(("news", f"Google 新聞：{keyword}（範例連結）", f"https://news.google.com/search?q={quote(keyword)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"))
    elif market == "US":
        items.append(("reddit", f"Reddit 搜尋：{query}（範例連結）", f"https://www.reddit.com/search/?q={quote(query)}&sort=new"))
        items.append(("x", f"X 搜尋：{query}（範例連結）", f"https://x.com/search?q={quote(query)}&src=typed_query&f=live"))
        items.append(("news", f"Google 新聞：{keyword}（範例連結）", f"https://news.google.com/search?q={quote(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"))
    else:
        jp = JP_QUERY.get(keyword, keyword)
        items.append(("5ch", f"5ch 相關搜尋：{keyword}（範例連結）", google(f"site:5ch.net {jp}")))
        items.append(("x", f"X 搜尋：{jp}（範例連結）", f"https://x.com/search?q={quote(jp)}&src=typed_query&f=live"))
        items.append(("news", f"Google 新聞：{keyword}（範例連結）", f"https://news.google.com/search?q={quote(keyword)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant"))
    if keyword in {"輝達", "台積電", "愛德萬測試", "超微"}:
        yt = query if market == "US" else keyword
        items.append(("youtube", f"YouTube 搜尋：{keyword}（範例連結）", f"https://www.youtube.com/results?search_query={quote(yt)}"))
    return [{"title": title, "url": url, "source": source} for source, title, url in items]


def snapshot_dates():
    dates = []
    cursor = SNAPSHOT_START
    while cursor <= END:
        dates.append(cursor.isoformat())
        cursor += timedelta(days=1)
    return dates


def became_later(flag_date: str, market: str, keyword: str, asof: str, snaps) -> bool:
    hot = HOT_FROM.get((market, keyword))
    if not hot:
        return False
    return any(flag_date < snap <= asof and hot <= snap for snap in snaps)


def hit_note(asof: str, found, snaps) -> str:
    flags = [item for item in found if item["date"] <= asof]
    later = sum(1 for item in flags if became_later(item["date"], item["market"], item["keyword"], asof, snaps))
    pending = len(flags) - later
    return f"範例資料。截至 {asof}，早期升溫標記 {len(flags)} 筆，其中 {later} 筆在較晚的快照裡列入熱門話題，{pending} 筆尚未。"


def write_daily(found) -> None:
    daily = ROOT / "data" / "daily"
    daily.mkdir(parents=True, exist_ok=True)
    for old in daily.glob("*.json"):
        old.unlink()
    snaps = snapshot_dates()
    by_day = {}
    for item in found:
        by_day.setdefault(item["date"], []).append(item)
    written = []
    for iso in snaps:
        markets = {}
        for market in ("TW", "US", "JP"):
            topics = []
            for keyword in TOPIC_ORDER:
                hot = HOT_FROM.get((market, keyword))
                if hot and hot <= iso:
                    topics.append(
                        {
                            "keyword": keyword,
                            "summary": SUMMARIES[keyword],
                            "links": links_for(keyword, market),
                        }
                    )
            heating = []
            for item in by_day.get(iso, []):
                if item["market"] != market:
                    continue
                heating.append(
                    {
                        "keyword": item["keyword"],
                        "reason": REASONS[(item["keyword"], item["date"])],
                        "ratio_vs_7d": item["ratio"],
                        "communities": item["communities"],
                        "platforms": item["platforms"],
                    }
                )
            heating.sort(key=lambda item: (-(item["ratio_vs_7d"] or 0), item["keyword"]))
            markets[market] = {"topics": topics, "early_heating": heating}
        payload = {
            "date": iso,
            "data_label": "範例資料",
            "markets": markets,
            "hit_rate_note": hit_note(iso, found, snaps),
        }
        dump(daily / f"{iso}.json", payload)
        written.append(payload)
    latest = written[-1]
    dump(ROOT / "data" / "latest.json", latest)
    dump(
        ROOT / "data" / "manifest.json",
        {"data_label": "範例資料", "latest": latest["date"], "daily": [item["date"] for item in written]},
    )


def normalize_best(row):
    return {
        "name": row["name"],
        "zh_name": ZH.get(row["name"], row["name"]),
        "market": row["market"],
        "group": row["group"],
        "hit": bool(row["hit"]),
        "ret": row["ret"],
        "n_flags": row["n_flags"],
        "n_conf": row["n_conf"],
        "first_flag": row["first_flag"],
        "lead_attn": row["lead_attn"],
        "lead_price": row["lead_price"],
        "price_peak": row["price_peak"],
        "attn_peak": row["attn_peak"],
        "trend_peak": row["trend_peak"],
        "mentions": row["reddit_total"],
        "flags": row["flags"],
    }


def normalize_ext(row):
    return {
        "name": row["name"],
        "zh_name": ZH.get(row["name"], row["name"]),
        "market": row["market"],
        "group": row["group"],
        "hit": bool(row["hit"]),
        "ret": None,
        "n_flags": row["n_flags"],
        "n_conf": row["n_conf"],
        "first_flag": row["first_flag"],
        "lead_attn": row["lead_attn"],
        "lead_price": row["lead_price"],
        "price_peak": row["price_peak"],
        "attn_peak": row["attn_peak"],
        "trend_peak": None,
        "mentions": row["total"],
        "flags": None,
    }


def rollup(rows):
    hot = [row for row in rows if row["group"] == "hot"]
    control = [row for row in rows if row["group"] == "control"]
    hot_hits = sum(1 for row in hot if row["hit"])
    return {
        "names": len(rows),
        "hot_names": len(hot),
        "hot_hits": hot_hits,
        "hot_hit_rate": (hot_hits / len(hot)) if hot else None,
        "control_names": len(control),
        "control_names_flagged": sum(1 for row in control if row["n_flags"] > 0),
        "control_hits": sum(1 for row in control if row["hit"]),
        "flags": sum(row["n_flags"] for row in rows),
    }


def channel_note(channel_id, roll):
    if roll["names"] == 0:
        return "結果檔裡這個管道沒有列，無法計算命中率。"
    base = (
        f"熱門股命中 {roll['hot_hits']}/{roll['hot_names']}，旗標 {roll['flags']} 次，"
        f"對照組 {roll['control_names_flagged']}/{roll['control_names']} 檔被標記。"
    )
    extra = {
        "best": "這是參數搜尋後採用的主結果。對照組沒有旗標，所以結果檔的精準度是 1。命中率的分母含 Reddit 覆蓋較少的台日熱門股。",
        "news": "旗標多，而且對照組也被標記，所以不用這組當已驗證規則。",
        "ptt": "這個區塊只有台股標的。",
        "reddit_news": "這是 Reddit 與新聞合併的另一組數字，旗標日期和主結果不完全相同。",
        "gdelt": "",
    }[channel_id]
    return base + extra


def write_backtest() -> None:
    best_file = json.loads(BEST_PATH.read_text(encoding="utf-8"))
    ext_file = json.loads(EXT_PATH.read_text(encoding="utf-8"))
    best_rows = [normalize_best(row) for row in best_file["results"]]
    official = best_file["best"]
    best_roll = rollup(best_rows)
    if abs(best_roll["hot_hit_rate"] - official["hit_rate"]) > 1e-9:
        raise SystemExit("best hit_rate does not match hot hits / hot names")
    if best_roll["flags"] != official["flags"]:
        raise SystemExit("best flag count does not match the sum of n_flags")
    if sum(row["n_flags"] for row in best_rows if row["group"] == "control") != official["ctl_flags"]:
        raise SystemExit("control flag events do not match ctl_flags")

    def market_hot(market):
        rows = [row for row in best_rows if row["market"] == market and row["group"] == "hot"]
        return len(rows), sum(1 for row in rows if row["hit"])

    us_hot_n, us_hits = market_hot("US")
    tw_hot_n, tw_hits = market_hot("TW")
    jp_hot_n, jp_hits = market_hot("JP")
    us_control = [row for row in best_rows if row["market"] == "US" and row["group"] == "control"]
    us_slice = {
        "hot_names": us_hot_n,
        "hot_hits": us_hits,
        "hot_hit_rate": us_hits / us_hot_n,
        "control_names": len(us_control),
        "control_names_flagged": sum(1 for row in us_control if row["n_flags"] > 0),
        "flags": sum(row["n_flags"] for row in best_rows if row["market"] == "US"),
        "note": (
            f"若只看美股熱門股，命中 {us_hits}/{us_hot_n}；美股對照組被標記 "
            f"{sum(1 for row in us_control if row['n_flags'] > 0)} 檔。"
            f"台股熱門股命中 {tw_hits}/{tw_hot_n}，日股熱門股命中 {jp_hits}/{jp_hot_n}。"
            "台日列在表內供對照，不視為已完成驗證。"
        ),
    }

    specs = [
        ("best", "Reddit 主結果", True, "Reddit 提及", best_rows),
        ("news", "新聞", False, "新聞量", [normalize_ext(row) for row in ext_file["news"]]),
        ("ptt", "PTT", False, "PTT 量", [normalize_ext(row) for row in ext_file["ptt"]]),
        ("reddit_news", "Reddit + 新聞", False, "合併提及", [normalize_ext(row) for row in ext_file["reddit_news"]]),
        ("gdelt", "GDELT", False, "提及量", [normalize_ext(row) for row in ext_file["gdelt"]]),
    ]
    channels = []
    for channel_id, label, validated, mentions_label, rows in specs:
        roll = rollup(rows)
        channels.append(
            {
                "id": channel_id,
                "label": label,
                "validated": validated,
                "mentions_label": mentions_label,
                "note": channel_note(channel_id, roll),
                "rollup": roll,
                "rows": rows,
            }
        )

    dump(
        ROOT / "data" / "backtest.json",
        {
            "data_label": "範例資料",
            "source_note": "由所附回測結果整理的摘要。報酬、命中與領先天數都沿用結果檔，這個網站沒有重算。",
            "scope_note": "此回測僅在美股驗證；台股與日股仍在累積資料。",
            "ret_note": "ret 是簡單報酬：0.44 表示 +44%，4.175 表示 +417.5%。",
            "parameters": {"k": official["k"], "minabs": official["minabs"], "tk": official["tk"]},
            "metrics": {
                "hit_rate": official["hit_rate"],
                "precision": official["precision"],
                "flags": official["flags"],
                "control_flags": official["ctl_flags"],
                "control_names_flagged": official["ctl_names"],
                "median_lead_days": official["med_lead"],
                "score": official["score"],
            },
            "us_slice": us_slice,
            "channels": channels,
        },
    )


def assert_story(analyzed, found) -> None:
    grouped = {}
    for item in found:
        grouped.setdefault((item["market"], item["keyword"]), []).append(item["date"])
    if grouped != EXPECTED:
        raise SystemExit(f"trigger dates mismatch:\n{json.dumps(grouped, ensure_ascii=False, indent=2)}")
    ast = next(series for series in analyzed["series"] if series["keyword"] == "AST SpaceMobile")
    day = next(item for item in ast["days"] if item["date"] == "2026-10-11")
    if not (day["abs_ok"] and day["ratio_ok"] and not day["cross"] and not day["triggered"]):
        raise SystemExit("AST SpaceMobile single-source spike should not trigger")
    snaps = snapshot_dates()
    end = END.isoformat()
    flags = [item for item in found if item["date"] <= end]
    later = [item for item in flags if became_later(item["date"], item["market"], item["keyword"], end, snaps)]
    if len(flags) != 12 or len(later) != 8:
        raise SystemExit(f"expected 12 flags and 8 later-hot, got {len(flags)} and {len(later)}")


def main() -> None:
    if not BEST_PATH.exists() or not EXT_PATH.exists():
        raise SystemExit("backtest source files are missing")
    rows = build_history()
    write_history(rows)
    analyzed = analyze(rows)
    found = triggers_of(analyzed)
    assert_story(analyzed, found)
    write_daily(found)
    write_backtest()
    print(f"history rows: {len(rows)}")
    print(f"triggers: {len(found)}")
    for item in found:
        print(f"  {item['date']} {item['market']} {item['keyword']} ratio={item['ratio']} sources={','.join(item['platforms'])}")


if __name__ == "__main__":
    main()
