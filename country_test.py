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

HS_CODE = "330499"

START_YEAR = 2025
START_MONTH = 1


today = datetime.now()

if today.month == 1:
    END_YEAR = today.year - 1
    END_MONTH = 12
else:
    END_YEAR = today.year
    END_MONTH = today.month - 1


COUNTRIES = {
    "US": "미국",
    "CN": "중국",
    "JP": "일본",
    "VN": "베트남",
    "HK": "홍콩",
    "FR": "프랑스"
}


def make_month_list(
    start_year,
    start_month,
    end_year,
    end_month
):

    months = []

    year = start_year
    month = start_month

    while True:

        months.append(
            f"{year}{month:02d}"
        )

        if (
            year == end_year
            and month == end_month
        ):
            break

        month += 1

        if month == 13:
            month = 1
            year += 1

    return months


MONTHS = make_month_list(
    START_YEAR,
    START_MONTH,
    END_YEAR,
    END_MONTH
)


# -----------------------------------
# summary_330499.csv에서 전체 수출 읽기
# -----------------------------------

def load_total_export():

    totals = {}

    filename = f"summary_{HS_CODE}.csv"

    with open(
        filename,
        "r",
        encoding="utf-8-sig"
    ) as f:

        reader = csv.DictReader(f)

        for row in reader:

            totals[
                row["월"]
            ] = {

                "export_usd":
                    int(
                        row[
                            "수출금액_USD"
                        ]
                    ),

                "export_kg":
                    int(
                        row[
                            "수출중량_KG"
                        ]
                    )
            }

    return totals


TOTAL_EXPORT = load_total_export()


# -----------------------------------
# 국가별 API 조회
# -----------------------------------

def fetch_country_data(
    yymm,
    country_code
):

    params = {
        "serviceKey": API_KEY,
        "strtYymm": yymm,
        "endYymm": yymm,
        "hsSgn": HS_CODE,
        "cntyCd": country_code
    }


    response = None


    for attempt in range(1, 4):

        try:

            response = requests.get(
                API_URL,
                params=params,
                timeout=(60, 120)
            )

            break


        except requests.exceptions.Timeout:

            print(
                f"timeout {attempt}/3",
                end=" "
            )

            if attempt < 3:
                time.sleep(5)


    if response is None:

        return 0, 0


    if response.status_code != 200:

        return 0, 0


    try:

        root = ET.fromstring(
            response.content
        )

    except:

        return 0, 0


    items = root.findall(
        ".//item"
    )


    export_usd = 0
    export_kg = 0


    for item in items:

        year = item.findtext(
            "year"
        )

        if year == "총계":
            continue


        exp_dlr = (
            item.findtext(
                "expDlr"
            )
            or
            "0"
        )


        exp_wgt = (
            item.findtext(
                "expWgt"
            )
            or
            "0"
        )


        export_usd += int(
            exp_dlr
        )


        export_kg += int(
            exp_wgt
        )


    return (
        export_usd,
        export_kg
    )


# -----------------------------------
# 국가별 수집
# -----------------------------------

rows = []


print(
    f"조회기간: "
    f"{START_YEAR}-{START_MONTH:02d}"
    f" ~ "
    f"{END_YEAR}-{END_MONTH:02d}"
)

print(
    "HS Code:",
    HS_CODE
)


for yymm in MONTHS:

    month_label = (
        yymm[:4]
        +
        "."
        +
        yymm[4:]
    )


    print()
    print("=" * 70)
    print("월:", month_label)
    print("=" * 70)


    major_export_usd = 0
    major_export_kg = 0


    for (
        country_code,
        country_name
    ) in COUNTRIES.items():

        print(
            country_name,
            end=" "
        )


        export_usd, export_kg = (
            fetch_country_data(
                yymm,
                country_code
            )
        )


        major_export_usd += (
            export_usd
        )

        major_export_kg += (
            export_kg
        )


        rows.append([
            month_label,
            HS_CODE,
            country_code,
            country_name,
            export_usd,
            export_kg
        ])


        print(
            f"{export_usd:,}"
        )


    # -----------------------------------
    # 기타 계산
    # -----------------------------------

    total = TOTAL_EXPORT.get(
        month_label
    )


    if total:

        other_export_usd = (
            total[
                "export_usd"
            ]
            -
            major_export_usd
        )

        other_export_kg = (
            total[
                "export_kg"
            ]
            -
            major_export_kg
        )

    else:

        other_export_usd = 0
        other_export_kg = 0


    # 음수 방지
    other_export_usd = max(
        0,
        other_export_usd
    )

    other_export_kg = max(
        0,
        other_export_kg
    )


    rows.append([
        month_label,
        HS_CODE,
        "OTHER",
        "기타",
        other_export_usd,
        other_export_kg
    ])


    print(
        "기타",
        f"{other_export_usd:,}"
    )


    print(
        "전체",
        f"{total['export_usd']:,}"
        if total
        else
        "없음"
    )


# -----------------------------------
# CSV 저장
# -----------------------------------

filename = (
    f"country_{HS_CODE}.csv"
)


with open(
    filename,
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:

    writer = csv.writer(f)

    writer.writerow([
        "월",
        "HS코드",
        "국가코드",
        "국가명",
        "수출금액_USD",
        "수출중량_KG"
    ])

    writer.writerows(
        rows
    )


print()
print(
    filename,
    "저장 완료"
)

print(
    "총 데이터 행:",
    len(rows)
)
