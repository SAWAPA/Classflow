"""Deploy a new classroom stack. Requires boto3 and an existing AWS credential session."""
import argparse
import json
import mimetypes
from pathlib import Path
import subprocess
import sys
import time
import hashlib
from package import package

ROOT = Path(__file__).resolve().parent.parent


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--stack', default='classflow')
    parser.add_argument('--region', default='ap-southeast-2')
    parser.add_argument('--teacher-email', help='Existing confirmed user in the NEW pool to add to teachers')
    parser.add_argument('--allow-account', required=True, help='Exact AWS account ID to deploy into')
    parser.add_argument('--template-bucket', default='cf-templates-182bnrzbk7b6f-ap-southeast-2', help='Existing CloudFormation template bucket in the same account')
    args = parser.parse_args()
    import boto3
    from botocore.exceptions import ClientError
    session = boto3.Session(region_name=args.region)
    account = session.client('sts').get_caller_identity()['Account']
    if account != args.allow_account:
        raise SystemExit('Wrong AWS account; no changes made.')
    template_path = package()
    cf = session.client('cloudformation')
    template = template_path.read_text(encoding='utf-8')
    request = dict(StackName=args.stack, Capabilities=['CAPABILITY_IAM'], Tags=[{'Key': 'Project', 'Value': 'Classflow'}])
    if len(template.encode()) <= 51200:
        request['TemplateBody'] = template
    else:
        s3 = session.client('s3')
        s3.head_bucket(Bucket=args.template_bucket, ExpectedBucketOwner=account)
        key = 'classflow-templates/' + hashlib.sha256(template.encode()).hexdigest() + '.json'
        s3.put_object(Bucket=args.template_bucket, Key=key, Body=template.encode(), ContentType='application/json', ServerSideEncryption='AES256', ExpectedBucketOwner=account)
        request['TemplateURL'] = s3.generate_presigned_url('get_object', Params={'Bucket': args.template_bucket, 'Key': key}, ExpiresIn=3600)
    try:
        cf.describe_stacks(StackName=args.stack)
        try:
            cf.update_stack(**request)
            waiter = 'stack_update_complete'
        except ClientError as error:
            if 'No updates are to be performed' not in str(error): raise
            waiter = None
    except ClientError as error:
        if 'does not exist' not in str(error): raise
        cf.create_stack(**request)
        waiter = 'stack_create_complete'
    if waiter:
        print('AWS is deploying the stack. This may take several minutes.', flush=True)
        cf.get_waiter(waiter).wait(StackName=args.stack)
    outputs = {v['OutputKey']: v['OutputValue'] for v in cf.describe_stacks(StackName=args.stack)['Stacks'][0]['Outputs']}
    config = {'region': outputs['Region'], 'userPoolId': outputs['UserPoolId'], 'clientId': outputs['ClientId'], 'apiUrl': outputs['ApiUrl']}
    (ROOT / 'frontend/public/config.js').write_text('window.__CLASSROOM_CONFIG__ = ' + json.dumps(config) + ';\n', encoding='utf-8')
    if args.teacher_email:
        session.client('cognito-idp').admin_add_user_to_group(UserPoolId=outputs['UserPoolId'], Username=args.teacher_email, GroupName='teachers')
        print('Teacher role granted. Sign out and sign back in for the new token.')
    print('Website:', outputs['WebsiteUrl'])


if __name__ == '__main__': main()

