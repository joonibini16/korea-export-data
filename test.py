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
    "1220000/Itemtrade/getItemtradeList"
)


START_YEAR = 2020
START_MONTH = 1


# 월별 기본 재시도 횟수
MAX_RETRIES = 3

# 재시도 전 대기시간
RETRY_WAIT_SECONDS = 10


# =========================================================
# 2. 최신 조회월 계산
# =========================================================

today = datetime.now()

if today.month == 1:
    END_YEAR = today.year - 1
    END_MONTH = 12
else:
    END_YEAR = today.year
    END_MONTH = today.month - 1


# =========================================================
# 3. 월 목록 생성
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
# 4. hs_codes.csv 읽기
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
# 5. 숫자 변환
# =========================================================

def to_int(value):

    if value is None:
        return 0

    value = str(value).strip()

    if value == "":
        return 0

    try:
        return int(float(value))

    except:
        return 0


# =========================================================
# 6. 월별 API 조회
# =========================================================

def fetch_month(
    hs_code,
    yymm,
    retry_count=MAX_RETRIES
):

    params = {
        "serviceKey": API_KEY,
        "strtYymm": yymm,
        "endYymm": yymm,
        "hsSgn": hs_code
    }


    for attempt in range(
        1,
        retry_count + 1
    ):

        try:

            print(
                f"조회 중: {yymm}",
                end=""
            )


            if attempt > 1:

                print(
                    f" / 재시도 {attempt}/{retry_count}",
                    end=""
                )


            response = requests.get(
                API_URL,
                params=params,
                timeout=(60, 120)
            )


            if response.status_code != 200:

                print(
                    f" 오류: HTTP {response.status_code}"
                )

                if attempt < retry_count:

                    time.sleep(
                        RETRY_WAIT_SECONDS
                    )

                    continue

                return None


            try:

                root = ET.fromstring(
                    response.content
                )

            except Exception as e:

                print(
                    " 오류: XML 해석 실패:",
                    e
                )

                if attempt < retry_count:

                    time.sleep(
                        RETRY_WAIT_SECONDS
                    )

                    continue

                return None


            items = root.findall(
                ".//item"
            )


            rows = []


            for item in items:

                year = (
                    item.findtext("year")
                    or
                    ""
                ).strip()


                # 총계 행은 제외
                if year == "총계":
                    continue


                detail_hs_code = (
                    item.findtext(
                        "hsCode"
                    )
                    or
                    ""
                ).strip()


                stat_kor = (
                    item.findtext(
                        "statKor"
                    )
                    or
                    ""
                ).strip()


                export_usd = to_int(
                    item.findtext(
                        "expDlr"
                    )
                )


                export_kg = to_int(
                    item.findtext(
                        "expWgt"
                    )
                )


                import_usd = to_int(
                    item.findtext(
                        "impDlr"
                    )
                )


                import_kg = to_int(
                    item.findtext(
                        "impWgt"
                    )
                )


                rows.append({
                    "월":
                        year,

                    "세부_HS코드":
                        detail_hs_code,

                    "세부품목명":
                        stat_kor,

                    "수출금액_USD":
                        export_usd,

                    "수출중량_KG":
                        export_kg,

                    "수입금액_USD":
                        import_usd,

                    "수입중량_KG":
                        import_kg
                })


            print(
                f" → {len(rows)} 개 저장"
            )


            return rows


        except requests.exceptions.Timeout as e:

            print(
                " 오류:",
                e
            )


        except requests.exceptions.RequestException as e:

            print(
                " 오류:",
                e
            )


        except Exception as e:

            print(
                " 알 수 없는 오류:",
                e
            )


        if attempt < retry_count:

            print(
                f"{RETRY_WAIT_SECONDS}초 후 다시 시도"
            )

            time.sleep(
                RETRY_WAIT_SECONDS
            )


    return None


# =========================================================
# 7. 품목별 상세 데이터 수집
# =========================================================

