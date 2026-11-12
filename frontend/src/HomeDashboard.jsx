import {ArrowUpRight, BookOpen, CalendarDays, CheckCircle2, ChevronRight, ClipboardList, Clock, FileText, Megaphone, RefreshCw, Users} from 'lucide-react';
import {Avatar, Badge, Btn, date} from './ui';

const NEW_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function isNew(post) {
  return post?.createdAt && Date.now() - new Date(post.createdAt).getTime() <= NEW_WINDOW_MS;
}

function assignmentSummary(entry, profile, teacher) {
  const assignments = entry?.snapshot?.posts?.filter(post => post.kind === 'assignment') || [];
  const submissions = entry?.snapshot?.submissions || [];
  const gradebooks = entry?.snapshot?.gradebooks || {};
  if (!teacher) {
    return assignments
      .filter(post => !submissions.some(submission => submission.postId === post.id && submission.userId === profile.id))
      .map(post => ({...post, course: entry.course, courseId: entry.course.id}));
  }
  return assignments
    .map(post => {
      const submitted = submissions.filter(submission => submission.postId === post.id).length;
      const graded = Object.keys(gradebooks[post.id] || {}).length;
      return submitted > graded ? {...post, course: entry.course, courseId: entry.course.id, submitted, graded} : null;
    })
    .filter(Boolean);
}

