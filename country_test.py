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


# 신규 품목은 2020년부터
FULL_START_YEAR = 2020
FULL_START_MONTH = 1


# 기존 품목 최근 갱신개월
UPDATE_MONTHS = 3


# 정상 API 호출 사이 휴식
REQUEST_INTERVAL_SECONDS = 3


# 품목 하나 끝난 뒤 휴식
ITEM_PAUSE_SECONDS = 5


# 429 최대 시도
MAX_429_ATTEMPTS = 3


# 429 대기
RATE_LIMIT_WAITS = [
    30,
    60
]


# 일반 오류 최대 시도
MAX_NORMAL_ATTEMPTS = 3


# 일반 오류 대기
NORMAL_RETRY_WAITS = [
    10,
    20
]


# =========================================================
# 2. 주요국
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


COUNTRY_CODES_WITH_OTHER = (
    list(COUNTRIES.keys())
    +
    ["OTHER"]
)


# =========================================================
# 3. 최신 조회월
# =========================================================

today = datetime.now()

if today.month == 1:

    END_YEAR = today.year - 1
    END_MONTH = 12

else:

    END_YEAR = today.year
    END_MONTH = today.month - 1


# =========================================================
# 4. 월 관련 함수
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
# 5. HS 코드
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
                "hs_code": hs_code,
                "name": item_name
            })


    return items


HS_ITEMS = read_hs_codes()


# =========================================================
# 6. CSV 필드
# =========================================================

FIELDNAMES = [
    "월",
    "품목명",
    "HS코드",
    "국가코드",
    "국가명",
    "수출금액_USD",
    "수출중량_KG"
]


FAILED_FIELDS = [
    "품목명",
    "HS코드",
    "월",
    "국가코드",
    "국가명",
    "오류"
]


# =========================================================
# 7. 숫자 변환
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
# 8. summary 전체 수출액
# =========================================================

def load_total_export(
    hs_code
):

    totals = {}

    filename = (
        f"summary_{hs_code}.csv"
    )


    if not os.path.exists(filename):

        print(
            "⚠",
            filename,
            "파일이 없습니다."
        )

        return totals


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
                    to_int(
                        row[
                            "수출금액_USD"
                        ]
                    ),

                "export_kg":
                    to_int(
                        row[
                            "수출중량_KG"
                        ]
                    )
            }


    return totals


# =========================================================
# 9. 기존 country 파일
# =========================================================

def load_existing_country_rows(
    hs_code
):

    filename = (
        f"country_{hs_code}.csv"
    )


    if not os.path.exists(filename):
        return []


    rows = []


    with open(
        filename,
        "r",
        encoding="utf-8-sig"
    ) as f:

        reader = csv.DictReader(f)

        for row in reader:
            rows.append(row)


    return rows


# =========================================================
# 10. 저장
# =========================================================

