import os
import csv
import requests
import xml.etree.ElementTree as ET

from datetime import datetime
from collections import defaultdict


# =========================================================
# 1. 기본 설정
# =========================================================

API_KEY = os.environ.get("CUSTOMS_API_KEY")

if not API_KEY:
    print("실패: CUSTOMS_API_KEY를 찾을 수 없습니다.")
    raise SystemExit(1)


API_URL = (
    "http://apis.data.go.kr/"
    "1220000/Itemtrade/getItemtradeList"
)


# ---------------------------------------------------------
# 조회 시작일
# ---------------------------------------------------------

START_YEAR = 2020
START_MONTH = 1


# ---------------------------------------------------------
# 조회 종료일 자동 계산
#
# 현재 월의 바로 전월까지 조회
#
# 예:
# 2026년 9월 실행
# → 2026년 8월까지
# ---------------------------------------------------------

today = datetime.now()

if today.month == 1:
    END_YEAR = today.year - 1
    END_MONTH = 12

else:
    END_YEAR = today.year
    END_MONTH = today.month - 1


print("=" * 70)

print(
    f"자동 조회기간: "
    f"{START_YEAR}-{START_MONTH:02d}"
    f" ~ "
    f"{END_YEAR}-{END_MONTH:02d}"
)

print("=" * 70)


# =========================================================
# 2. 조회할 월 목록 만들기
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

            hs_code = row["hs_code"].strip()
            name = row["name"].strip()

            if not hs_code:
                continue

            items.append({
                "hs_code": hs_code,
                "name": name
            })

    return items


HS_ITEMS = read_hs_codes()


print("등록된 품목 수:", len(HS_ITEMS))

for item in HS_ITEMS:

    print(
        "-",
        item["name"],
        item["hs_code"]
    )


# =========================================================
# 4. 관세청 데이터 수집
# =========================================================

def collect_data(hs_code):

    rows = []

    print()
    print("=" * 70)
    print("수집 시작:", hs_code)
    print("=" * 70)

    for yymm in MONTHS:

        print("조회 중:", yymm, end=" ")

        params = {

            "serviceKey":
                API_KEY,

            "strtYymm":
                yymm,

            "endYymm":
                yymm,

            "hsSgn":
                hs_code
        }

        try:

            response = requests.get(
                API_URL,
                params=params,
                timeout=30
            )

            if response.status_code != 200:

                print(
                    "HTTP 오류:",
                    response.status_code
                )

                continue


            root = ET.fromstring(
                response.text
            )

            items = root.findall(
                ".//item"
            )


            saved_count = 0


            for item in items:

                year = item.findtext(
                    "year"
                )


                # 총계 행 제외
                if year == "총계":
                    continue


                detail_hs_code = (
                    item.findtext(
                        "hsCode"
                    ) or ""
                )


                stat_kor = (
                    item.findtext(
                        "statKor"
                    ) or ""
                )


                exp_dlr = (
                    item.findtext(
                        "expDlr"
                    ) or "0"
                )


                exp_wgt = (
                    item.findtext(
                        "expWgt"
                    ) or "0"
                )


                imp_dlr = (
                    item.findtext(
                        "impDlr"
                    ) or "0"
                )


                imp_wgt = (
                    item.findtext(
                        "impWgt"
                    ) or "0"
                )


                rows.append({

                    "month":
                        year,

                    "detail_hs_code":
                        detail_hs_code,

                    "detail_name":
                        stat_kor,

                    "export_usd":
                        int(exp_dlr),

                    "export_kg":
                        int(exp_wgt),

                    "import_usd":
                        int(imp_dlr),

                    "import_kg":
                        int(imp_wgt)
                })


                saved_count += 1


            print(
                "→",
                saved_count,
                "개 저장"
            )


        except Exception as e:

            print(
                "오류:",
                str(e)
            )


    return rows


# =========================================================
# 5. 원본 CSV 저장
# =========================================================

def save_raw_csv(
    hs_code,
    name,
    rows
):

    filename = (
        f"export_{hs_code}.csv"
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

                row["month"],

                name,

                hs_code,

                row[
                    "detail_hs_code"
                ],

                row[
                    "detail_name"
                ],

                row[
                    "export_usd"
                ],

                row[
                    "export_kg"
                ],

                row[
                    "import_usd"
                ],

                row[
                    "import_kg"
                ]
            ])


    print(
        filename,
        "저장 완료"
    )


# =========================================================
# 6. 품목별 월간 요약 만들기
# =========================================================

