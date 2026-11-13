import json
import unittest
from unittest.mock import Mock, patch

import cognito_trigger
from handler import CognitoDirectory, claims_user


def user(username='native-id', email='person@gmail.com', verified='true'):
    return {'Username': username, 'Enabled': True, 'Attributes': [
        {'Name': 'email', 'Value': email}, {'Name': 'email_verified', 'Value': verified},
        {'Name': 'sub', 'Value': 'original-sub'}, {'Name': 'name', 'Value': 'Original'},
    ]}


class AuthTests(unittest.TestCase):
    def setUp(self):
        self.client = Mock()
        self.client.list_users.return_value = {'Users': [user()]}
        self.patcher = patch.object(cognito_trigger, 'client', self.client)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)

    def event(self, trigger='PreSignUp_ExternalProvider', verified='true'):
        return {'triggerSource': trigger, 'userPoolId': 'pool', 'userName': 'Google_123',
                'request': {'userAttributes': {'email': 'PERSON@gmail.com', 'email_verified': verified}}, 'response': {}}

    def test_verified_google_links_to_original_profile(self):
        event = self.event()
        self.assertIs(cognito_trigger.lambda_handler(event, None), event)
        self.client.admin_link_provider_for_user.assert_called_once_with(
            UserPoolId='pool', DestinationUser={'ProviderName': 'Cognito', 'ProviderAttributeValue': 'native-id'},
            SourceUser={'ProviderName': 'Google', 'ProviderAttributeName': 'Cognito_Subject', 'ProviderAttributeValue': '123'})

    def test_existing_google_email_blocks_new_password_or_admin_signup(self):
        self.client.list_users.return_value = {'Users': [user('Google_123', 'Person@gmail.com')]}
        for trigger in ('PreSignUp_SignUp', 'PreSignUp_AdminCreateUser'):
            with self.subTest(trigger=trigger), self.assertRaises(ValueError):
                cognito_trigger.lambda_handler(self.event(trigger), None)
        self.client.admin_link_provider_for_user.assert_not_called()

    def test_unverified_email_cannot_link(self):
        with self.assertRaises(ValueError):
            cognito_trigger.lambda_handler(self.event(verified='false'), None)
        self.client.list_users.return_value = {'Users': [user(verified='false')]}
        with self.assertRaises(ValueError):
            cognito_trigger.lambda_handler(self.event(), None)
        self.client.admin_link_provider_for_user.assert_not_called()

    def test_role_demotion_takes_effect_with_old_admin_token(self):
        directory = Mock()
        directory.resolve_user.return_value = {'sub': 'sub', 'enabled': True, 'role': 'student', 'email': 'p@gmail.com', 'name': 'P'}
        result = claims_user({'sub': 'sub', 'token_use': 'id', 'cognito:username': 'native-id', 'cognito:groups': '["admins"]'}, directory)
        self.assertEqual(result['role'], 'student')
        directory.resolve_user.assert_called_once_with('native-id')

    def test_deleted_duplicate_token_is_rejected(self):
        directory = Mock()
        directory.resolve_user.side_effect = RuntimeError('User no longer exists')
        with self.assertLogs(level='ERROR'), self.assertRaises(PermissionError):
            claims_user({'sub': 'removed-sub', 'token_use': 'id', 'cognito:username': 'Google_123'}, directory)

    def test_admin_user_serializes_attributes_and_groups(self):
        directory = CognitoDirectory.__new__(CognitoDirectory)
        directory.pool_id, directory.client = 'pool', self.client
        self.client.admin_list_groups_for_user.return_value = {'Groups': [{'GroupName': 'teachers'}]}
        item = user()
        item['UserAttributes'] = item.pop('Attributes')
        result = directory._user(item)
        self.assertEqual(result['email'], 'person@gmail.com')
        self.assertEqual(result['sub'], 'original-sub')
        json.dumps(result)


if __name__ == '__main__': unittest.main()
