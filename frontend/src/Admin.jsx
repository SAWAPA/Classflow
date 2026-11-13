import {useEffect, useState} from 'react';
import {Layers, LogOut, RefreshCw, ShieldCheck, UserPlus, Users, Check, Sparkles} from 'lucide-react';
import {rpc} from './api';
import {Avatar, Badge, Btn, Empty, Field} from './ui';

const roleLabel = {admin: 'ผู้ดูแลระบบ', teacher: 'อาจารย์', student: 'นักเรียน'};

export default function AdminPanel({profile, logout, notify}) {
  const [users, setUsers] = useState([]), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [form, setForm] = useState({email: '', name: '', password: '', role: 'student', enrollAllClasses: true});
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
      setForm({email: '', name: '', password: '', role: 'student', enrollAllClasses: true});
      notify(`สร้างบัญชีสำเร็จ บัญชีนี้เข้าสู่ระบบได้ทันที${form.role === 'student' && form.enrollAllClasses ? ' และถูกเพิ่มเข้าทุกห้องเรียนแล้ว' : ''}`);
      await load();
    } catch (error) {notify(error.message);} finally {setBusy(false);}
  }
  async function createBatch20() {
    setBusy(true);
    notify('กำลังดำเนินการสร้างและดึงนักเรียน 20 คนเข้าห้องเรียน กรุณารอสักครู่…');
    try {
      const res = await rpc('adminBatchCreateStudents', {});
      const cnames = res.classroomNames?.length ? ` (ห้อง: ${res.classroomNames.join(', ')})` : '';
      notify(`สร้างนักเรียน ${res.count || 20} คน และดึงเข้าทุกห้องเรียนเรียบร้อยแล้ว!${cnames}`);
      await load();
    } catch (error) {notify(error.message);} finally {setBusy(false);}
  }
  async function changeRole(userId, role) {
    try {await rpc('adminSetUserRole', {userId, role}); notify('เปลี่ยนบทบาทแล้ว'); await load();}
    catch (error) {notify(error.message);}
  }
  return <div className="app-shell admin-shell">
    <aside className="sidebar"><div className="brand"><span><Layers/></span>classflow<span className="brand-dot">.</span></div><div className="workspace-label">ADMIN WORKSPACE</div>
      <div className="admin-nav active"><ShieldCheck size={19}/>จัดการบัญชี</div>
      <div className="sidebar-bottom"><div className="sidebar-note"><span>KEEP IT SIMPLE</span><strong>More clarity. Less admin.</strong><div className="note-flower">✳</div></div><button className="side-logout" onClick={logout}><LogOut size={15}/>ออกจากระบบ</button></div>
    </aside>
    <main className="main-content"><header className="topbar"><div className="breadcrumb">Classflow<Users size={14}/><strong>จัดการบัญชี</strong></div><div className="topbar-right"><span>{profile?.name}</span><button className="icon-btn" aria-label="รีเฟรชผู้ใช้" onClick={() => load()}><RefreshCw size={17}/></button><Avatar name={profile?.name || '?'} small/></div></header>
      <div className="page-content"><section className="course-hero compact admin-hero"><div className="hero-copy"><div className="hero-meta"><span>CLASSFLOW / ADMIN</span><Badge tone="glass">ADMIN SPACE</Badge></div><h1>จัดการคนในระบบ</h1><p>สร้างบัญชีและกำหนดว่าใครเป็นผู้ดูแลระบบ อาจารย์ หรือนักเรียนจากพื้นที่เดียว</p></div><div className="hero-art"><div className="art-ring"/><div className="floating-book"><ShieldCheck size={55}/></div><div className="floating-star">✳</div></div></section>
        <div className="admin-grid"><section className="panel"><div className="section-title"><div><div className="eyebrow">NEW ACCOUNT</div><h2>สร้างบัญชี</h2></div><UserPlus size={24}/></div><p className="muted">บัญชีที่สร้างโดย Admin พร้อมเข้าสู่ระบบได้ทันที ไม่ต้องยืนยันอีเมล</p><form onSubmit={create}><Field label="ชื่อ–นามสกุล" value={form.name} onChange={e => update('name', e.target.value)} required maxLength={120} placeholder="เช่น กานต์ธีรา แสงจันทร์"/><Field label="อีเมล" type="email" value={form.email} onChange={e => update('email', e.target.value)} required maxLength={254} placeholder="เช่น student21@example.test"/><Field label="รหัสผ่านเริ่มต้น" type="password" value={form.password} onChange={e => update('password', e.target.value)} required minLength={8} autoComplete="new-password" placeholder="อย่างน้อย 8 ตัวอักษร (มีตัวเลขและตัวพิมพ์เล็ก)"/><label className="field">บทบาท<select value={form.role} onChange={e => update('role', e.target.value)}><option value="student">นักเรียน</option><option value="teacher">อาจารย์</option><option value="admin">ผู้ดูแลระบบ</option></select></label>{form.role === 'student' && <label style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12.5px', margin: '4px 0 16px', cursor: 'pointer'}}><input type="checkbox" checked={form.enrollAllClasses} onChange={e => update('enrollAllClasses', e.target.checked)}/> <span>เพิ่มเข้าทุกห้องเรียนที่มีอยู่โดยอัตโนมัติ</span></label>}<Btn disabled={busy} icon={UserPlus}>{busy ? 'กำลังสร้าง…' : 'สร้างบัญชี'}</Btn></form><div style={{marginTop: '22px', paddingTop: '16px', borderTop: '1px dashed var(--border)'}}><div style={{display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px'}}><strong style={{fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px'}}><Sparkles size={16}/> เพิ่มนักเรียน 20 คนอัตโนมัติ</strong><Badge tone="blue">20 บัญชี</Badge></div><p className="muted" style={{fontSize: '11.5px', margin: '0 0 12px 0', lineHeight: '1.5'}}>สร้างบัญชี student1@example.test ถึง student20@example.test (รหัสผ่าน student1234) และดึงเข้าทุกห้องเรียนในระบบทันที</p><button type="button" className="btn secondary" style={{width: '100%', justifyContent: 'center', fontSize: '12.5px', padding: '9px 12px', gap: '6px'}} onClick={createBatch20} disabled={busy}><UserPlus size={16}/> {busy ? 'กำลังดำเนินการ…' : '⚡ สร้างนักเรียน 20 คนและดึงเข้าทุกห้องเรียน'}</button></div></section>
          <section className="panel"><div className="section-title"><div><div className="eyebrow">DIRECTORY</div><h2>บัญชีทั้งหมด</h2></div><Badge>{users.length} คน</Badge></div>{loading ? <Empty icon={RefreshCw}>กำลังโหลดรายชื่อ…</Empty> : users.length ? <div className="admin-users">{users.map(user => <div className="person-row admin-user" key={user.id}><Avatar name={user.name}/><div className="admin-user-info"><strong>{user.name}</strong><small>{user.email}</small></div><Badge tone={user.role === 'student' ? 'gray' : ''}>{roleLabel[user.role] || user.role}</Badge><select aria-label={`เปลี่ยนบทบาท ${user.name}`} value={user.role} onChange={e => changeRole(user.id, e.target.value)}><option value="student">นักเรียน</option><option value="teacher">อาจารย์</option><option value="admin">ผู้ดูแลระบบ</option></select>{user.role === 'admin' && <Check size={17} aria-label="ผู้ดูแลระบบ"/>}</div>)}</div> : <Empty icon={Users}>ยังไม่มีผู้ใช้</Empty>}</section></div>
      </div><footer className="page-footer"><span>classflow. <span className="muted">A better place to learn.</span></span><span>Admin controls <span className="footer-dot">✳</span></span></footer>
    </main>
  </div>;
}
