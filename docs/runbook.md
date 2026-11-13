# ติดตั้ง ทดสอบ และ deploy Classflow

## Local

ใช้คำสั่งใน README เปิด backend และ frontend ข้อมูลสาธิตไม่มีบัญชี AWS ที่เชื่อมโยง โหมดนี้เลือกอาจารย์/นักเรียนได้เพื่อทดสอบ แต่ role switching ถูกตัดออกจาก production build

API local: http://127.0.0.1:8000, frontend: http://127.0.0.1:5173

## Build และ package

```powershell
cd frontend
npm ci
npm run build
cd ..
python -X utf8 scripts/package.py
```

ตรวจ deployment ที่ติดตั้งปัจจุบันโดยไม่ส่ง credentials: python scripts/check_public.py ตรวจหน้าเว็บ assets/config/security headers, API ต้องตอบ 401 เมื่อไม่มี token และ S3 private origin ต้องตอบ 403 เมื่อเข้าตรง แก้ endpoint ในสคริปต์เมื่อสร้างสแตกใหม่

## CloudFormation ผ่าน Console

1. ใช้บัญชี 778655339518, ap-southeast-2 ตรวจเครดิตและ plan ปัจจุบัน
2. Build frontend ก่อนรัน package.py แล้วสร้างสแตกใหม่ชื่อ `classflow` จาก build/classroom-stack.json หรือวาง JSON เดียวกันใน Template Studio (แทนเอกสารตัวอย่างทั้งหมด) เทมเพลตที่รวมเว็บอาจใหญ่เกินขนาดที่ editor Validate รองรับ แต่ตรวจด้วย cfn-lint และ CloudFormation ตอน deploy ได้
3. ยอมรับ IAM capability ตาม template, เปิด rollback และ validations ไม่เลือก Express mode
4. รอ CREATE_COMPLETE ถ้า failed ให้ดู Events ห้ามแก้โดยเปิด public S3 หรือยกระดับสิทธิ์ทั้งบัญชี
5. Custom resource SiteAssets ส่งหน้าเว็บขึ้น S3 และเติม config จากทรัพยากรจริงอัตโนมัติ จึงไม่ต้องอัปโหลด dist ด้วยมือ
6. การแก้เว็บครั้งต่อไป: build, package และ Update stack ด้วย template ใหม่ รอ UPDATE_COMPLETE
7. ตัวเผยแพร่ส่ง hashed assets ก่อน config/index, ตั้ง cache ที่เหมาะสม และ invalidate เฉพาะ /index.html และ /config.js
8. เข้า WebsiteUrl ที่เป็น HTTPS ตรวจว่าไม่มี local demo accounts
9. สร้าง Admin ตัวแรกด้วย `python scripts/admin.py --email admin@example.com --allow-account 778655339518` แล้วเข้าสู่หน้า Admin เพื่อสร้างบัญชีและกำหนดยศอาจารย์/นักเรียน บัญชีที่ Admin สร้างไม่ต้องยืนยันอีเมล
10. ทดสอบ permissions, file upload/download, grading/import/export และสองบัญชีจริงก่อนถือว่างาน cloud สำเร็จ

## CLI/SDK deployment

ต้องมี Python boto3 และ AWS credential session ที่ผู้ใช้จัดเตรียมไว้เอง ไม่เก็บ credentials ใน repository

```powershell
python scripts/deploy.py --allow-account 778655339518
```

deploy.py สร้างหรืออัปเดตสแตกและหน้าเว็บด้วย template ชุดเดียว หากต้องการเผยแพร่เฉพาะเว็บแยกเป็นทางเลือกสำรอง ใช้:

```powershell
python scripts/publish.py --allow-account 778655339518 --stack classflow-classroom
```

หากใช้บัญชีสมัครเอง ผู้ใช้ต้องยืนยันอีเมลตามปกติ ส่วนบัญชีที่ Admin สร้างใช้รหัสผ่านที่ Admin ตั้งให้และเข้าใช้งานได้ทันที ผู้ใช้ทั่วไปไม่สามารถเลื่อนตัวเองเป็นครูหรือ Admin จากเว็บได้

## GitHub Actions สำหรับ Deploy อัตโนมัติ

เมื่อ commit และ push การเปลี่ยนใด ๆ เข้า branch `main`, workflow `deploy.yml` จะรัน build, package, ตรวจ CloudFormation และ deploy ทั้ง Frontend, Backend และ Infrastructure ของ stack `classflow-classroom` อัตโนมัติ

ตั้ง Repository secrets `AWS_ACCESS_KEY_ID` และ `AWS_SECRET_ACCESS_KEY` ของ IAM user สำหรับ GitHub Actions และตั้ง Repository variable `AWS_ACCOUNT_ID=778655339518` ก่อนใช้งาน ไม่เก็บ AWS access key หรือ password ใน repository (GitHub จะเก็บ secret แบบเข้ารหัส) บัญชี AWS Free นี้ยังไม่เปิด advanced features จึงยังใช้ OIDC ไม่ได้โดยไม่ upgrade บัญชี ควรปิดหรือลบ access key/user หลัง demo

## ไฟล์ Excel

ดาวน์โหลดแม่แบบจากหน้าคะแนน ใช้ header studentId, name, score รหัสนักเรียนต้องเป็น text เพื่อรักษาเลขศูนย์ข้างหน้า หนึ่งไฟล์ต่อหนึ่งรายการสอบ/งาน เลือกรายการประเมินให้ถูกก่อน import

ใช้ .xlsx ขนาด <=5 MB, 1–500 แถวข้อมูล รหัสต้องอยู่ใน roster และไม่ซ้ำ คะแนนต้องเป็น numeric value ไม่รับ formula/error/string คะแนนรวมทั้งชุดถูกบันทึกด้วย version check ในคำขอเดียว งานที่มี Rubric ให้คะแนนแยกหัวข้อ ไม่ import คะแนนรวมที่ข้ามหัวข้อ

## เกรด

ทดลองเกณฑ์ใน Grade Lab ได้ทันที การเปลี่ยนแปลงไม่เผยแพร่ให้นักเรียน บันทึก config แล้วกดเผยแพร่เพื่อออก snapshot ผลใหม่ default null คือรอคะแนน; หากจะใช้ 0 ต้องเลือก policy ชัดเจน UI แสดง SD แบบประชากร

## ตรวจค่าใช้จ่ายและ observability

ดู Lambda Invocations/Duration/Errors/Throttles, API Gateway requests/4xx/5xx และ DynamoDB consumption แสดง CloudWatch log group ของสแตกใหม่ที่ retention 7 days หลีกเลี่ยง logging token/รหัสผ่าน/เนื้อหาข้อความ/ไฟล์

ตรวจ AWS Billing/Credits ในบัญชีปัจจุบัน Budget alert เป็นการแจ้งเตือน ไม่หยุดค่าใช้จ่ายโดยอัตโนมัติ ไม่ตั้งบริการที่มีค่าใช้จ่ายเพิ่มโดยไม่จำเป็น

## รื้อระบบ

หากจะรื้อ Classflow ให้สำรองและ export คะแนน/ไฟล์ที่ต้องเก็บก่อน จากนั้น empty S3 สอง bucket ของสแตก, Delete stack และตรวจ `DELETE_COMPLETE` การลบเป็นการถาวรและไม่สามารถกู้คืนข้อมูลจาก source code ได้
