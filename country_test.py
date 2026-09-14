import os
import csv
import time
import requests
import xml.etree.ElementTree as ET

from datetime import datetime


# =========================================================
# 1. 기본 설정
# =========================================================

API_KEY = os.environ.get("CUSTOMS_API_KEY")

if not API_KEY:
    print("API 인증키를 찾지 못했습니다.")
    raise SystemExit(1)


API_URL = (
    "http://apis.data.go.kr/"
    "1220000/nitemtrade/getNitemtradeList"
)


START_YEAR = 2025
START_MONTH = 1


today = datetime.now()

if today.month == 1:
    END_YEAR = today.year - 1
    END_MONTH = 12
else:
    END_YEAR = today.year
    END_MONTH = today.month - 1


# =========================================================
# 주요 국가
# =========================================================

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


# =========================================================
# 2. 조회월 만들기
# =========================================================

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


# =========================================================
# 3. hs_codes.csv 읽기
# =========================================================

def read_hs_codes():

    items = []

    with open(
        "hs_codes.csv",
        "r",
        encoding="utf-8-sig"
    ) as f:

        reader = csv.DictReader(f)

        for row in reader:

            hs_code = (
                row["hs_code"]
                .strip()
            )

            name = (
                row["name"]
                .strip()
            )

            if not hs_code:
                continue

            items.append({
                "hs_code": hs_code,
                "name": name
            })

    return items


HS_ITEMS = read_hs_codes()


# =========================================================
# 4. 품목별 전체 수출액 읽기
# =========================================================

def load_total_export(hs_code):

    totals = {}

    filename = (
        f"summary_{hs_code}.csv"
    )

    try:

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

    except FileNotFoundError:

        print(
            "오류:",
            filename,
            "파일이 없습니다."
        )

    return totals


# =========================================================
# 5. 국가별 API 조회
# =========================================================

def fetch_country_data(
    hs_code,
    yymm,
    country_code
):

    params = {
        "serviceKey": API_KEY,
        "strtYymm": yymm,
        "endYymm": yymm,
        "hsSgn": hs_code,
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


        except requests.exceptions.RequestException as e:

            print(
                "API 오류:",
                e
            )

            return 0, 0


    if response is None:

        return 0, 0


    if response.status_code != 200:

        return 0, 0


    try:

        root = ET.fromstring(
            response.content
        )

    except Exception:

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


# =========================================================
# 6. 품목 하나 수집
# =========================================================

def collect_one_item(
    hs_code,
    item_name
):

    print()
    print("=" * 70)

    print(
        item_name,
        hs_code
    )

    print("=" * 70)


    total_export = (
        load_total_export(
            hs_code
        )
    )


    rows = []


    for yymm in MONTHS:

        month_label = (
            yymm[:4]
            +
            "."
            +
            yymm[4:]
        )


        print()
        print(
            "월:",
            month_label
        )


        major_export_usd = 0
        major_export_kg = 0


        for (
            country_code,
            country_name
        ) in COUNTRIES.items():

            print(
                " ",
                country_name,
                end=" "
            )


            export_usd, export_kg = (
                fetch_country_data(
                    hs_code,
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

                item_name,

                hs_code,

                country_code,

                country_name,

                export_usd,

                export_kg
            ])


            print(
                f"{export_usd:,}"
            )


        # =================================================
        # 기타 계산
        # =================================================

        total = total_export.get(
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


        # 혹시 계산 오차로 음수가 생기는 것 방지
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

            item_name,

            hs_code,

            "OTHER",

            "기타",

            other_export_usd,

            other_export_kg
        ])


        print(
            " 기타",
            f"{other_export_usd:,}"
        )


        # =================================================
        # 합계 검증
        # =================================================

        if total:

            check_total = (
                major_export_usd
                +
                other_export_usd
            )


            print(
                " 합계확인:",
                f"{check_total:,}",
                "/",
                f"{total['export_usd']:,}"
            )


    return rows


# =========================================================
# 7. CSV 저장
# =========================================================

def save_country_csv(
    hs_code,
    rows
):

    filename = (
        f"country_{hs_code}.csv"
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
            "품목명",
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


# =========================================================
# 8. 모든 품목 실행
# =========================================================

print(
    f"조회기간: "
    f"{START_YEAR}-{START_MONTH:02d}"
    f" ~ "
    f"{END_YEAR}-{END_MONTH:02d}"
)

print(
    "품목 수:",
    len(HS_ITEMS)
)

print(
    "주요국 수:",
    len(COUNTRIES)
)


for item in HS_ITEMS:

    hs_code = (
        item["hs_code"]
    )

    item_name = (
        item["name"]
    )


    rows = collect_one_item(
        hs_code,
        item_name
    )


    save_country_csv(
        hs_code,
        rows
    )


print()
print("=" * 70)

print(
    "모든 국가별 데이터 수집 완료"
)

print("=" * 70)
