import os
import csv
import time
import requests
import xml.etree.ElementTree as ET
from datetime import datetime

API_KEY = os.environ.get("CUSTOMS_API_KEY")
if not API_KEY:
    print("API 인증키를 찾지 못했습니다.")
    raise SystemExit(1)

API_URL = "http://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"

FULL_START_YEAR = 2020
FULL_START_MONTH = 1
UPDATE_MONTHS = 3
REQUEST_INTERVAL_SECONDS = 1.0

DETAIL_FIELDS = [
    "월", "대표품목", "조회_HS코드", "세부_HS코드", "세부품목명",
    "수출금액_USD", "수출중량_KG", "수입금액_USD", "수입중량_KG"
]

SUMMARY_FIELDS = [
    "월", "품목명", "HS코드", "수출금액_USD", "수출중량_KG",
    "수출단가_USD_per_KG", "YoY_pct", "MoM_pct"
]

FAILED_FIELDS = ["품목명", "HS코드", "시작월", "종료월", "오류"]

today = datetime.now()
if today.month == 1:
    END_YEAR = today.year - 1
    END_MONTH = 12
else:
    END_YEAR = today.year
    END_MONTH = today.month - 1


def to_int(value):
    if value is None:
        return 0
    value = str(value).strip().replace(",", "")
    if not value:
        return 0
    try:
        return int(float(value))
    except Exception:
        return 0


def next_month(yymm):
    y = int(yymm[:4])
    m = int(yymm[4:]) + 1
    if m == 13:
        y += 1
        m = 1
    return f"{y}{m:02d}"


def prev_month(yymm):
    y = int(yymm[:4])
    m = int(yymm[4:]) - 1
    if m == 0:
        y -= 1
        m = 12
    return f"{y}{m:02d}"


def month_range(start_yymm, end_yymm):
    out = []
    cur = start_yymm
    while True:
        out.append(cur)
        if cur == end_yymm:
            break
        cur = next_month(cur)
    return out


def yymm_to_label(yymm):
    return f"{yymm[:4]}.{yymm[4:]}"


def get_recent_months(end_year, end_month, count):
    end = f"{end_year}{end_month:02d}"
    months = [end]
    while len(months) < count:
        months.append(prev_month(months[-1]))
    return sorted(months)


def make_year_chunks(start_year, start_month, end_year, end_month):
    chunks = []
    for year in range(start_year, end_year + 1):
        sm = start_month if year == start_year else 1
        em = end_month if year == end_year else 12
        chunks.append((f"{year}{sm:02d}", f"{year}{em:02d}"))
    return chunks


def group_contiguous_months(months):
    months = sorted(set(months))
    if not months:
        return []

    groups = []
    start = months[0]
    prev = months[0]

    for cur in months[1:]:
        if cur == next_month(prev):
            prev = cur
        else:
            groups.append((start, prev))
            start = cur
            prev = cur

    groups.append((start, prev))
    return groups


