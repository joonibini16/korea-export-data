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


# 새 품목을 처음 등록했을 때
# 국가별 데이터를 어디서부터 받을지 설정
FULL_START_YEAR = 2020
FULL_START_MONTH = 1


# 기존 품목은 최근 몇 개월을 다시 받을지
UPDATE_MONTHS = 3


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
            and month == end_month
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
# 5. summary 파일에서 전체 수출액 읽기
# =========================================================

def load_total_export(hs_code):

    totals = {}

    filename = (
        f"summary_{hs_code}.csv"
    )

    if not os.path.exists(filename):

        print()
        print(
            "오류:",
            filename,
            "파일이 없습니다."
        )

        print(
            "일반 수출데이터가 먼저 생성되어야 합니다."
        )

        raise SystemExit(1)


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
                        float(
                            row[
                                "수출금액_USD"
                            ]
                        )
                    ),

                "export_kg":
                    int(
                        float(
                            row[
                                "수출중량_KG"
                            ]
                        )
                    )
            }

    return totals


# =========================================================
# 6. 국가별 API 조회
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


    for attempt in range(1, 4):

        try:

            response = requests.get(
                API_URL,
                params=params,
                timeout=(60, 120)
            )


            if response.status_code != 200:

                print(
                    f"HTTP {response.status_code}"
                )

                if attempt < 3:
                    time.sleep(5)
                    continue

                raise RuntimeError(
                    "API HTTP 오류"
                )


            try:

                root = ET.fromstring(
                    response.content
                )

            except Exception as e:

                print(
                    "XML 해석 오류:",
                    e
                )

                if attempt < 3:
                    time.sleep(5)
                    continue

                raise RuntimeError(
                    "XML 해석 실패"
                )


            export_usd = 0
            export_kg = 0


            items = root.findall(
                ".//item"
            )


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
                    float(
                        exp_dlr
                    )
                )


                export_kg += int(
                    float(
                        exp_wgt
                    )
                )


            return (
                export_usd,
                export_kg
            )


        except requests.exceptions.RequestException as e:

            print(
                f"API 연결 오류 {attempt}/3:",
                e
            )

            if attempt < 3:

                print(
                    "5초 후 다시 시도합니다."
                )

                time.sleep(5)

            else:

                raise RuntimeError(
                    "API 연결에 3번 실패했습니다."
                )


    raise RuntimeError(
        "API 조회 실패"
    )


# =========================================================
# 7. 기존 country 파일 읽기
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
# 8. 국가별 데이터 수집
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

        raise RuntimeError(
            f"{month_label}의 "
            f"summary_{hs_code}.csv "
            f"전체 수출액을 찾을 수 없습니다."
        )


    month_rows = []

    major_export_usd = 0
    major_export_kg = 0


    for (
        country_code,
        country_name
    ) in COUNTRIES.items():

        print(
            " ",
            country_name,
            end=" → "
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


        print(
            f"${export_usd:,}"
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


    if other_export_usd < 0:

        print()
        print(
            "경고: 주요국 수출액 합계가 "
            "전체 수출액보다 큽니다."
        )

        print(
            "전체:",
            f"{total['export_usd']:,}"
        )

        print(
            "주요국:",
            f"{major_export_usd:,}"
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


    return month_rows


# =========================================================
# 9. 품목 하나 업데이트
# =========================================================

def update_one_item(
    hs_code,
    item_name
):

    print()
    print()
    print("=" * 70)

    print(
        item_name,
        "/ HS",
        hs_code
    )

    print("=" * 70)


    filename = (
        f"country_{hs_code}.csv"
    )


    total_export = (
        load_total_export(
            hs_code
        )
    )


    existing_rows = (
        load_existing_country_rows(
            hs_code
        )
    )


    # =====================================================
    # 신규 품목 / 기존 품목 자동 구분
    # =====================================================

    if not os.path.exists(filename):

        print(
            "신규 품목입니다."
        )

        print(
            f"{FULL_START_YEAR}년 "
            f"{FULL_START_MONTH}월부터 "
            "전체 데이터를 수집합니다."
        )

        target_months = (
            FULL_MONTHS
        )

        kept_rows = []


    else:

        print(
            "기존 품목입니다."
        )

        print(
            "최근",
            UPDATE_MONTHS,
            "개월만 다시 조회합니다."
        )


        target_months = (
            RECENT_MONTHS
        )


        refresh_labels = set(

            yymm[:4]
            +
            "."
            +
            yymm[4:]

            for yymm
            in target_months
        )


        # 최근 3개월 데이터만 제거하고
        # 기존 과거 데이터는 그대로 유지
        kept_rows = [

            row

            for row
            in existing_rows

            if row["월"]
            not in refresh_labels
        ]


    new_rows = []


    for yymm in target_months:

        month_rows = (
            collect_month(
                hs_code,
                item_name,
                yymm,
                total_export
            )
        )

        new_rows.extend(
            month_rows
        )


    combined_rows = (
        kept_rows
        +
        new_rows
    )


    # 월 → 국가 순으로 정렬
    country_order = (
        list(
            COUNTRIES.keys()
        )
        +
        ["OTHER"]
    )


    order_map = {

        code: index

        for index, code
        in enumerate(
            country_order
        )
    }


    combined_rows.sort(
        key=lambda row: (
            row["월"],
            order_map.get(
                row["국가코드"],
                999
            )
        )
    )


    return combined_rows


# =========================================================
# 10. 개별 country CSV 저장
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

        writer = csv.DictWriter(
            f,
            fieldnames=FIELDNAMES
        )

        writer.writeheader()

        writer.writerows(
            rows
        )


    print()
    print(
        filename,
        "저장 완료"
    )


# =========================================================
# 11. country_all.csv 생성
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


        if not os.path.exists(filename):
            continue


        with open(
            filename,
            "r",
            encoding="utf-8-sig"
        ) as f:

            reader = csv.DictReader(f)

            for row in reader:

                all_rows.append(row)


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
# 12. country_latest.csv 생성
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
            -int(
                float(
                    row["수출금액_USD"]
                )
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
# 13. 실행
# =========================================================

print("=" * 70)
print("국가별 수출 데이터 업데이트 시작")
print("=" * 70)

print(
    "최신월:",
    f"{END_YEAR}.{END_MONTH:02d}"
)

print(
    "등록 품목:",
    len(HS_ITEMS),
    "개"
)

print(
    "주요 국가:",
    len(COUNTRIES),
    "개"
)


for item in HS_ITEMS:

    hs_code = (
        item["hs_code"]
    )

    item_name = (
        item["name"]
    )


    rows = update_one_item(
        hs_code,
        item_name
    )


    save_country_csv(
        hs_code,
        rows
    )


# 통합 CSV 생성
all_rows = (
    create_country_all()
)


# 최신월 CSV 생성
create_country_latest(
    all_rows
)


print()
print("=" * 70)
print("모든 국가별 데이터 업데이트 완료")
print("=" * 70)
