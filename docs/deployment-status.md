# สถานะที่ตรวจสอบจริง - 7 พฤศจิกายน 2569

## Classflow

- บัญชี AWS 778655339518, region ap-southeast-2

- Backend tests: 16 cases ผ่าน
- Browser integration: หน้าชั้นเรียน/Dashboard ครู, Grade Lab, Excel export เปิดอ่านกลับ, import preview, student mobile และ student grade privacy ผ่าน
- Frontend production build ผ่าน; ExcelJS เป็น lazy-loaded chunk
- CloudFormation template: ผ่าน cfn-lint; template backend เริ่มต้นผ่าน AWS Template Studio validation และชุดรวม frontend ผ่าน CloudFormation deployment
- สแตก classflow-classroom: CREATE_COMPLETE เวลา 22:26:49 และ UPDATE_COMPLETE เวลา 22:37:55 UTC+0700
- Custom resource SiteAssets เผยแพร่เว็บและเติม runtime config สำเร็จ โดยไม่ต้องอัปโหลดไฟล์เว็บด้วยมือ
- เว็บจริง: https://d1zs85ifsfqc1o.cloudfront.net เปิดหน้าสมัคร/เข้าสู่ระบบผ่าน HTTPS ได้ ไม่มีบัญชีสาธิต Local
- ตรวจจริงด้วย scripts/check_public.py: หน้าเว็บและ JS/CSS ตอบ 200, config ตรงกับ Outputs, มี CSP/HSTS, API ที่ไม่มี token ถูกปฏิเสธ 401, S3 origin ที่เข้าตรงโดยไม่มีสิทธิ์ถูกปฏิเสธ 403
- Local demo identities, SQLite และ test fixtures ไม่ส่งไป Lambda package

## ทรัพยากรจริงจาก CloudFormation Outputs

| Output | Value |
|---|---|
| WebsiteUrl | https://d1zs85ifsfqc1o.cloudfront.net |
| ApiUrl | https://yjursns496.execute-api.ap-southeast-2.amazonaws.com |
| Region | ap-southeast-2 |
| UserPoolId | ap-southeast-2_A1kaEt9gI |
| ClientId | 3n7hbtopqcpj4jogchgi5hq5s |
| DistributionId | E1XXL0XU6OJ620 |
| FrontendBucket | classflow-classroom-webbucket-tsytcadluhqg |
| UploadsBucket | classflow-classroom-uploadsbucket-pfvjmlkknxde |
| TableName | classflow-classroom-DataTable-19CNMNBY1RXT8 |

## รายการที่ยังรอ

- สร้าง Admin ตัวแรกและทดสอบหน้า Admin สำหรับสร้างบัญชี/กำหนดยศ
- ทดสอบ workflow ครู–นักเรียนด้วยสองบัญชีจริง: เข้าห้อง ส่งไฟล์ ให้คะแนน แชต และ import/export ข้อมูลสาธิตบน cloud
- ตรวจ AWS Settings > Billing > Credits: ยอดคงเหลือและ estimated remaining $119.99 ($99.99 Free Tier + $20 Explore AWS Lambda), used $0.01 ทั้งบัญชี ยอดประมาณการอัปเดตราว 24 ชั่วโมง ไม่ใช่ต้นทุนที่วัดแยกเฉพาะ Classflow
- เมนูบัญชีแสดง Free plan และเหลือ 157 วันในวันที่ตรวจ ยังไม่ได้เปิด Budget alert และไม่ได้อัปเกรด plan
- GitHub Actions อยู่ใน repository แล้ว แต่ต้องตั้ง AWS OIDC variables และ deploy stack ใหม่ก่อนจึงจะตรวจ deployment จริงได้

หลักฐาน AWS: build/qa/aws-classflow-complete.png, aws-classflow-signup.png และ aws-public-checks.json ส่วนภาพ teacher-dashboard/student-mobile เป็นผล Local
