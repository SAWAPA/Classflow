# โครงเรื่องนำเสนอและสาธิต

## ลำดับนำเสนอ (ประมาณ 10 นาที)

1. ปัญหา: งานและคะแนนกระจัดกระจาย; ครูและนักเรียนได้ประโยชน์อะไร; ไม่มี Meet อยู่ใน scope
2. Architecture: Browser -> CloudFront/S3, Cognito -> JWT -> API Gateway -> Lambda -> DynamoDB; ไฟล์ไป private S3 โดยตรง
3. อธิบาย Compute / Storage / Database ตาม What, Role, Why ใน architecture.md
4. เข้าระบบครู สร้างห้องและแชร์ join code; นักเรียนตั้งชื่อ/รหัสและเข้าร่วม
5. ครูสร้างเนื้อหาและการบ้านพร้อมกำหนดส่งและ Rubric นักเรียนแสดงความคิดเห็นและส่ง PDF/Word/Excel
6. ครูเปิดไฟล์ ให้คะแนนแยกหัวข้อ ดูรายชื่อเรียงคะแนน นักเรียนดู feedback
7. นำเข้า .xlsx: เปิด preview ที่ข้อมูลถูกต้อง; ลองไฟล์ที่รหัสซ้ำหรือคะแนนเกิน แสดงว่าทั้งชุดไม่ถูกบันทึก
8. Dashboard: min/max/mean/population SD และกราฟเกรด เปลี่ยนเส้นตัดใน Grade Lab เปรียบเทียบอิงเกณฑ์กับอิงกลุ่ม แล้วบันทึกและเผยแพร่
9. ใช้บัญชีนักเรียนอีกคนแสดงว่าไม่เห็นคะแนน/ไฟล์/แชตของเพื่อน แสดง Timeline และงานที่ควรติดตามฝั่งครู
10. Export Excel, เปิดดู sheets; แสดง CloudFormation Outputs, S3 private, DynamoDB และ CloudWatch logs พร้อมข้อจำกัดและแผนค่าใช้จ่าย

## คำถามที่ควรตอบได้

- ทำไม serverless แทน EC2? ไม่มีเครื่องรันค้าง เหมาะกับโหลดห้องเรียนไม่ต่อเนื่อง แลกกับ cold start และข้อจำกัด timeout
- ทำไม S3 แทนเก็บไฟล์ใน DB? แยก binary ออกจาก metadata, upload/download โดยตรง ลดการส่งไฟล์ผ่าน Lambda
- ฐานข้อมูลอยู่ Private Subnet ไหม? DynamoDB เป็น managed service ไม่ได้วางใน VPC ของเรา ปิด public database access ด้วย IAM, นักเรียนไม่มี AWS credentials และเรียกได้เฉพาะ backend ที่ตรวจสมาชิกแล้ว ไม่ต้องซื้อ NAT Gateway
- Login ปลอมเป็นครูได้ไหม? บทบาทจาก Cognito signed token กลุ่ม admins/teachers และ Admin จัดการยศผ่านหน้า Admin ไม่มี dropdown ให้ผู้ใช้ทั่วไปเลื่อนสิทธิ์เอง
- นักเรียนเปลี่ยน URL เพื่ออ่านของเพื่อนได้ไหม? backend ตรวจ owner/context/member ทุกครั้ง มี unit tests และต้องยืนยันอีกครั้งบน cloud
- คะแนน 0 ต่างจากยังไม่กรอกอย่างไร? 0 เป็นคะแนนจริง null คือรอคะแนน ไม่ออกเกรดจนกว่าจะครบหรือครูเลือก policy ให้นับเป็น 0
- อิงกลุ่มเท่ากับ curve บวกคะแนนทุกคนไหม? ไม่ใช่ ใช้ตำแหน่ง Z-score ในกลุ่มและเส้นตัดที่ครูกำหนด SD=0 ใช้ Z=0 ตามที่แสดงในหน้า
- ป้องกันครูสองแท็บเขียนทับคะแนนอย่างไร? gradebook version + DynamoDB conditional write
- ไฟล์นำเข้าผิดหนึ่งแถวจะเป็นอย่างไร? ตรวจทุกแถวก่อน conditional put หนึ่งครั้ง จึงไม่บันทึกเพียงบางส่วน
- แชต realtime ทันทีหรือไม่? Poll ทุก 15 วินาทีเมื่อเปิดหน้าสนทนาและแท็บยังมองเห็น ประหยัดกว่าการคง WebSocket ทุกหน้า แต่มี latency สูงสุดราวรอบ poll
- ทำ CI/CD แล้วหรือยัง? Workflow เตรียมไว้ ต้องแสดง run จริงและ AWS deploy ที่สำเร็จจึงกล่าวว่า pipeline พร้อมใช้งาน ห้ามนับไฟล์ workflow อย่างเดียวเป็นโบนัสที่ได้แล้ว

## เกณฑ์คะแนนที่ต้องแสดงหลักฐาน

5 คะแนน Proposal/แผน: proposal.md, requirements.md, cost/security choices

15 คะแนน Architecture: แผนภาพทิศทางข้อมูล, Compute/Storage/Database, network boundary, IAM, stateless, scalability และ trade-offs

15 คะแนน Demo: URL HTTPS บน AWS จริง, สองบทบาท, S3 file, DB records และ deployment/access controls

10 คะแนน Presentation: ลำดับปัญหา -> ออกแบบ -> demo -> เหตุผลและทางเลือก

5 คะแนน Q&A: ใช้คำถามข้างต้นฝึกอธิบายด้วยหลักฐาน

Bonus: สาธิต CI/CD ที่ทำงานจริง หรือ CloudWatch metrics/logs ที่ทำงานจริงก่อนอ้างคะแนนพิเศษ
