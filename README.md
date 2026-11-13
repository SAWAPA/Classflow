# Classflow - Classroom บน AWS

ห้องเรียนสำหรับครูและนักเรียน: ส่งงาน แนบไฟล์ ให้คะแนน สรุปเกรด และแชตส่วนตัว ไม่มี Meet

## สถานะ

- เว็บจริง: https://d1zs85ifsfqc1o.cloudfront.net — ระบบ Classflow สถานะ UPDATE_COMPLETE
- ระบบใหม่ผ่านการทดสอบในเครื่อง และตรวจหน้าเว็บ/การป้องกัน API กับ S3 บน AWS แล้ว; การทดสอบครู–นักเรียนบน cloud ยังรอบัญชีที่ยืนยันอีเมล
- ใช้โค้ด backend ชุดเดียวกันใน Local และ AWS Lambda; Local ใช้ SQLite และบัญชีตัวอย่าง ส่วน AWS ใช้ Cognito, DynamoDB และ S3 ส่วนตัว
- สถานะ AWS จริงและรายการที่ยังรอ: ดู docs/deployment-status.md
- โปรเจคนี้มีเฉพาะระบบ Classflow ไม่มีโค้ดหรือไฟล์สำรองจากระบบอื่น

## ทดลองในเครื่อง

ต้องมี Node.js 20.19+ / 22.12+ และ Python 3.12+ (แนะนำ Python 3.13 ให้ตรง Lambda)

เปิด terminal ที่โฟลเดอร์โปรเจกต์:

```powershell
python -X utf8 backend/local.py
```

เปิดอีก terminal:

```powershell
cd frontend
npm ci
npm run dev
```

เปิด http://127.0.0.1:5173 เลือกบัญชีอาจารย์หรือนักเรียนตัวอย่าง ข้อมูลตัวอย่างและไฟล์ Local อยู่ใน .local/ และไม่อัปโหลดไป AWS อัตโนมัติ โหมดตัวอย่างใช้ได้เฉพาะ development บน localhost เท่านั้น

## ความสามารถ

- ครูสร้างห้องเรียน นักเรียนเข้าร่วมด้วยรหัสและกำหนดรหัสนักเรียนก่อนเข้าห้อง
- โพสต์เนื้อหาหรือการบ้าน กำหนดส่ง คะแนนเต็ม และ Rubric สูงสุด 12 หัวข้อ
- แนบ PDF, DOC/DOCX, XLS/XLSX, PPT/PPTX, JPG/JPEG/PNG/GIF/WEBP, TXT, CSV สูงสุด 25 MB ต่อไฟล์ / 5 ไฟล์ต่องาน
- ส่งงานซ้ำได้ บันทึกครั้งที่ส่งและสถานะส่งช้า; ครูดาวน์โหลดงาน ให้คะแนน พร้อมข้อเสนอแนะ
- คอมเมนต์โพสต์และสนทนาครู–นักเรียนแบบส่วนตัว แชตอัปเดตทุก 15 วินาทีเมื่อเปิดหน้าและแท็บยังมองเห็น
- คะแนนการบ้านและสอบรายคน เรียงจากมากไปน้อย; นักเรียนเห็นเฉพาะคะแนนของตนเอง
- Dashboard คะแนนสูงสุด ต่ำสุด เฉลี่ย SD แบบประชากร การกระจายเกรด และรายชื่อเรียงคะแนน
- เกรดอิงเกณฑ์ / อิงกลุ่ม Z-score ปรับเกณฑ์และเห็นผลจำลอง ก่อนบันทึกและเผยแพร่ผลให้นักเรียน
- สรุปนักเรียนที่มีงานเลยกำหนดแล้วยังไม่ส่ง หรือมีคะแนนรวมต่ำกว่า 50 เฉพาะครู
- Timeline กำหนดส่งงาน
- Import คะแนน .xlsx พร้อม preview: ตรวจรหัสซ้ำ รหัสไม่อยู่ในห้อง คะแนนเกินช่วง และสูตร Excel; ข้อมูลไม่ผ่านจะไม่บันทึกทั้งชุด
- Export .xlsx เป็น Grades, Scores, Statistics และ Thresholds; อ่าน/เขียน Excel ใน browser จึงไม่ต้องมีบริการแปลงไฟล์บนคลาวด์

## กติกาคะแนน

ค่าเริ่มต้น: การบ้าน 40% สอบ 60% ปรับได้รวมกัน 100% แต่ละรายการภายในหมวดมีน้ำหนักเท่ากันหลังหารด้วยคะแนนเต็มของตนเอง

