import unittest
from unittest.mock import Mock

from files import S3Files


class FilePreviewTests(unittest.TestCase):
    def test_preview_and_download_have_distinct_content_dispositions(self):
        files = S3Files.__new__(S3Files)
        files.bucket = 'private-files'
        files.s3 = Mock()
        file = {'key': 'class/student/file.pdf', 'filename': 'lesson.pdf', 'mime': 'application/pdf'}
        for inline, disposition in [(True, 'inline;'), (False, 'attachment;')]:
            files.download(file, inline=inline)
            args, kwargs = files.s3.generate_presigned_url.call_args
            self.assertEqual(args, ('get_object',))
            self.assertEqual(kwargs['Params']['Bucket'], 'private-files')
            self.assertEqual(kwargs['Params']['ResponseContentType'], 'application/pdf')
            self.assertTrue(kwargs['Params']['ResponseContentDisposition'].startswith(disposition))
            self.assertLessEqual(kwargs['ExpiresIn'], 300)
