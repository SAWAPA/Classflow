import argparse
import json
import mimetypes
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parent.parent


def publish(session, outputs):
    config = {'region': outputs['Region'], 'userPoolId': outputs['UserPoolId'], 'clientId': outputs['ClientId'], 'apiUrl': outputs['ApiUrl']}
    (ROOT / 'frontend/public/config.js').write_text('window.__CLASSROOM_CONFIG__ = ' + json.dumps(config) + ';\n', encoding='utf-8')
    import shutil
    npm = shutil.which('npm.cmd') or shutil.which('npm')
    subprocess.run([npm, 'run', 'build'], cwd=ROOT / 'frontend', check=True)
    s3 = session.client('s3')
    dist = ROOT / 'frontend/dist'
    # Upload hashed assets first and the entry point last.
    paths = sorted((p for p in dist.rglob('*') if p.is_file()), key=lambda p: p.name == 'index.html')
    for path in paths:
        key = path.relative_to(dist).as_posix()
        mime = {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html'}.get(path.suffix) or mimetypes.guess_type(key)[0] or 'application/octet-stream'
        cache = 'no-cache' if key in ('index.html', 'config.js') else 'public,max-age=31536000,immutable'
        s3.upload_file(str(path), outputs['FrontendBucket'], key, ExtraArgs={'ContentType': mime, 'CacheControl': cache})
    session.client('cloudfront').create_invalidation(DistributionId=outputs['DistributionId'], InvalidationBatch={'Paths': {'Quantity': 2, 'Items': ['/index.html', '/config.js']}, 'CallerReference': str(time.time_ns())})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--stack', default='classflow-classroom')
    parser.add_argument('--region', default='ap-southeast-2')
    parser.add_argument('--allow-account', required=True)
    args = parser.parse_args()
    import boto3
    session = boto3.Session(region_name=args.region)
    if session.client('sts').get_caller_identity()['Account'] != args.allow_account:
        raise SystemExit('Wrong AWS account; no files uploaded.')
    outputs = {v['OutputKey']: v['OutputValue'] for v in session.client('cloudformation').describe_stacks(StackName=args.stack)['Stacks'][0]['Outputs']}
    publish(session, outputs)
    print(outputs['WebsiteUrl'])
