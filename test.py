import os
import requests
import xml.etree.ElementTree as ET

# GitHub Secret에서 인증키 가져오기
api_key = os.environ.get("CUSTOMS_API_KEY")

if not api_key:
    print("실패: API 인증키를 찾지 못했습니다.")
    exit()

# 관세청 API 주소
url = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"

# 조회조건
params = {
    "serviceKey": api_key,
    "strtYymm": "202601",
    "endYymm": "202601",
    "hsSgn": "330499"
}

print("관세청 데이터를 요청합니다...")
print("조회 HS Code: 330499")
print("조회기간: 2026년 1월")
print()

response = requests.get(url, params=params, timeout=30)

print("HTTP 상태코드:", response.status_code)
print()

if response.status_code != 200:
    print("API 호출 실패")
    print(response.text)
    exit()

root = ET.fromstring(response.text)

items = root.findall(".//item")

print("데이터 개수:", len(items))
print()

# 모든 item의 실제 필드 이름과 값을 출력
for number, item in enumerate(items, start=1):

    print("=" * 70)
    print("ITEM", number)
    print("=" * 70)

    for child in item:
        print(child.tag, "=", child.text)

    print()
