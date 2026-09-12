import os

api_key = os.environ.get("CUSTOMS_API_KEY")

if api_key:
    print("성공: 관세청 API 인증키를 GitHub에서 읽었습니다.")
    print("인증키 길이:", len(api_key))
else:
    print("실패: 인증키를 찾지 못했습니다.")
