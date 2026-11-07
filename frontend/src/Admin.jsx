import {useEffect, useState} from 'react';
import {Layers, LogOut, RefreshCw, ShieldCheck, UserPlus, Users, Check} from 'lucide-react';
import {rpc} from './api';
import {Avatar, Badge, Btn, Empty, Field} from './ui';

const roleLabel = {admin: 'ผู้ดูแลระบบ', teacher: 'อาจารย์', student: 'นักเรียน'};

export default function AdminPanel({profile, logout, notify}) {
  const [users, setUsers] = useState([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({email: '', name: '', password: '', role: 'student'});
  const update = (key, value) => setForm(current => ({...current, [key]: value}));
  async function load() {
    setLoading(true);
    try {setUsers(await rpc('adminListUsers'));} catch (error) {notify(error.message);} finally {setLoading(false);}
  }
  useEffect(() => {load();}, []);
  async function create(e) {
    e.preventDefault(); setBusy(true);
    try {
      await rpc('adminCreateUser', form);
      setForm({email: '', name: '', password: '', role: 'student'});
      notify('สร้างบัญชีสำเร็จ บัญชีนี้เข้าสู่ระบบได้ทันทีโดยไม่ต้องยืนยันอีเมล');
      await load();
    } catch (error) {notify(error.message);} finally {setBusy(false);}
  }
  async function changeRole(userId, role) {
    try {await rpc('adminSetUserRole', {userId, role}); notify('เปลี่ยนยศแล้ว'); await load();}
    catch (error) {notify(error.message);}
  }
  return <div className="app-shell admin-shell">
    <aside className="sidebar"><div className="brand"><span><Layers/></span>classflow<span className="brand-dot">.</span></div><div className="workspace-label">ADMIN WORKSPACE</div>
      <div className="admin-nav active"><ShieldCheck size={19}/>จัดการบัญชี</div>
      <div className="sidebar-bottom"><div className="sidebar-note"><span>KEEP IT SIMPLE</span><strong>More clarity. Less admin.</strong><div className="note-flower">✳</div></div><button className="side-logout" onClick={logout}><LogOut size={15}/>ออกจากระบบ</button></div>
    </aside>
    <main className="main-content"><header className="topbar"><div className="breadcrumb">Classflow<Users size={14}/><strong>จัดการบัญชี</strong></div><div className="topbar-right"><span>{profile?.name}</span><button className="icon-btn" aria-label="รีเฟรชผู้ใช้" onClick={() => load()}><RefreshCw size={17}/></button><Avatar name={profile?.name || '?'} small/></div></header>
      <div className="page-content"><section className="course-hero compact admin-hero"><div className="hero-copy"><div className="hero-meta"><span>CLASSFLOW / ADMIN</span><Badge tone="glass">ADMIN SPACE</Badge></div><h1>จัดการคนในระบบ</h1><p>สร้างบัญชีและกำหนดว่าใครเป็นอาจารย์หรือนักเรียนจากพื้นที่เดียว</p></div><div className="hero-art"><div className="art-ring"/><div className="floating-book"><ShieldCheck size={55}/></div><div className="floating-star">✳</div></div></section>
        <div className="admin-grid"><section className="panel"><div className="section-title"><div><div className="eyebrow">NEW ACCOUNT</div><h2>สร้างบัญชี</h2></div><UserPlus size={24}/></div><p className="muted">บัญชีที่สร้างโดย Admin พร้อมเข้าสู่ระบบได้ทันที ไม่ต้องยืนยันอีเมล</p><form onSubmit={create}><Field label="ชื่อ–นามสกุล" value={form.name} onChange={e => update('name', e.target.value)} required maxLength={120}/><Field label="อีเมล" type="email" value={form.email} onChange={e => update('email', e.target.value)} required maxLength={254}/><Field label="รหัสผ่านเริ่มต้น" type="password" value={form.password} onChange={e => update('password', e.target.value)} required minLength={8} autoComplete="new-password"/><label className="field">ยศ<select value={form.role} onChange={e => update('role', e.target.value)}><option value="student">นักเรียน</option><option value="teacher">อาจารย์</option></select></label><Btn disabled={busy} icon={UserPlus}>{busy ? 'กำลังสร้าง…' : 'สร้างบัญชี'}</Btn></form></section>
          <section className="panel"><div className="section-title"><div><div className="eyebrow">DIRECTORY</div><h2>บัญชีทั้งหมด</h2></div><Badge>{users.length} คน</Badge></div>{loading ? <Empty icon={RefreshCw}>กำลังโหลดรายชื่อ…</Empty> : users.length ? <div className="admin-users">{users.map(user => <div className="person-row admin-user" key={user.id}><Avatar name={user.name}/><div className="admin-user-info"><strong>{user.name}</strong><small>{user.email}</small></div><Badge tone={user.role === 'admin' ? '' : user.role === 'teacher' ? '' : 'gray'}>{roleLabel[user.role] || user.role}</Badge>{user.role !== 'admin' && <select aria-label={`เปลี่ยนยศ ${user.name}`} value={user.role} onChange={e => changeRole(user.id, e.target.value)}><option value="student">นักเรียน</option><option value="teacher">อาจารย์</option></select>}{user.role === 'admin' && <Check size={17} aria-label="ผู้ดูแลระบบ"/>}</div>)}</div> : <Empty icon={Users}>ยังไม่มีผู้ใช้</Empty>}</section></div>
      </div><footer className="page-footer"><span>classflow. <span className="muted">A better place to learn.</span></span><span>Admin controls <span className="footer-dot">✳</span></span></footer>
    </main>
  </div>;
}
