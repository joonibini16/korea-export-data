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


# 신규 품목은 여기부터 전체 수집
FULL_START_YEAR = 2020
FULL_START_MONTH = 1


# 기존 품목은 최근 몇 개월 재조회
UPDATE_MONTHS = 3


# 정상 호출 간격
REQUEST_INTERVAL_SECONDS = 0.5


# 일반 오류 재시도 대기
RETRY_WAITS = [
    10,
    20,
    40
]


# 429 발생 시 대기
RATE_LIMIT_WAITS = [
    30,
    60,
    120,
    180
]


# =========================================================
# 2. 최신 조회월 계산
# =========================================================

today = datetime.now()

if today.month == 1:

    END_YEAR = (
        today.year
        -
        1
    )

    END_MONTH = 12

else:

    END_YEAR = today.year

    END_MONTH = (
        today.month
        -
        1
    )


# =========================================================
# 3. 월 관련 함수
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
            and
            month == end_month
        ):

            break


        month += 1


        if month == 13:

            month = 1
            year += 1


    return months


def get_recent_months(
    end_year,
    end_month,
    count
):

    months = []

    year = end_year
    month = end_month


    for _ in range(count):

        months.append(
            f"{year}{month:02d}"
        )


        month -= 1


        if month == 0:

            month = 12
            year -= 1


    months.reverse()

    return months


FULL_MONTHS = make_month_list(
    FULL_START_YEAR,
    FULL_START_MONTH,
    END_YEAR,
    END_MONTH
)


RECENT_MONTHS = get_recent_months(
    END_YEAR,
    END_MONTH,
    UPDATE_MONTHS
)


# =========================================================
# 4. HS 코드 읽기
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


            item_name = (
                row["name"]
                .strip()
            )


            if not hs_code:

                continue


            items.append({

                "hs_code":
                    hs_code,

                "name":
                    item_name

            })


    return items


HS_ITEMS = read_hs_codes()


# =========================================================
# 5. CSV 필드
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


FAILED_FIELDS = [
    "품목명",
    "HS코드",
    "월",
    "오류"
]


# =========================================================
# 6. 숫자 변환
# =========================================================

def to_int(value):

    if value is None:

        return 0


    value = str(
        value
    ).strip()


    if value == "":

        return 0


    try:

        return int(
            float(
                value
            )
        )

    except:

        return 0


# =========================================================
# 7. 기존 export 파일 읽기
# =========================================================

def load_existing_detail_rows(
    hs_code
):

    filename = (
        f"export_{hs_code}.csv"
    )


    if not os.path.exists(
        filename
    ):

        return []


    rows = []


    with open(
        filename,
        "r",
        encoding="utf-8-sig"
    ) as f:

        reader = csv.DictReader(f)


        for row in reader:

            rows.append(
                row
            )


    return rows


# =========================================================
# 8. 기존 summary 파일 월 목록
# =========================================================

def load_existing_summary_months(
    hs_code
):

    filename = (
        f"summary_{hs_code}.csv"
    )


    if not os.path.exists(
        filename
    ):

        return set()


    months = set()


    with open(
        filename,
        "r",
        encoding="utf-8-sig"
    ) as f:

        reader = csv.DictReader(f)


        for row in reader:

            month = (
                row.get(
                    "월",
                    ""
                )
                .strip()
            )


            if month:

                months.add(
                    month
                )


    return months


# =========================================================
# 9. 상세 CSV 저장
# =========================================================

