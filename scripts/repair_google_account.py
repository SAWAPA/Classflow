"""Inspect, back up and replace one empty duplicate Google profile with a link.

Defaults to read-only. An explicit email, AWS account and --apply are required
for deletion. Any Classflow data referring to the duplicate blocks deletion.
"""
import argparse
import json
from pathlib import Path


def attributes(user):
    return {a['Name']: a['Value'] for a in user.get('UserAttributes', user.get('Attributes', []))}


def inspect(session, stack, email):
    outputs = {o['OutputKey']: o['OutputValue'] for o in session.client('cloudformation').describe_stacks(StackName=stack)['Stacks'][0]['Outputs']}
    pool = outputs['UserPoolId']
    cognito = session.client('cognito-idp')
    users = []
    for page in cognito.get_paginator('list_users').paginate(UserPoolId=pool):
        users.extend(u for u in page.get('Users', []) if attributes(u).get('email', '').strip().casefold() == email)
    native = [u for u in users if not u['Username'].lower().startswith('google_')]
    google = [u for u in users if u['Username'].lower().startswith('google_')]
    report = {'pool': pool, 'email': email, 'users': users, 'duplicateCount': len(google), 'references': []}
    if len(native) != 1 or len(google) > 1:
        raise ValueError('Expected exactly one native profile and at most one Google duplicate.')
    target = native[0]
    if attributes(target).get('email_verified') != 'true' or not target.get('Enabled', True):
        raise ValueError('The destination account must be enabled and email-verified.')
    for user in users:
        user['Groups'] = cognito.admin_list_groups_for_user(UserPoolId=pool, Username=user['Username']).get('Groups', [])
    if google:
        source = google[0]
        if attributes(source).get('email_verified') != 'true':
            raise ValueError('The Google email is not verified.')
        subject = attributes(source).get('sub')
        if not subject:
            raise ValueError('Duplicate has no sub.')
        dynamo = session.client('dynamodb')
        for page in dynamo.get_paginator('scan').paginate(
            TableName=outputs['TableName'], ConsistentRead=True,
            FilterExpression='contains(PK, :id) OR contains(SK, :id) OR contains(#data, :id)',
            ExpressionAttributeNames={'#data': 'data'}, ExpressionAttributeValues={':id': {'S': subject}},
        ):
            report['references'].extend(page.get('Items', []))
    return report, cognito, target, google


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--email', required=True)
    parser.add_argument('--allow-account', required=True)
    parser.add_argument('--region', default='ap-southeast-2')
    parser.add_argument('--stack', default='classflow-classroom')
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    import boto3
    session = boto3.Session(region_name=args.region)
    if session.client('sts').get_caller_identity()['Account'] != args.allow_account:
        raise SystemExit('Wrong AWS account; no changes made.')
    email = args.email.strip().casefold()
    report, cognito, target, google = inspect(session, args.stack, email)
    backup = Path('.local/account-repair-backup.json')
    backup.parent.mkdir(parents=True, exist_ok=True)
    backup.write_text(json.dumps(report, default=str, ensure_ascii=False, indent=2), encoding='utf-8')
    print('Profiles:', len(report['users']), '| Google duplicates:', len(google), '| data references:', len(report['references']))
    for user in report['users']:
        print('Profile:', user['Username'], '| status:', user.get('UserStatus'), '| groups:', [g['GroupName'] for g in user['Groups']])
    if not google:
        print('Already consolidated; nothing to delete.')
        return
    if report['references']:
        raise SystemExit('Duplicate owns Classflow data. No deletion performed; migrate the data first.')
    source = google[0]
    identities = json.loads(attributes(source).get('identities', '[]'))
    identity = next((i for i in identities if i.get('providerName') == 'Google'), None)
    if not identity or not identity.get('userId'):
        raise SystemExit('No trusted Google identity to link. No deletion performed.')
    print('Destination:', target['Username'], '| ready:', True, '| apply:', args.apply)
    if not args.apply:
        return
    pool = report['pool']
    # Preserve both existing sets of groups; no password or application data changes.
    target_groups = {g['GroupName'] for g in target['Groups']}
    for group in source['Groups']:
        if group['GroupName'] not in target_groups:
            cognito.admin_add_user_to_group(UserPoolId=pool, Username=target['Username'], GroupName=group['GroupName'])
    cognito.admin_delete_user(UserPoolId=pool, Username=source['Username'])
    cognito.admin_link_provider_for_user(
        UserPoolId=pool,
        DestinationUser={'ProviderName': 'Cognito', 'ProviderAttributeValue': target['Username']},
        SourceUser={'ProviderName': 'Google', 'ProviderAttributeName': 'Cognito_Subject', 'ProviderAttributeValue': identity['userId']},
    )
    linked = cognito.admin_get_user(UserPoolId=pool, Username=target['Username'])
    linked_ids = json.loads(attributes(linked).get('identities', '[]'))
    assert any(i.get('providerName') == 'Google' and i.get('userId') == identity['userId'] for i in linked_ids)
    assert attributes(linked)['sub'] == attributes(target)['sub']
    print('SUCCESS: duplicate deleted; Google linked to original account. Original sub and data preserved.')


if __name__ == '__main__':
    main()
