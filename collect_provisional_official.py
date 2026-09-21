import csv
import re
from pathlib import Path
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

LIST_URL = "https://customs.go.kr/kcs/na/ntt/selectNttList.do"
BASE = "https://customs.go.kr"
OUT = Path("provisional_official.csv")
FIELDS = [
    "기준월","기간구분","종료일","발표일","수출_USD_mn","전년동기수출_USD_mn","수출YoY_pct",
    "수입_USD_mn","전년동기수입_USD_mn","수입YoY_pct","무역수지_USD_mn",
    "조업일수","전년조업일수","일평균수출_USD_mn","전년일평균수출_USD_mn",
    "일평균YoY_pct","반도체수출_USD_mn","출처URL"
]
HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; KoreaExportDashboard/1.0)"}


def number(value):
    return float(value.replace(",", "").replace("△", "-").replace("−", "-").strip())


def int_number(value):
    return int(round(number(value)))


def read_existing():
    if not OUT.exists():
        return []
    with OUT.open(encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def write_rows(rows):
    rows = sorted(rows, key=lambda r: (r["발표일"], r["기준월"], int(r["종료일"])))
    with OUT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(rows)


def find_release_links():
    found = {}
    for page in range(1, 5):
        r = requests.get(
            LIST_URL,
            params={"bbsId": "1362", "mi": "2891", "currPage": page},
            headers=HEADERS,
            timeout=30,
        )
        r.raise_for_status()
        soup = BeautifulSoup(r.text, "html.parser")
        for a in soup.find_all("a", href=True):
            title = " ".join(a.get_text(" ", strip=True).split())
            if "수출입 현황" not in title or "잠정치" not in title:
                continue
            href = urljoin(BASE, a["href"])
            found[href] = title
    return found


def parse_title(title):
    m = re.search(r"(\d{4})년\s*(\d{1,2})월\s*1일\s*~\s*\d{1,2}월\s*(10|20)일\s*수출입\s*현황", title)
    if m:
        year, month, end = m.groups()
        return f"{year}.{int(month):02d}", ("D10" if end == "10" else "D20"), int(end)
    m = re.search(r"(\d{4})년\s*(\d{1,2})월\s*수출입\s*현황", title)
    if m:
        year, month = m.groups()
        import calendar
        end = calendar.monthrange(int(year), int(month))[1]
        return f"{year}.{int(month):02d}", "MONTH", end
    return None


def parse_five(text, label):
    pat = rf"{label}\s*(?:\(전년동기대비 증감률\))?\s*([\-0-9,]+)\s+([\-0-9,]+)\s+([\-0-9,]+)\s+([\-0-9,]+)\s+([\-0-9,]+)"
    m = re.search(pat, text)
    if not m:
        return None
    return [int_number(v) for v in m.groups()]


def parse_rates_after(text, label):
    pat = rf"{label}\s*(?:\(전년동기대비 증감률\))?\s*[\-0-9,]+\s+[\-0-9,]+\s+[\-0-9,]+\s+[\-0-9,]+\s+[\-0-9,]+\s*" + \
          r"\(([^)]+)\)\s*\(([^)]+)\)\s*\(([^)]+)\)\s*\(([^)]+)\)\s*\(([^)]+)\)"
    m = re.search(pat, text)
    if not m:
        return None
    return [number(v) for v in m.groups()]


def parse_detail(url, title):
    meta = parse_title(title)
    if not meta:
        return None
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "html.parser")
    text = " ".join(soup.get_text(" ", strip=True).split())

    release = re.search(r"등록일\s*(\d{4}\.\d{2}\.\d{2})", text)
    if not release:
        return None

    exports = parse_five(text, r"수\s*출")
    imports = parse_five(text, r"수\s*입")
    balances = parse_five(text, r"무역수지")
    export_rates = parse_rates_after(text, r"수\s*출")
    import_rates = parse_rates_after(text, r"수\s*입")
    if not exports or not imports or not balances or not export_rates or not import_rates:
        return None

    work = re.search(
        r"조업일수\[\(.’?\d{2}\)([0-9.]+)\s*일,\(.’?\d{2}\)([0-9.]+)\s*일\].*?"
        r"일평균수출액\[\(.’?\d{2}\.\d{1,2}\.\)([0-9.]+),\(.’?\d{2}\.\d{1,2}\.\)([0-9.]+)\s*억\s*달러\]\s*([△0-9.\-]+)%",
        text,
    )
    # fallback for curly apostrophes / spacing variants
    if not work:
        work = re.search(
            r"조업일수.*?\(.*?\)([0-9.]+)\s*일.*?\(.*?\)([0-9.]+)\s*일.*?"
            r"일평균수출액.*?\(.*?\)([0-9.]+).*?\(.*?\)([0-9.]+)\s*억\s*달러.*?([△0-9.\-]+)%",
            text,
        )

    semi = re.search(r"반도체\(([0-9,.]+)\s*억\s*달러\)", text)
    base_month, period, end = meta

    row = {
        "기준월": base_month,
        "기간구분": period,
        "종료일": str(end),
        "발표일": release.group(1).replace(".", "-"),
        "수출_USD_mn": str(exports[3]),
        "전년동기수출_USD_mn": str(exports[0]),
        "수출YoY_pct": str(export_rates[3]),
        "수입_USD_mn": str(imports[3]),
        "전년동기수입_USD_mn": str(imports[0]),
        "수입YoY_pct": str(import_rates[3]),
        "무역수지_USD_mn": str(balances[3]),
        "조업일수": str(number(work.group(2))) if work else "",
        "전년조업일수": str(number(work.group(1))) if work else "",
        "일평균수출_USD_mn": str(int(round(number(work.group(4)) * 100))) if work else "",
        "전년일평균수출_USD_mn": str(int(round(number(work.group(3)) * 100))) if work else "",
        "일평균YoY_pct": str(number(work.group(5))) if work else "",
        "반도체수출_USD_mn": str(int(round(number(semi.group(1)) * 100))) if semi else "",
        "출처URL": url,
    }
    return row


def main():
    rows = read_existing()
    by_key = {(r["기준월"], r["기간구분"]): r for r in rows}
    changed = False

    for url, title in find_release_links().items():
        meta = parse_title(title)
        if not meta:
            continue
        key = (meta[0], meta[1])
        if key in by_key:
            continue
        try:
            row = parse_detail(url, title)
        except Exception as exc:
            print(f"skip {title}: {exc}")
            continue
        if row:
            by_key[key] = row
            changed = True
            print("added", row["기준월"], row["기간구분"], row["발표일"])

    if changed:
        write_rows(list(by_key.values()))
    else:
        print("no new provisional release")


if __name__ == "__main__":
    main()
