import {useEffect, useState} from 'react';
import {BookOpen, ClipboardList, CalendarDays, Clock, Sparkles, ArrowUpRight, ChevronRight, Plus, MessageCircle, Paperclip, RefreshCw, Send, AlertCircle, CheckCircle2, Filter} from 'lucide-react';
import {rpc} from './api';
import {Avatar, Badge, Btn, Empty, date} from './ui';

export function Stream({state, profile, open, create}) {
  const teacher = profile.id === state.course.ownerId, assignments = state.posts.filter(p => p.kind === 'assignment');
  return <div className="two-column"><section><button className="composer" onClick={teacher ? create : undefined}><Avatar name={profile.name}/><span>{teacher ? 'วันนี้อยากแบ่งปันอะไรกับชั้นเรียน?' : 'พร้อมเรียนรู้สิ่งใหม่ไปด้วยกัน'}</span>{teacher && <Plus size={20}/>}</button><div className="section-title"><h2>เรื่องราวในชั้นเรียน <span className="muted small-text">{state.posts.length} โพสต์</span></h2><span className="eyebrow">LATEST UPDATES</span></div>{state.posts.map(post => <article className="post-card" key={post.id}><div className="post-author"><div className={`post-symbol ${post.kind}`}>{post.kind === 'assignment' ? <ClipboardList size={21}/> : <BookOpen size={21}/>}</div><div><strong>{post.authorName}</strong><small>{date(post.createdAt)}</small></div><Badge tone={post.kind === 'assignment' ? 'orange' : ''}>{post.kind === 'assignment' ? 'มอบหมายงาน' : 'เนื้อหา'}</Badge></div><button className="post-open" onClick={() => open(post)}><h3>{post.title}</h3><p>{post.description}</p>{post.kind === 'assignment' && <div className="post-due"><Clock size={14}/><span>กำหนดส่ง {date(post.dueAt)}</span><strong>{post.maxScore} คะแนน</strong></div>}<span className="post-link">{post.kind === 'assignment' ? 'ดูงานและรายละเอียด' : 'อ่านเนื้อหาและความคิดเห็น'}<ArrowUpRight size={16}/></span></button><div className="post-bottom"><MessageCircle size={15}/>{state.comments.filter(c => c.postId === post.id).length} ความคิดเห็น{post.files.length > 0 && <span><Paperclip size={14}/> {post.files.length} ไฟล์แนบ</span>}</div></article>)}{!state.posts.length && <Empty>ยังไม่มีโพสต์ในห้องเรียนนี้</Empty>}</section><aside><div className="side-card"><div className="section-title"><h3>กำลังจะถึง</h3><CalendarDays size={18}/></div>{assignments.filter(p => new Date(p.dueAt) >= new Date()).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 4).map(p => <button className="upcoming" key={p.id} onClick={() => open(p)}><div className="date-tile"><strong>{new Date(p.dueAt).getDate()}</strong><small>{new Date(p.dueAt).toLocaleDateString('th-TH', {month: 'short'})}</small></div><div><strong>{p.title}</strong><small>{date(p.dueAt)}</small></div><ChevronRight size={15}/></button>)}{!assignments.some(p => new Date(p.dueAt) >= new Date()) && <p className="muted">ยังไม่มีกำหนดส่งงานถัดไป</p>}</div><div className="tip-card"><Sparkles size={23}/><h3>ทุกความก้าวหน้า<br/>มีความหมาย</h3><p>ค่อย ๆ เรียนรู้ ลงมือทำ และถามเมื่อสงสัย ห้องเรียนนี้พร้อมเติบโตไปกับคุณ</p><div className="tip-line"/></div>{teacher && <div className="side-card"><small className="eyebrow">INVITE YOUR CLASS</small><h3>รหัสเข้าห้องเรียน</h3><div className="join-code">{state.course.joinCode}</div><p className="muted">ส่งรหัสนี้ให้นักเรียนเข้าร่วม</p></div>}</aside></div>;
}
export function Work({state, states = [], courses = [], profile, open, grade, create}) {
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'overdue' | 'submitted'
  const [courseFilter, setCourseFilter] = useState('all');

  const entries = states.length ? states : (state ? [state] : []);
  const availableCourses = courses.length
    ? courses
    : entries.map(e => e.course).filter(Boolean);

  const now = new Date();

  // ดึงรายการงานที่ได้รับมอบหมายทั้งหมดจากทุกห้องเรียน
  const allAssignments = entries.flatMap(s => (s?.posts || [])
    .filter(p => p.kind === 'assignment')
    .map(p => {
      const isTeacher = profile?.id === s.course?.ownerId;
      const submissions = s.submissions || [];
      const mine = submissions.find(sub => sub.postId === p.id && sub.userId === profile?.id);
      const submitted = submissions.filter(sub => sub.postId === p.id);
      const graded = Object.keys(s.gradebooks?.[p.id] || {}).length;
      const gradeInfo = s.gradebooks?.[p.id]?.[profile?.id];
      const dueDate = p.dueAt ? new Date(p.dueAt) : null;
      const isOverdue = Boolean(dueDate && dueDate < now);
      const memberCount = Math.max(1, (s.members || []).filter(m => m.role === 'student').length);

      // แยกเป็น 3 สถานะที่ตัดขาดจากกันโดยสิ้นเชิง (Mutually Exclusive)
      let category = 'pending';
      if (!isTeacher) {
        if (mine) {
          category = 'submitted';
        } else if (isOverdue) {
          category = 'overdue';
        } else {
          category = 'pending';
        }
      } else {
        // ฝั่งครูผู้สอน
        if (submitted.length > 0 && submitted.length === graded) {
          category = 'submitted';
        } else if (isOverdue) {
          category = 'overdue';
        } else {
          category = 'pending';
        }
      }

      return {
        ...p,
        course: s.course,
        courseId: s.course?.id,
        mine,
        gradeInfo,
        submittedCount: submitted.length,
        gradedCount: graded,
        memberCount,
        isTeacher,
        isOverdue,
        dueDate,
        category
      };
    })
  );

  // กรองตามรายวิชาที่เลือก
  const courseFiltered = courseFilter === 'all'
    ? allAssignments
    : allAssignments.filter(p => p.courseId === courseFilter);

  // แยกรายการ 3 แถบออกจากกันโดยสิ้นเชิง พร้อมเรียงตามกำหนดส่ง
  const pendingList = courseFiltered
    .filter(p => p.category === 'pending')
    .sort((a, b) => {
      if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
      if (a.dueAt && !b.dueAt) return -1;
      if (!a.dueAt && b.dueAt) return 1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

  const overdueList = courseFiltered
    .filter(p => p.category === 'overdue')
    .sort((a, b) => {
      if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

  const submittedList = courseFiltered
    .filter(p => p.category === 'submitted')
    .sort((a, b) => {
      const aTime = new Date(a.mine?.submittedAt || a.mine?.createdAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.mine?.submittedAt || b.mine?.createdAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });

  const currentList = activeTab === 'pending'
    ? pendingList
    : activeTab === 'overdue'
      ? overdueList
      : submittedList;

  const isGlobalTeacher = profile?.role === 'teacher';

  return (
    <div className="tab-pane">
      <div className="section-title">
        <div>
          <h2>งานในชั้นเรียน</h2>
          <p className="muted">
            {courseFilter === 'all'
              ? `รวมงานทั้งหมดจากทุกรายวิชา (${allAssignments.length} งาน)`
              : `งานในรายวิชา ${availableCourses.find(c => c.id === courseFilter)?.name || ''} (${courseFiltered.length} งาน)`}
          </p>
        </div>
        {isGlobalTeacher && (
          <Btn icon={Plus} onClick={create}>สร้างงาน / การบ้าน</Btn>
        )}
      </div>

      {/* แถบฟิวเตอร์เลือกรายวิชา */}
      {availableCourses.length > 0 && (
        <div className="work-filter-bar">
          <div className="filter-title">
            <Filter size={15}/>
            <span>รายวิชา:</span>
          </div>
          <div className="filter-chips">
            <button
              className={`filter-chip ${courseFilter === 'all' ? 'active' : ''}`}
              onClick={() => setCourseFilter('all')}
            >
              ทุกรายวิชา <span className="chip-badge">{allAssignments.length}</span>
            </button>
            {availableCourses.map(c => {
              const count = allAssignments.filter(p => p.courseId === c.id).length;
              return (
                <button
                  key={c.id}
                  className={`filter-chip ${courseFilter === c.id ? 'active' : ''}`}
                  onClick={() => setCourseFilter(c.id)}
                >
                  {c.name} <span className="chip-badge">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* แถบสลับ 3 หมวดหมู่หลัก แยกออกจากกันโดยสิ้นเชิง */}
      <div className="assignment-tabs">
        <button
          className={`assignment-tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          <Clock size={16}/>
          <span>ยังไม่ส่ง</span>
          <span className="tab-counter pending">{pendingList.length}</span>
        </button>

        <button
          className={`assignment-tab ${activeTab === 'overdue' ? 'active overdue' : ''}`}
          onClick={() => setActiveTab('overdue')}
        >
          <AlertCircle size={16}/>
          <span>เลยกำหนดส่ง</span>
          <span className={`tab-counter ${overdueList.length > 0 ? 'overdue' : ''}`}>
            {overdueList.length}
          </span>
        </button>

        <button
          className={`assignment-tab ${activeTab === 'submitted' ? 'active submitted' : ''}`}
          onClick={() => setActiveTab('submitted')}
        >
          <CheckCircle2 size={16}/>
          <span>ส่งแล้ว</span>
          <span className="tab-counter submitted">{submittedList.length}</span>
        </button>
      </div>

      {/* แสดงรายการการ์ดงานของแถบที่กำลังเลือก */}
      {currentList.length > 0 ? (
        <div className="assignment-grid" key={activeTab}>
          {currentList.map(post => {
            const dueDate = post.dueDate;
            const isDueSoon = dueDate && (dueDate - now > 0) && (dueDate - now < 86400000 * 2);

            return (
              <article className="assignment-card" key={`${post.courseId}-${post.id}`}>
                <div className="assignment-card-top">
                  <span className="work-course-tag" style={{marginBottom: 0}}>
                    <BookOpen size={12}/>
                    <span>{post.course?.name || 'รายวิชา'}</span>
                  </span>

                  {activeTab === 'pending' && (
                    isDueSoon ? (
                      <Badge tone="orange"><Clock size={11}/> ใกล้ถึงกำหนด</Badge>
                    ) : (
                      <Badge tone="gray"><Clock size={11}/> ยังไม่ส่ง</Badge>
                    )
                  )}

                  {activeTab === 'overdue' && (
                    <Badge tone="orange"><AlertCircle size={11}/> เลยกำหนดส่ง</Badge>
                  )}

                  {activeTab === 'submitted' && (
                    post.mine?.late ? (
                      <Badge tone="orange"><CheckCircle2 size={11}/> ส่งช้า</Badge>
                    ) : (
                      <Badge><CheckCircle2 size={11}/> ส่งแล้ว</Badge>
                    )
                  )}
                </div>

                <h3>{post.title}</h3>
                {post.description && (
                  <p className="assignment-desc">{post.description}</p>
                )}

                <div className="assignment-meta-list">
                  <div className={`assignment-meta-item ${post.isOverdue && activeTab !== 'submitted' ? 'overdue' : ''}`}>
                    <CalendarDays size={14}/>
                    <span>
                      {post.dueAt ? `กำหนดส่ง: ${date(post.dueAt)}` : 'ไม่มีกำหนดส่ง'}
                    </span>
                  </div>
                  <div className="assignment-meta-item">
                    <ClipboardList size={14}/>
                    <span>คะแนนเต็ม: {post.maxScore || 100} คะแนน</span>
                  </div>
                  {activeTab === 'submitted' && post.mine && (
                    <div className="assignment-meta-item success">
                      <CheckCircle2 size={14}/>
                      <span>ส่งเมื่อ: {date(post.mine.submittedAt || post.mine.createdAt)}</span>
                    </div>
                  )}
                </div>

                {activeTab === 'submitted' && (
                  post.gradeInfo != null ? (
                    <div className="graded-result-box">
                      <strong>ผลการตรวจ: ได้ {post.gradeInfo.score} / {post.maxScore} คะแนน</strong>
                      {post.gradeInfo.feedback && (
                        <p style={{margin: '4px 0 0', fontSize: '11px', color: '#39785e'}}>
                          ความเห็นครู: {post.gradeInfo.feedback}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div className="pending-grade-box">
                      <span className="muted">
                        รอผู้สอนตรวจให้คะแนน · แนบแล้ว {post.mine?.files?.length || 0} ไฟล์
                      </span>
                    </div>
                  )
                )}

                {post.isTeacher && (
                  <div style={{marginBottom: '14px'}}>
                    <div className="progress-bar" style={{margin: '8px 0 6px'}}>
                      <span style={{width: `${(post.submittedCount / post.memberCount) * 100}%`}}/>
                    </div>
                    <small className="muted">
                      ส่งแล้ว {post.submittedCount} คน · ตรวจแล้ว {post.gradedCount} คน
                    </small>
                  </div>
                )}

                <div className="assignment-actions">
                  <button className="text-btn" onClick={() => open(post, post.courseId)}>
                    {activeTab === 'submitted' ? 'ดูงานที่ส่ง' : 'ดูรายละเอียด'}
                    <ArrowUpRight size={14}/>
                  </button>

                  {post.isTeacher ? (
                    <Btn secondary onClick={() => grade(post, post.courseId)}>
                      ตรวจงาน ({post.submittedCount})
                    </Btn>
                  ) : (
                    <Btn
                      secondary={activeTab === 'submitted'}
                      onClick={() => open(post, post.courseId)}
                    >
                      {activeTab === 'submitted'
                        ? 'แก้ไขงานที่ส่ง'
                        : activeTab === 'overdue'
                          ? 'ส่งงานย้อนหลัง'
                          : 'ส่งงาน'}
                    </Btn>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="empty-assignments">
          {activeTab === 'pending' && (
            <>
              <CheckCircle2 size={42} className="icon-success"/>
              <div className="empty-text">
                <h3>ไม่มีงานที่ค้างส่ง</h3>
                <p>คุณส่งงานที่มอบหมายครบทั้งหมดแล้ว หรือยังไม่มีงานใหม่ในขณะนี้</p>
              </div>
            </>
          )}
          {activeTab === 'overdue' && (
            <>
              <CheckCircle2 size={42} className="icon-success"/>
              <div className="empty-text">
                <h3>ไม่มีงานที่เลยกำหนดส่ง</h3>
                <p>ยอดเยี่ยมมาก! ไม่มีงานค้างส่งที่เกินกำหนดเวลา</p>
              </div>
            </>
          )}
          {activeTab === 'submitted' && (
            <>
              <Clock size={42} className="icon-muted"/>
              <div className="empty-text">
                <h3>ยังไม่มีงานที่ส่งแล้ว</h3>
                <p>เมื่องานถูกส่งแล้ว ข้อมูลและผลคะแนนจะปรากฏในแถบนี้</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
export function Timeline({state, profile, open}) {
  const teacher = profile.id === state.course.ownerId, posts = state.posts.filter(p => p.kind === 'assignment').sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  return <section className="panel"><div className="section-title"><div><div className="eyebrow">ONE STEP AT A TIME</div><h2>เส้นทางการเรียนรู้</h2><p className="muted">เห็นทุกกำหนดส่ง วางแผนได้ก่อนถึงวันจริง</p></div><CalendarDays size={28}/></div><div className="timeline">{posts.map(p => {const mine = state.submissions.find(s => s.postId === p.id && s.userId === profile.id); return <button className="timeline-item" key={p.id} onClick={() => open(p)}><span className={`timeline-dot ${new Date(p.dueAt) < new Date() ? 'past' : ''}`}/><div className="timeline-date">{date(p.dueAt)}</div><div><h3>{p.title}</h3><p>{p.maxScore} คะแนน · {teacher ? `ส่งแล้ว ${state.submissions.filter(s => s.postId === p.id).length} คน` : mine ? mine.late ? 'ส่งช้า' : 'ส่งแล้ว' : 'ยังไม่ส่ง'}</p></div><ArrowUpRight size={18}/></button>;})}{!posts.length && <Empty icon={CalendarDays}>ยังไม่มีกำหนดส่งงาน</Empty>}</div></section>;
}
export function Messages({state, profile, notify}) {
  const teacher = profile.id === state.course.ownerId, students = state.members.filter(m => m.role === 'student');
  const [target, setTarget] = useState(teacher ? students[0]?.userId : profile.id), [messages, setMessages] = useState([]), [value, setValue] = useState(''), [busy, setBusy] = useState(false);
  async function load() {if (target) setMessages(await rpc('getMessages', {classId: state.course.id, studentUserId: target}));}
  useEffect(() => {let cancelled = false; const poll = async () => {if (!document.hidden && target) try {const r = await rpc('getMessages', {classId: state.course.id, studentUserId: target}); if (!cancelled) setMessages(r);} catch (err) {if (!cancelled) notify(err.message);}}; setMessages([]); poll(); const interval = setInterval(poll, 15000); return () => {cancelled = true; clearInterval(interval);};}, [target, state.course.id]);
  return <section className={`chat panel ${teacher ? '' : 'student-chat'}`}>{teacher && <aside className="chat-list"><h3>ข้อความส่วนตัว</h3>{students.map(m => <button key={m.userId} onClick={() => setTarget(m.userId)} className={target === m.userId ? 'active' : ''}><Avatar name={m.name} small/><span>{m.name}<small>{m.studentId}</small></span></button>)}</aside>}<div className="chat-conversation"><div className="chat-head"><Avatar name={teacher ? students.find(s => s.userId === target)?.name : state.course.teacherName}/><div><strong>{teacher ? students.find(s => s.userId === target)?.name || 'เลือกนักเรียน' : state.course.teacherName}</strong><small>เฉพาะคุณและคู่สนทนา · อัปเดตทุก 15 วินาทีขณะเปิดหน้านี้</small></div><button className="icon-btn" aria-label="อัปเดตข้อความ" onClick={() => load().catch(e => notify(e.message))}><RefreshCw size={16}/></button></div><div className="chat-body">{messages.map(m => <div key={m.id} className={`bubble ${m.senderId === profile.id ? 'mine' : ''}`}><p>{m.text}</p><small>{date(m.createdAt)}</small></div>)}{!messages.length && <Empty icon={MessageCircle}>เริ่มบทสนทนา ถามได้ทุกเรื่องเกี่ยวกับการเรียน</Empty>}</div><form className="chat-compose" onSubmit={async e => {e.preventDefault(); setBusy(true); try {setMessages(await rpc('sendMessage', {classId: state.course.id, studentUserId: target, text: value})); setValue('');} catch (err) {notify(err.message);} finally {setBusy(false);}}}><input placeholder="เขียนข้อความ…" aria-label="ข้อความส่วนตัว" value={value} onChange={e => setValue(e.target.value)} maxLength={2000} required/><Btn disabled={busy || !target} icon={Send}>ส่ง</Btn></form></div></section>;
}
