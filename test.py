import os
import requests
import xml.etree.ElementTree as ET
import csv
from datetime import datetime

api_key = os.environ.get("CUSTOMS_API_KEY")

if not api_key:
    print("실패: API 인증키를 찾지 못했습니다.")
    exit()

url = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"

HS_CODE = "330499"

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


months = make_month_list(
    START_YEAR,
    START_MONTH,
    END_YEAR,
    END_MONTH
)

rows = []

print("관세청 데이터 수집 시작")
print("HS Code:", HS_CODE)
print("수집 월 수:", len(months))
print()

for yymm in months:

    print("조회 중:", yymm)

    params = {
        "serviceKey": api_key,
        "strtYymm": yymm,
        "endYymm": yymm,
        "hsSgn": HS_CODE
    }

    try:
        response = requests.get(
            url,
            params=params,
            timeout=30
        )

        if response.status_code != 200:
            print("  실패: HTTP", response.status_code)
            continue

        root = ET.fromstring(response.text)

        items = root.findall(".//item")

        if len(items) == 0:
            print("  데이터 없음")
            continue

        count = 0

        for item in items:

            year = item.findtext("year")
            hs_code = item.findtext("hsCode")
            stat_kor = item.findtext("statKor")
            exp_dlr = item.findtext("expDlr")
            exp_wgt = item.findtext("expWgt")
            imp_dlr = item.findtext("impDlr")
            imp_wgt = item.findtext("impWgt")

            # '총계' 행은 제외
            if year == "총계":
                continue

            rows.append([
                year,
                hs_code,
                stat_kor,
                exp_dlr,
                exp_wgt,
                imp_dlr,
                imp_wgt
            ])

            count += 1

        print("  저장:", count, "개")

    except Exception as e:

        print("  오류:", e)


print()
print("전체 수집 완료")
print("총 데이터 행:", len(rows))


with open(
    "export_330499.csv",
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:

    writer = csv.writer(f)

    writer.writerow([
        "월",
        "HS코드",
        "품목명",
        "수출금액_USD",
        "수출중량_KG",
        "수입금액_USD",
        "수입중량_KG"
    ])

    writer.writerows(rows)


print()
print("export_330499.csv 저장 완료")

# -----------------------------
# 월별 요약 데이터 만들기
# -----------------------------

from collections import defaultdict

monthly = defaultdict(lambda: {
    "exp_dlr": 0,
    "exp_wgt": 0
})

for row in rows:
    year = row[0]
    exp_dlr = int(row[3]) if row[3] else 0
    exp_wgt = int(row[4]) if row[4] else 0

    monthly[year]["exp_dlr"] += exp_dlr
    monthly[year]["exp_wgt"] += exp_wgt


summary_rows = []

months_sorted = sorted(monthly.keys())

for i, month in enumerate(months_sorted):

    exp_dlr = monthly[month]["exp_dlr"]
    exp_wgt = monthly[month]["exp_wgt"]

    # 수출단가
    if exp_wgt > 0:
        unit_price = exp_dlr / exp_wgt
    else:
        unit_price = 0

    # MoM
    if i > 0:
        prev_month = months_sorted[i - 1]
        prev_exp = monthly[prev_month]["exp_dlr"]

        if prev_exp > 0:
            mom = ((exp_dlr / prev_exp) - 1) * 100
        else:
            mom = None
    else:
        mom = None

    # YoY
    year_num = int(month[:4])
    month_num = month[-2:]

    prev_year_month = f"{year_num - 1}.{month_num}"

    if prev_year_month in monthly:
        prev_year_exp = monthly[prev_year_month]["exp_dlr"]

        if prev_year_exp > 0:
            yoy = ((exp_dlr / prev_year_exp) - 1) * 100
        else:
            yoy = None
    else:
        yoy = None

    summary_rows.append([
        month,
        exp_dlr,
        exp_wgt,
        unit_price,
        yoy,
        mom
    ])


with open(
    "summary_330499.csv",
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:

    writer = csv.writer(f)

    writer.writerow([
        "월",
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
            round(row[3], 2),
            "" if row[4] is None else round(row[4], 2),
            "" if row[5] is None else round(row[5], 2)
        ])


print("summary_330499.csv 저장 완료")
