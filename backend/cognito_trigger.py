"""Cognito pre-sign-up trigger for one email = one Classflow account.

Google is trusted as an email verifier in this project. When a verified Google
identity matches an existing local Cognito user, attach the identity to that
local profile before Cognito creates a second federated profile.
"""
client = None


def _users_by_email(pool_id, email):
    # This existing pool is case-sensitive; ListUsers' email filter is too.
    # Normalize explicitly so legacy mixed-case addresses cannot create duplicates.
    request = {'UserPoolId': pool_id, 'Limit': 60}
    matches = []
    while True:
        response = client.list_users(**request)
        for user in response.get('Users', []):
            attributes = {a['Name']: a['Value'] for a in user.get('Attributes', [])}
            if str(attributes.get('email', '')).strip().casefold() == email:
                matches.append((user, attributes))
        if not response.get('PaginationToken'):
            return matches
        request['PaginationToken'] = response['PaginationToken']


def lambda_handler(event, context):
    global client
    if client is None:
        import boto3
        client = boto3.client('cognito-idp')
    attributes = event.get('request', {}).get('userAttributes', {})
    email = str(attributes.get('email', '')).strip().casefold()
    if not email:
        return event
    matches = _users_by_email(event['userPoolId'], email)
    if event.get('triggerSource') in ('PreSignUp_SignUp', 'PreSignUp_AdminCreateUser'):
        if matches:
            raise ValueError('อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบด้วยวิธีที่เคยสมัคร')
        return event
    if event.get('triggerSource') != 'PreSignUp_ExternalProvider':
        return event

    username = str(event.get('userName', ''))
    provider, separator, provider_id = username.partition('_')
    if not separator or provider.lower() != 'google' or not provider_id:
        return event
    if str(attributes.get('email_verified', '')).lower() != 'true':
        raise ValueError('กรุณายืนยันอีเมลกับ Google ก่อนเข้าสู่ระบบ')

    for existing, existing_attributes in matches:
        existing_name = existing.get('Username', '')
        # Do not link a federated profile to itself. Prefer a local profile as
        # the destination so password login and Google login share one user.
        if not existing_name or existing_name.lower().startswith('google_'):
            continue
        if not existing.get('Enabled', True) or existing_attributes.get('email_verified') != 'true':
            raise ValueError('กรุณายืนยันบัญชีอีเมลเดิมก่อนเชื่อม Google')
        client.admin_link_provider_for_user(
            UserPoolId=event['userPoolId'],
            DestinationUser={'ProviderName': 'Cognito', 'ProviderAttributeValue': existing_name},
            SourceUser={'ProviderName': 'Google', 'ProviderAttributeName': 'Cognito_Subject', 'ProviderAttributeValue': provider_id},
        )
        return event
    return event
