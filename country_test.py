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


# 신규 품목은 2020년부터 전체 수집
FULL_START_YEAR = 2020
FULL_START_MONTH = 1


# 기존 품목은 최근 3개월 재조회
UPDATE_MONTHS = 3


# 정상 API 호출 간격
REQUEST_INTERVAL_SECONDS = 1.0


# 품목 하나가 끝난 후 휴식
ITEM_PAUSE_SECONDS = 10


# 429 발생 시 대기시간
RATE_LIMIT_WAITS = [
    60,
    120,
    180,
    300,
    600
]


# 일반 오류 재시도 대기시간
NORMAL_RETRY_WAITS = [
    15,
    30,
    60
]


# =========================================================
# 2. 주요 국가
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
# 5. HS 코드 읽기
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

        return int(
            float(value)
        )

    except:

        return 0


# =========================================================
# 8. summary 파일에서 전체 수출액 읽기
# =========================================================

def load_total_export(
    hs_code
):

    totals = {}


    filename = (
        f"summary_{hs_code}.csv"
    )


    if not os.path.exists(
        filename
    ):

        print()
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

            month = (
                row["월"]
                .strip()
            )


            totals[
                month
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
# 9. 기존 국가별 파일 읽기
# =========================================================

def load_existing_country_rows(
    hs_code
):

    filename = (
        f"country_{hs_code}.csv"
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

            rows.append(row)


    return rows


# =========================================================
# 10. 개별 country CSV 저장
# =========================================================

def save_country_csv(
    hs_code,
    rows
):

    filename = (
        f"country_{hs_code}.csv"
    )


    country_order = {

        code: index

        for index, code
        in enumerate(
            COUNTRY_CODES_WITH_OTHER
        )

    }


    rows.sort(

        key=lambda row: (

            row["월"],

            country_order.get(
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

        writer.writerows(
            rows
        )


# =========================================================
# 11. 국가별 API 조회
# =========================================================

session = requests.Session()


def fetch_country_data(
    hs_code,
    yymm,
    country_code
):

    params = {

        "serviceKey":
            API_KEY,

        "strtYymm":
            yymm,

        "endYymm":
            yymm,

        "hsSgn":
            hs_code,

        "cntyCd":
            country_code

    }


    # -----------------------------------------------------
    # 최대 5회까지 시도
    # -----------------------------------------------------

    max_attempts = 5


    for attempt in range(
        1,
        max_attempts + 1
    ):

        try:

            response = session.get(
                API_URL,
                params=params,
                timeout=(60, 120)
            )


            # =================================================
            # HTTP 429
            # =================================================

            if response.status_code == 429:

                print()

                print(
                    f"    ⚠ HTTP 429 발생 "
                    f"({attempt}/{max_attempts})"
                )


                if attempt >= max_attempts:

                    return (
                        None,
                        None,
                        "HTTP 429 최종 실패"
                    )


                # Retry-After가 있으면 우선 사용
                retry_after = (
                    response.headers.get(
                        "Retry-After"
                    )
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


                if retry_after:

                    try:

                        wait_seconds = max(
                            wait_seconds,
                            int(
                                retry_after
                            )
                        )

                    except:

                        pass


                print(
                    f"    → {wait_seconds}초 대기 후 재시도"
                )


                time.sleep(
                    wait_seconds
                )

                continue


            # =================================================
            # 기타 HTTP 오류
            # =================================================

            if response.status_code != 200:

                print()

                print(
                    f"    ⚠ HTTP "
                    f"{response.status_code}"
                )


                if attempt >= max_attempts:

                    return (
                        None,
                        None,
                        f"HTTP {response.status_code}"
                    )


                wait_seconds = (
                    NORMAL_RETRY_WAITS[
                        min(
                            attempt - 1,
                            len(
                                NORMAL_RETRY_WAITS
                            )
                            -
                            1
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


            except Exception as e:

                print()

                print(
                    "    ⚠ XML 해석 오류:",
                    e
                )


                if attempt >= max_attempts:

                    return (
                        None,
                        None,
                        "XML 해석 실패"
                    )


                time.sleep(
                    20
                )

                continue


            # =================================================
            # 정상 데이터 집계
            # =================================================

            export_usd = 0
            export_kg = 0


            items = root.findall(
                ".//item"
            )


            for item in items:

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


            # 정상 호출 뒤 잠시 쉬기
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

        except requests.exceptions.Timeout as e:

            print()

            print(
                f"    ⚠ Timeout "
                f"({attempt}/{max_attempts})"
            )


            if attempt >= max_attempts:

                return (
                    None,
                    None,
                    "Timeout 최종 실패"
                )


            wait_seconds = (
                NORMAL_RETRY_WAITS[
                    min(
                        attempt - 1,
                        len(
                            NORMAL_RETRY_WAITS
                        )
                        -
                        1
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

            print()

            print(
                "    ⚠ API 연결 오류:",
                e
            )


            if attempt >= max_attempts:

                return (
                    None,
                    None,
                    str(e)
                )


            wait_seconds = (
                NORMAL_RETRY_WAITS[
                    min(
                        attempt - 1,
                        len(
                            NORMAL_RETRY_WAITS
                        )
                        -
                        1
                    )
                ]
            )


            print(
                f"    → {wait_seconds}초 후 재시도"
            )


            time.sleep(
                wait_seconds
            )


    return (
        None,
        None,
        "알 수 없는 API 실패"
    )


# =========================================================
# 12. 월 하나 전체 조회
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


    total = total_export.get(
        month_label
    )


    if total is None:

        print(
            "  ⚠ 전체 수출액(summary)이 없습니다."
        )


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
                    "-",

                "국가명":
                    "-",

                "오류":
                    "summary 데이터 없음"
            }]
        )


    month_rows = []

    failed_rows = []

    major_export_usd = 0
    major_export_kg = 0


    # -----------------------------------------------------
    # 주요 국가 조회
    # -----------------------------------------------------

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


        # -------------------------------------------------
        # 실패
        # -------------------------------------------------

        if error is not None:

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


        # -------------------------------------------------
        # 성공
        # -------------------------------------------------

        print(
            f"${export_usd:,}"
        )


        major_export_usd += (
            export_usd
        )

        major_export_kg += (
            export_kg
        )


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
    # 한 국가라도 실패했다면
    # 기타를 계산하면 안 됨
    # =====================================================

    if failed_rows:

        print()
        print(
            "  ⚠ 이 월은 일부 국가 조회가 실패했습니다."
        )

        print(
            "  → 잘못된 기타값 생성을 막기 위해 "
            "이번 월 갱신을 보류합니다."
        )


        return (
            None,
            failed_rows
        )


    # =====================================================
    # 기타 계산
    # =====================================================

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


    # -----------------------------------------------------
    # 주요국 합 > 전체수출이면 오류
    # -----------------------------------------------------

    if other_export_usd < 0:

        print()
        print(
            "  ⚠ 주요국 수출액이 전체 수출액보다 큽니다."
        )


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
                    "주요국 합계가 전체 수출액보다 큼"
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


    check_total = (
        major_export_usd
        +
        other_export_usd
    )


    print(
        " 합계확인:",
        f"${check_total:,}",
        "/",
        f"${total['export_usd']:,}"
    )


    return (
        month_rows,
        []
    )


# =========================================================
# 13. 기존 파일의 누락월 찾기
# =========================================================

def find_incomplete_months(
    existing_rows
):

    month_country_map = {}


    for row in existing_rows:

        month = (
            row["월"]
        )


        country_code = (
            row["국가코드"]
        )


        if month not in month_country_map:

            month_country_map[
                month
            ] = set()


        month_country_map[
            month
        ].add(
            country_code
        )


    incomplete_months = []


    for yymm in FULL_MONTHS:

        month_label = (
            yymm[:4]
            +
            "."
            +
            yymm[4:]
        )


        existing_codes = (
            month_country_map.get(
                month_label,
                set()
            )
        )


        required_codes = set(
            COUNTRY_CODES_WITH_OTHER
        )


        if not required_codes.issubset(
            existing_codes
        ):

            incomplete_months.append(
                yymm
            )


    return incomplete_months


# =========================================================
# 14. 품목 하나 업데이트
# =========================================================

def update_one_item(
    hs_code,
    item_name
):

    print()
    print()
    print("=" * 75)

    print(
        item_name,
        "/ HS",
        hs_code
    )

    print("=" * 75)


    filename = (
        f"country_{hs_code}.csv"
    )


    total_export = (
        load_total_export(
            hs_code
        )
    )


    if not total_export:

        print(
            "⚠ summary 데이터가 없어 "
            "이 품목을 건너뜁니다."
        )


        return (
            load_existing_country_rows(
                hs_code
            ),
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
                    "summary 파일 없음 또는 비어 있음"
            }]
        )


    existing_rows = (
        load_existing_country_rows(
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
            "2020.01부터 전체 수집합니다."
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


        incomplete_months = (
            find_incomplete_months(
                existing_rows
            )
        )


        # 최근 3개월 + 과거 누락월
        target_months = sorted(
            set(
                RECENT_MONTHS
                +
                incomplete_months
            )
        )


        print(
            "최근 갱신월:",
            ", ".join(
                RECENT_MONTHS
            )
        )


        if incomplete_months:

            print(
                "과거 누락월도 재조회:",
                ", ".join(
                    incomplete_months
                )
            )


    print(
        "총 조회월:",
        len(
            target_months
        ),
        "개"
    )


    working_rows = (
        existing_rows.copy()
    )


    all_failed_rows = []


    # =====================================================
    # 월별 처리
    # =====================================================

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


        # -------------------------------------------------
        # 월 전체 성공
        # -------------------------------------------------

        if month_rows is not None:

            # 기존 같은 월 삭제
            working_rows = [

                row

                for row
                in working_rows

                if row["월"]
                !=
                month_label

            ]


            # 새 데이터 추가
            working_rows.extend(
                month_rows
            )


            # 체크포인트 저장
            save_country_csv(
                hs_code,
                working_rows
            )


            print(
                "  ✓ 체크포인트 저장"
            )


        # -------------------------------------------------
        # 실패
        # 기존 데이터가 있다면 그대로 유지
        # -------------------------------------------------

        else:

            all_failed_rows.extend(
                failed_rows
            )


            print(
                "  → 기존 데이터 유지 / "
                "신규 월이면 다음 실행에서 재시도"
            )


    # 최종 저장
    save_country_csv(
        hs_code,
        working_rows
    )


    print()
    print(
        filename,
        "저장 완료"
    )


    return (
        working_rows,
        all_failed_rows
    )


# =========================================================
# 15. country_all.csv 생성
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


    print()
    print(
        "country_all.csv 저장 완료"
    )


    return all_rows


# =========================================================
# 16. country_latest.csv
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

    print(
        "최신월:",
        latest_month
    )


# =========================================================
# 17. 실패목록 저장
# =========================================================

def save_failed_rows(
    failed_rows
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
            failed_rows
        )


    print()
    print(
        "country_failed.csv 저장 완료"
    )


# =========================================================
# 18. 전체 실행
# =========================================================

print("=" * 75)
print("국가별 수출 데이터 업데이트 시작")
print("=" * 75)

print(
    "조회기간:",
    f"{FULL_START_YEAR}.{FULL_START_MONTH:02d}",
    "~",
    f"{END_YEAR}.{END_MONTH:02d}"
)

print(
    "등록 품목:",
    len(HS_ITEMS),
    "개"
)

print(
    "국가:",
    len(COUNTRIES),
    "개 + 기타"
)

print(
    "API 정상 호출 간격:",
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


    hs_code = (
        item["hs_code"]
    )

    item_name = (
        item["name"]
    )


    _, failed_rows = (
        update_one_item(
            hs_code,
            item_name
        )
    )


    all_failed_rows.extend(
        failed_rows
    )


    # 품목 사이 휴식
    if item_index < len(
        HS_ITEMS
    ):

        print()
        print(
            f"다음 품목 조회 전 "
            f"{ITEM_PAUSE_SECONDS}초 대기..."
        )


        time.sleep(
            ITEM_PAUSE_SECONDS
        )


# =========================================================
# 통합파일 생성
# =========================================================

all_rows = (
    create_country_all()
)


create_country_latest(
    all_rows
)


save_failed_rows(
    all_failed_rows
)


# =========================================================
# 최종 결과
# =========================================================

print()
print("=" * 75)
print("국가별 수출 데이터 업데이트 결과")
print("=" * 75)


if not all_failed_rows:

    print(
        "✅ 모든 조회가 정상 완료되었습니다."
    )

else:

    print(
        "⚠ 일부 조회가 완료되지 않았습니다."
    )

    print(
        "실패 건수:",
        len(
            all_failed_rows
        )
    )

    print(
        "country_failed.csv를 확인하세요."
    )

    print(
        "다음 실행 시 누락월을 자동으로 다시 조회합니다."
    )


print()
print("=" * 75)
print("작업 종료")
print("=" * 75)