def save_country_csv(
    hs_code,
    rows
):

    filename = (
        f"country_{hs_code}.csv"
    )


    order_map = {

        code: index

        for index, code
        in enumerate(
            COUNTRY_CODES_WITH_OTHER
        )
    }


    rows.sort(
        key=lambda row: (
            row["월"],
            order_map.get(
                row["국가코드"],
                999
            )
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
            fieldnames=FIELDNAMES
        )

        writer.writeheader()
        writer.writerows(rows)


# =========================================================
# 11. API
# =========================================================

session = requests.Session()


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


    normal_attempt = 0
    rate_attempt = 0


    while True:

        try:

            response = session.get(
                API_URL,
                params=params,
                timeout=(60, 120)
            )


            # =================================================
            # 429
            # =================================================

            if response.status_code == 429:

                rate_attempt += 1

                print()
                print(
                    f"    ⚠ HTTP 429 "
                    f"({rate_attempt}/{MAX_429_ATTEMPTS})"
                )


                if (
                    rate_attempt
                    >=
                    MAX_429_ATTEMPTS
                ):

                    return (
                        None,
                        None,
                        "HTTP 429 최종 실패"
                    )


                wait_seconds = (
                    RATE_LIMIT_WAITS[
                        min(
                            rate_attempt - 1,
                            len(
                                RATE_LIMIT_WAITS
                            ) - 1
                        )
                    ]
                )


                retry_after = (
                    response.headers.get(
                        "Retry-After"
                    )
                )


                if retry_after:

                    try:

                        wait_seconds = max(
                            wait_seconds,
                            int(retry_after)
                        )

                    except:
                        pass


                print(
                    f"    → {wait_seconds}초 후 재시도"
                )


                time.sleep(
                    wait_seconds
                )

                continue


            # =================================================
            # 기타 HTTP 오류
            # =================================================

            if response.status_code != 200:

                normal_attempt += 1

                print()
                print(
                    f"    ⚠ HTTP "
                    f"{response.status_code}"
                )


                if (
                    normal_attempt
                    >=
                    MAX_NORMAL_ATTEMPTS
                ):

                    return (
                        None,
                        None,
                        f"HTTP {response.status_code}"
                    )


                wait_seconds = (
                    NORMAL_RETRY_WAITS[
                        min(
                            normal_attempt - 1,
                            len(
                                NORMAL_RETRY_WAITS
                            ) - 1
                        )
                    ]
                )


                print(
                    f"    → {wait_seconds}초 후 재시도"
                )


                time.sleep(
                    wait_seconds
                )

                continue


            # =================================================
            # XML
            # =================================================

            try:

                root = ET.fromstring(
                    response.content
                )

            except Exception:

                normal_attempt += 1

                if (
                    normal_attempt
                    >=
                    MAX_NORMAL_ATTEMPTS
                ):

                    return (
                        None,
                        None,
                        "XML 해석 실패"
                    )


                time.sleep(
                    10
                )

                continue


            # =================================================
            # 정상 데이터
            # =================================================

            export_usd = 0
            export_kg = 0


            for item in root.findall(
                ".//item"
            ):

                year = (
                    item.findtext(
                        "year"
                    )
                    or
                    ""
                ).strip()


                if year == "총계":
                    continue


                export_usd += to_int(
                    item.findtext(
                        "expDlr"
                    )
                )


                export_kg += to_int(
                    item.findtext(
                        "expWgt"
                    )
                )


            # 호출 간격
            time.sleep(
                REQUEST_INTERVAL_SECONDS
            )


            return (
                export_usd,
                export_kg,
                None
            )


        # =====================================================
        # Timeout
        # =====================================================

        except requests.exceptions.Timeout:

            normal_attempt += 1

            print()
            print(
                f"    ⚠ Timeout "
                f"({normal_attempt}/{MAX_NORMAL_ATTEMPTS})"
            )


            if (
                normal_attempt
                >=
                MAX_NORMAL_ATTEMPTS
            ):

                return (
                    None,
                    None,
                    "Timeout 최종 실패"
                )


            wait_seconds = (
                NORMAL_RETRY_WAITS[
                    min(
                        normal_attempt - 1,
                        len(
                            NORMAL_RETRY_WAITS
                        ) - 1
                    )
                ]
            )


            print(
                f"    → {wait_seconds}초 후 재시도"
            )


            time.sleep(
                wait_seconds
            )


        # =====================================================
        # 기타 연결 오류
        # =====================================================

        except requests.exceptions.RequestException as e:

            normal_attempt += 1


            if (
                normal_attempt
                >=
                MAX_NORMAL_ATTEMPTS
            ):

                return (
                    None,
                    None,
                    str(e)
                )


            wait_seconds = (
                NORMAL_RETRY_WAITS[
                    min(
                        normal_attempt - 1,
                        len(
                            NORMAL_RETRY_WAITS
                        ) - 1
                    )
                ]
            )


            print()
            print(
                "    ⚠ 연결 오류"
            )

            print(
                f"    → {wait_seconds}초 후 재시도"
            )


            time.sleep(
                wait_seconds
            )


# =========================================================
# 12. 한 달 조회
# =========================================================

def collect_month(
    hs_code,
    item_name,
    yymm,
    total_export
):

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


    total = (
        total_export.get(
            month_label
        )
    )


    if total is None:

        return (
            None,
            [{
                "품목명": item_name,
                "HS코드": hs_code,
                "월": month_label,
                "국가코드": "-",
                "국가명": "-",
                "오류": "summary 없음"
            }]
        )


    month_rows = []
    failed_rows = []


    major_export_usd = 0
    major_export_kg = 0


    for (
        country_code,
        country_name
    ) in COUNTRIES.items():


        print(
            " ",
            country_name,
            "→",
            end=" ",
            flush=True
        )


        export_usd, export_kg, error = (
            fetch_country_data(
                hs_code,
                yymm,
                country_code
            )
        )


        if error:

            print(
                "실패"
            )


            failed_rows.append({

                "품목명":
                    item_name,

                "HS코드":
                    hs_code,

                "월":
                    month_label,

                "국가코드":
                    country_code,

                "국가명":
                    country_name,

                "오류":
                    error

            })


            continue


        print(
            f"${export_usd:,}"
        )


        major_export_usd += export_usd
        major_export_kg += export_kg


        month_rows.append({

            "월":
                month_label,

            "품목명":
                item_name,

            "HS코드":
                hs_code,

            "국가코드":
                country_code,

            "국가명":
                country_name,

            "수출금액_USD":
                export_usd,

            "수출중량_KG":
                export_kg

        })


    # =====================================================
    # 국가 하나라도 실패
    # 해당 월 전체 갱신 보류
    # =====================================================

    if failed_rows:

        print(
            "  ⚠ 일부 국가 실패 → "
            "이 월은 갱신하지 않습니다."
        )


        return (
            None,
            failed_rows
        )


    # =====================================================
    # 기타
    # =====================================================

    other_export_usd = (
        total["export_usd"]
        -
        major_export_usd
    )


    other_export_kg = (
        total["export_kg"]
        -
        major_export_kg
    )


    if other_export_usd < 0:

        return (
            None,
            [{
                "품목명":
                    item_name,

                "HS코드":
                    hs_code,

                "월":
                    month_label,

                "국가코드":
                    "OTHER",

                "국가명":
                    "기타",

                "오류":
                    "주요국 합계가 전체수출보다 큼"
            }]
        )


    month_rows.append({

        "월":
            month_label,

        "품목명":
            item_name,

        "HS코드":
            hs_code,

        "국가코드":
            "OTHER",

        "국가명":
            "기타",

        "수출금액_USD":
            other_export_usd,

        "수출중량_KG":
            other_export_kg

    })


    print(
        " 기타 →",
        f"${other_export_usd:,}"
    )


    print(
        " 합계확인:",
        f"${major_export_usd + other_export_usd:,}",
        "/",
        f"${total['export_usd']:,}"
    )


    return (
        month_rows,
        []
    )


# =========================================================
# 13. 누락월 찾기
# =========================================================

def find_incomplete_months(
    existing_rows
):

    month_map = {}


    for row in existing_rows:

        month = (
            row["월"]
        )


        if month not in month_map:

            month_map[
                month
            ] = set()


        month_map[
            month
        ].add(
            row[
                "국가코드"
            ]
        )


    required = set(
        COUNTRY_CODES_WITH_OTHER
    )


    incomplete = []


    for yymm in FULL_MONTHS:

        month_label = (
            yymm[:4]
            +
            "."
            +
            yymm[4:]
        )


        existing_codes = (
            month_map.get(
                month_label,
                set()
            )
        )


        if not required.issubset(
            existing_codes
        ):

            incomplete.append(
                yymm
            )


    return incomplete


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


    total_export = (
        load_total_export(
            hs_code
        )
    )


    if not total_export:

        return (
            [],
            [{
                "품목명":
                    item_name,

                "HS코드":
                    hs_code,

                "월":
                    "-",

                "국가코드":
                    "-",

                "국가명":
                    "-",

                "오류":
                    "summary 없음"
            }]
        )


    existing_rows = (
        load_existing_country_rows(
            hs_code
        )
    )


    # 신규
    if not existing_rows:

        print(
            "신규 품목 → 2020년부터 수집"
        )


        target_months = (
            FULL_MONTHS.copy()
        )


    else:

        incomplete = (
            find_incomplete_months(
                existing_rows
            )
        )


        target_months = sorted(
            set(
                RECENT_MONTHS
                +
                incomplete
            )
        )


        print(
            "기존 품목"
        )

        print(
            "최근 갱신:",
            ", ".join(
                RECENT_MONTHS
            )
        )


        if incomplete:

            print(
                "과거 누락월:",
                ", ".join(
                    incomplete
                )
            )


    print(
        "이번 조회월:",
        len(
            target_months
        )
    )


    working_rows = (
        existing_rows.copy()
    )


    failed_rows_all = []


    for index, yymm in enumerate(
        target_months,
        start=1
    ):


        print()
        print(
            f"[{index}/{len(target_months)}]",
            end=" "
        )


        month_rows, failed_rows = (
            collect_month(
                hs_code,
                item_name,
                yymm,
                total_export
            )
        )


        month_label = (
            yymm[:4]
            +
            "."
            +
            yymm[4:]
        )


        if month_rows is not None:

            working_rows = [

                row

                for row
                in working_rows

                if row["월"]
                !=
                month_label

            ]


            working_rows.extend(
                month_rows
            )


            save_country_csv(
                hs_code,
                working_rows
            )


            print(
                " ✓ 저장"
            )


        else:

            failed_rows_all.extend(
                failed_rows
            )


            print(
                " → 실패월 보류"
            )


    save_country_csv(
        hs_code,
        working_rows
    )


    return (
        working_rows,
        failed_rows_all
    )


# =========================================================
# 15. country_all.csv
# =========================================================

def create_country_all():

    all_rows = []


    for item in HS_ITEMS:

        hs_code = (
            item["hs_code"]
        )


        filename = (
            f"country_{hs_code}.csv"
        )


        if not os.path.exists(
            filename
        ):

            continue


        with open(
            filename,
            "r",
            encoding="utf-8-sig"
        ) as f:

            reader = csv.DictReader(f)

            for row in reader:

                all_rows.append(
                    row
                )


    all_rows.sort(
        key=lambda row: (
            row["월"],
            row["품목명"],
            row["국가코드"]
        )
    )


    with open(
        "country_all.csv",
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=FIELDNAMES
        )

        writer.writeheader()
        writer.writerows(
            all_rows
        )


    return all_rows


# =========================================================
# 16. latest
# =========================================================

def create_country_latest(
    all_rows
):

    if not all_rows:
        return


    latest_month = max(
        row["월"]
        for row
        in all_rows
    )


    latest_rows = [

        row

        for row
        in all_rows

        if row["월"]
        ==
        latest_month
    ]


    latest_rows.sort(
        key=lambda row: (
            row["품목명"],
            -to_int(
                row[
                    "수출금액_USD"
                ]
            )
        )
    )


    with open(
        "country_latest.csv",
        "w",
        newline="",
        encoding="utf-8-sig"
    ) as f:

        writer = csv.DictWriter(
            f,
            fieldnames=FIELDNAMES
        )

        writer.writeheader()
        writer.writerows(
            latest_rows
        )


    print(
        "country_latest.csv 저장 완료"
    )


# =========================================================
# 17. 실패목록
# =========================================================

def save_failed_rows(
    rows
):

    with open(
        "country_failed.csv",
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
            rows
        )


# =========================================================
# 18. 실행
# =========================================================

print("=" * 75)
print("국가별 수출 데이터 업데이트")
print("=" * 75)

print(
    "조회기간:",
    f"{FULL_START_YEAR}.{FULL_START_MONTH:02d}",
    "~",
    f"{END_YEAR}.{END_MONTH:02d}"
)

print(
    "정상 API 호출 간격:",
    REQUEST_INTERVAL_SECONDS,
    "초"
)


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


    _, failed_rows = (
        update_one_item(
            item["hs_code"],
            item["name"]
        )
    )


    all_failed_rows.extend(
        failed_rows
    )


    if item_index < len(
        HS_ITEMS
    ):

        print(
            f"{ITEM_PAUSE_SECONDS}초 휴식..."
        )


        time.sleep(
            ITEM_PAUSE_SECONDS
        )


all_rows = (
    create_country_all()
)


create_country_latest(
    all_rows
)


save_failed_rows(
    all_failed_rows
)


print()
print("=" * 75)


if all_failed_rows:

    print(
        "⚠ 실패 건수:",
        len(
            all_failed_rows
        )
    )

    print(
        "country_failed.csv에 기록했습니다."
    )

    print(
        "다음 실행에서 누락월을 자동 재조회합니다."
    )

else:

    print(
        "✅ 모든 국가별 데이터 조회 성공"
    )


print("=" * 75)
