import {useEffect, useState, useMemo, useRef} from 'react';
import {BookOpen, Home, LayoutDashboard, ClipboardList, MessageCircle, Users, CalendarDays, Plus, ArrowUpRight, ChevronRight, ChevronDown, LogOut, GraduationCap, FileText, Layers, Settings, RefreshCw, AlertCircle, X, Bell, Check, Upload, CheckCircle2, Search} from 'lucide-react';
import {rpc, isLocal, getSession, saveSession, exchangeGoogleCode, signOut} from './api';
import {Avatar, Badge, Btn, Empty, date} from './ui';
import {Auth, ClassForm, Profile, PostForm, PostDetail, Grading, RoleModal} from './forms';
import AdminPanel from './Admin';
import {Stream, Work, Timeline, Messages} from './views';
import Dashboard from './Dashboard';
import HomeDashboard from './HomeDashboard';
const labels = {home: 'หน้าหลัก', stream: 'หน้าชั้นเรียน', work: 'งานในชั้นเรียน', dashboard: 'คะแนนและเกรด', people: 'สมาชิก', messages: 'ข้อความ', timeline: 'กำหนดส่งงาน'};
const navigation = [[Home, 'home'], [ClipboardList, 'work'], [LayoutDashboard, 'dashboard'], [Users, 'people'], [MessageCircle, 'messages'], [CalendarDays, 'timeline']];

function timeAgo(dateString) {
  if (!dateString) return '';
  const diffSec = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (diffSec < 60) return 'เมื่อสักครู่';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} นาทีที่แล้ว`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour} ชม. ที่แล้ว`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay === 1) return 'เมื่อวานนี้';
  if (diffDay < 7) return `${diffDay} วันที่แล้ว`;
  return new Date(dateString).toLocaleDateString('th-TH', {day: 'numeric', month: 'short'});
}

