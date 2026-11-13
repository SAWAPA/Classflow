import os
from urllib.parse import quote


class S3Files:
    def __init__(self):
        import boto3
        from botocore.config import Config
        self.s3 = boto3.client('s3', config=Config(signature_version='s3v4'))
        self.bucket = os.environ['UPLOAD_BUCKET']

    def prepare(self, file):
        return self.s3.generate_presigned_post(self.bucket, file['key'], Fields={'Content-Type': file['mime']},
                                              Conditions=[{'Content-Type': file['mime']}, ['content-length-range', 1, file['size']]], ExpiresIn=300)

    def verify(self, file):
        head = self.s3.head_object(Bucket=self.bucket, Key=file['key'])
        if head['ContentLength'] != file['size'] or head['ContentType'] != file['mime']:
            raise ValueError('ขนาดหรือประเภทไฟล์ไม่ตรงกับข้อมูลที่แจ้ง')

    def download(self, file, inline=False):
        return self.s3.generate_presigned_url('get_object', Params={'Bucket': self.bucket, 'Key': file['key'],
             'ResponseContentType': file['mime'],
             'ResponseContentDisposition': ("inline;" if inline else "attachment;") + " filename*=UTF-8''" + quote(file['filename'])}, ExpiresIn=300 if inline else 60)