อิงเกณฑ์: A >= 80, B+ >= 75, B >= 70, C+ >= 65, C >= 60, D+ >= 55, D >= 50, F ต่ำกว่า 50

อิงกลุ่ม: Z = (คะแนนรวม - ค่าเฉลี่ย) / SD; ค่าเริ่มต้น A >= 1.5, B+ >= 1, B >= .5, C+ >= 0, C >= -.5, D+ >= -1, D >= -1.5 กรณี SD = 0 ใช้ Z = 0 ทุกคน ครูเปลี่ยนเส้นตัดได้

คะแนนที่ยังไม่กรอกใช้สถานะรอคะแนน ไม่ออกเกรดจนกว่าจะครบ เว้นแต่ครูเลือกนับเป็นศูนย์อย่างชัดเจน หมวดที่มีน้ำหนักมากกว่า 0 ต้องมีรายการประเมินอย่างน้อยหนึ่งรายการ จัดอันดับคะแนนเท่ากันเป็นอันดับเดียวกัน คำนวณคะแนนรวมที่ความละเอียด 6 ตำแหน่งทศนิยมก่อนตัดเกรด

คะแนนงานที่ครูตรวจแล้วแสดงให้นักเรียนทันที ส่วนคะแนนรวม/เกรดแสดงเฉพาะ snapshot ที่ครูกดเผยแพร่แล้ว

## ตรวจสอบ

```powershell
python -X utf8 -m unittest discover -s backend -v
node --test tests/auth.mjs
cd frontend
npm run build
cd ..
python -X utf8 scripts/package.py
```

ชุดทดสอบ browser อยู่ใน `tests/browser.mjs` ดูวิธีเรียกใช้ใน `docs/runbook.md`

## Deploy AWS

ใช้สแตกชื่อ `classflow` ใน ap-southeast-2 รายละเอียดอยู่ใน docs/runbook.md

```powershell
cd frontend
npm ci
npm run build
cd ..
python scripts/package.py
```

ไฟล์สำหรับ CloudFormation Console: build/classroom-stack.json รวม Lambda code และหน้าเว็บที่ build แล้ว CloudFormation จะส่ง assets, สร้าง config จากทรัพยากรจริง และล้าง cache ของ index/config อัตโนมัติ อย่าอัปโหลด infra/classroom.json โดยตรง เพราะยังเป็น template ต้นฉบับ

หากใช้ CLI/SDK ต้องมี boto3 และ AWS session ที่ถูกต้อง:

```powershell
python scripts/deploy.py --allow-account 778655339518
```

scripts/publish.py เป็นทางเลือกสำรองสำหรับเผยแพร่หน้าเว็บแยก โดยเติม config จาก Outputs และส่ง assets ก่อน index.html ไม่รวมบัญชีตัวอย่าง Local

## GitHub Actions สำหรับ Deploy อัตโนมัติ

ไฟล์ `.github/workflows/deploy.yml` ทำงานเมื่อ push เข้า `main` ทุกไฟล์ โดยจะรัน test, build, package และ deploy ทั้ง Frontend, Backend และ Infrastructure ไปยัง CloudFormation stack `classflow-classroom` อัตโนมัติ การ deploy จะทำตามลำดับและไม่ยกเลิกงานที่กำลัง deploy อยู่ เพื่อป้องกัน AWS ค้างกลางทาง

หลังสร้าง repository ให้ตั้งค่า Repository secrets และ variable ดังนี้:

- `AWS_ACCESS_KEY_ID` เป็น Repository secret ของ IAM user สำหรับ GitHub Actions
- `AWS_SECRET_ACCESS_KEY` เป็น Repository secret ของ IAM user สำหรับ GitHub Actions
- `AWS_ACCOUNT_ID` เป็น Repository variable ค่า `778655339518`
- `GOOGLE_CLIENT_ID` และ `GOOGLE_CLIENT_SECRET` เป็น Repository secrets แบบใส่เป็นคู่; ถ้าไม่ใส่ทั้งคู่ Google Login จะยังปิดอยู่ แต่ workflow ยัง deploy ได้

### เปิด Google Login

สร้าง OAuth Client แบบ Web application ใน Google Cloud Console แล้วตั้ง Authorized redirect URI เป็น Cognito endpoint ของสแตกนี้:

`https://classflow-778655339518.auth.ap-southeast-2.amazoncognito.com/oauth2/idpresponse`

จากนั้นนำ Client ID และ Client Secret ไปใส่ใน GitHub repository secrets ชื่อ `GOOGLE_CLIENT_ID` และ `GOOGLE_CLIENT_SECRET` แล้ว push เข้า `main` อีกครั้ง ระบบจะสร้าง Cognito domain, Google identity provider และเปิดปุ่ม Google Login ให้อัตโนมัติ ค่าลับจะถูกส่งให้ CloudFormation ผ่าน GitHub Actions เท่านั้นและไม่ถูกเขียนลงไฟล์ใน repository