def read_hs_codes():
    items = []
    with open("hs_codes.csv", "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            hs_code = row["hs_code"].strip()
            name = row["name"].strip()
            if hs_code:
                items.append({"hs_code": hs_code, "name": name})
    return items


HS_ITEMS = read_hs_codes()
RECENT_MONTHS = get_recent_months(END_YEAR, END_MONTH, UPDATE_MONTHS)
ALL_MONTHS = month_range(
    f"{FULL_START_YEAR}{FULL_START_MONTH:02d}",
    f"{END_YEAR}{END_MONTH:02d}"
)

session = requests.Session()


def request_range(hs_code, start_yymm, end_yymm):
    params = {
        "serviceKey": API_KEY,
        "strtYymm": start_yymm,
        "endYymm": end_yymm,
        "hsSgn": hs_code
    }

    for attempt in range(1, 4):
        try:
            print(
                f"조회: {start_yymm}~{end_yymm}"
                + (f" / 재시도 {attempt}/3" if attempt > 1 else ""),
                flush=True
            )

            response = session.get(
                API_URL,
                params=params,
                timeout=(60, 180)
            )

            if response.status_code == 429:
                wait = 30 if attempt == 1 else 60
                print(f"  HTTP 429 → {wait}초 대기")
                if attempt == 3:
                    return None, "HTTP 429 최종 실패"
                time.sleep(wait)
                continue

            if response.status_code != 200:
                if attempt == 3:
                    return None, f"HTTP {response.status_code}"
                time.sleep(10 * attempt)
                continue

            try:
                root = ET.fromstring(response.content)
            except Exception:
                if attempt == 3:
                    return None, "XML 해석 실패"
                time.sleep(10)
                continue

            rows = []

            for item in root.findall(".//item"):
                year = (item.findtext("year") or "").strip()

                if not year or year == "총계":
                    continue

                if len(year) != 7 or "." not in year:
                    continue

                rows.append({
                    "월": year,
                    "세부_HS코드": (item.findtext("hsCode") or "").strip(),
                    "세부품목명": (item.findtext("statKor") or "").strip(),
                    "수출금액_USD": to_int(item.findtext("expDlr")),
                    "수출중량_KG": to_int(item.findtext("expWgt")),
                    "수입금액_USD": to_int(item.findtext("impDlr")),
                    "수입중량_KG": to_int(item.findtext("impWgt"))
                })

            time.sleep(REQUEST_INTERVAL_SECONDS)
            print(f"  → {len(rows)}개 행 수신")
            return rows, None

        except requests.exceptions.Timeout:
            if attempt == 3:
                return None, "Timeout 최종 실패"
            time.sleep(10 * attempt)

        except requests.exceptions.RequestException as e:
            if attempt == 3:
                return None, str(e)
            time.sleep(10 * attempt)

    return None, "알 수 없는 오류"


def request_range_with_monthly_fallback(hs_code, start_yymm, end_yymm):
    rows, error = request_range(hs_code, start_yymm, end_yymm)

    if error is None and rows:
        return rows, []

    print(f"  ⚠ 기간조회 실패/빈 결과 → {start_yymm}~{end_yymm} 월별 fallback")

    recovered = []
    failures = []

    for yymm in month_range(start_yymm, end_yymm):
        month_rows, month_error = request_range(hs_code, yymm, yymm)

        if month_error is not None:
            failures.append({
                "시작월": yymm,
                "종료월": yymm,
                "오류": month_error
            })
            continue

        recovered.extend(month_rows or [])

    return recovered, failures


def load_existing_detail_rows(hs_code):
    filename = f"export_{hs_code}.csv"
    if not os.path.exists(filename):
        return []

    with open(filename, "r", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def load_existing_summary_months(hs_code):
    filename = f"summary_{hs_code}.csv"
    if not os.path.exists(filename):
        return set()

    with open(filename, "r", encoding="utf-8-sig") as f:
        return {
            row["월"].strip()
            for row in csv.DictReader(f)
            if row.get("월", "").strip()
        }


def save_detail_csv(hs_code, rows):
    rows.sort(key=lambda r: (r["월"], r["세부_HS코드"]))

    with open(
        f"export_{hs_code}.csv",
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:
        writer = csv.DictWriter(f, fieldnames=DETAIL_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def make_summary(hs_code, item_name, detail_rows):
    monthly = {}

    for row in detail_rows:
        month = row["월"]
        monthly.setdefault(month, {"export_usd": 0, "export_kg": 0})
        monthly[month]["export_usd"] += to_int(row["수출금액_USD"])
        monthly[month]["export_kg"] += to_int(row["수출중량_KG"])

    summary_rows = []
    sorted_months = sorted(monthly)

    for index, month in enumerate(sorted_months):
        export_usd = monthly[month]["export_usd"]
        export_kg = monthly[month]["export_kg"]
        unit_price = export_usd / export_kg if export_kg else 0

        year = int(month[:4])
        mon = int(month[5:7])
        prev_year = f"{year - 1}.{mon:02d}"
        prev_year_value = monthly.get(prev_year, {}).get("export_usd")

        yoy = ""
        if prev_year_value not in (None, 0):
            yoy = round((export_usd / prev_year_value - 1) * 100, 2)

        mom = ""
        if index > 0:
            prev_value = monthly[sorted_months[index - 1]]["export_usd"]
            if prev_value:
                mom = round((export_usd / prev_value - 1) * 100, 2)

        summary_rows.append({
            "월": month,
            "품목명": item_name,
            "HS코드": hs_code,
            "수출금액_USD": export_usd,
            "수출중량_KG": export_kg,
            "수출단가_USD_per_KG": round(unit_price, 4),
            "YoY_pct": yoy,
            "MoM_pct": mom
        })

    return summary_rows


def save_summary_csv(hs_code, rows):
    with open(
        f"summary_{hs_code}.csv",
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:
        writer = csv.DictWriter(f, fieldnames=SUMMARY_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


# HSK 2022 개편으로 신설된 코드는 2020~2021년 조회가 비어 있으므로,
# index.html HISTORICAL_CONTINUITY와 같은 선행 코드로 해당 기간만 채운다.
# 세부_HS코드에는 선행 코드를 그대로 남겨 연결분임을 추적할 수 있게 한다.
LEGACY_BRIDGE = {
    "8541430000": ["8541409021", "8541409022"],
    "2841909020": ["2841909000"],
    # 300249(독소·미생물 배양체·바이러스·기타) = 2021년 3002.90의 독소(3010·3020·3090)·미생물 배양체(4000)·바이러스(5000)·기타(9000)
    "300249": ["3002903010", "3002903020", "3002903090", "3002904000", "3002905000", "3002909000"],
    "3002491000": ["3002903010", "3002903020", "3002903090"],
    # 2022 개편 전 8486.20 부분품(902010·902020)이 2022년 902030·902040·902090으로 나뉨.
    # 개별 연결이 불가해 2022년 연간 수출 비중(902040 45.9%, 902090 50.4%)으로 배분한 추정치.
    "8486902040": {"codes": ["8486902010", "8486902020"], "share": 0.4587},
    "8486902090": {"codes": ["8486902010", "8486902020"], "share": 0.5040},
    # 2022년 8542.90 '부분품' 단일 코드 = 2021년 8542.90 하위 코드 전체(모노리식 IC 부분품 등) 합계.
    "8542900000": ["854290"],
}
LEGACY_END = "202112"


def fill_legacy(hs_code, item_name, working_rows, failed_rows):
    legacy = LEGACY_BRIDGE.get(hs_code)
    if not legacy:
        return working_rows
    share = 1.0
    if isinstance(legacy, dict):
        share, legacy = legacy["share"], legacy["codes"]
    have = {row["월"] for row in working_rows}
    missing = [m for m in ALL_MONTHS if m <= LEGACY_END and yymm_to_label(m) not in have]
    if not missing:
        return working_rows
    print(f"HSK 2022 이전 선행코드 연결: {legacy} / {len(missing)}개월")
    chunks = [(a, b) for g in group_contiguous_months(missing)
              for a, b in [(max(g[0], f"{y}01"), min(g[1], f"{y}12")) for y in range(int(g[0][:4]), int(g[1][:4]) + 1)]
              if a <= b]
    for start_yymm, end_yymm in chunks:
        for code in legacy:
            rows, failures = request_range_with_monthly_fallback(code, start_yymm, end_yymm)
            for row in rows:
                working_rows.append({
                    "월": row["월"],
                    "대표품목": item_name,
                    "조회_HS코드": hs_code,
                    "세부_HS코드": row["세부_HS코드"] or code,
                    "세부품목명": ("[HSK2017 선행코드" + (f" · 2022년 비중 {share:.1%} 배분 추정" if share != 1.0 else "") + "] ") + row["세부품목명"],
                    "수출금액_USD": round(to_int(row["수출금액_USD"]) * share),
                    "수출중량_KG": round(to_int(row["수출중량_KG"]) * share),
                    "수입금액_USD": row["수입금액_USD"],
                    "수입중량_KG": row["수입중량_KG"]
                })
            for failure in failures:
                failed_rows.append({"품목명": item_name, "HS코드": code, **failure})
    return working_rows


def update_one_item(hs_code, item_name):
    print("\n" + "=" * 75)
    print(f"{item_name} / HS {hs_code}")
    print("=" * 75)

    existing_rows = load_existing_detail_rows(hs_code)
    existing_months = load_existing_summary_months(hs_code)

    if not existing_rows:
        print("신규 품목 → 2020년부터 연도 단위 조회")
        ranges = make_year_chunks(
            FULL_START_YEAR,
            FULL_START_MONTH,
            END_YEAR,
            END_MONTH
        )
    else:
        missing = [
            yymm
            for yymm in ALL_MONTHS
            if yymm_to_label(yymm) not in existing_months
            and not (hs_code in LEGACY_BRIDGE and yymm <= LEGACY_END)
        ]
        target_months = sorted(set(RECENT_MONTHS + missing))
        ranges = group_contiguous_months(target_months)

        print("기존 품목 → 최근 3개월 + 과거 누락월만 조회")
        print("조회 구간:", ranges)

    working_rows = existing_rows.copy()
    failed_rows = []

    for start_yymm, end_yymm in ranges:
        result_rows, failures = request_range_with_monthly_fallback(
            hs_code,
            start_yymm,
            end_yymm
        )

        received_months = {row["월"] for row in result_rows}

        if received_months:
            working_rows = [
                row
                for row in working_rows
                if row["월"] not in received_months
            ]

            for row in result_rows:
                working_rows.append({
                    "월": row["월"],
                    "대표품목": item_name,
                    "조회_HS코드": hs_code,
                    "세부_HS코드": row["세부_HS코드"],
                    "세부품목명": row["세부품목명"],
                    "수출금액_USD": row["수출금액_USD"],
                    "수출중량_KG": row["수출중량_KG"],
                    "수입금액_USD": row["수입금액_USD"],
                    "수입중량_KG": row["수입중량_KG"]
                })

            save_detail_csv(hs_code, working_rows)

        for failure in failures:
            failed_rows.append({
                "품목명": item_name,
                "HS코드": hs_code,
                **failure
            })

    working_rows = fill_legacy(hs_code, item_name, working_rows, failed_rows)
    save_detail_csv(hs_code, working_rows)
    summary_rows = make_summary(hs_code, item_name, working_rows)
    save_summary_csv(hs_code, summary_rows)

    print(f"export_{hs_code}.csv 저장 완료")
    print(f"summary_{hs_code}.csv 저장 완료")

    return summary_rows, failed_rows


print("=" * 75)
print("관세청 품목별 수출입 데이터 업데이트")
print("=" * 75)
print(f"전체기간: {FULL_START_YEAR}.{FULL_START_MONTH:02d} ~ {END_YEAR}.{END_MONTH:02d}")
print(f"등록품목: {len(HS_ITEMS)}개")

all_summary_rows = []
all_failed_rows = []

# 실행 시간 예산(분): 넘으면 남은 품목은 조회하지 않고 기존 summary 파일 값을 그대로 씀(다음 실행에서 이어서 수집)
BUDGET = float(os.environ.get("TIME_BUDGET_MIN") or 0) * 60
T0 = time.time()
skipped = 0

for idx, item in enumerate(HS_ITEMS, start=1):
    print(f"\n######## 품목 {idx}/{len(HS_ITEMS)} ########")

    if BUDGET and time.time() - T0 > BUDGET:
        skipped += 1
        fn = f"summary_{item['hs_code']}.csv"
        if os.path.exists(fn):
            with open(fn, "r", encoding="utf-8-sig") as f:
                all_summary_rows.extend(csv.DictReader(f))
        continue

    summary_rows, failed_rows = update_one_item(
        item["hs_code"],
        item["name"]
    )

    all_summary_rows.extend(summary_rows)
    all_failed_rows.extend(failed_rows)

all_summary_rows.sort(key=lambda r: (r["월"], r["품목명"]))

with open(
    "summary_all.csv",
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:
    writer = csv.DictWriter(f, fieldnames=SUMMARY_FIELDS)
    writer.writeheader()
    writer.writerows(all_summary_rows)

if all_summary_rows:
    latest_month = max(row["월"] for row in all_summary_rows)
    latest_rows = [
        row for row in all_summary_rows
        if row["월"] == latest_month
    ]
    latest_rows.sort(key=lambda r: -to_int(r["수출금액_USD"]))

    with open(
        "latest.csv",
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:
        writer = csv.DictWriter(f, fieldnames=SUMMARY_FIELDS)
        writer.writeheader()
        writer.writerows(latest_rows)

with open(
    "export_failed.csv",
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:
    writer = csv.DictWriter(f, fieldnames=FAILED_FIELDS)
    writer.writeheader()
    writer.writerows(all_failed_rows)

with open("export_progress.txt", "w") as f:
    f.write("incomplete" if skipped else "complete")
print(f"시간 예산으로 건너뛴 품목: {skipped}개")

print("\n" + "=" * 75)
if all_failed_rows:
    print(f"⚠ 실패 구간 {len(all_failed_rows)}건 → export_failed.csv 확인")
else:
    print("✅ 모든 일반 수출데이터 조회 성공")
print("=" * 75)
