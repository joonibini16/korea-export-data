# 해외 리서치 발간 모니터

공개 화면: `global_research.html` / 자료: `global_research.json`.
기존 Work 자동화 ‘해외 리서치 발간 점검’이 매일 한국시간 오전 8시 전후 공식 공개자료를 확인하고 이 JSON을 갱신한다. 단순 링크 확인이나 빈 검색 결과를 전체 리포트 점검 완료로 취급하지 않는다. 정상 갱신은 대화로 따로 알리지 않는다.

## 갱신 절차

1. main의 이 문서·JSON과 최신 SHA를 읽는다. `providers`의 8개 발간사 공식 목록·검색에서 직전 점검 이후 신규 자료를 확인하고 최근 7일도 재검색한다. 유료 원문은 권한을 우회하지 않는다.
2. 발간일은 본문/PDF 기준으로 확인한다. 크롤링일·최초 발견일을 발간일로 쓰지 않는다. 날짜가 모호하면 `published_at: null`, `date_note`로 설명한다. 은행 자체 실적 발표를 해당 은행의 리서치로 오인하지 않는다.
3. 신규 리포트는 `reports`에 추가한다. 동일 발간사+제목+발간일+정규화 출처 URL을 중복 저장하지 않는다. 추적 파라미터·PDF/기사·번역본 중복도 대조한다. 기존 `id`, `first_seen_at`, 과거 정상 기록은 유지한다. 수정이 확인된 기존 자료만 근거를 검증해 갱신한다.
4. 짧은 한국어 재서술로 `headline`(투자 결론), `facts`(원문 사실), `interpretation`(분석자 해석), `estimate_signal`(실적추정 영향), `valuation_change`(목표가/밸류), `tone_change`, `watch`를 채운다. 비교 자료가 없으면 변화 단정을 보류하고 없는 수치·목표가를 만들지 않는다. 전문·도표·유료 PDF를 복제하지 않는다.
5. 발간사별 `checked_at`, `status`, `note`를 실제 확인 범위로 갱신한다. `checked`=설정한 공개 범위 점검 완료, `partial`=일부 목록/본문만 확인, `failed`=점검 실패, `pending`=미점검. 신규 없음과 접근 실패를 구분한다. 기관 고객 전용 전체 자료는 별도다.
6. `last_checked_at` 및 `updated_at`을 실제 점검 UTC ISO 시각으로 갱신한다. `checks`에 실행별 점검 시각·신규 발간 수·추가 등록 수·한계/실패를 추가한다. 신규가 없어도 이 점검 메타데이터는 갱신하고 과거 reports를 지우지 않는다. 최소 최근 90회 점검 이력을 유지한다.
7. `python validate_global_research.py global_research.json`으로 JSON·중복·분류·URL·발간일을 검사한다. 반영 직전 최신 SHA/내용을 다시 읽고 다른 변경과 이력을 보존해서 커밋한다. Pages 성공 후 화면을 검증한다. 점검/게시 실패 시 이전 정상 자료를 보존하고 필요한 조치만 알린다.

## JSON 구조

최상위 `schema_version:1, updated_at, last_checked_at, schedule_note, sectors, providers, reports, checks`를 유지한다.

`reports[]` 필수 항목:
- `id`: 안정적인 고유 문자열. `publisher`: providers의 id.
- `published_at`: YYYY-MM-DD 또는 null. `first_seen_at`, `last_verified_at`: UTC ISO 시각.
- `title`: 원문 제목. `title_ko`: 한국어 제목. `division`: 실제 작성 부서. IB 리서치·AM·CIO·Institute·트레이딩을 구분한다.
- `sectors`: 최상위 sectors 중 1개 이상. 첫 업종이 기본 그룹이다. 증권사에서 쓰는 큰 업종 범주를 유지하고 불필요하게 세분화하지 않는다.
- `companies`: 실제 원문 분석/언급 기업만 `{ticker,name,relationship}`로 기록한다. 미지정은 빈 배열. 발간 은행을 대상 기업으로 잘못 넣거나 임의의 국내 수혜주를 붙이지 않는다.
- `document_type`: research_pdf / research_article / cio_commentary / market_commentary / podcast / media_reference.
- `source_scope`: full_text / official_summary / media_only / listing_only. 소개문만 확인했으면 내용도 그 범위로 제한하고 `coverage_note`에 명시한다.
- `source_url`: 직접 원문 HTTPS URL. 필요하면 landing_url, 비교한 prior_source를 추가한다. 고객/세션 토큰을 URL에 넣지 않는다.
- `headline`, `facts[]`, `interpretation`, `estimate_signal`, `valuation_change`, `tone_change`, `watch[]`, `date_note`.
- `stance`: positive / negative / mixed / neutral / unknown. 이는 분석자 해석이며 증권사의 공식 투자의견 변경과 혼동하지 않는다.
- `initial_archive`: 초기 기존 참고자료에만 true. 새 자료에 false. 오래된 참고자료를 신규 발간으로 세지 않는다.

`providers[]`: id/name/source_url/checked_at/status/note. 현재 GS, MS, JPM, UBS, BofA, Citi, Barclays, DB를 유지한다.
`checks[]`: checked_at/kind/new_publications/added_reports/note. kind는 initial_archive 또는 daily_review.

UI 코드는 텍스트를 DOM textContent로 표시하며, 자료 갱신은 JSON만 변경하면 된다. 정상 운영 중 HTML/공통 메뉴나 다른 대시보드·실적 파일을 수정할 필요가 없다.