Google ใช้ Cognito Essentials + Managed Login v2 เพื่อส่ง `prompt=select_account` ไปยัง Google ทุกครั้ง (Classic/Lite ไม่รองรับพารามิเตอร์นี้) ทั้งการสมัครและเข้าสู่ระบบจะแสดงหน้าเลือกบัญชี และใช้อีเมลที่เคยสมัครเป็นบัญชีเดิม ปุ่ม Logout ล้าง session ในเว็บ เพิกถอน refresh token และไปยัง Cognito `/logout` เพื่อล้าง cookie ของ Cognito โดยไม่ออกจากบัญชี Google ในเว็บไซต์อื่น

Pre-sign-up trigger เชื่อม Google ที่ยืนยันอีเมลแล้วเข้ากับบัญชีอีเมลเดิม และปฏิเสธการสมัครด้วยอีเมลซ้ำ หน้า Admin แสดงบัญชีจริงจาก Cognito ส่วนสิทธิ์อ่านจากบัญชีที่ล็อกอินอยู่ทุกครั้ง หลังลบบัญชี token เดิมจะเข้า API ไม่ได้

กรณีเคยมี Google ซ้ำอยู่แล้ว ให้ใช้ Actions → **Consolidate a duplicate Google account** ใส่อีเมลและรันตรวจโดยไม่เลือก `apply` ก่อน ตรวจว่าไม่มีข้อมูล Classflow อ้างถึงบัญชีซ้ำ แล้วจึงรัน `apply=true` งานจะบันทึกสำเนาโปรไฟล์ใน S3 ส่วนตัวของ AWS บัญชีเดิมที่ `maintenance/account-repair/` ก่อนลบเฉพาะ Google profile ที่ซ้ำและเชื่อม Google เข้าบัญชีเดิม ถ้าพบข้อมูลระบบจะหยุดก่อนลบ รายละเอียดโปรไฟล์ไม่ถูกส่งขึ้น GitHub artifact หรือ logs

Free Tier ของ Cognito Lite และ Essentials ครอบคลุมบัญชีอีเมลและ Social Login รวม 10,000 MAU ต่อเดือนต่อ AWS account/organization; ตรวจเงื่อนไขปัจจุบันที่ https://aws.amazon.com/cognito/pricing/

บัญชี AWS แบบ Free ที่ใช้กับโปรเจกต์นี้ยังไม่เปิด advanced features จึงใช้ GitHub OIDC ไม่ได้โดยไม่ต้อง upgrade บัญชี การ deploy demo จึงใช้ IAM user `classflow-github-actions` แทน ควรปิดหรือลบ access key/user หลัง demo และไม่ใส่ค่า key ลงใน repository

IAM user นี้ใช้สิทธิ์กว้างเพื่อให้ CloudFormation deploy stack demo ได้ครบทุก resource ควรปิดหรือลบ user/access key หลังนำเสนอเสร็จ

## Admin

ผู้ดูแลระบบอยู่ใน Cognito group `admins` และใช้หน้า Admin เพื่อสร้างบัญชีโดยไม่ต้องยืนยันอีเมล กำหนดยศอาจารย์/นักเรียน และเปลี่ยนยศภายหลังได้ บัญชี Admin ตัวแรกให้สร้างด้วยคำสั่งนี้ โดยระบบจะถามรหัสผ่านแบบไม่แสดงผลและไม่เก็บไว้ใน Git:

```powershell
python scripts/admin.py --email admin@example.com --name "Classflow Admin" --allow-account 778655339518
```

รหัสผ่าน `admin` สั้นเกินไปและไม่ควรใช้ในระบบจริง; Cognito ต้องการอย่างน้อย 8 ตัว มีตัวพิมพ์เล็กและตัวเลข

## เอกสาร

- docs/requirements.md - ขอบเขตและรายการตรวจรับ
- docs/architecture.md - แผนภาพ, Data Flow, What/Role/Why, ความปลอดภัยและค่าใช้จ่าย
- docs/proposal.md - Pain point, กลุ่มผู้ใช้, ขอบเขตและ milestones
- docs/presentation.md - ลำดับ demo และคำถามประกอบเกณฑ์
- docs/runbook.md - ติดตั้ง, deploy, ตั้งครู, ทดสอบและรื้อระบบ
- docs/deployment-status.md - สถานะ cloud ที่ยืนยันได้จริง
