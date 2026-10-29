"""Check the files under data/ against the dashboard contract."""

from __future__ import annotations

import csv
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from rule import MARKETS, SOURCE_ORDER, analyze, triggers_of

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
SOURCES = set(SOURCE_ORDER)
MARKET_SET = set(MARKETS)
SCOPE = "此回測僅在美股驗證；台股與日股仍在累積資料。"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    errors = []

    def err(message: str) -> None:
        errors.append(message)

    history_path = DATA / "history.csv"
    if not history_path.exists():
        err("missing data/history.csv")
        rows = []
    else:
        with history_path.open(encoding="utf-8-sig", newline="") as handle:
            reader = csv.DictReader(handle)
            if reader.fieldnames != ["date", "market", "source", "keyword", "mentions", "authors"]:
                err(f"history.csv header is {reader.fieldnames}")
            rows = list(reader)
        seen = set()
        for index, row in enumerate(rows, start=2):
            where = f"history.csv:{index}"
            try:
                date.fromisoformat(row["date"])
            except ValueError:
                err(f"{where} bad date {row.get('date')}")
            if row["market"] not in MARKET_SET:
                err(f"{where} bad market {row.get('market')}")
            if row["source"] not in SOURCES:
                err(f"{where} bad source {row.get('source')}")
            if not row["keyword"]:
                err(f"{where} empty keyword")
            for field in ("mentions", "authors"):
                try:
                    value = int(row[field])
                except (TypeError, ValueError):
                    err(f"{where} {field} is not an integer")
                    continue
                if value < 0:
                    err(f"{where} {field} is negative")
            key = (row["date"], row["market"], row["source"], row["keyword"])
            if key in seen:
                err(f"{where} duplicate {key}")
            seen.add(key)

    manifest_path = DATA / "manifest.json"
    manifest = {}
    if not manifest_path.exists():
        err("missing data/manifest.json")
    else:
        manifest = load_json(manifest_path)
        daily_list = manifest.get("daily")
        if not isinstance(daily_list, list) or not daily_list:
            err("manifest.daily must be a non-empty list")
            daily_list = []
        if daily_list != sorted(set(daily_list)):
            err("manifest.daily must be unique and sorted")
        if manifest.get("latest") != (daily_list[-1] if daily_list else None):
            err("manifest.latest must be the last daily date")
        on_disk = sorted(path.stem for path in (DATA / "daily").glob("*.json"))
        if on_disk != daily_list:
            err(f"daily files {on_disk} do not match manifest")

    daily_payloads = []
    for iso in manifest.get("daily") or []:
        path = DATA / "daily" / f"{iso}.json"
        if not path.exists():
            err(f"missing {path}")
            continue
        payload = load_json(path)
        daily_payloads.append(payload)
        check_snapshot(payload, iso, err)

    latest_path = DATA / "latest.json"
    if not latest_path.exists():
        err("missing data/latest.json")
    elif daily_payloads:
        latest = load_json(latest_path)
        if latest != daily_payloads[-1]:
            err("data/latest.json must match the newest daily file")
        check_snapshot(latest, manifest.get("latest"), err)

    backtest_path = DATA / "backtest.json"
    if not backtest_path.exists():
        err("missing data/backtest.json")
    else:
        check_backtest(load_json(backtest_path), err)

    if rows and not errors:
        check_rule_parity(rows, err)
        if daily_payloads and daily_payloads[-1].get("data_label") == "範例資料":
            check_sample_alignment(rows, daily_payloads, err)

    if errors:
        print("\n".join(f"ERROR: {item}" for item in errors))
        raise SystemExit(1)
    print(f"OK history={len(rows)} daily={len(daily_payloads)}")


def check_snapshot(payload, expected_date, err) -> None:
    where = f"daily {expected_date}"
    if payload.get("date") != expected_date:
        err(f"{where} date field is {payload.get('date')}")
    markets = payload.get("markets")
    if not isinstance(markets, dict) or list(markets) != MARKETS:
        err(f"{where} markets must be TW, US, JP in that order")
        return
    if not isinstance(payload.get("hit_rate_note"), str) or not payload["hit_rate_note"].strip():
        err(f"{where} hit_rate_note must be a non-empty string")
    for market, block in markets.items():
        topics = block.get("topics")
        heating = block.get("early_heating")
        if not isinstance(topics, list) or not isinstance(heating, list):
            err(f"{where} {market} topics/early_heating must be lists")
            continue
        seen_topics = set()
        for topic in topics:
            keyword = topic.get("keyword")
            if not keyword or keyword in seen_topics:
                err(f"{where} {market} bad or duplicate topic {keyword}")
            seen_topics.add(keyword)
            if not isinstance(topic.get("summary"), str) or not topic["summary"].strip():
                err(f"{where} {market} {keyword} summary missing")
            links = topic.get("links")
            if not isinstance(links, list):
                err(f"{where} {market} {keyword} links must be a list")
                continue
            for link in links:
                if not isinstance(link, dict):
                    err(f"{where} {market} {keyword} link must be an object")
                    continue
                if not link.get("title") or not isinstance(link.get("url"), str) or not link["url"].startswith("https://"):
                    err(f"{where} {market} {keyword} link needs title and https url")
                if link.get("source") not in SOURCES:
                    err(f"{where} {market} {keyword} link source {link.get('source')}")
        seen_heat = set()
        for item in heating:
            keyword = item.get("keyword")
            if not keyword or keyword in seen_heat:
                err(f"{where} {market} bad or duplicate early_heating {keyword}")
            seen_heat.add(keyword)
            if not isinstance(item.get("reason"), str) or not item["reason"].strip():
                err(f"{where} {market} {keyword} reason missing")
            ratio = item.get("ratio_vs_7d")
            if ratio is not None and not isinstance(ratio, (int, float)):
                err(f"{where} {market} {keyword} ratio_vs_7d must be a number or null")
            if not isinstance(item.get("communities"), int) or item["communities"] < 0:
                err(f"{where} {market} {keyword} communities must be a non-negative integer")
            platforms = item.get("platforms")
            if not isinstance(platforms, list) or any(source not in SOURCES for source in platforms):
                err(f"{where} {market} {keyword} platforms must use the source enum")


