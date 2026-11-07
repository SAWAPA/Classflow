"""Read-only deployment smoke checks. Never sends credentials or student data."""
import json
import os
import re
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SITE = 'https://d1zs85ifsfqc1o.cloudfront.net'
API = 'https://yjursns496.execute-api.ap-southeast-2.amazonaws.com'
BUCKET = os.environ.get('CLASSFLOW_FRONTEND_BUCKET')


def request(url, data=None, method='GET', headers=None):
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        response = urllib.request.urlopen(req, timeout=25)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, dict(response.headers), response.read()


def main():
    assert BUCKET, 'Set CLASSFLOW_FRONTEND_BUCKET to the deployed frontend bucket before running this check'
    results = []
    status, headers, body = request(SITE + '/')
    assert status == 200 and b'Classflow' in body, 'Website unavailable'
    headers = {key.lower(): value for key, value in headers.items()}
    assert headers.get('strict-transport-security'), 'HSTS missing'
    assert headers.get('content-security-policy'), 'CSP missing'
    results.append({'check': 'HTTPS website with security headers', 'status': status})
    assets = re.findall(rb'(?:src|href)="(/assets/[^"]+)"', body)
    assert assets, 'No production assets'
    for asset in assets:
        status, _, payload = request(SITE + asset.decode())
        assert status == 200 and len(payload) > 100, 'Asset unavailable'
    results.append({'check': 'Production JS/CSS assets', 'count': len(assets), 'status': 200})
    status, _, config = request(SITE + '/config.js')
    settings = json.loads(config.decode().split('=', 1)[1].strip().rstrip(';'))
    assert status == 200 and settings['apiUrl'] == API
    assert settings['userPoolId'] == 'ap-southeast-2_A1kaEt9gI'
    assert settings['clientId'] == '3n7hbtopqcpj4jogchgi5hq5s'
    results.append({'check': 'Runtime config matches CloudFormation Outputs', 'status': status})
    status, _, _ = request(API + '/rpc', b'{"action":"bootstrap"}', 'POST', {'Content-Type': 'application/json'})
    assert status == 401, 'Unauthenticated API access must be rejected'
    results.append({'check': 'Unauthenticated API rejected', 'status': status})
    status, _, _ = request(f'https://{BUCKET}.s3.ap-southeast-2.amazonaws.com/index.html')
    assert status == 403, 'Private frontend origin must reject public direct access'
    results.append({'check': 'Private S3 direct access rejected', 'status': status})
    path = ROOT / 'build/qa/aws-public-checks.json'
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(results, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
