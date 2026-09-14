import os
import requests
import xml.etree.ElementTree as ET


api_key = os.environ.get("CUSTOMS_API_KEY")

if not api_key:
    print("API 인증키를 찾지 못했습니다.")
    raise SystemExit(1)


url = "https://apis.data.go.kr/1220000/nitemtrade/getNitemtradeList"


params = {
    "serviceKey": api_key,
    "strtYymm": "202608",
    "endYymm": "202608",
    "hsSgn": "330499",
    "cntyCd": "US"
}


print("품목별 국가별 수출입 데이터 요청")
print("HS Code: 330499")
print("국가: 미국(US)")
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
    response.content
)


result_code = root.findtext(
    ".//resultCode"
)

result_msg = root.findtext(
    ".//resultMsg"
)


print(
    "결과코드:",
    result_code
)

print(
    "결과메시지:",
    result_msg
)

print()


items = root.findall(
    ".//item"
)


print(
    "데이터 개수:",
    len(items)
)

print()


for number, item in enumerate(
    items[:20],
    start=1
):

    print("=" * 70)
    print("ITEM", number)
    print("=" * 70)

    for child in item:

        print(
            child.tag,
            "=",
            child.text
        )

    print()