export default function HomeDashboard({courses = [], states = [], profile, teacher, onOpen, onRefresh, loading}) {
  const entries = courses.map(course => ({course, snapshot: states.find(item => item?.course?.id === course.id)}));
  const assignments = entries.flatMap(entry => assignmentSummary(entry, profile, teacher));
  const updates = entries.flatMap(entry => (entry.snapshot?.posts || []).map(post => ({...post, course: entry.course, courseId: entry.course.id})))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const recentUpdates = updates.filter(isNew);
  const totalPosts = updates.length;

  return <div className="home-dashboard">
    <section className="home-welcome panel">
      <div>
        <div className="eyebrow">YOUR CLASSROOM HUB</div>
        <h1>ยินดีต้อนรับ {profile?.name || 'กลับมาเรียนรู้ด้วยกัน'}</h1>
        <p>เลือกห้องเรียนเพื่อเข้าสู่เนื้อหา งาน และความคืบหน้า หรือเริ่มจากสิ่งที่ต้องทำวันนี้</p>
      </div>
      <Btn secondary icon={RefreshCw} onClick={onRefresh} disabled={loading}>{loading ? 'กำลังรีเฟรช…' : 'รีเฟรชหน้าแรก'}</Btn>
    </section>

    <div className="home-stats">
      <div className="home-stat"><span><BookOpen size={18}/></span><div><small>ห้องเรียนของฉัน</small><strong>{courses.length}<em> ห้อง</em></strong></div></div>
      <div className="home-stat"><span><ClipboardList size={18}/></span><div><small>{teacher ? 'งานที่รอตรวจ' : 'การบ้านที่ยังไม่ส่ง'}</small><strong>{assignments.length}<em> รายการ</em></strong></div></div>
      <div className="home-stat"><span><Megaphone size={18}/></span><div><small>ประกาศใหม่</small><strong>{recentUpdates.length}<em> โพสต์</em></strong></div></div>
      <div className="home-stat"><span><FileText size={18}/></span><div><small>โพสต์และงานทั้งหมด</small><strong>{totalPosts}<em> รายการ</em></strong></div></div>
    </div>

    <section className="home-section">
      <div className="section-title"><div><h2>ห้องเรียนของฉัน</h2><p className="muted">กดที่การ์ดเพื่อเปิดพื้นที่เรียนรู้ของแต่ละวิชา</p></div><span className="eyebrow">{courses.length} CLASSROOMS</span></div>
      {entries.length ? <div className="classroom-grid">{entries.map(({course, snapshot}) => {
        const posts = snapshot?.posts || [], courseAssignments = posts.filter(post => post.kind === 'assignment');
        const pending = assignmentSummary({course, snapshot}, profile, teacher).length;
        return <article className="classroom-card" key={course.id}>
          <button className="classroom-card-button" onClick={() => onOpen(course.id)} aria-label={`เปิดห้องเรียน ${course.name}`}>
            <div className="classroom-cover"><span>CLASSROOM / {course.subject}</span><BookOpen size={32}/></div>
            <div className="classroom-body">
              <div className="classroom-title"><div><h3>{course.name}</h3><p>{course.description || 'พื้นที่เรียนรู้และเติบโตไปด้วยกัน'}</p></div><ChevronRight size={19}/></div>
              <div className="classroom-meta"><span><ClipboardList size={14}/> {courseAssignments.length} งาน</span><span><FileText size={14}/> {posts.filter(post => post.kind === 'material').length} เนื้อหา</span>{pending > 0 && <Badge tone="orange">{teacher ? `${pending} งานรอตรวจ` : `${pending} งานค้าง`}</Badge>}</div>
            </div>
          </button>
        </article>;
      })}</div> : <div className="panel home-empty"><BookOpen size={30}/><h3>ยังไม่มีห้องเรียน</h3><p>สร้างห้องเรียนหรือเข้าร่วมด้วยรหัสจากอาจารย์เพื่อเริ่มต้น</p></div>}
    </section>

    <div className="home-columns">
      <section className="panel home-panel">
        <div className="section-title"><div><h2>{teacher ? 'งานที่ต้องตรวจ' : 'การบ้านที่ยังไม่ส่ง'}</h2><p className="muted">{teacher ? 'ติดตามงานที่ส่งแล้วแต่ยังไม่ได้ให้คะแนน' : 'งานที่ควรจัดการก่อนถึงกำหนดส่ง'}</p></div><CalendarDays size={20}/></div>
        {assignments.slice().sort((a, b) => String(a.dueAt).localeCompare(String(b.dueAt))).slice(0, 6).map(item => {
          const overdue = item.dueAt && new Date(item.dueAt) < new Date();
          return <button className="home-task" key={`${item.courseId}-${item.id}`} onClick={() => onOpen(item.courseId)}>
            <span className={`home-task-icon ${overdue ? 'overdue' : ''}`}><ClipboardList size={17}/></span>
            <span className="home-task-copy"><strong>{item.title}</strong><small>{item.course.name} · {teacher ? `ส่งแล้ว ${item.submitted} คน · รอตรวจ ${item.submitted - item.graded} คน` : `กำหนดส่ง ${date(item.dueAt)}`}</small></span>
            {overdue ? <Badge tone="orange">เลยกำหนด</Badge> : <ChevronRight size={16}/>}
          </button>;
        })}
        {!assignments.length && <div className="home-success"><CheckCircle2 size={19}/><span>{teacher ? 'ยังไม่มีงานที่รอตรวจ' : 'ไม่มีการบ้านค้าง เยี่ยมมาก'}</span></div>}
      </section>

      <section className="panel home-panel">
        <div className="section-title"><div><h2>ประกาศล่าสุด</h2><p className="muted">โพสต์ใหม่จากอาจารย์ในทุกห้องเรียน</p></div><Megaphone size={20}/></div>
        {updates.slice(0, 6).map(post => <button className="home-update" key={`${post.courseId}-${post.id}`} onClick={() => onOpen(post.courseId)}>
          <span className={`home-update-icon ${post.kind}`}><span>{post.kind === 'assignment' ? <ClipboardList size={16}/> : <Megaphone size={16}/>}</span></span>
          <span className="home-update-copy"><strong>{post.title}</strong><small>{post.course.name} · {date(post.createdAt)}</small></span>
          {isNew(post) && <Badge>ใหม่</Badge>}
          <ArrowUpRight size={16}/>
        </button>)}
        {!updates.length && <div className="home-empty-inline"><Megaphone size={21}/><span>ยังไม่มีประกาศหรือโพสต์ใหม่</span></div>}
      </section>
    </div>
  </div>;
}
