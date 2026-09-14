import os
import requests
import xml.etree.ElementTree as ET


api_key = os.environ.get("CUSTOMS_API_KEY")

if not api_key:
    print("API 인증키를 찾지 못했습니다.")
    raise SystemExit(1)


url = "https://apis.data.go.kr/1220000/Countrytrade/getCountrytradeList"


params = {

    "serviceKey": api_key,

    "strtYymm": "202608",

    "endYymm": "202608"

}


print("국가별 수출입 데이터 요청")
print("조회기간: 2026년 8월")
print()


response = requests.get(

    url,

    params=params,

    timeout=30

)


print("HTTP 상태코드:", response.status_code)
print()


if response.status_code != 200:

    print(response.text)

    raise SystemExit(1)


root = ET.fromstring(
    response.text
)


items = root.findall(
    ".//item"
)


print(
    "데이터 개수:",
    len(items)
)

print()


for number, item in enumerate(
    items[:15],
    start=1
):

    print("=" * 70)

    print(
        "ITEM",
        number
    )

    print("=" * 70)


    for child in item:

        print(
            child.tag,
            "=",
            child.text
        )


    print()
