"""Bounded, unauthenticated connection checks. Never reads/writes trade CSVs."""
import json
import os
import re
import socket
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

import requests

HOST = 'apis.data.go.kr'
ENDPOINTS = {
    'item': '/1220000/Itemtrade/getItemtradeList',
    'country': '/1220000/nitemtrade/getNitemtradeList',
}


def probe_api(scheme, endpoint, session):
    """An HTTP error is useful here: it proves the connection was established."""
    started = time.monotonic()
    result = {'scheme': scheme, 'endpoint': endpoint, 'reachable': False}
    try:
        # No API key, auth header or user input. Do not follow redirects to an
        # unverified host or downgrade a TLS connection.
        with session.get(f'{scheme}://{HOST}{ENDPOINTS[endpoint]}',
                         timeout=(10, 15), allow_redirects=False, stream=True) as response:
            result.update(reachable=True, http_status=response.status_code)
            if 300 <= response.status_code < 400:
                target = urlsplit(response.headers.get('Location', ''))
                result['redirect_scheme'] = target.scheme
                result['redirect_host'] = target.hostname
            else:
                payload = bytearray()
                for chunk in response.iter_content(chunk_size=4096):
                    payload.extend(chunk)
                    if len(payload) >= 65536:
                        break
                try:
                    root = ET.fromstring(payload)
                except ET.ParseError:
                    result['xml'] = False
                else:
                    result['xml'] = True
                    for node in root.iter():
                        tag = node.tag.split('}')[-1]
                        if tag in ('resultCode', 'returnReasonCode'):
                            code = (node.text or '').strip()
                            if re.fullmatch(r'[A-Za-z0-9_]{1,32}', code):
                                result['api_code'] = code
    except requests.exceptions.RequestException as exc:
        # Exception messages may contain proxy credentials. Only log the type.
        result['error'] = type(exc).__name__
    result['seconds'] = round(time.monotonic() - started, 2)
    return result


def probe_tcp(address, port):
    started = time.monotonic()
    result = {'address': address, 'port': port, 'connected': False}
    try:
        with socket.create_connection((address, port), timeout=5):
            result['connected'] = True
    except OSError as exc:
        result['error'] = type(exc).__name__
    result['seconds'] = round(time.monotonic() - started, 2)
    return result


def main():
    report = {'utc': datetime.now(timezone.utc).isoformat(),
              'host': HOST, 'authenticated': False,
              'proxy_configured': any(os.environ.get(k) for k in
                                      ('http_proxy', 'https_proxy', 'HTTP_PROXY', 'HTTPS_PROXY')),
              'dns': [], 'tcp': [], 'api': []}
    try:
        addresses = socket.getaddrinfo(HOST, None, type=socket.SOCK_STREAM)
        report['dns'] = sorted({entry[4][0] for entry in addresses})
    except OSError as exc:
        report['dns_error'] = type(exc).__name__
    print('DNS:', report['dns'], 'error:', report.get('dns_error', '-'), flush=True)
    # Bound direct TCP checks to two addresses; API requests use normal DNS and
    # proxy behavior, just like the collectors.
    for address in report['dns'][:2]:
        for port in (80, 443):
            result = probe_tcp(address, port)
            report['tcp'].append(result)
            print('TCP:', json.dumps(result), flush=True)
    with requests.Session() as session:
        for scheme in ('http', 'https'):
            for endpoint in ENDPOINTS:
                result = probe_api(scheme, endpoint, session)
                report['api'].append(result)
                print('API:', json.dumps(result), flush=True)
    Path('connection-diagnostics.json').write_text(json.dumps(report, indent=2) + '\n')
    summary = ['## 관세청 연결 진단', '',
               '인증키 없는 연결 검사입니다. 401/403 또는 인증 오류 XML도 서버에 도달했다는 증거이며, 수집 성공을 뜻하지 않습니다.', '',
               '| Protocol | API | HTTP | Error | Seconds |',
               '|---|---|---|---|---|']
    for row in report['api']:
        summary.append(f"| {row['scheme']} | {row['endpoint']} | {row.get('http_status', '-')} | "
                       f"{row.get('error', '-')} | {row['seconds']} |")
    summary.extend(['', 'CSV는 읽거나 변경하지 않았습니다. DNS/TCP 상세는 로그와 artifact를 확인하세요.'])
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with open(os.environ['GITHUB_STEP_SUMMARY'], 'a', encoding='utf-8') as stream:
            stream.write('\n'.join(summary) + '\n')
    # Judge only HTTPS connectivity. API authorization/data are not tested.
    return 0 if all(row['reachable'] and 'error' not in row
                    for row in report['api'] if row['scheme'] == 'https') else 1


if __name__ == '__main__':
    raise SystemExit(main())
