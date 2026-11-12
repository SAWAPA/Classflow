import {useEffect, useState} from 'react';
import {BookOpen, ClipboardList, CalendarDays, Clock, Sparkles, ArrowUpRight, ChevronRight, Plus, MessageCircle, Paperclip, RefreshCw, Send} from 'lucide-react';
import {rpc} from './api';
import {Avatar, Badge, Btn, Empty, date} from './ui';

export function Stream({state, profile, open, create}) {
  const teacher = profile.id === state.course.ownerId, assignments = state.posts.filter(p => p.kind === 'assignment');
  return <div className="two-column"><section><button className="composer" onClick={teacher ? create : undefined}><Avatar name={profile.name}/><span>{teacher ? 'วันนี้อยากแบ่งปันอะไรกับชั้นเรียน?' : 'พร้อมเรียนรู้สิ่งใหม่ไปด้วยกัน'}</span>{teacher && <Plus size={20}/>}</button><div className="section-title"><h2>เรื่องราวในชั้นเรียน <span className="muted small-text">{state.posts.length} โพสต์</span></h2><span className="eyebrow">LATEST UPDATES</span></div>{state.posts.map(post => <article className="post-card" key={post.id}><div className="post-author"><div className={`post-symbol ${post.kind}`}>{post.kind === 'assignment' ? <ClipboardList size={21}/> : <BookOpen size={21}/>}</div><div><strong>{post.authorName}</strong><small>{date(post.createdAt)}</small></div><Badge tone={post.kind === 'assignment' ? 'orange' : ''}>{post.kind === 'assignment' ? 'มอบหมายงาน' : 'เนื้อหา'}</Badge></div><button className="post-open" onClick={() => open(post)}><h3>{post.title}</h3><p>{post.description}</p>{post.kind === 'assignment' && <div className="post-due"><Clock size={14}/><span>กำหนดส่ง {date(post.dueAt)}</span><strong>{post.maxScore} คะแนน</strong></div>}<span className="post-link">{post.kind === 'assignment' ? 'ดูงานและรายละเอียด' : 'อ่านเนื้อหาและความคิดเห็น'}<ArrowUpRight size={16}/></span></button><div className="post-bottom"><MessageCircle size={15}/>{state.comments.filter(c => c.postId === post.id).length} ความคิดเห็น{post.files.length > 0 && <span><Paperclip size={14}/> {post.files.length} ไฟล์แนบ</span>}</div></article>)}{!state.posts.length && <Empty>ยังไม่มีโพสต์ในห้องเรียนนี้</Empty>}</section><aside><div className="side-card"><div className="section-title"><h3>กำลังจะถึง</h3><CalendarDays size={18}/></div>{assignments.filter(p => new Date(p.dueAt) >= new Date()).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 4).map(p => <button className="upcoming" key={p.id} onClick={() => open(p)}><div className="date-tile"><strong>{new Date(p.dueAt).getDate()}</strong><small>{new Date(p.dueAt).toLocaleDateString('th-TH', {month: 'short'})}</small></div><div><strong>{p.title}</strong><small>{date(p.dueAt)}</small></div><ChevronRight size={15}/></button>)}{!assignments.some(p => new Date(p.dueAt) >= new Date()) && <p className="muted">ยังไม่มีกำหนดส่งงานถัดไป</p>}</div><div className="tip-card"><Sparkles size={23}/><h3>ทุกความก้าวหน้า<br/>มีความหมาย</h3><p>ค่อย ๆ เรียนรู้ ลงมือทำ และถามเมื่อสงสัย ห้องเรียนนี้พร้อมเติบโตไปกับคุณ</p><div className="tip-line"/></div>{teacher && <div className="side-card"><small className="eyebrow">INVITE YOUR CLASS</small><h3>รหัสเข้าห้องเรียน</h3><div className="join-code">{state.course.joinCode}</div><p className="muted">ส่งรหัสนี้ให้นักเรียนเข้าร่วม</p></div>}</aside></div>;
}
export function Work({state, states = [], courses = [], profile, open, grade, create}) {
  const [filter, setFilter] = useState('all');
  const [courseFilter, setCourseFilter] = useState(state?.course?.id || 'all');

  useEffect(() => {
    if (state?.course?.id) {
      setCourseFilter(state.course.id);
    }
  }, [state?.course?.id]);

  const entries = states.length ? states : (state ? [state] : []);
  const availableCourses = courses.length
    ? courses
    : entries.map(e => e.course).filter(Boolean);

  const allPosts = entries.flatMap(s => (s?.posts || []).map(p => {
    const isTeacher = profile?.id === s.course?.ownerId;
    const submitted = (s.submissions || []).filter(sub => sub.postId === p.id);
    const graded = Object.keys(s.gradebooks?.[p.id] || {}).length;
    const mine = (s.submissions || []).find(sub => sub.postId === p.id && sub.userId === profile?.id);
    const gradeInfo = s.gradebooks?.[p.id]?.[profile?.id];
    return {
      ...p,
      course: s.course,
      courseId: s.course?.id,
      submissions: s.submissions || [],
      submittedCount: submitted.length,
      gradedCount: graded,
      mine,
      gradeInfo,
      isTeacher
    };
  }));

  const activeCourseId = state?.course?.id || courseFilter;
  const courseFiltered = activeCourseId === 'all'
    ? allPosts
    : allPosts.filter(p => p.courseId === activeCourseId);

  const isTeacher = profile?.role === 'teacher';
  const filtered = courseFiltered.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'assignment') return p.kind === 'assignment';
    if (filter === 'material') return p.kind === 'material';
    if (filter === 'pending') return p.kind === 'assignment' && !p.mine;
    if (filter === 'submitted') return p.kind === 'assignment' && Boolean(p.mine);
    if (filter === 'toGrade') return p.kind === 'assignment' && p.submittedCount > p.gradedCount;
    return true;
  });

  // เรียงลำดับจากกำหนดส่งใกล้ไปไกล (Earliest due date to latest)
  const sortedPosts = [...filtered].sort((a, b) => {
    if (a.dueAt && b.dueAt) {
      const diff = new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime();
      if (diff !== 0) return diff;
    }
    if (a.dueAt && !b.dueAt) return -1;
    if (!a.dueAt && b.dueAt) return 1;
    return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
  });

  return <>
    <div className="section-title">
      <div>
        <h2>งานในชั้นเรียน</h2>
        <p className="muted">
          {activeCourseId === 'all'
            ? `รวมงานทั้งหมดจากทุกห้องเรียน · เรียงตามกำหนดส่งจากใกล้ไปไกล (${sortedPosts.length} รายการ)`
            : `งานของห้องเรียน ${availableCourses.find(c => c.id === activeCourseId)?.name || state?.course?.name} · เรียงตามกำหนดส่ง (${sortedPosts.length} รายการ)`}
        </p>
      </div>
      {isTeacher && <Btn icon={Plus} onClick={create}>สร้างงาน / เนื้อหา</Btn>}
    </div>

    {availableCourses.length > 1 && (
      <div className="filter-row" style={{marginBottom: '10px'}}>
        <button
          className={`pill ${courseFilter === 'all' ? 'active' : ''}`}
          onClick={() => setCourseFilter('all')}
        >
          ทุกห้องเรียน ({allPosts.length})
        </button>
        {availableCourses.map(c => (
          <button
            key={c.id}
            className={`pill ${courseFilter === c.id ? 'active' : ''}`}
            onClick={() => setCourseFilter(c.id)}
          >
            {c.name}
          </button>
        ))}
      </div>
    )}

    <div className="filter-row">
      {[
        ['all', 'ทั้งหมด'],
        ['assignment', 'งานที่มอบหมาย'],
        ['material', 'เนื้อหาการเรียน'],
        ...(!isTeacher
          ? [['pending', 'การบ้านที่ยังไม่ส่ง'], ['submitted', 'ส่งแล้ว']]
          : [['toGrade', 'งานที่รอตรวจ']])
      ].map(([v, t]) => (
        <button
          key={v}
          className={`pill ${filter === v ? 'active' : ''}`}
          onClick={() => setFilter(v)}
        >
          {t}
        </button>
      ))}
    </div>

    <div className="work-grid">
      {sortedPosts.map(p => {
        const isAssignment = p.kind === 'assignment';
        const dueDate = p.dueAt ? new Date(p.dueAt) : null;
        const isOverdue = dueDate && dueDate < new Date();
        const memberCount = Math.max(1, (p.members || []).filter(m => m.role === 'student').length);

        return (
          <article className="work-card" key={`${p.courseId}-${p.id}`}>
            {p.course?.name && (
              <div className="work-course-tag">
                <BookOpen size={12}/>
                <span>{p.course.name}</span>
              </div>
            )}
            <div className="section-title">
              <span className={`work-icon ${p.kind}`}><ClipboardList size={23}/></span>
              <div style={{display: 'flex', gap: '6px', alignItems: 'center'}}>
                {isAssignment && isOverdue && !p.mine && !p.isTeacher && (
                  <Badge tone="orange">เลยกำหนด</Badge>
                )}
                <Badge tone={p.kind === 'material' ? '' : 'orange'}>
                  {p.kind === 'material' ? 'เนื้อหา' : 'งานที่มอบหมาย'}
                </Badge>
              </div>
            </div>
            <h3>{p.title}</h3>
            <p>{p.description}</p>
            {p.dueAt && (
              <div className={`muted icon-label ${isOverdue ? 'overdue-label' : ''}`}>
                <Clock size={14}/>
                <strong>กำหนดส่ง {date(p.dueAt)}</strong>
              </div>
            )}
            {isAssignment && (
              <>
                <div className="progress-bar">
                  <span style={{
                    width: `${p.isTeacher
                      ? (p.submittedCount / memberCount) * 100
                      : p.mine
                        ? 100
                        : 0}%`
                  }}/>
                </div>
                <small className="muted">
                  {p.isTeacher
                    ? `ส่งแล้ว ${p.submittedCount} คน · ให้คะแนน ${p.gradedCount} คน`
                    : p.gradeInfo
                      ? `ตรวจแล้ว ได้ ${p.gradeInfo.score} / ${p.maxScore} คะแนน`
                      : p.mine
                        ? `ส่งแล้ว${p.mine.late ? ' (ส่งช้า)' : ''}`
                        : 'ยังไม่ส่งงาน'}
                </small>
              </>
            )}
            <div className="work-actions">
              <button className="text-btn" onClick={() => open(p, p.courseId)}>
                ดูรายละเอียด<ArrowUpRight size={15}/>
              </button>
              {p.isTeacher && isAssignment && (
                <Btn secondary onClick={() => grade(p, p.courseId)}>ตรวจงาน</Btn>
              )}
            </div>
          </article>
        );
      })}
    </div>
    {!sortedPosts.length && <Empty>ยังไม่มีงานหรือเนื้อหาประเภทนี้</Empty>}
  </>;
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
