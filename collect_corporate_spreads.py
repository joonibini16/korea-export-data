"""Discover screenshot issuers in FINRA's public bond directory, then collect TRACE EOD.

Only exact coupon/year matches with an actual TRACE observation are published.
Existing observations are kept on failures. The selected CUSIP is pinned once
resolved so a later issue with the same coupon/year cannot silently replace it.
"""
import csv
import datetime as dt
import json
import math
import pathlib
import runpy

cfg = json.loads(pathlib.Path("corporate_spread_targets.json").read_text(encoding="utf-8"))["targets"]
resolved_path = pathlib.Path("corporate_spread_resolved.json")
resolved = json.loads(resolved_path.read_text(encoding="utf-8")) if resolved_path.exists() else {}
out = pathlib.Path("corporate_spreads_hist.csv")
fields = ["date", "ticker", "cusip", "price", "ytm", "ust", "spread_bp", "source"]
rows = {}
if out.exists():
    for r in csv.DictReader(out.open(encoding="utf-8")):
        if r.get("date") and r.get("ticker"):
            rows[(r["date"], r["ticker"])] = r

# Reuse the existing FINRA session and Treasury curve implementation. Its own
# existing bigtech history is written locally but is not committed by this job.
bonds = runpy.run_path("tools/collect_bigtech_bonds.py")
finra_data = bonds["finra_data"]
ust_on = bonds["ust_on"]
ytm_from_price = bonds["ytm_from_price"]
today = dt.date.today()
start = (today - dt.timedelta(days=1825)).isoformat() + " 00:00:00.000"
end = today.isoformat() + " 23:59:00.000"
status = {"updated": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
          "targets": len(cfg), "bonds": {}, "errors": []}


def matching_issues(b):
    raw = finra_data("corporateAndAgencySecurities", {
        "fields": ["cusip", "issueSymbolIdentifier", "issuerName", "couponRate", "maturityDate", "standardAndPoorsRating", "moodysRating", "couponType", "lastTradeDate"],
        "compareFilters": [{"fieldName": "issuerName", "fieldValue": b["issuer"], "compareType": "CONTAINS"}],
        "limit": 500})
    matches = []
    for r in raw:
        try:
            coupon = float(r["couponRate"])
            maturity = str(r["maturityDate"])[:10]
            year = int(maturity[:4])
            cusip = str(r.get("cusip") or r.get("issueSymbolIdentifier") or "").strip()
            if (abs(coupon - b["coupon"]) <= 0.005 and year == b["year"]
                    and len(cusip) == 9 and maturity > today.isoformat()):
                matches.append({"cusip": cusip, "coupon": coupon, "maturity": maturity,
                                "issuer": str(r.get("issuerName") or ""),
                                "rating_sp": r.get("standardAndPoorsRating"), "rating_moody": r.get("moodysRating"),
                                "coupon_type": r.get("couponType")})
        except (TypeError, ValueError, KeyError):
            continue
    return sorted(matches, key=lambda x: x["maturity"])


def observations(cusip):
    return finra_data("EndOfDayPriceYield", {
        "fields": ["cusip", "productType", "lastSalePrice", "lastSaleYield", "tradeDate"],
        "orFilters": [{"compareFilters": [
            {"fieldName": "cusip", "fieldValue": cusip, "compareType": "EQUAL"},
            {"fieldName": "issueSymbolIdentifier", "fieldValue": cusip, "compareType": "EQUAL"}]}],
        "dateRangeFilters": [{"startDate": start, "endDate": end, "fieldName": "tradeDate"}],
        "sortFields": ["tradeDate"], "offset": 0, "limit": 5000})


for b in cfg:
    ticker = b["t"]
    st = status["bonds"][ticker] = {"name": b["name"], "state": "unresolved"}
    try:
        candidates = [resolved[ticker]] if ticker in resolved else matching_issues(b)
        st["matches"] = len(candidates)
        for issue in candidates:
            got = observations(issue["cusip"])
            if not got:
                continue
            accepted = 0
            for r in got:
                try:
                    day = str(r["tradeDate"])[:10]
                    settle = dt.date.fromisoformat(day)
                    y = r.get("lastSaleYield")
                    price = r.get("lastSalePrice")
                    inferred = y is None
                    if inferred and price is None:
                        continue
                    y = (ytm_from_price(float(price), issue["coupon"], issue["maturity"], settle)
                         if inferred else float(y))
                    yrs = (dt.date.fromisoformat(issue["maturity"]) - settle).days / 365.25
                    treasury = ust_on(day, yrs)
                    if treasury is None or not (0 < y < 40) or yrs <= 0:
                        continue
                    rows[(day, ticker)] = {
                        "date": day, "ticker": ticker, "cusip": issue["cusip"],
                        "price": "" if price is None else f"{float(price):.3f}",
                        "ytm": f"{y:.3f}", "ust": f"{treasury:.3f}",
                        "spread_bp": f"{(y-treasury)*100:.0f}",
                        "source": "FINRA TRACE EOD price→YTM; FRED CMT" if inferred
                                  else "FINRA TRACE EOD; FRED CMT"}
                    accepted += 1
                except (ValueError, TypeError, KeyError, OverflowError) as e:
                    status["errors"].append(f"{ticker} row: {str(e)[:90]}")
            if accepted:
                resolved[ticker] = issue
                st.update(state="collected", cusip=issue["cusip"], coupon=issue["coupon"],
                          maturity=issue["maturity"], n=accepted,
                          latest=max(k[0] for k in rows if k[1] == ticker))
                break
        if st["state"] != "collected":
            st["state"] = "no matching traded issue"
    except Exception as e:
        st["state"] = "error"
        status["errors"].append(f"{ticker}: {str(e)[:160]} " + (e.read().decode("utf-8", "replace")[:400] if hasattr(e, "read") else ""))

with out.open("w", encoding="utf-8", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=fields, lineterminator="\n")
    writer.writeheader()
    writer.writerows(sorted(rows.values(), key=lambda r: (r["ticker"], r["date"])))
resolved_path.write_text(json.dumps(resolved, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
status["rows"] = len(rows)
pathlib.Path("corporate_spreads_status.json").write_text(
    json.dumps(status, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"targets": len(cfg), "resolved": len(resolved), "rows": len(rows),
                  "errors": status["errors"][:5]}, ensure_ascii=False))
