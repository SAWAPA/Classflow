import {useEffect, useState, useMemo, useRef} from 'react';
import {BookOpen, ClipboardList, CalendarDays, Clock, ArrowUpRight, ChevronRight, ChevronDown, Check, Layers, Plus, MessageCircle, Paperclip, RefreshCw, Send, AlertCircle, CheckCircle2, Filter, Search, X, Megaphone, FileText, Edit3} from 'lucide-react';
import {rpc} from './api';
import {Avatar, Badge, Btn, Empty, date, fullDate} from './ui';

export function Stream({state, profile, open, create}) {
  const teacher = profile.id === state.course.ownerId, assignments = state.posts.filter(p => p.kind === 'assignment');
  const [filterType, setFilterType] = useState('all'); // 'all' | 'assignment' | 'material' | 'files'
  const [search, setSearch] = useState('');

  const filteredPosts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (state?.posts || []).filter(post => {
      if (filterType === 'assignment' && post.kind !== 'assignment') return false;
      if (filterType === 'material' && post.kind !== 'material') return false;
      if (filterType === 'files' && (!post.files || post.files.length === 0)) return false;
      if (!q) return true;
      const title = (post.title || '').toLowerCase();
      const desc = (post.description || '').toLowerCase();
      const author = (post.authorName || '').toLowerCase();
      const filesMatch = (post.files || []).some(f => (f.filename || '').toLowerCase().includes(q));
      return title.includes(q) || desc.includes(q) || author.includes(q) || filesMatch;
    });
  }, [state?.posts, filterType, search]);

  return <div className="two-column"><section>
    <button className="composer" onClick={teacher ? create : undefined}>
      <Avatar name={profile.name}/>
      <span>{teacher ? 'วันนี้อยากแบ่งปันอะไรกับชั้นเรียน?' : 'พร้อมเรียนรู้สิ่งใหม่ไปด้วยกัน'}</span>
      {teacher && <Plus size={20}/>}
    </button>
    <div className="section-title">
      <h2>เรื่องราวในชั้นเรียน <span className="muted small-text">{state.posts.length} โพสต์</span></h2>
      <span className="eyebrow">LATEST UPDATES</span>
    </div>

    {/* แถบค้นหาและกรองประกาศ งาน และไฟล์ในห้องเรียนนี้ */}
    <div className="stream-search-bar">
      <div className="stream-search-input">
        <Search size={14} className="muted"/>
        <input
          type="text"
          placeholder="ค้นหาประกาศ, งาน หรือไฟล์ในห้องนี้…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          aria-label="ค้นหาในห้องเรียนนี้"
        />
        {search && (
          <button type="button" className="stream-search-clear" onClick={() => setSearch('')}>
            <X size={12}/>
          </button>
        )}
      </div>
      <div className="stream-filter-pills">
        <button
          type="button"
          className={`stream-pill ${filterType === 'all' ? 'active' : ''}`}
          onClick={() => setFilterType('all')}
        >
          ทั้งหมด ({state.posts.length})
        </button>
        <button
          type="button"
          className={`stream-pill ${filterType === 'assignment' ? 'active' : ''}`}
          onClick={() => setFilterType('assignment')}
        >
          <ClipboardList size={12}/> งาน ({assignments.length})
        </button>
        <button
          type="button"
          className={`stream-pill ${filterType === 'material' ? 'active' : ''}`}
          onClick={() => setFilterType('material')}
        >
          <Megaphone size={12}/> ประกาศ ({state.posts.filter(p => p.kind === 'material').length})
        </button>
        <button
          type="button"
          className={`stream-pill ${filterType === 'files' ? 'active' : ''}`}
          onClick={() => setFilterType('files')}
        >
          <Paperclip size={12}/> มีไฟล์แนบ ({state.posts.filter(p => p.files?.length > 0).length})
        </button>
      </div>
    </div>

    {filteredPosts.map(post => (
      <article className="post-card" key={post.id}>
        <div className="post-author">
          <div className={`post-symbol ${post.kind}`}>
            {post.kind === 'assignment' ? <ClipboardList size={21}/> : <BookOpen size={21}/>}
          </div>
          <div className="post-author-info">
            <strong>{post.authorName}</strong>
            <div className="post-timestamps-row">
              <small>โพสต์เมื่อ {date(post.createdAt)}</small>
              {post.updatedAt && (
                <span className="post-edited-indicator" title={`แก้ไขล่าสุดเมื่อ ${fullDate(post.updatedAt)}`}>
                  <Edit3 size={11}/> (แก้ไขแล้วเมื่อ {date(post.updatedAt)})
                </span>
              )}
            </div>
          </div>
          <div className="post-author-badges">
            <Badge tone={post.kind === 'assignment' ? 'orange' : ''}>
              {post.kind === 'assignment' ? 'มอบหมายงาน' : 'เนื้อหา'}
            </Badge>
            {teacher && (
              <button
                type="button"
                className="post-card-edit-btn"
                title="แก้ไขรายละเอียดโพสต์นี้"
                onClick={(e) => {
                  e.stopPropagation();
                  open(post, undefined, true);
                }}
              >
                <Edit3 size={13}/>
                <span>แก้ไข</span>
              </button>
            )}
          </div>
        </div>
        <button className="post-open" onClick={() => open(post)}>
          <h3>{post.title}</h3>
          <p>{post.description}</p>
          {post.kind === 'assignment' && (
            <div className="post-due">
              <Clock size={14}/>
              <span>กำหนดส่ง {date(post.dueAt)}</span>
              <strong>{post.maxScore} คะแนน</strong>
            </div>
          )}
          <span className="post-link">
            {post.kind === 'assignment' ? 'ดูงานและรายละเอียด' : 'อ่านเนื้อหาและความคิดเห็น'}
            <ArrowUpRight size={16}/>
          </span>
        </button>
        <div className="post-bottom">
          <MessageCircle size={15}/>
          {state.comments.filter(c => c.postId === post.id).length} ความคิดเห็น
          {post.files.length > 0 && (
            <span><Paperclip size={14}/> {post.files.length} ไฟล์แนบ</span>
          )}
        </div>
      </article>
    ))}
    {!filteredPosts.length && (
      <Empty>
        {search || filterType !== 'all' ? 'ไม่พบประกาศ งาน หรือไฟล์ที่ตรงกับคำค้นหา' : 'ยังไม่มีโพสต์ในห้องเรียนนี้'}
      </Empty>
    )}
  </section><aside><div className="side-card"><div className="section-title"><h3>กำลังจะถึง</h3><CalendarDays size={18}/></div>{assignments.filter(p => new Date(p.dueAt) >= new Date()).sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 4).map(p => <button className="upcoming" key={p.id} onClick={() => open(p)}><div className="date-tile"><strong>{new Date(p.dueAt).getDate()}</strong><small>{new Date(p.dueAt).toLocaleDateString('th-TH', {month: 'short'})}</small></div><div><strong>{p.title}</strong><small>{date(p.dueAt)}</small></div><ChevronRight size={15}/></button>)}{!assignments.some(p => new Date(p.dueAt) >= new Date()) && <p className="muted">ยังไม่มีกำหนดส่งงานถัดไป</p>}</div>{teacher && <div className="side-card"><small className="eyebrow">INVITE YOUR CLASS</small><h3>รหัสเข้าห้องเรียน</h3><div className="join-code">{state.course.joinCode}</div><p className="muted">ส่งรหัสนี้ให้นักเรียนเข้าร่วม</p></div>}</aside></div>;
}
export function CourseFilterDropdown({courses = [], selectedId = 'all', onSelect, allCount = 0, countsByCourse}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef(null);

  const selectedCourse = courses.find(c => c.id === selectedId);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [open]);

  const filteredCourses = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return courses;
    const cleanQ = q.replace(/[\s\-_]/g, '');
    return courses.filter(c => {
      const name = (c.name || '').toLowerCase();
      const subject = (c.subject || '').toLowerCase();
      const teacher = (c.teacherName || '').toLowerCase();
      const code = (c.code || '').toLowerCase();
      if (name.includes(q) || subject.includes(q) || teacher.includes(q) || code.includes(q)) return true;
      if (cleanQ) {
        const cleanName = name.replace(/[\s\-_]/g, '');
        const cleanSubject = subject.replace(/[\s\-_]/g, '');
        const cleanCode = code.replace(/[\s\-_]/g, '');
        if (cleanName.includes(cleanQ) || cleanSubject.includes(cleanQ) || cleanCode.includes(cleanQ)) return true;
      }
      return false;
    });
  }, [courses, search]);

  const selectedCount = selectedId === 'all'
    ? allCount
    : (countsByCourse ? countsByCourse(selectedId) : 0);

  return (
    <div className="course-filter-dropdown-wrapper" ref={ref}>
      <button
        type="button"
        className={`course-filter-dropdown-btn ${open ? 'open' : ''} ${selectedId !== 'all' ? 'filtered' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-label="เลือกรายวิชาเพื่อกรองข้อมูล"
      >
        <div className="filter-dropdown-btn-left">
          <Filter size={14} className="filter-icon"/>
          <span className="filter-label">รายวิชา:</span>
          <strong className="filter-selected-name" title={selectedCourse ? selectedCourse.name : 'ทุกรายวิชา'}>
            {selectedCourse ? selectedCourse.name : 'ทุกรายวิชา'}
          </strong>
        </div>
        <span className="filter-selected-badge">{selectedCount}</span>
        <ChevronDown size={14} className={`filter-chevron ${open ? 'open' : ''}`}/>
      </button>

      {open && (
        <div className="course-filter-dropdown-menu">
          <div className="course-filter-search">
            <Search size={14} className="course-filter-search-icon"/>
            <input
              type="text"
              placeholder="ค้นหาชื่อวิชา หรือรหัสวิชา…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button
                type="button"
                className="filter-search-clear"
                aria-label="ล้างคำค้นหา"
                onClick={() => setSearch('')}
              >
                <X size={12}/>
              </button>
            )}
          </div>

          <div className="course-filter-list">
            {(!search.trim() || 'ทุกรายวิชา'.includes(search.trim().toLowerCase()) || 'all'.includes(search.trim().toLowerCase())) && (
              <div
                className={`course-filter-item ${selectedId === 'all' ? 'active' : ''}`}
                onClick={() => {
                  onSelect('all');
                  setOpen(false);
                  setSearch('');
                }}
              >
                <div className="course-filter-item-icon all">
                  <Layers size={14}/>
                </div>
                <div className="course-filter-item-text">
                  <strong>ทุกรายวิชา</strong>
                  <small>แสดงงานจากทุกห้องเรียน</small>
                </div>
                <span className="item-count-badge">{allCount}</span>
                {selectedId === 'all' && <Check size={14} className="item-check"/>}
              </div>
            )}

            {filteredCourses.map(c => {
              const count = countsByCourse ? countsByCourse(c.id) : 0;
              const isSelected = selectedId === c.id;
              return (
                <div
                  key={c.id}
                  className={`course-filter-item ${isSelected ? 'active' : ''}`}
                  onClick={() => {
                    onSelect(c.id);
                    setOpen(false);
                    setSearch('');
                  }}
                >
                  <div className="course-filter-item-icon">
                    <BookOpen size={14}/>
                  </div>
                  <div className="course-filter-item-text">
                    <strong>{c.name}</strong>
                    <small>
                      {c.subject ? `${c.subject} · ` : ''}{c.teacherName ? `อาจารย์ ${c.teacherName}` : 'ห้องเรียน'}
                    </small>
                  </div>
                  <span className="item-count-badge">{count}</span>
                  {isSelected && <Check size={14} className="item-check"/>}
                </div>
              );
            })}

            {filteredCourses.length === 0 && search.trim() && (
              <div className="course-filter-empty">
                <p>ไม่พบรายวิชาที่ตรงกับ <strong>"{search}"</strong></p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Work({state, states = [], courses = [], profile, open, grade, create}) {
  const [activeTab, setActiveTab] = useState('pending'); // 'pending' | 'overdue' | 'submitted'
  const [courseFilter, setCourseFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const isSingleClass = Boolean(state && state.course);
  const entries = isSingleClass ? [state] : (states.length ? states : (state ? [state] : []));
  const availableCourses = isSingleClass
    ? (state.course ? [state.course] : [])
    : (courses.length ? courses : entries.map(e => e.course).filter(Boolean));

  const now = new Date();
  const isTeacherRole = profile?.role === 'teacher' || (isSingleClass ? profile?.id === state?.course?.ownerId : entries.some(s => profile?.id === s?.course?.ownerId));

  // ดึงรายการงานที่ได้รับมอบหมายทั้งหมดจากห้องเรียนที่ระบุ (หากอยู่ในห้องเรียนเดี่ยว จะดึงเฉพาะห้องเรียนนั้น)
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

  // กรองตามรายวิชาที่เลือก (หากอยู่ในหน้าห้องเรียนเดี่ยว จะยึดเฉพาะห้องเรียนนั้นเสมอ)
  const courseFiltered = isSingleClass
    ? allAssignments
    : (courseFilter === 'all'
        ? allAssignments
        : allAssignments.filter(p => p.courseId === courseFilter));

  // กรองตามคำค้นหา (ชื่อเรื่อง, คำอธิบาย, ชื่อวิชา, ไฟล์แนบ)
  const searchedAssignments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return courseFiltered;
    return courseFiltered.filter(p => {
      const title = (p.title || '').toLowerCase();
      const desc = (p.description || '').toLowerCase();
      const courseName = (p.course?.name || '').toLowerCase();
      const subject = (p.course?.subject || '').toLowerCase();
      const filesMatch = (p.files || []).some(f => (f.filename || '').toLowerCase().includes(q)) ||
                         (p.mine?.files || []).some(f => (f.filename || '').toLowerCase().includes(q));
      return title.includes(q) || desc.includes(q) || courseName.includes(q) || subject.includes(q) || filesMatch;
    });
  }, [courseFiltered, searchQuery]);

  // แยกรายการ 3 แถบออกจากกันโดยสิ้นเชิง พร้อมเรียงตามกำหนดส่ง
  const pendingList = searchedAssignments
    .filter(p => p.category === 'pending')
    .sort((a, b) => {
      if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
      if (a.dueAt && !b.dueAt) return -1;
      if (!a.dueAt && b.dueAt) return 1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

  const overdueList = searchedAssignments
    .filter(p => p.category === 'overdue')
    .sort((a, b) => {
      if (a.dueAt && b.dueAt) return new Date(a.dueAt) - new Date(b.dueAt);
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });

  const submittedList = searchedAssignments
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

  const canCreate = isSingleClass
    ? (profile?.id === state.course?.ownerId)
    : (profile?.role === 'teacher');

  return (
    <div className="tab-pane">
      <div className="section-title">
        <div>
          <h2>งานในชั้นเรียน</h2>
          <p className="muted">
            {isSingleClass
              ? `งานในรายวิชา ${state?.course?.name || ''} (${allAssignments.length} งาน)`
              : (courseFilter === 'all'
                  ? `รวมงานทั้งหมดจากทุกรายวิชา (${allAssignments.length} งาน)`
                  : `งานในรายวิชา ${availableCourses.find(c => c.id === courseFilter)?.name || ''} (${courseFiltered.length} งาน)`)}
          </p>
        </div>
        {canCreate && (
          <Btn icon={Plus} onClick={create}>สร้างงาน / การบ้าน</Btn>
        )}
      </div>

      {/* แถบฟิวเตอร์เลือกรายวิชาและค้นหา */}
      <div className="work-filter-bar">
        {!isSingleClass && availableCourses.length > 0 && (
          <CourseFilterDropdown
            courses={availableCourses}
            selectedId={courseFilter}
            onSelect={setCourseFilter}
            allCount={allAssignments.length}
            countsByCourse={cId => allAssignments.filter(p => p.courseId === cId).length}
          />
        )}
        <div className="work-search-box">
          <Search size={14} className="muted"/>
          <input
            type="text"
            placeholder={isSingleClass ? "ค้นหางานในวิชานี้ หรือไฟล์แนบ…" : "ค้นหางาน หรือไฟล์แนบ…"}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            aria-label="ค้นหางานในชั้นเรียน"
          />
          {searchQuery && (
            <button type="button" className="stream-search-clear" onClick={() => setSearchQuery('')}>
              <X size={12}/>
            </button>
          )}
        </div>
      </div>

      {/* แถบสลับ 3 หมวดหมู่หลัก แยกออกจากกันโดยสิ้นเชิง */}
      <div className="assignment-tabs">
        <button
          className={`assignment-tab ${activeTab === 'pending' ? 'active' : ''}`}
          onClick={() => setActiveTab('pending')}
        >
          <Clock size={16}/>
          <span>{isTeacherRole ? 'ยังไม่ตรวจ' : 'ยังไม่ส่ง'}</span>
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
          <span>{isTeacherRole ? 'ตรวจแล้ว' : 'ส่งแล้ว'}</span>
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
                    isTeacherRole ? (
                      post.submittedCount > post.gradedCount ? (
                        <Badge tone="orange"><Clock size={11}/> รอตรวจ ({post.submittedCount - post.gradedCount})</Badge>
                      ) : (
                        <Badge tone="gray"><Clock size={11}/> ยังไม่ตรวจ</Badge>
                      )
                    ) : (
                      isDueSoon ? (
                        <Badge tone="orange"><Clock size={11}/> ใกล้ถึงกำหนด</Badge>
                      ) : (
                        <Badge tone="gray"><Clock size={11}/> ยังไม่ส่ง</Badge>
                      )
                    )
                  )}

                  {activeTab === 'overdue' && (
                    <Badge tone="orange"><AlertCircle size={11}/> เลยกำหนดส่ง</Badge>
                  )}

                  {activeTab === 'submitted' && (
                    isTeacherRole ? (
                      <Badge><CheckCircle2 size={11}/> ตรวจแล้ว</Badge>
                    ) : (
                      post.mine?.late ? (
                        <Badge tone="orange"><CheckCircle2 size={11}/> ส่งช้า</Badge>
                      ) : (
                        <Badge><CheckCircle2 size={11}/> ส่งแล้ว</Badge>
                      )
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
                  {post.updatedAt && (
                    <div className="assignment-meta-item edited" title={`แก้ไขล่าสุดเมื่อ ${fullDate(post.updatedAt)}`}>
                      <Edit3 size={13}/>
                      <span>แก้ไขแล้วเมื่อ: {date(post.updatedAt)}</span>
                    </div>
                  )}
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
                    <div style={{display: 'flex', gap: '8px', alignItems: 'center'}}>
                      <button
                        type="button"
                        className="text-btn"
                        onClick={() => open(post, post.courseId, true)}
                        title="แก้ไขรายละเอียดงานนี้"
                        style={{display: 'inline-flex', alignItems: 'center', gap: '4px'}}
                      >
                        <Edit3 size={13}/> แก้ไข
                      </button>
                      <Btn secondary onClick={() => grade(post, post.courseId)}>
                        ตรวจงาน ({post.submittedCount})
                      </Btn>
                    </div>
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
          {searchQuery.trim() && (
            <>
              <Search size={42} className="icon-muted"/>
              <div className="empty-text">
                <h3>ไม่พบงานที่ค้นหา</h3>
                <p>ไม่พบงานที่ตรงกับ “{searchQuery.trim()}” ในแถบนี้ ลองเปลี่ยนคำค้นหาหรือเลือกแถบสถานะอื่น</p>
              </div>
            </>
          )}
          {!searchQuery.trim() && activeTab === 'pending' && (
            <>
              <CheckCircle2 size={42} className="icon-success"/>
              <div className="empty-text">
                <h3>{isTeacherRole ? 'ไม่มีงานที่ยังไม่ตรวจ' : 'ไม่มีงานที่ค้างส่ง'}</h3>
                <p>{isTeacherRole ? 'ตรวจงานครบทุกรายการแล้ว หรือยังไม่มีงานใหม่ในขณะนี้' : 'คุณส่งงานที่มอบหมายครบทั้งหมดแล้ว หรือยังไม่มีงานใหม่ในขณะนี้'}</p>
              </div>
            </>
          )}
          {!searchQuery.trim() && activeTab === 'overdue' && (
            <>
              <CheckCircle2 size={42} className="icon-success"/>
              <div className="empty-text">
                <h3>ไม่มีงานที่เลยกำหนดส่ง</h3>
                <p>{isTeacherRole ? 'ไม่มีงานที่เลยกำหนดส่งในขณะนี้' : 'ยอดเยี่ยมมาก! ไม่มีงานค้างส่งที่เกินกำหนดเวลา'}</p>
              </div>
            </>
          )}
          {!searchQuery.trim() && activeTab === 'submitted' && (
            <>
              <Clock size={42} className="icon-muted"/>
              <div className="empty-text">
                <h3>{isTeacherRole ? 'ยังไม่มีงานที่ตรวจแล้ว' : 'ยังไม่มีงานที่ส่งแล้ว'}</h3>
                <p>{isTeacherRole ? 'เมื่องานได้รับการตรวจครบถ้วนแล้ว จะปรากฏในแถบนี้' : 'เมื่องานถูกส่งแล้ว ข้อมูลและผลคะแนนจะปรากฏในแถบนี้'}</p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
export function Timeline({state, states = [], courses = [], profile, open}) {
  const [courseFilter, setCourseFilter] = useState('all');

  // รวบรวมข้อมูลห้องเรียนทั้งหมด
  const entries = useMemo(() => {
    if (state && (!states || states.length === 0)) return [state];
    if (states && states.length > 0) {
      if (state && !states.some(s => s?.course?.id === state?.course?.id)) {
        return [state, ...states];
      }
      return states;
    }
    return state ? [state] : [];
  }, [state, states]);

  const availableCourses = useMemo(() => {
    if (courses && courses.length > 0) return courses;
    const list = [];
    const seen = new Set();
    entries.forEach(s => {
      if (s?.course && !seen.has(s.course.id)) {
        seen.add(s.course.id);
        list.push(s.course);
      }
    });
    return list;
  }, [courses, entries]);

  const allPosts = useMemo(() => {
    const now = new Date();
    return entries.flatMap(s => {
      const isTeacher = profile?.id === s?.course?.ownerId;
      const submissions = s?.submissions || [];
      return (s?.posts || [])
        .filter(p => p && p.kind === 'assignment')
        .map(p => {
          const mine = submissions.find(sub => sub.postId === p.id && sub.userId === profile?.id);
          const submitted = submissions.filter(sub => sub.postId === p.id);
          const dueDate = p.dueAt ? new Date(p.dueAt) : null;
          const isPast = Boolean(dueDate && dueDate < now);

          return {
            ...p,
            course: s?.course,
            courseId: s?.course?.id,
            mine,
            submittedCount: submitted.length,
            isTeacher,
            dueDate,
            isPast
          };
        });
    });
  }, [entries, profile?.id]);

  const filteredPosts = useMemo(() => {
    const list = courseFilter === 'all'
      ? allPosts
      : allPosts.filter(p => p.courseId === courseFilter);

    return list.sort((a, b) => {
      if (a.dueDate && b.dueDate) return a.dueDate - b.dueDate;
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
    });
  }, [allPosts, courseFilter]);

  return (
    <section className="panel">
      <div className="section-title">
        <div>
          <div className="eyebrow">ONE STEP AT A TIME</div>
          <h2>กำหนดส่งงาน</h2>
          <p className="muted">
            {courseFilter === 'all'
              ? `รวมกำหนดส่งงานทั้งหมดจากทุกรายวิชา (${allPosts.length} งาน)`
              : `กำหนดส่งงานในรายวิชา ${availableCourses.find(c => c.id === courseFilter)?.name || ''} (${filteredPosts.length} งาน)`}
          </p>
        </div>
        <CalendarDays size={28}/>
      </div>

      {/* แถบฟิลเตอร์เลือกรายวิชา */}
      {availableCourses.length > 0 && (
        <div className="work-filter-bar" style={{marginBottom: '20px'}}>
          <CourseFilterDropdown
            courses={availableCourses}
            selectedId={courseFilter}
            onSelect={setCourseFilter}
            allCount={allPosts.length}
            countsByCourse={cId => allPosts.filter(p => p.courseId === cId).length}
          />
        </div>
      )}

      <div className="timeline">
        {filteredPosts.map(p => {
          return (
            <button
              className="timeline-item"
              key={`${p.courseId || 'c'}-${p.id}`}
              onClick={() => open(p, p.courseId)}
            >
              <span className={`timeline-dot ${p.isPast ? 'past' : ''}`}/>
              <div className="timeline-date">{p.dueAt ? date(p.dueAt) : 'ไม่มีกำหนดส่ง'}</div>
              <div style={{flex: 1, minWidth: 0}}>
                {p.course?.name && (
                  <span className="timeline-course-tag">
                    <BookOpen size={11}/>
                    <span>{p.course.name}</span>
                  </span>
                )}
                <h3>{p.title}</h3>
                <p>
                  {p.maxScore} คะแนน · {p.isTeacher ? `ส่งแล้ว ${p.submittedCount} คน` : p.mine ? (p.mine.late ? 'ส่งช้า' : 'ส่งแล้ว') : (p.isPast ? 'เลยกำหนดส่ง' : 'ยังไม่ส่ง')}
                  {p.updatedAt && <span style={{marginLeft: '8px', color: '#16645b', fontWeight: '500'}}>· แก้ไขแล้ว</span>}
                </p>
              </div>
              <ArrowUpRight size={18}/>
            </button>
          );
        })}
        {!filteredPosts.length && (
          <Empty icon={CalendarDays}>
            {courseFilter !== 'all' ? 'ไม่มีกำหนดส่งงานในรายวิชานี้' : 'ยังไม่มีกำหนดส่งงาน'}
          </Empty>
        )}
      </div>
    </section>
  );
}
