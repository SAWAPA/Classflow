import json
import os
import sqlite3
from contextlib import contextmanager


class Conflict(ValueError):
    pass


class LocalStore:
    def __init__(self, path):
        self.path = str(path)
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS records (pk TEXT, sk TEXT, data TEXT, version INTEGER, PRIMARY KEY(pk,sk))')

    @contextmanager
    def connect(self):
        connection = sqlite3.connect(self.path, timeout=15)
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def get(self, pk, sk):
        with self.connect() as db:
            row = db.execute('SELECT data,version FROM records WHERE pk=? AND sk=?', (pk, sk)).fetchone()
        return ({**json.loads(row[0]), '_version': row[1]} if row else None)

    def list(self, pk, prefix=''):
        with self.connect() as db:
            rows = db.execute('SELECT data,version FROM records WHERE pk=? AND substr(sk,1,?)=? ORDER BY sk', (pk, len(prefix), prefix)).fetchall()
        return [{**json.loads(row[0]), '_version': row[1]} for row in rows]

    def put(self, pk, sk, data, expected=None):
        content = {k: v for k, v in data.items() if k != '_version'}
        with self.connect() as db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT version FROM records WHERE pk=? AND sk=?', (pk, sk)).fetchone()
            version = prior[0] if prior else 0
            if expected is not None and version != expected:
                raise Conflict('ข้อมูลถูกแก้ไขแล้ว กรุณารีเฟรชและลองใหม่')
            db.execute('INSERT OR REPLACE INTO records VALUES(?,?,?,?)', (pk, sk, json.dumps(content, ensure_ascii=False), version + 1))
        return {**content, '_version': version + 1}


class DynamoStore:
    def __init__(self):
        import boto3
        self.client = boto3.client('dynamodb')
        self.table = os.environ['TABLE_NAME']

    @staticmethod
    def unpack(item):
        return {**json.loads(item['data']['S']), '_version': int(item['version']['N'])}

    def get(self, pk, sk):
        response = self.client.get_item(TableName=self.table, Key={'PK': {'S': pk}, 'SK': {'S': sk}}, ConsistentRead=True)
        return self.unpack(response['Item']) if 'Item' in response else None

    def list(self, pk, prefix=''):
        params = dict(TableName=self.table, KeyConditionExpression='PK = :pk AND begins_with(SK, :prefix)',
                      ExpressionAttributeValues={':pk': {'S': pk}, ':prefix': {'S': prefix}}, ConsistentRead=True)
        items = []
        while True:
            response = self.client.query(**params)
            items.extend(self.unpack(item) for item in response['Items'])
            if 'LastEvaluatedKey' not in response:
                break
            params['ExclusiveStartKey'] = response['LastEvaluatedKey']
        return items

    def put(self, pk, sk, data, expected=None):
        content = {k: v for k, v in data.items() if k != '_version'}
        version = expected if expected is not None else (self.get(pk, sk) or {}).get('_version', 0)
        params = dict(TableName=self.table, Item={'PK': {'S': pk}, 'SK': {'S': sk},
                      'data': {'S': json.dumps(content, ensure_ascii=False, allow_nan=False)}, 'version': {'N': str(version + 1)}})
        params['ConditionExpression'] = 'attribute_not_exists(PK)' if version == 0 else '#v = :v'
        if version:
            params.update(ExpressionAttributeNames={'#v': 'version'}, ExpressionAttributeValues={':v': {'N': str(version)}})
        try:
            self.client.put_item(**params)
        except self.client.exceptions.ConditionalCheckFailedException as error:
            raise Conflict('ข้อมูลถูกแก้ไขแล้ว กรุณารีเฟรชและลองใหม่') from error
        return {**content, '_version': version + 1}
