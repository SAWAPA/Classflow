import {useEffect, useState} from 'react';
import {BookOpen, Home, LayoutDashboard, ClipboardList, MessageCircle, Users, CalendarDays, Plus, ArrowUpRight, ChevronRight, LogOut, GraduationCap, FileText, Layers, Settings, RefreshCw, AlertCircle, X} from 'lucide-react';
import {rpc, isLocal, getSession, saveSession, exchangeGoogleCode, signOut} from './api';
import {Avatar, Badge, Btn, Empty} from './ui';
import {Auth, ClassForm, Profile, PostForm, PostDetail, Grading, RoleModal} from './forms';
import AdminPanel from './Admin';
import {Stream, Work, Timeline, Messages} from './views';
import Dashboard from './Dashboard';
import HomeDashboard from './HomeDashboard';
const labels = {home: 'หน้าหลัก', stream: 'หน้าชั้นเรียน', work: 'งานในชั้นเรียน', dashboard: 'คะแนนและเกรด', people: 'สมาชิก', messages: 'ข้อความ', timeline: 'กำหนดส่งงาน'};
const navigation = [[Home, 'home'], [BookOpen, 'stream'], [ClipboardList, 'work'], [LayoutDashboard, 'dashboard'], [Users, 'people'], [MessageCircle, 'messages'], [CalendarDays, 'timeline']];

export default function App() {
  const [session, setSession] = useState(getSession), [boot, setBoot] = useState(null), [bootError, setBootError] = useState(''), [cid, setCid] = useState(''), [lastCid, setLastCid] = useState(''), [state, setState] = useState(null), [homeStates, setHomeStates] = useState([]), [homeLoading, setHomeLoading] = useState(false), [homeRefreshKey, setHomeRefreshKey] = useState(0), [tab, setTab] = useState('home'), [modal, setModal] = useState(null), [detail, setDetail] = useState(null), [grading, setGrading] = useState(null), [toast, setToast] = useState(''), [loading, setLoading] = useState(false);
  const profile = boot?.profile, teacher = profile?.role === 'teacher';
  function notify(message) {setToast(message);}
  function login(value) {saveSession(value); setSession(value); setBoot(null); setBootError(''); setState(null); setCid(''); setLastCid('');}
  function logout() {const pending = signOut(); setSession(null); setState(null); setBoot(null); setBootError(''); setCid(''); setLastCid(''); setModal(null); setDetail(null); setGrading(null); pending.catch(error => notify(error.message));}
  async function bootstrap(nextId) {setBootError(''); try {const r = await rpc('bootstrap'); setBoot(r); if (nextId) {setTab('stream'); setCid(nextId); setLastCid(nextId);} return r;} catch (error) {setBootError(error.message); throw error;}}
  async function refresh() {if (cid) setState(await rpc('getClass', {classId: cid}));}
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
        <div className="class-select"><div className="class-icon"><BookOpen size={19}/></div><select aria-label="เลือกห้องเรียน" value={cid} onChange={e => e.target.value ? openClass(e.target.value) : goHome()}><option value="">หน้าหลัก · ห้องเรียนทั้งหมด</option>{boot?.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
        <nav>{navigation.map(([Icon, id]) => <button key={id} className={tab === id ? 'active' : ''} onClick={() => handleNav(id)}><Icon size={19}/>{labels[id]}{id === 'work' && totalAssignmentsCount > 0 && <small>{totalAssignmentsCount}</small>}</button>)}</nav>
        <div className="sidebar-bottom"><div className="sidebar-note"><span>MAKE ROOM FOR</span><strong>your next big idea.</strong><div className="note-flower">✳</div></div><button className="side-add" onClick={() => setModal('class')}><Plus size={18}/>{teacher ? 'สร้างห้องเรียน' : 'เข้าร่วมห้องเรียน'}</button><button className="profile-button" onClick={() => setModal('profile')}><Avatar name={profile?.name || '?'} small/><div><strong>{profile?.name || 'กำลังโหลด…'}</strong><small>{teacher ? 'อาจารย์' : 'นักเรียน'}</small></div><Settings size={16}/></button><button className="side-logout" onClick={logout}><LogOut size={15}/>ออกจากระบบ</button></div>
      </aside>
      <main className="main-content">
        {isLocal && <div className="local-banner"><span/>โหมดสาธิตในเครื่อง · ข้อมูลตัวอย่าง · ยังไม่ deploy ระบบใหม่บน AWS</div>}
        <header className="topbar"><div className="breadcrumb">{!cid && tab === 'home' ? <>Classflow<ChevronRight size={14}/><strong>หน้าหลัก</strong></> : !cid ? <>Classflow<ChevronRight size={14}/><span>ห้องเรียนทั้งหมด</span><ChevronRight size={14}/><strong>{labels[tab]}</strong></> : <><span>ห้องเรียนของฉัน</span><ChevronRight size={14}/><span>{state?.course?.name || 'กำลังโหลด…'}</span><ChevronRight size={14}/><strong>{labels[tab]}</strong></>}</div><div className="topbar-right"><span className="pill" style={{padding:'6px 12px', fontSize:'11px', display:'inline-flex', alignItems:'center', gap:'5px', borderColor:'#267768', color:'#1e776b', background:'#eaf5ee'}}>บทบาท: {teacher ? 'อาจารย์ 🎓' : 'นักเรียน 🎒'}</span><span>{new Date().toLocaleDateString('th-TH', {day: 'numeric', month: 'long', year: 'numeric'})}</span><button className="icon-btn" aria-label="รีเฟรชห้องเรียน" onClick={() => tab === 'home' || !cid ? loadHome() : refresh().catch(e => notify(e.message))}><RefreshCw size={17}/></button><Avatar name={profile?.name || '?'} small/></div></header>
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
