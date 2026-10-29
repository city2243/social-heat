"""Trigger rule shared by sample generation and the data validator.

A day triggers when all of the following are true:

- at least 7 earlier calendar days exist in the file's date span
- mentions (summed across sources) are at least 5
- mentions are at least 5x the prior 7 calendar days (missing days count as 0)
- at least 2 distinct sources have mentions inside the 3 calendar days ending today

In this dataset each source is a platform, so the community count and the
cross-platform check are the same condition.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import date, timedelta

SOURCE_ORDER = ["ptt", "cmoney", "threads", "5ch", "reddit", "x", "youtube", "news"]
MARKETS = ["TW", "US", "JP"]


def ratio_of(total: int, window_sum: int):
    if window_sum <= 0:
        return None
    return int(total * 7 * 100 / window_sum + 0.5) / 100.0


def _parse_date(value: str) -> date:
    return date.fromisoformat(value)


def analyze(rows):
    parsed = []
    for row in rows:
        parsed.append(
            {
                "date": _parse_date(str(row["date"])),
                "market": row["market"],
                "source": row["source"],
                "keyword": row["keyword"],
                "mentions": int(row["mentions"]),
                "authors": int(row["authors"]),
            }
        )
    if not parsed:
        return {"calendar": [], "series": []}

    start = min(item["date"] for item in parsed)
    end = max(item["date"] for item in parsed)
    calendar = []
    cursor = start
    while cursor <= end:
        calendar.append(cursor)
        cursor += timedelta(days=1)

    mentions = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    authors = defaultdict(lambda: defaultdict(lambda: defaultdict(int)))
    for item in parsed:
        key = (item["market"], item["keyword"])
        mentions[key][item["date"]][item["source"]] += item["mentions"]
        authors[key][item["date"]][item["source"]] += item["authors"]

    series = []
    for market, keyword in sorted(mentions, key=lambda key: (MARKETS.index(key[0]) if key[0] in MARKETS else 9, key[1])):
        days = []
        totals = []
        for index, current in enumerate(calendar):
            by_source = {
                source: mentions[(market, keyword)][current][source]
                for source in SOURCE_ORDER
                if mentions[(market, keyword)][current][source] > 0
            }
            total = sum(by_source.values())
            author_total = sum(authors[(market, keyword)][current].values())
            history_ok = index >= 7
            window_sum = sum(totals[index - 7 : index]) if history_ok else 0
            avg7 = (window_sum / 7) if history_ok else None
            ratio = ratio_of(total, window_sum) if history_ok else None
            abs_ok = total >= 5
            ratio_ok = history_ok and (window_sum == 0 or total * 7 >= 5 * window_sum)
            present = set()
            for back in range(max(0, index - 2), index + 1):
                for source, count in mentions[(market, keyword)][calendar[back]].items():
                    if count > 0:
                        present.add(source)
            window_sources = [source for source in SOURCE_ORDER if source in present]
            cross = len(window_sources) >= 2
            triggered = history_ok and abs_ok and ratio_ok and cross
            days.append(
                {
                    "date": current.isoformat(),
                    "total": total,
                    "authors": author_total,
                    "avg7": avg7,
                    "window_sum": window_sum if history_ok else None,
                    "ratio": ratio,
                    "by_source": by_source,
                    "window_sources": window_sources,
                    "history_ok": history_ok,
                    "abs_ok": abs_ok,
                    "ratio_ok": ratio_ok,
                    "cross": cross,
                    "triggered": triggered,
                }
            )
            totals.append(total)
        series.append({"market": market, "keyword": keyword, "days": days})
    return {"calendar": [day.isoformat() for day in calendar], "series": series}


def triggers_of(analyzed):
    found = []
    for series in analyzed["series"]:
        for day in series["days"]:
            if not day["triggered"]:
                continue
            found.append(
                {
                    "date": day["date"],
                    "market": series["market"],
                    "keyword": series["keyword"],
                    "mentions": day["total"],
                    "ratio": day["ratio"],
                    "communities": len(day["window_sources"]),
                    "platforms": list(day["window_sources"]),
                }
            )
    return found
