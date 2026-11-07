"""Retire ONLY the old, known auction stack. Dry-run by default; never touches Classroom."""
import argparse
import json

ACCOUNT = '778655339518'
STACK = 'arn:aws:cloudformation:ap-southeast-2:778655339518:stack/live-auction-platform/13052170-c651-11f1-b396-0affe2c5d99b'
REGION = 'ap-southeast-2'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--delete-known-auction-stack', action='store_true', help='Permanently delete old auction users, bids, tables, static website and stack')
    args = parser.parse_args()
    import boto3
    session = boto3.Session(region_name=REGION)
    if session.client('sts').get_caller_identity()['Account'] != ACCOUNT:
        raise SystemExit('Wrong AWS account. No changes made.')
    cf = session.client('cloudformation')
    stack = cf.describe_stacks(StackName=STACK)['Stacks'][0]
    resources = []
    for page in cf.get_paginator('list_stack_resources').paginate(StackName=STACK):
        resources.extend(page['StackResourceSummaries'])
    print(json.dumps([{'logicalId': r['LogicalResourceId'], 'type': r['ResourceType'], 'id': r.get('PhysicalResourceId')} for r in resources], indent=2))
    if not args.delete_known_auction_stack:
        print('DRY RUN ONLY. Nothing deleted. Use --delete-known-auction-stack after reviewing this exact list.')
        return
    print('Deleting the old auction only. Local source backup remains in legacy/live-auction-2026-11-07.zip', flush=True)
    # All bucket and schedule targets are obtained from the exact validated stack.
    for resource in resources:
        if resource['ResourceType'] == 'AWS::Events::Rule':
            session.client('events').disable_rule(Name=resource['PhysicalResourceId'])
        if resource['ResourceType'] == 'AWS::S3::Bucket':
            s3 = session.resource('s3')
            bucket = s3.Bucket(resource['PhysicalResourceId'])
            bucket.object_versions.delete()
            bucket.objects.delete()
    cf.delete_stack(StackName=STACK)
    cf.get_waiter('stack_delete_complete').wait(StackName=STACK)
    # Lambda-created log groups are outside the original template; remove only exact function names from its resource list.
    logs = session.client('logs')
    for resource in resources:
        if resource['ResourceType'] == 'AWS::Lambda::Function':
            name = '/aws/lambda/' + resource['PhysicalResourceId']
            try:
                logs.delete_log_group(logGroupName=name)
            except logs.exceptions.ResourceNotFoundException:
                pass
    print('Confirmed: old auction stack deleted. Data and users on AWS are not recoverable from the local code archive.')


if __name__ == '__main__': main()