function NotificationBell({homeStates = [], profile, teacher, onOpenPost, onGradeAssessment}) {
  const [open, setOpen] = useState(false);
  const storageKey = `classflow_read_notis_${profile?.id || 'guest'}`;

  const [readIds, setReadIds] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || '[]');
    } catch {
      return [];
    }
  });

  const notifications = useMemo(() => {
    if (!profile || !homeStates.length) return [];
    const list = [];
    const isTeacher = teacher || profile?.role === 'teacher';

    homeStates.forEach(s => {
      if (!s?.course) return;
      const course = s.course;
      const isOwner = profile.id === course.ownerId;

      // สำหรับอาจารย์: แสดงว่านักเรียนคนไหนส่งงานมาแล้วบ้าง ในทุกห้องเรียนที่รับผิดชอบ
      if (isOwner || isTeacher) {
        (s.submissions || []).forEach(sub => {
          const student = (s.members || []).find(m => m.userId === sub.userId);
          const studentName = student?.name || (sub.userId === profile.id ? profile.name : 'นักเรียน');
          const studentCode = student?.studentId ? ` (${student.studentId})` : '';
          const post = (s.posts || []).find(p => p.id === sub.postId);

          list.push({
            id: `sub-${course.id}-${sub.postId}-${sub.userId}-${sub.submittedAt || sub.createdAt}`,
            type: 'submission',
            title: `${studentName}${studentCode} ส่งงานแล้ว`,
            description: `ส่งงาน "${post?.title || 'งานที่มอบหมาย'}" ในวิชา ${course.name}${sub.late ? ' (ส่งช้า)' : ''}`,
            courseId: course.id,
            courseName: course.name,
            timestamp: sub.submittedAt || sub.createdAt,
            post,
            action: () => {
              if (post) onGradeAssessment(post, course.id);
            }
          });
        });
      }

      // สำหรับนักเรียน: แสดงสิ่งที่เกิดขึ้นใน classroom ทั้งหมดที่สังกัด (งานใหม่, เนื้อหาใหม่, การตรวจงาน)
      if (!isTeacher || !isOwner) {
        // งานและเนื้อหาที่อาจารย์โพสต์
        (s.posts || []).forEach(p => {
          list.push({
            id: `post-${course.id}-${p.id}`,
            type: p.kind === 'assignment' ? 'assignment' : 'material',
            title: p.kind === 'assignment' ? `งานใหม่: ${p.title}` : `เนื้อหาใหม่: ${p.title}`,
            description: `อาจารย์ ${p.authorName || course.teacherName} ได้โพสต์ในวิชา ${course.name}${p.dueAt ? ` · กำหนดส่ง ${date(p.dueAt)}` : ''}`,
            courseId: course.id,
            courseName: course.name,
            timestamp: p.createdAt,
            post: p,
            action: () => {
              onOpenPost(p, course.id);
            }
          });
        });

        // ประกาศผลคะแนนที่ตรวจแล้ว
        Object.entries(s.gradebooks || {}).forEach(([postId, grades]) => {
          const myGrade = grades?.[profile.id];
          if (myGrade) {
            const post = (s.posts || []).find(p => p.id === postId);
            list.push({
              id: `grade-${course.id}-${postId}-${profile.id}-${myGrade.gradedAt || ''}`,
              type: 'grade',
              title: `ตรวจงานแล้ว: ${post?.title || 'งานที่มอบหมาย'}`,
              description: `ได้รับ ${myGrade.score} / ${post?.maxScore || 100} คะแนน ในวิชา ${course.name}${myGrade.feedback ? ` · "${myGrade.feedback}"` : ''}`,
              courseId: course.id,
              courseName: course.name,
              timestamp: myGrade.gradedAt || post?.createdAt,
              post,
              action: () => {
                if (post) onOpenPost(post, course.id);
              }
            });
          }
        });
      }
    });

    return list.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0));
  }, [homeStates, profile, teacher]);

  const unreadCount = notifications.filter(n => !readIds.includes(n.id)).length;

  const markAllAsRead = () => {
    const allIds = notifications.map(n => n.id);
    setReadIds(allIds);
    try {
      localStorage.setItem(storageKey, JSON.stringify(allIds));
    } catch {}
  };

  const handleToggle = () => {
    if (!open) {
      // เมื่อกดเปิดดู ให้ถือว่าอ่านแล้วเพื่อเคลียร์จุดแดงทันทีตามที่ผู้ใช้ต้องการ
      markAllAsRead();
    }
    setOpen(prev => !prev);
  };

  const handleItemClick = (item) => {
    if (!readIds.includes(item.id)) {
      const updated = [...readIds, item.id];
      setReadIds(updated);
      try {
        localStorage.setItem(storageKey, JSON.stringify(updated));
      } catch {}
    }
    setOpen(false);
    if (item.action) {
      item.action();
    }
  };

  const ref = useRef(null);
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

  return (
    <div className="notif-wrapper" ref={ref}>
      <button
        className="icon-btn notif-btn"
        aria-label="การแจ้งเตือน"
        onClick={handleToggle}
        title="การแจ้งเตือน"
      >
        <Bell size={18}/>
        {unreadCount > 0 && <span className="notif-badge" />}
      </button>

      {open && (
        <div className="notif-dropdown">
          <div className="notif-head">
            <div className="notif-head-title">
              <strong>การแจ้งเตือน</strong>
              <span className="notif-head-badge">{notifications.length}</span>
            </div>
            {notifications.length > 0 && (
              <button className="notif-clear-btn" onClick={markAllAsRead}>
                <Check size={13}/> อ่านแล้วทั้งหมด
              </button>
            )}
          </div>

          <div className="notif-scroll">
            {notifications.length > 0 ? (
              notifications.slice(0, 30).map(item => {
                const isUnread = !readIds.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`notif-card ${isUnread ? 'unread' : ''}`}
                    onClick={() => handleItemClick(item)}
                  >
                    <div className={`notif-type-icon ${item.type}`}>
                      {item.type === 'submission' && <Upload size={14}/>}
                      {item.type === 'assignment' && <ClipboardList size={14}/>}
                      {item.type === 'material' && <BookOpen size={14}/>}
                      {item.type === 'grade' && <CheckCircle2 size={14}/>}
                    </div>
                    <div className="notif-body">
                      <div className="notif-meta">
                        <span className="notif-course-tag">{item.courseName}</span>
                        <span className="notif-time">{timeAgo(item.timestamp)}</span>
                      </div>
                      <strong className="notif-title">{item.title}</strong>
                      <p className="notif-desc">{item.description}</p>
                    </div>
                    {isUnread && <span className="notif-dot" />}
                  </div>
                );
              })
            ) : (
              <div className="notif-empty">
                <Bell size={32}/>
                <p>ยังไม่มีการแจ้งเตือนในขณะนี้</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CourseSearch({courses = [], onSelectCourse}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return courses.filter(c => {
      const name = (c.name || '').toLowerCase();
      const teacher = (c.teacherName || '').toLowerCase();
      const subject = (c.subject || '').toLowerCase();
      return name.includes(q) || teacher.includes(q) || subject.includes(q);
    });
  }, [query, courses]);

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

  const handleSelect = (courseId) => {
    onSelectCourse(courseId);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="top-search-wrapper" ref={ref}>
      <div className={`top-search-bar ${open && query.trim() ? 'focused' : ''}`}>
        <Search size={15} className="top-search-icon"/>
        <input
          type="text"
          placeholder="ค้นหาวิชา หรืออาจารย์…"
          value={query}
          onChange={e => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => {
            if (query.trim()) setOpen(true);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && results.length > 0) {
              handleSelect(results[0].id);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          aria-label="ค้นหารายวิชาและอาจารย์"
        />
        {query && (
          <button
            type="button"
            className="top-search-clear"
            aria-label="ล้างคำค้นหา"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
          >
            <X size={13}/>
          </button>
        )}
      </div>

      {open && query.trim() && (
        <div className="top-search-dropdown">
          <div className="top-search-header">
            <span>ผลการค้นหา ({results.length})</span>
          </div>

          <div className="top-search-list">
            {results.length > 0 ? (
              results.map(course => (
                <div
                  key={course.id}
                  className="top-search-item"
                  onClick={() => handleSelect(course.id)}
                >
                  <div className="search-item-icon">
                    <BookOpen size={16}/>
                  </div>
                  <div className="search-item-info">
                    <strong className="search-item-title">{course.name}</strong>
                    <div className="search-item-meta">
                      {course.teacherName && (
                        <span className="search-item-teacher">
                          <Users size={12}/> อาจารย์ {course.teacherName}
                        </span>
                      )}
                      {course.subject && (
                        <span className="search-item-subject">
                          {course.subject}
                        </span>
                      )}
                    </div>
                  </div>
                  <ChevronRight size={14} className="search-item-arrow"/>
                </div>
              ))
            ) : (
              <div className="top-search-empty">
                <Search size={22}/>
                <p>ไม่พบรายวิชาหรืออาจารย์ที่ตรงกับ <strong>"{query}"</strong></p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ClassSelector({cid, courses = [], onSelectCourse, onGoHome}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  const selectedCourse = courses.find(c => c.id === cid);

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

  return (
    <div className="custom-class-select-wrapper" ref={ref}>
      <button
        type="button"
        className={`custom-class-select ${open ? 'open' : ''} ${cid ? 'has-course' : ''}`}
        onClick={() => setOpen(prev => !prev)}
        aria-expanded={open}
        aria-label="เลือกห้องเรียน"
      >
        <div className="class-select-icon">
          {cid ? <BookOpen size={16}/> : <Home size={16}/>}
        </div>
        <div className="class-select-text">
          <strong>{selectedCourse ? selectedCourse.name : 'หน้าหลัก · ห้องเรียนทั้งหมด'}</strong>
          <small>{selectedCourse ? (selectedCourse.teacherName ? `อาจารย์ ${selectedCourse.teacherName}` : selectedCourse.subject || 'ห้องเรียน') : 'ดูภาพรวมทุกวิชา'}</small>
        </div>
        <div className={`class-select-arrow ${open ? 'open' : ''}`}>
          <ChevronDown size={15}/>
        </div>
      </button>

      {open && (
        <div className="class-dropdown-menu">
          <div className="class-dropdown-header">
            <span>พื้นที่เรียนรู้</span>
          </div>

          <div
            className={`class-dropdown-item ${!cid ? 'active' : ''}`}
            onClick={() => {
              onGoHome();
              setOpen(false);
            }}
          >
            <div className="item-icon home">
              <Home size={15}/>
            </div>
            <div className="item-info">
              <strong>หน้าหลัก · ห้องเรียนทั้งหมด</strong>
              <small>ดูภาพรวม สรุปงาน และกิจกรรมทุกวิชา</small>
            </div>
            {!cid && <Check size={15} className="item-check"/>}
          </div>

          {courses.length > 0 && (
            <>
              <div className="class-dropdown-divider"/>
              <div className="class-dropdown-header">
                <span>ห้องเรียนของคุณ ({courses.length})</span>
              </div>
              <div className="class-dropdown-list">
                {courses.map(c => {
                  const isCurrent = c.id === cid;
                  return (
                    <div
                      key={c.id}
                      className={`class-dropdown-item ${isCurrent ? 'active' : ''}`}
                      onClick={() => {
                        onSelectCourse(c.id);
                        setOpen(false);
                      }}
                    >
                      <div className="item-icon course">
                        <BookOpen size={15}/>
                      </div>
                      <div className="item-info">
                        <strong>{c.name}</strong>
                        <small>{c.teacherName ? `อาจารย์ ${c.teacherName}` : c.subject || 'ห้องเรียน'}</small>
                      </div>
                      {isCurrent && <Check size={15} className="item-check"/>}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(getSession), [boot, setBoot] = useState(null), [bootError, setBootError] = useState(''), [cid, setCid] = useState(''), [lastCid, setLastCid] = useState(''), [state, setState] = useState(null), [homeStates, setHomeStates] = useState([]), [homeLoading, setHomeLoading] = useState(false), [homeRefreshKey, setHomeRefreshKey] = useState(0), [tab, setTab] = useState('home'), [modal, setModal] = useState(null), [detail, setDetail] = useState(null), [grading, setGrading] = useState(null), [toast, setToast] = useState(''), [loading, setLoading] = useState(false);
  const profile = boot?.profile, teacher = profile?.role === 'teacher';
  function notify(message) {setToast(message);}
  function login(value) {saveSession(value); setSession(value); setBoot(null); setBootError(''); setState(null); setCid(''); setLastCid('');}
  function logout() {const pending = signOut(); setSession(null); setState(null); setBoot(null); setBootError(''); setCid(''); setLastCid(''); setModal(null); setDetail(null); setGrading(null); pending.catch(error => notify(error.message));}
  async function bootstrap(nextId) {setBootError(''); try {const r = await rpc('bootstrap'); setBoot(r); if (nextId) {setTab('stream'); setCid(nextId); setLastCid(nextId);} return r;} catch (error) {setBootError(error.message); throw error;}}
  async function refresh() {
    if (cid) {
      const updated = await rpc('getClass', {classId: cid});
      setState(updated);
      setHomeStates(prev => prev.map(s => s?.course?.id === cid ? updated : s));
    }
  }
  async function loadHome() {
    if (!boot?.courses?.length || boot.profile?.role === 'admin') {setHomeStates([]); return;}
    setHomeLoading(true);
    try {
      const results = await Promise.allSettled(boot.courses.map(course => rpc('getClass', {classId: course.id})));
      setHomeStates(results.filter(r => r.status === 'fulfilled').map(r => r.value));
    }
    catch (error) {notify(error.message);}
    finally {setHomeLoading(false);}
  }
  function goHome() {
    if (tab === 'home' && !cid) return;
    setCid('');
    setTab('home');
  }
  function openClass(classId, nextTab = 'stream', postId = null) {
    const targetCourseId = classId || lastCid || boot?.courses?.[0]?.id;
    if (!targetCourseId) {
      notify('คุณยังไม่มีห้องเรียน กรุณาสร้างหรือเข้าร่วมห้องเรียนก่อน');
      return;
    }
    setCid(targetCourseId);
    setLastCid(targetCourseId);
    setTab(nextTab);
    if (postId) setDetail({id: postId});
    setState(current => {
      if (current?.course?.id === targetCourseId) return current;
      const cached = homeStates.find(s => s?.course?.id === targetCourseId);
      return cached || current || null;
    });
  }
  function handleNav(id) {
    if (tab === id && (id === 'home' ? !cid : Boolean(cid))) {
      return;
    }
    if (id === 'home') {
      goHome();
      return;
    }
    if (id === 'work') {
      setTab('work');
      return;
    }
    const targetId = cid || lastCid || boot?.courses?.[0]?.id;
    if (!targetId) {
      notify('คุณยังไม่มีห้องเรียน กรุณาสร้างหรือเข้าร่วมห้องเรียนก่อน');
      return;
    }
    if (!cid || cid !== targetId) {
      openClass(targetId, id);
    } else {
      setTab(id);
    }
  }
  function handleOpenPost(post, courseId) {
    const targetCourseId = courseId || post?.courseId || post?.course?.id || cid;
    setDetail({id: post.id, courseId: targetCourseId});
  }
  function handleGradeAssessment(assessment, courseId) {
    const targetCourseId = courseId || assessment?.courseId || assessment?.course?.id || cid;
    setGrading({assessment, courseId: targetCourseId});
  }
  useEffect(() => {if (session) bootstrap().catch(e => notify(e.message));}, [session]);
  useEffect(() => {if (boot && boot.profile?.role !== 'admin') loadHome();}, [boot?.profile?.id, boot?.courses, homeRefreshKey]);
  useEffect(() => {
    if (!boot || boot.profile?.role === 'admin') return;
    const poll = () => {if (!document.hidden) loadHome();};
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [boot?.profile?.id, boot?.courses]);
  useEffect(() => {
    if (!cid) return;
    let stale = false;
    const hasCached = state?.course?.id === cid || homeStates.some(s => s?.course?.id === cid);
    if (!hasCached) setLoading(true);
    rpc('getClass', {classId: cid})
      .then(r => {if (!stale) setState(r);})
      .catch(e => notify(e.message))
      .finally(() => {if (!stale) setLoading(false);});
    return () => {stale = true;};
  }, [cid]);
  useEffect(() => {window.addEventListener('classflow-signed-out', logout); return () => window.removeEventListener('classflow-signed-out', logout);}, []);
  useEffect(() => {if (!toast) return; const timer = setTimeout(() => setToast(''), 8000); return () => clearTimeout(timer);}, [toast]);
  useEffect(() => {
    if (profile && profile.role !== 'admin' && !profile.roleSelected) {
      setModal('role');
    }
  }, [profile?.id, profile?.roleSelected]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const googleSession = await exchangeGoogleCode();
        if (googleSession && active) {
          login(googleSession);
          window.history.replaceState(null, '', window.location.pathname);
          return;
        }
        // Keep the previous implicit-flow callback working for any old links.
        const hash = window.location.hash;
        if (hash && hash.includes('id_token=')) {
          const params = new URLSearchParams(hash.replace(/^#/, ''));
          const idToken = params.get('id_token');
          const refreshToken = params.get('refresh_token');
          const expiresIn = Number(params.get('expires_in') || 3600);
          if (idToken && active) {
            login({token: idToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000});
            window.history.replaceState(null, '', window.location.pathname);
          }
        }
      } catch (error) {
        if (active) notify(error.message);
        window.history.replaceState(null, '', window.location.pathname);
      }
    })();
    return () => {active = false;};
  }, []);
  const activeDetailCourse = detail?.courseId
    ? (homeStates.find(s => s?.course?.id === detail.courseId) || state)
    : state;
  const current = detail && (activeDetailCourse?.posts.find(p => p.id === detail.id) || state?.posts.find(p => p.id === detail.id));

  const activeGradingCourse = grading?.courseId
    ? (homeStates.find(s => s?.course?.id === grading.courseId) || state)
    : state;
  const currentGradingAssessment = grading?.assessment || grading;
  const totalAssignmentsCount = state
    ? state.posts.filter(p => p.kind === 'assignment').length
    : homeStates.reduce((acc, s) => acc + (s?.posts?.filter(p => p.kind === 'assignment').length || 0), 0);
  return <>
    {toast && <div className="toast" role="status"><AlertCircle size={18}/><span>{toast}</span><button className="icon-btn" aria-label="ปิดแจ้งเตือน" onClick={() => setToast('')}><X size={16}/></button></div>}
    {!session ? <Auth onLogin={login} notify={notify}/> : !boot ? <div className="welcome-empty"><RefreshCw size={45}/><h1>{bootError ? 'เข้าสู่ระบบไม่สำเร็จ' : 'กำลังตรวจสอบสิทธิ์…'}</h1><p className="muted">{bootError || 'ระบบกำลังเลือกหน้าให้ตรงกับยศของคุณ'}</p>{bootError && <Btn onClick={() => bootstrap().catch(() => {})}>ลองใหม่</Btn>}</div> : profile?.role === 'admin' ? <AdminPanel profile={profile} logout={logout} notify={notify}/> : <div className="app-shell">
      <aside className="sidebar"><div className="brand"><span><Layers/></span>classflow<span className="brand-dot">.</span></div><div className="workspace-label">YOUR WORKSPACE</div>
        <ClassSelector cid={cid} courses={boot?.courses || []} onSelectCourse={openClass} onGoHome={goHome}/>
        <nav>{navigation.map(([Icon, id]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => handleNav(id)}><Icon size={19}/>{labels[id]}{id === 'work' && totalAssignmentsCount > 0 && <small>{totalAssignmentsCount}</small>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-note"><span>MAKE ROOM FOR</span><strong>your next big idea.</strong><div className="note-flower">✳</div></div><button className="side-add" onClick={() => setModal('class')}><Plus size={18}/>{teacher ? 'สร้างห้องเรียน' : 'เข้าร่วมห้องเรียน'}</button><button className="profile-button" onClick={() => setModal('profile')}><Avatar name={profile?.name || '?'} small/><div><strong>{profile?.name || 'กำลังโหลด…'}</strong><small>{teacher ? 'อาจารย์' : 'นักเรียน'}</small></div><Settings size={16}/></button><button className="side-logout" onClick={logout}><LogOut size={15}/>ออกจากระบบ</button></div>
      </aside>
      <main className="main-content">
        {isLocal && <div className="local-banner"><span/>โหมดสาธิตในเครื่อง · ข้อมูลตัวอย่าง · ยังไม่ deploy ระบบใหม่บน AWS</div>}
        <header className="topbar"><div className="breadcrumb">{!cid && tab === 'home' ? <>Classflow<ChevronRight size={14}/><strong>หน้าหลัก</strong></> : !cid ? <>Classflow<ChevronRight size={14}/><span>ห้องเรียนทั้งหมด</span><ChevronRight size={14}/><strong>{labels[tab]}</strong></> : <><span>ห้องเรียนของฉัน</span><ChevronRight size={14}/><span>{state?.course?.name || 'กำลังโหลด…'}</span><ChevronRight size={14}/><strong>{labels[tab]}</strong></>}</div><div className="topbar-right"><CourseSearch courses={boot?.courses || []} onSelectCourse={openClass}/><span className="pill" style={{padding:'6px 12px', fontSize:'11px', display:'inline-flex', alignItems:'center', gap:'5px', borderColor:'#267768', color:'#1e776b', background:'#eaf5ee'}}>บทบาท: {teacher ? 'อาจารย์ 🎓' : 'นักเรียน 🎒'}</span><span>{new Date().toLocaleDateString('th-TH', {day: 'numeric', month: 'long', year: 'numeric'})}</span><NotificationBell homeStates={homeStates} profile={profile} teacher={teacher} onOpenPost={handleOpenPost} onGradeAssessment={handleGradeAssessment}/><button className="icon-btn" aria-label="รีเฟรชห้องเรียน" onClick={() => tab === 'home' || !cid ? loadHome() : refresh().catch(e => notify(e.message))}><RefreshCw size={17}/></button><Avatar name={profile?.name || '?'} small/></div></header>
        <div className="page-content">
          <div key={cid ? `${cid}-${tab}` : tab} className="tab-pane">
            {tab === 'home' ? (
              <HomeDashboard courses={boot?.courses || []} states={homeStates} profile={profile} teacher={teacher} onOpen={openClass} onRefresh={loadHome} loading={homeLoading}/>
            ) : tab === 'work' && !cid ? (
              <Work state={null} states={homeStates} courses={boot?.courses || []} profile={profile} open={handleOpenPost} grade={handleGradeAssessment} create={() => setModal('post')}/>
            ) : loading && !state ? (
              <Empty icon={RefreshCw}>กำลังโหลดห้องเรียน…</Empty>
            ) : !state ? (
              <div className="welcome-empty">
                <GraduationCap size={55}/>
                <h1>เริ่มต้นพื้นที่เรียนรู้ของคุณ</h1>
                <p className="muted">{teacher ? 'สร้างห้องเรียนแรก แล้วเชิญนักเรียนเข้ามาร่วมเรียนรู้' : 'ตั้งค่าโปรไฟล์ แล้วใช้รหัสห้องเรียนจากอาจารย์เพื่อเข้าร่วม'}</p>
                <div className="button-group">
                  <Btn icon={Plus} onClick={() => setModal('class')}>{teacher ? 'สร้างห้องเรียน' : 'เข้าร่วมห้องเรียน'}</Btn>
                  <Btn secondary onClick={() => setModal('profile')}>ตั้งค่าโปรไฟล์</Btn>
                </div>
              </div>
            ) : <>
              <section className={'course-hero ' + (tab !== 'stream' ? 'compact' : '')}><div className="hero-copy"><div className="hero-meta"><span>CLASSROOM / {state.course.subject}</span><Badge tone="glass">{teacher ? 'TEACHER SPACE' : 'STUDENT SPACE'}</Badge></div><h1>{state.course.name}</h1><p>{state.course.description || 'พื้นที่เรียนรู้และเติบโตไปด้วยกัน'}</p><div className="hero-footer"><Avatar name={state.course.teacherName} small/><span>{state.course.teacherName}</span><i/>ภาคเรียนของเรา</div></div><div className="hero-art"><div className="art-ring"/><div className="floating-book"><BookOpen size={55}/></div><div className="floating-star">✳</div><div className="little-card"><CheckMark/><span>Learning, in flow.</span></div></div></section>
              {tab === 'stream' && <div className="overview-row">{[[ClipboardList, 'งานที่มอบหมาย', state.posts.filter(p => p.kind === 'assignment').length, 'ชิ้น'], [Users, teacher ? 'นักเรียนในห้อง' : 'ห้องเรียนของฉัน', teacher ? state.members.filter(m => m.role === 'student').length : boot.courses.length, teacher ? 'คน' : 'ห้อง'], [FileText, 'เนื้อหาการเรียน', state.posts.filter(p => p.kind === 'material').length, 'โพสต์']].map(([Icon, label, count, unit]) => <div key={label}><span className="overview-icon"><Icon size={21}/></span><div><small>{label}</small><strong>{count}<span>{unit}</span></strong></div><ArrowUpRight size={16}/></div>)}</div>}
              <div className="content-tabs">{['stream', 'work', 'dashboard', 'people', 'messages', 'timeline'].map(id => <button className={tab === id ? 'active' : ''} key={id} onClick={() => setTab(id)}>{labels[id]}</button>)}{teacher && <button className="quick-create" onClick={() => setModal('post')}><Plus size={16}/> สร้างโพสต์</button>}</div>
              {tab === 'stream' && <Stream state={state} profile={profile} open={handleOpenPost} create={() => setModal('post')}/>}
              {tab === 'work' && <Work state={state} states={homeStates} courses={boot?.courses || []} profile={profile} open={handleOpenPost} grade={handleGradeAssessment} create={() => setModal('post')}/>}
              {tab === 'dashboard' && <Dashboard key={cid} state={state} profile={profile} refresh={refresh} notify={notify} grade={setGrading}/>}
              {tab === 'people' && <section className="panel"><div className="section-title"><h2>{teacher ? 'ทุกคนในห้องเรียน' : 'อาจารย์และโปรไฟล์ของฉัน'}</h2><Badge>{state.members.length} คน</Badge></div>{state.members.map(m => <div className="person-row" key={m.userId}><Avatar name={m.name}/><div><strong>{m.name}</strong><small>{m.studentId || m.email}</small></div><Badge tone={m.role === 'teacher' ? '' : 'gray'}>{m.role === 'teacher' ? 'อาจารย์' : 'นักเรียน'}</Badge></div>)}</section>}
              {tab === 'messages' && <Messages key={cid} state={state} profile={profile} notify={notify}/>}
              {tab === 'timeline' && <Timeline state={state} profile={profile} open={handleOpenPost}/>}
            </>}
          </div>
        </div>
        <footer className="page-footer"><span>classflow. <span className="muted">A better place to learn.</span></span><span>Made for your classroom <span className="footer-dot">✳</span></span></footer>
      </main>
    </div>}
    {modal === 'class' && profile && <ClassForm teacher={teacher} close={() => setModal(null)} notify={notify} done={bootstrap}/>}
    {modal === 'profile' && profile && <Profile profile={profile} close={() => setModal(null)} done={async () => {await bootstrap(); await refresh();}} notify={notify}/>}
    {modal === 'role' && profile && !profile.roleSelected && <RoleModal profile={profile} close={() => setModal(null)} done={async () => {await bootstrap(); await refresh();}} notify={notify} canClose={false}/>}
    {modal === 'post' && <PostForm classId={cid || boot?.courses?.[0]?.id} close={() => setModal(null)} done={async () => {if (cid) await refresh(); await loadHome();}} notify={notify}/>}
    {current && activeDetailCourse && <PostDetail post={current} state={activeDetailCourse} profile={profile} close={() => setDetail(null)} refresh={async () => {if (cid) await refresh(); await loadHome();}} notify={notify}/>}
    {grading && activeGradingCourse && <Grading assessment={currentGradingAssessment} state={activeGradingCourse} close={() => setGrading(null)} refresh={async () => {if (cid) await refresh(); await loadHome();}} notify={notify}/>}
  </>;
}
function CheckMark() {return <span>✓</span>;}
