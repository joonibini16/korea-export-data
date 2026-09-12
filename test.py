import os
import requests
import xml.etree.ElementTree as ET

# 1. GitHub Secret에서 API 인증키 가져오기
api_key = os.environ.get("CUSTOMS_API_KEY")

if not api_key:
    print("실패: API 인증키를 찾지 못했습니다.")
    exit()

# 2. 관세청 API 주소
url = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"

# 3. 조회 조건
params = {
    "serviceKey": api_key,
    "strtYymm": "202601",
    "endYymm": "202608",
    "hsSgn": "330499"
}

print("관세청 데이터를 요청합니다...")
print("조회 HS Code: 330499")
print("조회기간: 2026년 1월 ~ 2026년 8월")
print()

# 4. 관세청 API 호출
response = requests.get(url, params=params, timeout=30)

print("HTTP 상태코드:", response.status_code)

# 5. 호출 실패 확인
if response.status_code != 200:
    print("API 호출 실패")
    print(response.text)
    exit()

# 6. XML 데이터 읽기
root = ET.fromstring(response.text)

items = root.findall(".//item")

if len(items) == 0:
    print("데이터를 찾지 못했습니다.")
    print()
    print("관세청 응답 원문:")
    print(response.text)
    exit()

print("성공! 데이터 개수:", len(items))
print()
print("=" * 60)

# 7. 결과 출력
for item in items:

    year = item.findtext("year")
    hs_code = item.findtext("hsSgn")
    exp_wgt = item.findtext("expWgt")
    exp_dlr = item.findtext("expDlr")
    imp_wgt = item.findtext("impWgt")
    imp_dlr = item.findtext("impDlr")

    print("기간:", year)
    print("HS Code:", hs_code)
    print("수출금액(USD):", exp_dlr)
    print("수출중량(kg):", exp_wgt)
    print("수입금액(USD):", imp_dlr)
    print("수입중량(kg):", imp_wgt)
    print("-" * 60)
