import base64
import json
import logging
import os

from files import S3Files
from service import Classroom, clean
from store import Conflict, DynamoStore

service = None


def claims_user(claims):
    if not claims.get('sub') or claims.get('token_use') != 'id':
        raise PermissionError('กรุณาเข้าสู่ระบบใหม่')
    groups = claims.get('cognito:groups', '')
    if isinstance(groups, str):
        try:
            groups = json.loads(groups)
        except ValueError:
            groups = groups.strip('[]').replace('"', '').split(',')
    return {'id': claims['sub'], 'name': claims.get('name') or claims.get('email', 'สมาชิก'),
            'email': claims.get('email', ''), 'role': 'teacher' if 'teachers' in groups else 'student'}


def lambda_handler(event, context):
    global service
    status = 200
    try:
        claims = event.get('requestContext', {}).get('authorizer', {}).get('jwt', {}).get('claims', {})
        user = claims_user(claims)
        raw = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw).decode('utf-8')
        if len(raw.encode()) > 250000:
            raise ValueError('ข้อมูลคำขอใหญ่เกินไป')
        body = json.loads(raw)
        if service is None:
            service = Classroom(DynamoStore(), S3Files())
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
