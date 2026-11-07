"""CloudFormation-only deployment helper. No public endpoint or classroom data access."""
import base64
import io
import json
import logging
import mimetypes
import urllib.request
import zipfile


def lambda_handler(event, context):
    properties = event['ResourceProperties']
    physical = event.get('PhysicalResourceId') or properties['Bucket'] + '-site-assets'
    status, reason = 'SUCCESS', 'Frontend deployment completed'
    try:
        if event['RequestType'] != 'Delete':
            import boto3
            s3 = boto3.client('s3')
            bundle = zipfile.ZipFile(io.BytesIO(base64.b64decode(properties['Bundle'])))
            entries = [entry for entry in bundle.infolist() if not entry.is_dir() and entry.filename != 'config.js']
            # Hashed assets first; runtime config and index last. Old assets remain valid for older cached pages.
            entries.sort(key=lambda entry: entry.filename == 'index.html')
            for entry in entries:
                key = entry.filename
                if key.startswith('/') or '..' in key.split('/'):
                    raise ValueError('Invalid asset key')
                if key == 'index.html':
                    s3.put_object(Bucket=properties['Bucket'], Key='config.js', Body=('window.__CLASSROOM_CONFIG__ = ' + json.dumps(properties['Config']) + ';\n').encode(), ContentType='text/javascript', CacheControl='no-cache')
                mime = {'.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html'}.get('.' + key.rsplit('.', 1)[-1]) or mimetypes.guess_type(key)[0] or 'application/octet-stream'
                s3.put_object(Bucket=properties['Bucket'], Key=key, Body=bundle.read(entry), ContentType=mime,
                              CacheControl='no-cache' if key == 'index.html' else 'public,max-age=31536000,immutable')
            boto3.client('cloudfront').create_invalidation(DistributionId=properties['Distribution'],
                InvalidationBatch={'Paths': {'Quantity': 2, 'Items': ['/index.html', '/config.js']}, 'CallerReference': event['RequestId']})
    except Exception as error:
        logging.exception('asset_deployment_failed')
        status, reason = 'FAILED', type(error).__name__ + ': ' + str(error)[:600]
    response = {'Status': status, 'Reason': reason, 'PhysicalResourceId': physical,
                'StackId': event['StackId'], 'RequestId': event['RequestId'], 'LogicalResourceId': event['LogicalResourceId']}
    request = urllib.request.Request(event['ResponseURL'], data=json.dumps(response).encode(), headers={'Content-Type': ''}, method='PUT')
    with urllib.request.urlopen(request, timeout=20) as result:
        result.read()
