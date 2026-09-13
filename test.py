import os
import requests
import xml.etree.ElementTree as ET
import csv
from collections import defaultdict


api_key = os.environ.get("CUSTOMS_API_KEY")

if not api_key:
    print("실패: API 인증키를 찾지 못했습니다.")
    exit()


API_URL = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"

START_YEAR = 2025
START_MONTH = 1

END_YEAR = 2026
END_MONTH = 8


def make_month_list(start_year, start_month, end_year, end_month):

    months = []

    year = start_year
    month = start_month

    while True:

        months.append(f"{year}{month:02d}")

        if year == end_year and month == end_month:
            break

        month += 1

        if month == 13:
            month = 1
            year += 1

    return months


def read_hs_codes():

    items = []

    with open("hs_codes.csv", "r", encoding="utf-8-sig") as f:

        reader = csv.DictReader(f)

        for row in reader:

            items.append({
                "hs_code": row["hs_code"].strip(),
                "name": row["name"].strip()
            })

    return items


def collect_data(hs_code):

    months = make_month_list(
        START_YEAR,
        START_MONTH,
        END_YEAR,
        END_MONTH
    )

    rows = []

    print()
    print("=" * 70)
    print("수집 시작:", hs_code)
    print("=" * 70)

    for yymm in months:

        print("조회 중:", yymm)

        params = {
            "serviceKey": api_key,
            "strtYymm": yymm,
            "endYymm": yymm,
            "hsSgn": hs_code
        }

        try:

            response = requests.get(
                API_URL,
                params=params,
                timeout=30
            )

            if response.status_code != 200:
                print("HTTP 오류:", response.status_code)
                continue

            root = ET.fromstring(response.text)

            items = root.findall(".//item")

            count = 0

            for item in items:

                year = item.findtext("year")

                if year == "총계":
                    continue

                rows.append([
                    year,
                    item.findtext("hsCode"),
                    item.findtext("statKor"),
                    item.findtext("expDlr"),
                    item.findtext("expWgt"),
                    item.findtext("impDlr"),
                    item.findtext("impWgt")
                ])

                count += 1

            print("저장:", count, "개")

        except Exception as e:

            print("오류:", e)

    return rows


def save_raw_csv(hs_code, name, rows):

    filename = f"export_{hs_code}.csv"

    with open(
        filename,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:

        writer = csv.writer(f)

        writer.writerow([
            "월",
            "대표품목",
            "조회_HS코드",
            "세부_HS코드",
            "세부품목명",
            "수출금액_USD",
            "수출중량_KG",
            "수입금액_USD",
            "수입중량_KG"
        ])

        for row in rows:

            writer.writerow([
                row[0],
                name,
                hs_code,
                row[1],
                row[2],
                row[3],
                row[4],
                row[5],
                row[6]
            ])

    print(filename, "저장 완료")


def save_summary_csv(hs_code, name, rows):

    monthly = defaultdict(lambda: {
        "exp_dlr": 0,
        "exp_wgt": 0
    })

    for row in rows:

        month = row[0]

        exp_dlr = int(row[3]) if row[3] else 0
        exp_wgt = int(row[4]) if row[4] else 0

        monthly[month]["exp_dlr"] += exp_dlr
        monthly[month]["exp_wgt"] += exp_wgt

    months_sorted = sorted(monthly.keys())

    summary_rows = []

    for i, month in enumerate(months_sorted):

        exp_dlr = monthly[month]["exp_dlr"]
        exp_wgt = monthly[month]["exp_wgt"]

        # 수출단가
        if exp_wgt > 0:
            unit_price = exp_dlr / exp_wgt
        else:
            unit_price = 0

        # MoM
        mom = None

        if i > 0:

            prev_month = months_sorted[i - 1]

            prev_exp = monthly[prev_month]["exp_dlr"]

            if prev_exp > 0:
                mom = ((exp_dlr / prev_exp) - 1) * 100

        # YoY
        yoy = None

        year_num = int(month[:4])
        month_num = month[-2:]

        prev_year_month = f"{year_num - 1}.{month_num}"

        if prev_year_month in monthly:

            prev_year_exp = monthly[prev_year_month]["exp_dlr"]

            if prev_year_exp > 0:
                yoy = ((exp_dlr / prev_year_exp) - 1) * 100

        summary_rows.append([
            month,
            name,
            hs_code,
            exp_dlr,
            exp_wgt,
            unit_price,
            yoy,
            mom
        ])

    filename = f"summary_{hs_code}.csv"

    with open(
        filename,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:

        writer = csv.writer(f)

        writer.writerow([
            "월",
            "품목명",
            "HS코드",
            "수출금액_USD",
            "수출중량_KG",
            "수출단가_USD_per_KG",
            "YoY_pct",
            "MoM_pct"
        ])

        for row in summary_rows:

            writer.writerow([
                row[0],
                row[1],
                row[2],
                row[3],
                row[4],
                round(row[5], 2),
                "" if row[6] is None else round(row[6], 2),
                "" if row[7] is None else round(row[7], 2)
            ])

    print(filename, "저장 완료")


# ------------------------------------
# 프로그램 시작
# ------------------------------------

hs_items = read_hs_codes()

print("등록된 품목 수:", len(hs_items))

for item in hs_items:

    hs_code = item["hs_code"]
    name = item["name"]

    rows = collect_data(hs_code)

    save_raw_csv(
        hs_code,
        name,
        rows
    )

    save_summary_csv(
        hs_code,
        name,
        rows
    )

print()
print("모든 품목 수집 완료")
