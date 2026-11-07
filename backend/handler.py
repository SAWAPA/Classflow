import base64
import json
import logging
import os

from files import S3Files
from service import Classroom, clean
from store import Conflict, DynamoStore

service = None


def _groups_from_claims(claims):
    groups = claims.get('cognito:groups', '')
    if isinstance(groups, str):
        try:
            groups = json.loads(groups)
        except ValueError:
            groups = groups.strip('[]').replace('"', '').split(',')
    return {str(group).strip() for group in groups if str(group).strip()}


def _role_from_groups(groups):
    return 'admin' if 'admins' in groups else 'teacher' if 'teachers' in groups else 'student'


def claims_user(claims, directory=None):
    if not claims.get('sub') or claims.get('token_use') != 'id':
        raise PermissionError('กรุณาเข้าสู่ระบบใหม่')
    groups = _groups_from_claims(claims)
    username = claims.get('cognito:username') or claims.get('username') or claims.get('email')
    if directory and username:
        try:
            # Cognito group membership is the source of truth. This also fixes
            # sessions whose token was issued before a role was changed.
            groups.update(directory.groups_for_user(username))
        except Exception:
            logging.exception('cognito_group_lookup_failed')
    role = _role_from_groups(groups)
    return {'id': claims['sub'], 'name': claims.get('name') or claims.get('email', 'สมาชิก'),
            'email': claims.get('email', ''), 'role': role}


class CognitoDirectory:
    """Least-privilege Cognito user management used only after admin authorization."""
    def __init__(self):
        import boto3
        self.pool_id = os.environ['USER_POOL_ID']
        self.client = boto3.client('cognito-idp')

    def groups_for_user(self, username):
        return {g['GroupName'] for g in self.client.admin_list_groups_for_user(
            UserPoolId=self.pool_id, Username=username).get('Groups', [])}

    def _user(self, item):
        attributes = {a['Name']: a['Value'] for a in item.get('Attributes', [])}
        username = item['Username']
        groups = self.groups_for_user(username)
        role = _role_from_groups(groups)
        return {'id': username, 'email': attributes.get('email', username), 'name': attributes.get('name', attributes.get('email', username)),
                'role': role, 'status': item.get('UserStatus', 'UNKNOWN'), 'enabled': item.get('Enabled', True), 'createdAt': item.get('UserCreateDate').isoformat() if item.get('UserCreateDate') else None}

    def list_users(self):
        users, token = [], None
        while True:
            request = {'UserPoolId': self.pool_id, 'Limit': 60}
            if token:
                request['PaginationToken'] = token
            response = self.client.list_users(**request)
            users.extend(self._user(item) for item in response.get('Users', []))
            token = response.get('PaginationToken')
            if not token:
                return sorted(users, key=lambda user: (user['role'] != 'admin', user['name'].lower()))

    def create_user(self, email, name, password, role):
        self.client.admin_create_user(UserPoolId=self.pool_id, Username=email,
            UserAttributes=[{'Name': 'email', 'Value': email}, {'Name': 'email_verified', 'Value': 'true'}, {'Name': 'name', 'Value': name}],
            MessageAction='SUPPRESS')
        self.client.admin_set_user_password(UserPoolId=self.pool_id, Username=email, Password=password, Permanent=True)
        group = {'admin': 'admins', 'teacher': 'teachers'}.get(role)
        if group:
            self.client.admin_add_user_to_group(UserPoolId=self.pool_id, Username=email, GroupName=group)
        response = self.client.admin_get_user(UserPoolId=self.pool_id, Username=email)
        return self._user(response)

    def set_role(self, user_id, role):
        group = {'admin': 'admins', 'teacher': 'teachers'}.get(role)
        current = self.groups_for_user(user_id)
        for candidate in ('admins', 'teachers'):
            if candidate != group and candidate in current:
                self.client.admin_remove_user_from_group(UserPoolId=self.pool_id, Username=user_id, GroupName=candidate)
        if group and group not in current:
            self.client.admin_add_user_to_group(UserPoolId=self.pool_id, Username=user_id, GroupName=group)
        return self._user(self.client.admin_get_user(UserPoolId=self.pool_id, Username=user_id))


def lambda_handler(event, context):
    global service
    status = 200
    try:
        claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
        if service is None:
            service = Classroom(DynamoStore(), S3Files(), CognitoDirectory())
        user = claims_user(claims, service.directory)
        raw = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw).decode('utf-8')
        if len(raw.encode()) > 250000:
            raise ValueError('ข้อมูลคำขอใหญ่เกินไป')
        body = json.loads(raw)
        result = {'data': clean(service.run(user, body.get('action'), body.get('data') or {}))}
    except PermissionError as error:
        status, result = 403, {'error': str(error)}
    except Conflict as error:
        status, result = 409, {'error': str(error)}
    except (ValueError, TypeError, KeyError, OverflowError) as error:
        status, result = 400, {'error': str(error)}
    except Exception:
        logging.exception('classroom_request_failed')
        status, result = 500, {'error': 'ระบบขัดข้องชั่วคราว กรุณาลองใหม่'}
    return {'statusCode': status, 'headers': {'Content-Type': 'application/json', 'Cache-Control': 'no-store'},
            'body': json.dumps(result, ensure_ascii=False, allow_nan=False)}
