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

API_URL = "http://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"

FULL_START_YEAR = 2020
FULL_START_MONTH = 1
UPDATE_MONTHS = 3
REQUEST_INTERVAL_SECONDS = 1.0

COUNTRIES = {
    "US": "미국",
    "CN": "중국",
    "JP": "일본",
    "VN": "베트남",
    "HK": "홍콩",
    "FR": "프랑스",
    "PL": "폴란드",
    "GB": "영국"
}

FIELDNAMES = [
    "월", "품목명", "HS코드", "국가코드", "국가명",
    "수출금액_USD", "수출중량_KG"
]

FAILED_FIELDS = [
    "품목명", "HS코드", "국가코드", "국가명",
    "시작월", "종료월", "오류"
]

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


def load_total_export(hs_code):
    totals = {}
    filename = f"summary_{hs_code}.csv"

    if not os.path.exists(filename):
        return totals

    with open(filename, "r", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        for row in reader:
            totals[row["월"]] = {
                "export_usd": to_int(row["수출금액_USD"]),
                "export_kg": to_int(row["수출중량_KG"])
            }

    return totals


def load_existing_country_rows(hs_code):
    filename = f"country_{hs_code}.csv"

    if not os.path.exists(filename):
        return []

    with open(filename, "r", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def save_country_csv(hs_code, rows):
    order = {
        code: idx
        for idx, code in enumerate(list(COUNTRIES.keys()) + ["OTHER"])
    }

    rows.sort(
        key=lambda r: (
            r["월"],
            order.get(r["국가코드"], 999)
        )
    )

    with open(
        f"country_{hs_code}.csv",
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(rows)


def request_country_range(hs_code, country_code, start_yymm, end_yymm):
    params = {
        "serviceKey": API_KEY,
        "strtYymm": start_yymm,
        "endYymm": end_yymm,
        "hsSgn": hs_code,
        "cntyCd": country_code
    }

    for attempt in range(1, 4):
        try:
            print(
                f"    {country_code} {start_yymm}~{end_yymm}"
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
                print(f"      HTTP 429 → {wait}초 대기")
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

            monthly = {}

            for item in root.findall(".//item"):
                year = (item.findtext("year") or "").strip()

                if not year or year == "총계":
                    continue

                if len(year) != 7 or "." not in year:
                    continue

                monthly.setdefault(
                    year,
                    {"export_usd": 0, "export_kg": 0}
                )

                monthly[year]["export_usd"] += to_int(
                    item.findtext("expDlr")
                )
                monthly[year]["export_kg"] += to_int(
                    item.findtext("expWgt")
                )

            time.sleep(REQUEST_INTERVAL_SECONDS)
            print(f"      → {len(monthly)}개월 수신")
            return monthly, None

        except requests.exceptions.Timeout:
            if attempt == 3:
                return None, "Timeout 최종 실패"
            time.sleep(10 * attempt)

        except requests.exceptions.RequestException as e:
            if attempt == 3:
                return None, str(e)
            time.sleep(10 * attempt)

    return None, "알 수 없는 오류"


def existing_complete_months(existing_rows):
    required = set(COUNTRIES.keys()) | {"OTHER"}
    month_map = {}

    for row in existing_rows:
        month_map.setdefault(row["월"], set()).add(row["국가코드"])

    return {
        month
        for month, codes in month_map.items()
        if required.issubset(codes)
    }


def build_ranges(existing_rows):
    if not existing_rows:
        return make_year_chunks(
            FULL_START_YEAR,
            FULL_START_MONTH,
            END_YEAR,
            END_MONTH
        )

    complete = existing_complete_months(existing_rows)
    missing = [
        yymm
        for yymm in ALL_MONTHS
        if yymm_to_label(yymm) not in complete
    ]

    target_months = sorted(set(RECENT_MONTHS + missing))
    return group_contiguous_months(target_months)


def update_one_item(hs_code, item_name):
    print("\n" + "=" * 75)
    print(f"{item_name} / HS {hs_code}")
    print("=" * 75)

    totals = load_total_export(hs_code)

    if not totals:
        print("⚠ summary 파일이 없어 건너뜁니다.")
        return [], [{
            "품목명": item_name,
            "HS코드": hs_code,
            "국가코드": "-",
            "국가명": "-",
            "시작월": "-",
            "종료월": "-",
            "오류": "summary 없음"
        }]

    existing_rows = load_existing_country_rows(hs_code)
    ranges = build_ranges(existing_rows)

    if not existing_rows:
        print("신규 품목 → 2020년부터 기간 단위 조회")
    else:
        print("기존 품목 → 최근 3개월 + 누락구간 조회")

    print("조회 구간:", ranges)

    working_rows = existing_rows.copy()
    failed_rows = []

    for start_yymm, end_yymm in ranges:
        print(f"\n구간 {start_yymm}~{end_yymm}")

        country_results = {}
        range_failed = False

        for country_code, country_name in COUNTRIES.items():
            monthly, error = request_country_range(
                hs_code,
                country_code,
                start_yymm,
                end_yymm
            )

            if error is not None:
                range_failed = True
                failed_rows.append({
                    "품목명": item_name,
                    "HS코드": hs_code,
                    "국가코드": country_code,
                    "국가명": country_name,
                    "시작월": start_yymm,
                    "종료월": end_yymm,
                    "오류": error
                })
                print(f"      실패: {country_name}")
                continue

            country_results[country_code] = monthly

        if range_failed:
            print("  ⚠ 일부 국가 실패 → 이 구간은 갱신 보류")
            continue

        requested_months = month_range(start_yymm, end_yymm)

        for yymm in requested_months:
            month_label = yymm_to_label(yymm)
            total = totals.get(month_label)

            if total is None:
                continue

            month_rows = []
            major_usd = 0
            major_kg = 0

            for country_code, country_name in COUNTRIES.items():
                data = country_results[country_code].get(
                    month_label,
                    {"export_usd": 0, "export_kg": 0}
                )

                export_usd = data["export_usd"]
                export_kg = data["export_kg"]

                major_usd += export_usd
                major_kg += export_kg

                month_rows.append({
                    "월": month_label,
                    "품목명": item_name,
                    "HS코드": hs_code,
                    "국가코드": country_code,
                    "국가명": country_name,
                    "수출금액_USD": export_usd,
                    "수출중량_KG": export_kg
                })

            other_usd = total["export_usd"] - major_usd
            other_kg = total["export_kg"] - major_kg

            if other_usd < 0:
                failed_rows.append({
                    "품목명": item_name,
                    "HS코드": hs_code,
                    "국가코드": "OTHER",
                    "국가명": "기타",
                    "시작월": yymm,
                    "종료월": yymm,
                    "오류": "주요국 합계가 전체수출보다 큼"
                })
                continue

            month_rows.append({
                "월": month_label,
                "품목명": item_name,
                "HS코드": hs_code,
                "국가코드": "OTHER",
                "국가명": "기타",
                "수출금액_USD": other_usd,
                "수출중량_KG": other_kg
            })

            working_rows = [
                row
                for row in working_rows
                if row["월"] != month_label
            ]

            working_rows.extend(month_rows)

        save_country_csv(hs_code, working_rows)
        print("  ✓ 구간 저장 완료")

    save_country_csv(hs_code, working_rows)
    return working_rows, failed_rows


def create_country_all():
    all_rows = []

    for item in HS_ITEMS:
        filename = f"country_{item['hs_code']}.csv"

        if not os.path.exists(filename):
            continue

        with open(filename, "r", encoding="utf-8-sig") as f:
            all_rows.extend(csv.DictReader(f))

    all_rows.sort(
        key=lambda r: (
            r["월"],
            r["품목명"],
            r["국가코드"]
        )
    )

    with open(
        "country_all.csv",
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(all_rows)

    return all_rows


def create_country_latest(all_rows):
    if not all_rows:
        return

    latest_month = max(row["월"] for row in all_rows)
    latest_rows = [
        row for row in all_rows
        if row["월"] == latest_month
    ]

    latest_rows.sort(
        key=lambda r: (
            r["품목명"],
            -to_int(r["수출금액_USD"])
        )
    )

    with open(
        "country_latest.csv",
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES)
        writer.writeheader()
        writer.writerows(latest_rows)


print("=" * 75)
print("국가별 수출데이터 기간조회 방식 업데이트")
print("=" * 75)
print(f"조회기간: {FULL_START_YEAR}.{FULL_START_MONTH:02d} ~ {END_YEAR}.{END_MONTH:02d}")
print(f"등록품목: {len(HS_ITEMS)}개")

all_failed_rows = []

for idx, item in enumerate(HS_ITEMS, start=1):
    print(f"\n######## 품목 {idx}/{len(HS_ITEMS)} ########")

    _, failed_rows = update_one_item(
        item["hs_code"],
        item["name"]
    )

    all_failed_rows.extend(failed_rows)

all_rows = create_country_all()
create_country_latest(all_rows)

with open(
    "country_failed.csv",
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:
    writer = csv.DictWriter(f, fieldnames=FAILED_FIELDS)
    writer.writeheader()
    writer.writerows(all_failed_rows)

print("\n" + "=" * 75)
if all_failed_rows:
    print(f"⚠ 실패 구간 {len(all_failed_rows)}건 → country_failed.csv 확인")
else:
    print("✅ 모든 국가별 데이터 조회 성공")
print("=" * 75)