def make_summary(
    hs_code,
    name,
    rows
):

    monthly = defaultdict(
        lambda: {
            "export_usd": 0,
            "export_kg": 0
        }
    )


    for row in rows:

        month = row["month"]

        monthly[
            month
        ][
            "export_usd"
        ] += row[
            "export_usd"
        ]


        monthly[
            month
        ][
            "export_kg"
        ] += row[
            "export_kg"
        ]


    months_sorted = sorted(
        monthly.keys()
    )


    summary = []


    for index, month in enumerate(
        months_sorted
    ):

        export_usd = (
            monthly[
                month
            ][
                "export_usd"
            ]
        )


        export_kg = (
            monthly[
                month
            ][
                "export_kg"
            ]
        )


        # ---------------------------------
        # 수출단가
        # ---------------------------------

        if export_kg > 0:

            unit_price = (
                export_usd
                /
                export_kg
            )

        else:

            unit_price = 0


        # ---------------------------------
        # MoM
        # ---------------------------------

        mom = None


        if index > 0:

            previous_month = (
                months_sorted[
                    index - 1
                ]
            )


            previous_export = (
                monthly[
                    previous_month
                ][
                    "export_usd"
                ]
            )


            if previous_export > 0:

                mom = (
                    (
                        export_usd
                        /
                        previous_export
                    )
                    - 1
                ) * 100


        # ---------------------------------
        # YoY
        # ---------------------------------

        yoy = None


        year_number = int(
            month[:4]
        )


        month_number = (
            month[-2:]
        )


        previous_year_month = (
            f"{year_number - 1}"
            f"."
            f"{month_number}"
        )


        if (
            previous_year_month
            in monthly
        ):

            previous_year_export = (
                monthly[
                    previous_year_month
                ][
                    "export_usd"
                ]
            )


            if previous_year_export > 0:

                yoy = (
                    (
                        export_usd
                        /
                        previous_year_export
                    )
                    - 1
                ) * 100


        summary.append({

            "월":
                month,

            "품목명":
                name,

            "HS코드":
                hs_code,

            "수출금액_USD":
                export_usd,

            "수출중량_KG":
                export_kg,

            "수출단가_USD_per_KG":
                round(
                    unit_price,
                    2
                ),

            "YoY_pct":
                (
                    ""
                    if yoy is None
                    else round(
                        yoy,
                        2
                    )
                ),

            "MoM_pct":
                (
                    ""
                    if mom is None
                    else round(
                        mom,
                        2
                    )
                )
        })


    return summary


# =========================================================
# 7. 품목별 summary CSV 저장
# =========================================================

def save_summary_csv(
    hs_code,
    summary_rows
):

    filename = (
        f"summary_{hs_code}.csv"
    )


    headers = [

        "월",

        "품목명",

        "HS코드",

        "수출금액_USD",

        "수출중량_KG",

        "수출단가_USD_per_KG",

        "YoY_pct",

        "MoM_pct"
    ]


    with open(
        filename,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=headers
        )

        writer.writeheader()

        writer.writerows(
            summary_rows
        )


    print(
        filename,
        "저장 완료"
    )


# =========================================================
# 8. 실제 전체 품목 실행
# =========================================================

ALL_SUMMARY_ROWS = []


for item in HS_ITEMS:

    hs_code = (
        item["hs_code"]
    )

    name = (
        item["name"]
    )


    raw_rows = collect_data(
        hs_code
    )


    save_raw_csv(
        hs_code,
        name,
        raw_rows
    )


    summary_rows = make_summary(
        hs_code,
        name,
        raw_rows
    )


    save_summary_csv(
        hs_code,
        summary_rows
    )


    ALL_SUMMARY_ROWS.extend(
        summary_rows
    )


# =========================================================
# 9. 모든 품목을 summary_all.csv로 합치기
# =========================================================

ALL_SUMMARY_ROWS.sort(

    key=lambda row: (

        row["월"],

        row["품목명"]
    )
)


SUMMARY_HEADERS = [

    "월",

    "품목명",

    "HS코드",

    "수출금액_USD",

    "수출중량_KG",

    "수출단가_USD_per_KG",

    "YoY_pct",

    "MoM_pct"
]


with open(
    "summary_all.csv",
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:

    writer = csv.DictWriter(
        f,
        fieldnames=SUMMARY_HEADERS
    )

    writer.writeheader()

    writer.writerows(
        ALL_SUMMARY_ROWS
    )


print()
print(
    "summary_all.csv 저장 완료"
)


# =========================================================
# 10. 최신월만 latest.csv로 저장
# =========================================================

if ALL_SUMMARY_ROWS:

    latest_month = max(

        row["월"]

        for row
        in ALL_SUMMARY_ROWS
    )


    latest_rows = [

        row

        for row
        in ALL_SUMMARY_ROWS

        if (
            row["월"]
            ==
            latest_month
        )
    ]


    # 수출금액 큰 순서
    latest_rows.sort(

        key=lambda row:

            row[
                "수출금액_USD"
            ],

        reverse=True
    )


    with open(
        "latest.csv",
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=SUMMARY_HEADERS
        )

        writer.writeheader()

        writer.writerows(
            latest_rows
        )


    print(
        "latest.csv 저장 완료"
    )

    print(
        "최신월:",
        latest_month
    )


else:

    print(
        "경고: 수집된 데이터가 없습니다."
    )


# =========================================================
# 11. 완료
# =========================================================

print()
print("=" * 70)
print("모든 작업 완료")
print("=" * 70)