def collect_item(
    hs_code,
    item_name
):

    print()
    print("=" * 70)

    print(
        item_name,
        "/ HS",
        hs_code
    )

    print("=" * 70)


    detail_rows = []

    failed_months = []


    # -----------------------------------------------------
    # 1차 전체 조회
    # -----------------------------------------------------

    for yymm in MONTHS:

        result = fetch_month(
            hs_code,
            yymm
        )


        if result is None:

            failed_months.append(
                yymm
            )

            continue


        for row in result:

            detail_rows.append({

                "월":
                    row["월"],

                "대표품목":
                    item_name,

                "조회_HS코드":
                    hs_code,

                "세부_HS코드":
                    row["세부_HS코드"],

                "세부품목명":
                    row["세부품목명"],

                "수출금액_USD":
                    row["수출금액_USD"],

                "수출중량_KG":
                    row["수출중량_KG"],

                "수입금액_USD":
                    row["수입금액_USD"],

                "수입중량_KG":
                    row["수입중량_KG"]
            })


    # -----------------------------------------------------
    # 실패월 마지막 재조회
    # -----------------------------------------------------

    final_failed_months = []


    if failed_months:

        print()
        print("=" * 70)
        print(
            item_name,
            "실패월 재조회 시작"
        )
        print("=" * 70)

        print(
            "1차 실패월:",
            ", ".join(
                failed_months
            )
        )


        for yymm in failed_months:

            print()

            print(
                "실패월 다시 조회:",
                yymm
            )


            result = fetch_month(
                hs_code,
                yymm,
                retry_count=3
            )


            if result is None:

                final_failed_months.append(
                    yymm
                )

                continue


            for row in result:

                detail_rows.append({

                    "월":
                        row["월"],

                    "대표품목":
                        item_name,

                    "조회_HS코드":
                        hs_code,

                    "세부_HS코드":
                        row["세부_HS코드"],

                    "세부품목명":
                        row["세부품목명"],

                    "수출금액_USD":
                        row["수출금액_USD"],

                    "수출중량_KG":
                        row["수출중량_KG"],

                    "수입금액_USD":
                        row["수입금액_USD"],

                    "수입중량_KG":
                        row["수입중량_KG"]
                })


    # -----------------------------------------------------
    # 최종 실패월 출력
    # -----------------------------------------------------

    print()
    print("-" * 70)


    if final_failed_months:

        print(
            "⚠ 최종 실패월:",
            ", ".join(
                final_failed_months
            )
        )

    else:

        print(
            "모든 월 조회 성공"
        )


    print("-" * 70)


    return (
        detail_rows,
        final_failed_months
    )


# =========================================================
# 8. 상세 CSV 저장
# =========================================================

DETAIL_FIELDS = [
    "월",
    "대표품목",
    "조회_HS코드",
    "세부_HS코드",
    "세부품목명",
    "수출금액_USD",
    "수출중량_KG",
    "수입금액_USD",
    "수입중량_KG"
]


def save_detail_csv(
    hs_code,
    rows
):

    filename = (
        f"export_{hs_code}.csv"
    )


    rows.sort(
        key=lambda x: (
            x["월"],
            x["세부_HS코드"]
        )
    )


    with open(
        filename,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=DETAIL_FIELDS
        )

        writer.writeheader()

        writer.writerows(
            rows
        )


    print(
        filename,
        "저장 완료"
    )


# =========================================================
# 9. 월별 요약 생성
# =========================================================

SUMMARY_FIELDS = [
    "월",
    "품목명",
    "HS코드",
    "수출금액_USD",
    "수출중량_KG",
    "수출단가_USD_per_KG",
    "YoY_pct",
    "MoM_pct"
]


