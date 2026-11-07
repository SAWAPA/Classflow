"""Cognito pre-sign-up trigger for one email = one Classflow account.

Google is trusted as an email verifier in this project. When a verified Google
identity matches an existing local Cognito user, attach the identity to that
local profile before Cognito creates a second federated profile.
"""
import boto3


client = boto3.client('cognito-idp')


def _users_by_email(pool_id, email):
    escaped = email.replace('\\', '\\\\').replace('"', '\\"')
    response = client.list_users(UserPoolId=pool_id, Filter=f'email = "{escaped}"', Limit=60)
    return response.get('Users', [])


def lambda_handler(event, context):
    if event.get('triggerSource') != 'PreSignUp_ExternalProvider':
        return event

    attributes = event.get('request', {}).get('userAttributes', {})
    email = str(attributes.get('email', '')).strip().casefold()
    if not email or str(attributes.get('email_verified', '')).lower() != 'true':
        return event

    username = str(event.get('userName', ''))
    provider, separator, provider_id = username.partition('_')
    if not separator or provider.lower() != 'google' or not provider_id:
        return event

    for existing in _users_by_email(event['userPoolId'], email):
        existing_name = existing.get('Username', '')
        # Do not link a federated profile to itself. Prefer a local profile as
        # the destination so password login and Google login share one user.
        if not existing_name or existing_name.lower().startswith('google_'):
            continue
        client.admin_link_provider_for_user(
            UserPoolId=event['userPoolId'],
            DestinationUser={'ProviderName': 'Cognito', 'ProviderAttributeValue': existing_name},
            SourceUser={'ProviderName': 'Google', 'ProviderAttributeName': 'Cognito_Subject', 'ProviderAttributeValue': provider_id},
        )
        return event
    return event