def save_detail_csv(
    hs_code,
    rows
):

    filename = (
        f"export_{hs_code}.csv"
    )


    rows.sort(

        key=lambda row: (

            row["월"],

            row[
                "세부_HS코드"
            ]

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


# =========================================================
# 10. 월별 API 조회
# =========================================================

session = requests.Session()


def fetch_month(
    hs_code,
    yymm
):

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


    max_attempts = 4


    for attempt in range(
        1,
        max_attempts + 1
    ):

        try:

            print(
                f"조회 중: {yymm}",
                end="",
                flush=True
            )


            if attempt > 1:

                print(
                    f" / 재시도 "
                    f"{attempt}/{max_attempts}",
                    end="",
                    flush=True
                )


            response = session.get(
                API_URL,
                params=params,
                timeout=(60, 120)
            )


            # =================================================
            # 429
            # =================================================

            if (
                response.status_code
                ==
                429
            ):

                print(
                    " → HTTP 429"
                )


                if (
                    attempt
                    >=
                    max_attempts
                ):

                    return (
                        None,
                        "HTTP 429 최종 실패"
                    )


                wait_seconds = (
                    RATE_LIMIT_WAITS[
                        min(
                            attempt - 1,
                            len(
                                RATE_LIMIT_WAITS
                            )
                            -
                            1
                        )
                    ]
                )


                print(
                    f"{wait_seconds}초 후 재시도"
                )


                time.sleep(
                    wait_seconds
                )

                continue


            # =================================================
            # 기타 HTTP 오류
            # =================================================

            if (
                response.status_code
                !=
                200
            ):

                print(
                    f" → HTTP "
                    f"{response.status_code}"
                )


                if (
                    attempt
                    >=
                    max_attempts
                ):

                    return (
                        None,
                        f"HTTP "
                        f"{response.status_code}"
                    )


                wait_seconds = (
                    RETRY_WAITS[
                        min(
                            attempt - 1,
                            len(
                                RETRY_WAITS
                            )
                            -
                            1
                        )
                    ]
                )


                print(
                    f"{wait_seconds}초 후 재시도"
                )


                time.sleep(
                    wait_seconds
                )

                continue


            # =================================================
            # XML 파싱
            # =================================================

            try:

                root = ET.fromstring(
                    response.content
                )


            except Exception as e:

                print(
                    " → XML 오류"
                )


                if (
                    attempt
                    >=
                    max_attempts
                ):

                    return (
                        None,
                        "XML 해석 실패"
                    )


                time.sleep(
                    15
                )

                continue


            items = root.findall(
                ".//item"
            )


            rows = []


            for item in items:

                year = (
                    item.findtext(
                        "year"
                    )
                    or
                    ""
                ).strip()


                # 총계 제외
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


                rows.append({

                    "월":
                        year,

                    "세부_HS코드":
                        detail_hs_code,

                    "세부품목명":
                        stat_kor,

                    "수출금액_USD":
                        to_int(
                            item.findtext(
                                "expDlr"
                            )
                        ),

                    "수출중량_KG":
                        to_int(
                            item.findtext(
                                "expWgt"
                            )
                        ),

                    "수입금액_USD":
                        to_int(
                            item.findtext(
                                "impDlr"
                            )
                        ),

                    "수입중량_KG":
                        to_int(
                            item.findtext(
                                "impWgt"
                            )
                        )

                })


            print(
                f" → {len(rows)}개 저장"
            )


            time.sleep(
                REQUEST_INTERVAL_SECONDS
            )


            return (
                rows,
                None
            )


        except requests.exceptions.Timeout:

            print(
                " → Timeout"
            )


            if (
                attempt
                >=
                max_attempts
            ):

                return (
                    None,
                    "Timeout 최종 실패"
                )


        except requests.exceptions.RequestException as e:

            print(
                " → 연결 오류:",
                e
            )


            if (
                attempt
                >=
                max_attempts
            ):

                return (
                    None,
                    str(e)
                )


        wait_seconds = (
            RETRY_WAITS[
                min(
                    attempt - 1,
                    len(
                        RETRY_WAITS
                    )
                    -
                    1
                )
            ]
        )


        print(
            f"{wait_seconds}초 후 다시 시도"
        )


        time.sleep(
            wait_seconds
        )


    return (
        None,
        "알 수 없는 오류"
    )


# =========================================================
# 11. summary 만들기
# =========================================================

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

                "export_usd":
                    0,

                "export_kg":
                    0

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


        # =================================================
        # YoY
        # =================================================

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


        previous_year_value = (
            monthly.get(
                previous_year_month,
                {}
            ).get(
                "export_usd"
            )
        )


        if (
            previous_year_value
            is not None
            and
            previous_year_value
            !=
            0
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


        # =================================================
        # MoM
        # =================================================

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


            if (
                previous_month_value
                !=
                0
            ):

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
# 12. summary 저장
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


# =========================================================
# 13. 누락월 확인
# =========================================================

def find_missing_months(
    existing_summary_months
):

    missing = []


    for yymm in FULL_MONTHS:

        month_label = (
            yymm[:4]
            +
            "."
            +
            yymm[4:]
        )


        if (
            month_label
            not in
            existing_summary_months
        ):

            missing.append(
                yymm
            )


    return missing


# =========================================================
# 14. 품목 하나 업데이트
# =========================================================

def update_one_item(
    hs_code,
    item_name
):

    print()
    print("=" * 75)

    print(
        item_name,
        "/ HS",
        hs_code
    )

    print("=" * 75)


    existing_rows = (
        load_existing_detail_rows(
            hs_code
        )
    )


    existing_summary_months = (
        load_existing_summary_months(
            hs_code
        )
    )


    # =====================================================
    # 신규 품목
    # =====================================================

    if not existing_rows:

        print(
            "신규 품목입니다."
        )

        print(
            "2020.01부터 전체 조회합니다."
        )


        target_months = (
            FULL_MONTHS.copy()
        )


    # =====================================================
    # 기존 품목
    # =====================================================

    else:

        print(
            "기존 품목입니다."
        )


        missing_months = (
            find_missing_months(
                existing_summary_months
            )
        )


        target_months = sorted(
            set(
                RECENT_MONTHS
                +
                missing_months
            )
        )


        print(
            "최근 갱신월:",
            ", ".join(
                RECENT_MONTHS
            )
        )


        if missing_months:

            print(
                "과거 누락월:",
                ", ".join(
                    missing_months
                )
            )


    print(
        "이번 조회월:",
        len(
            target_months
        ),
        "개"
    )


    working_rows = (
        existing_rows.copy()
    )


    failed_rows = []


    for index, yymm in enumerate(
        target_months,
        start=1
    ):

        print(
            f"[{index}/{len(target_months)}] ",
            end=""
        )


        result, error = (
            fetch_month(
                hs_code,
                yymm
            )
        )


        month_label = (
            yymm[:4]
            +
            "."
            +
            yymm[4:]
        )


        # =================================================
        # 실패
        # =================================================

        if error is not None:

            failed_rows.append({

                "품목명":
                    item_name,

                "HS코드":
                    hs_code,

                "월":
                    month_label,

                "오류":
                    error

            })


            print(
                "  → 기존 데이터 유지"
            )


            continue


        # =================================================
        # 성공
        # 기존 같은 월 삭제 후 새 데이터로 교체
        # =================================================

        working_rows = [

            row

            for row
            in working_rows

            if row["월"]
            !=
            month_label

        ]


        for row in result:

            working_rows.append({

                "월":
                    row["월"],

                "대표품목":
                    item_name,

                "조회_HS코드":
                    hs_code,

                "세부_HS코드":
                    row[
                        "세부_HS코드"
                    ],

                "세부품목명":
                    row[
                        "세부품목명"
                    ],

                "수출금액_USD":
                    row[
                        "수출금액_USD"
                    ],

                "수출중량_KG":
                    row[
                        "수출중량_KG"
                    ],

                "수입금액_USD":
                    row[
                        "수입금액_USD"
                    ],

                "수입중량_KG":
                    row[
                        "수입중량_KG"
                    ]

            })


        # =================================================
        # 체크포인트 저장
        # =================================================

        save_detail_csv(
            hs_code,
            working_rows
        )


    # =====================================================
    # 최종 summary 생성
    # =====================================================

    save_detail_csv(
        hs_code,
        working_rows
    )


    summary_rows = (
        make_summary(
            hs_code,
            item_name,
            working_rows
        )
    )


    save_summary_csv(
        hs_code,
        summary_rows
    )


    print()
    print(
        f"export_{hs_code}.csv 저장 완료"
    )

    print(
        f"summary_{hs_code}.csv 저장 완료"
    )


    return (
        summary_rows,
        failed_rows
    )


# =========================================================
# 15. 전체 실행
# =========================================================

print("=" * 75)
print("관세청 수출입 데이터 업데이트 시작")
print("=" * 75)

print(
    "전체기간:",
    f"{FULL_START_YEAR}.{FULL_START_MONTH:02d}",
    "~",
    f"{END_YEAR}.{END_MONTH:02d}"
)

print(
    "등록품목:",
    len(HS_ITEMS),
    "개"
)


all_summary_rows = []

all_failed_rows = []


for item_index, item in enumerate(
    HS_ITEMS,
    start=1
):

    print()
    print(
        f"######## 품목 "
        f"{item_index}/{len(HS_ITEMS)} ########"
    )


    hs_code = (
        item["hs_code"]
    )

    item_name = (
        item["name"]
    )


    summary_rows, failed_rows = (
        update_one_item(
            hs_code,
            item_name
        )
    )


    all_summary_rows.extend(
        summary_rows
    )


    all_failed_rows.extend(
        failed_rows
    )


# =========================================================
# 16. summary_all.csv
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
# 17. latest.csv
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
# 18. 실패월 파일
# =========================================================

with open(
    "export_failed.csv",
    "w",
    newline="",
    encoding="utf-8-sig"
) as f:

    writer = csv.DictWriter(
        f,
        fieldnames=FAILED_FIELDS
    )


    writer.writeheader()

    writer.writerows(
        all_failed_rows
    )


print(
    "export_failed.csv 저장 완료"
)


# =========================================================
# 19. 결과
# =========================================================

print()
print("=" * 75)


if all_failed_rows:

    print(
        "⚠ 일부 월 조회 실패:",
        len(
            all_failed_rows
        ),
        "건"
    )

    print(
        "다음 실행 시 누락월을 자동 재조회합니다."
    )

else:

    print(
        "✅ 모든 수출입 데이터 조회 성공"
    )


print("=" * 75)
print("작업 완료")
print("=" * 75)