def make_summary(
    hs_code,
    item_name,
    detail_rows
):

    monthly = {}


    for row in detail_rows:

        month = (
            row["월"]
        )


        if month not in monthly:

            monthly[
                month
            ] = {
                "export_usd": 0,
                "export_kg": 0
            }


        monthly[
            month
        ][
            "export_usd"
        ] += to_int(
            row[
                "수출금액_USD"
            ]
        )


        monthly[
            month
        ][
            "export_kg"
        ] += to_int(
            row[
                "수출중량_KG"
            ]
        )


    summary_rows = []


    sorted_months = sorted(
        monthly.keys()
    )


    for index, month in enumerate(
        sorted_months
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


        if export_kg > 0:

            unit_price = (
                export_usd
                /
                export_kg
            )

        else:

            unit_price = 0


        # -------------------------------------------------
        # YoY
        # -------------------------------------------------

        try:

            year_number = int(
                month[:4]
            )

            month_number = int(
                month[5:7]
            )

            previous_year_month = (
                f"{year_number - 1}."
                f"{month_number:02d}"
            )

        except:

            previous_year_month = ""


        previous_year_value = (
            monthly.get(
                previous_year_month,
                {}
            ).get(
                "export_usd"
            )
        )


        if (
            previous_year_value is not None
            and
            previous_year_value != 0
        ):

            yoy = (
                (
                    export_usd
                    /
                    previous_year_value
                )
                -
                1
            ) * 100

        else:

            yoy = ""


        # -------------------------------------------------
        # MoM
        # -------------------------------------------------

        if index > 0:

            previous_month = (
                sorted_months[
                    index - 1
                ]
            )


            previous_month_value = (
                monthly[
                    previous_month
                ][
                    "export_usd"
                ]
            )


            if previous_month_value != 0:

                mom = (
                    (
                        export_usd
                        /
                        previous_month_value
                    )
                    -
                    1
                ) * 100

            else:

                mom = ""

        else:

            mom = ""


        summary_rows.append({

            "월":
                month,

            "품목명":
                item_name,

            "HS코드":
                hs_code,

            "수출금액_USD":
                export_usd,

            "수출중량_KG":
                export_kg,

            "수출단가_USD_per_KG":
                round(
                    unit_price,
                    4
                ),

            "YoY_pct":
                (
                    round(
                        yoy,
                        2
                    )
                    if yoy != ""
                    else
                    ""
                ),

            "MoM_pct":
                (
                    round(
                        mom,
                        2
                    )
                    if mom != ""
                    else
                    ""
                )
        })


    return summary_rows


# =========================================================
# 10. summary CSV 저장
# =========================================================

def save_summary_csv(
    hs_code,
    rows
):

    filename = (
        f"summary_{hs_code}.csv"
    )


    with open(
        filename,
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=SUMMARY_FIELDS
        )

        writer.writeheader()

        writer.writerows(
            rows
        )


    print(
        filename,
        "저장 완료"
    )


# =========================================================
# 11. 전체 실행
# =========================================================

print("=" * 70)
print("관세청 품목별 수출입 데이터 업데이트 시작")
print("=" * 70)

print(
    "조회기간:",
    f"{START_YEAR}.{START_MONTH:02d}",
    "~",
    f"{END_YEAR}.{END_MONTH:02d}"
)

print(
    "등록 품목:",
    len(HS_ITEMS),
    "개"
)


all_summary_rows = []

all_failed = {}


for item in HS_ITEMS:

    hs_code = (
        item["hs_code"]
    )

    item_name = (
        item["name"]
    )


    detail_rows, failed_months = (
        collect_item(
            hs_code,
            item_name
        )
    )


    save_detail_csv(
        hs_code,
        detail_rows
    )


    summary_rows = (
        make_summary(
            hs_code,
            item_name,
            detail_rows
        )
    )


    save_summary_csv(
        hs_code,
        summary_rows
    )


    all_summary_rows.extend(
        summary_rows
    )


    if failed_months:

        all_failed[
            hs_code
        ] = failed_months


# =========================================================
# 12. summary_all.csv
# =========================================================

all_summary_rows.sort(
    key=lambda row: (
        row["월"],
        row["품목명"]
    )
)


with open(
    "summary_all.csv",
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:

    writer = csv.DictWriter(
        f,
        fieldnames=SUMMARY_FIELDS
    )

    writer.writeheader()

    writer.writerows(
        all_summary_rows
    )


print()
print(
    "summary_all.csv 저장 완료"
)


# =========================================================
# 13. latest.csv
# =========================================================

if all_summary_rows:

    latest_month = max(

        row["월"]

        for row
        in all_summary_rows
    )


    latest_rows = [

        row

        for row
        in all_summary_rows

        if row["월"]
        ==
        latest_month
    ]


    latest_rows.sort(
        key=lambda row:
        -to_int(
            row[
                "수출금액_USD"
            ]
        )
    )


    with open(
        "latest.csv",
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=SUMMARY_FIELDS
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


# =========================================================
# 14. 최종 실패월 요약
# =========================================================

print()
print("=" * 70)
print("조회 결과")
print("=" * 70)


if not all_failed:

    print(
        "✅ 모든 품목 / 모든 월 조회 성공"
    )


else:

    print(
        "⚠ 아래 월은 최종적으로 조회에 실패했습니다."
    )

    print()


    for hs_code, months in all_failed.items():

        print(
            "HS",
            hs_code,
            ":",
            ", ".join(
                months
            )
        )


    print()
    print(
        "위 월은 CSV에서 누락될 수 있습니다."
    )


print()
print("=" * 70)
print("전체 수출입 데이터 업데이트 완료")
print("=" * 70)