def check_backtest(payload, err) -> None:
    if SCOPE not in str(payload.get("scope_note", "")):
        err("backtest.scope_note must include the US-only validation sentence")
    metrics = payload.get("metrics") or {}
    for key in ("hit_rate", "precision", "flags", "control_flags", "control_names_flagged", "median_lead_days", "score"):
        if not isinstance(metrics.get(key), (int, float)):
            err(f"backtest.metrics.{key} missing")
    parameters = payload.get("parameters") or {}
    for key in ("k", "minabs", "tk"):
        if not isinstance(parameters.get(key), (int, float)):
            err(f"backtest.parameters.{key} missing")
    us_slice = payload.get("us_slice") or {}
    for key in ("hot_names", "hot_hits", "hot_hit_rate", "note"):
        if key not in us_slice:
            err(f"backtest.us_slice.{key} missing")
    channels = payload.get("channels")
    if not isinstance(channels, list) or not channels:
        err("backtest.channels must be a non-empty list")
        return
    if not any(channel.get("id") == "best" and channel.get("validated") is True for channel in channels):
        err("backtest.channels must include a validated best channel")
    for channel in channels:
        if not channel.get("id") or not channel.get("label") or not isinstance(channel.get("note"), str):
            err("channel needs id, label, and note")
        if not isinstance(channel.get("rows"), list) or not isinstance(channel.get("rollup"), dict):
            err(f"channel {channel.get('id')} needs rows and rollup")


def check_rule_parity(rows, err) -> None:
    py_triggers = sorted(triggers_of(analyze(rows)), key=lambda item: (item["date"], item["market"], item["keyword"]))
    try:
        raw = subprocess.check_output(["node", str(ROOT / "scripts" / "check_rule.js")], cwd=ROOT, text=True)
    except (OSError, subprocess.CalledProcessError) as exc:
        err(f"node rule check failed: {exc}")
        return
    js_triggers = sorted(json.loads(raw), key=lambda item: (item["date"], item["market"], item["keyword"]))
    py_key = [(item["date"], item["market"], item["keyword"], item["mentions"], tuple(item["platforms"])) for item in py_triggers]
    js_key = [(item["date"], item["market"], item["keyword"], item["mentions"], tuple(item["platforms"])) for item in js_triggers]
    if py_key != js_key:
        err("Python and JavaScript trigger rules disagree")
    for left, right in zip(py_triggers, js_triggers):
        if left["ratio"] is None or right["ratio"] is None:
            if left["ratio"] != right["ratio"]:
                err(f"ratio null mismatch {left['keyword']} {left['date']}")
        elif abs(left["ratio"] - right["ratio"]) > 0.001:
            err(f"ratio mismatch {left['keyword']} {left['date']}: {left['ratio']} vs {right['ratio']}")


def check_sample_alignment(rows, daily_payloads, err) -> None:
    found = {(item["date"], item["market"], item["keyword"]): item for item in triggers_of(analyze(rows))}
    seen = set()
    keywords = {(row["market"], row["keyword"]) for row in rows}
    for payload in daily_payloads:
        for market, block in payload["markets"].items():
            for topic in block["topics"]:
                if (market, topic["keyword"]) not in keywords:
                    err(f"{payload['date']} topic {topic['keyword']} is not in history.csv")
            for item in block["early_heating"]:
                key = (payload["date"], market, item["keyword"])
                seen.add(key)
                trigger = found.get(key)
                if trigger is None:
                    err(f"{key} is early_heating but the rule did not trigger")
                    continue
                if item["platforms"] != trigger["platforms"] or item["communities"] != trigger["communities"]:
                    err(f"{key} platforms/communities do not match the rule")
                if trigger["ratio"] is not None and abs(item["ratio_vs_7d"] - trigger["ratio"]) > 0.011:
                    err(f"{key} ratio {item['ratio_vs_7d']} != {trigger['ratio']}")
    daily_dates = {payload["date"] for payload in daily_payloads}
    for key in found:
        if key[0] in daily_dates and key not in seen:
            err(f"rule trigger {key} missing from that day's early_heating")


if __name__ == "__main__":
    main()
