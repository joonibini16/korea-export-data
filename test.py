import os
import requests
import xml.etree.ElementTree as ET
import csv

api_key = os.environ.get("CUSTOMS_API_KEY")

if not api_key:
    print("실패: API 인증키를 찾지 못했습니다.")
    exit()

url = "https://apis.data.go.kr/1220000/Itemtrade/getItemtradeList"

params = {
    "serviceKey": api_key,
    "strtYymm": "202501",
    "endYymm": "202608",
    "hsSgn": "330499"
}

print("관세청 데이터를 요청합니다...")

response = requests.get(url, params=params, timeout=30)

if response.status_code != 200:
    print("API 호출 실패")
    print(response.text)
    exit()

root = ET.fromstring(response.text)

items = root.findall(".//item")

rows = []

for item in items:

    year = item.findtext("year")
    hs_code = item.findtext("hsCode")
    stat_kor = item.findtext("statKor")
    exp_dlr = item.findtext("expDlr")
    exp_wgt = item.findtext("expWgt")
    imp_dlr = item.findtext("impDlr")
    imp_wgt = item.findtext("impWgt")

    # 총계 행은 제외
    if year == "총계":
        continue

    rows.append([
        year,
        hs_code,
        stat_kor,
        exp_dlr,
        exp_wgt,
        imp_dlr,
        imp_wgt
    ])

# CSV 저장
with open("export_330499.csv", "w", newline="", encoding="utf-8-sig") as f:

    writer = csv.writer(f)

    writer.writerow([
        "월",
        "HS코드",
        "품목명",
        "수출금액_USD",
        "수출중량_KG",
        "수입금액_USD",
        "수입중량_KG"
    ])

    writer.writerows(rows)

print()
print("성공!")
print("export_330499.csv 파일을 만들었습니다.")
print("저장된 데이터 행:", len(rows))
