import {useEffect, useRef, useState} from 'react';
import {MessageCircle, RefreshCw, Send, Search} from 'lucide-react';
import {rpc} from './api';
import {Avatar, Badge, Btn, Empty, date} from './ui';

export default function Messages({profile, conversations, peerId, onSelect, refreshInbox, notify}) {
  const [messages, setMessages] = useState([]), [drafts, setDrafts] = useState({}), [busy, setBusy] = useState(false), [loading, setLoading] = useState(false), [search, setSearch] = useState(''), [error, setError] = useState('');
  const currentPeer = useRef(peerId), inbox = useRef(refreshInbox), body = useRef(null), sending = useRef(false);
  currentPeer.current = peerId; inbox.current = refreshInbox;
  const selected = conversations.find(c => c.peerId === peerId);
  const visible = conversations.filter(c => (c.name + ' ' + c.studentId).toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => {
    let cancelled = false, running = false;
    setMessages([]); setError('');
    if (!peerId) {setLoading(false); return;}
    setLoading(true);
    const poll = async () => {
      if (cancelled || running || document.hidden) return;
      running = true;
      try {
        const result = await rpc('getMessages', {peerId});
        if (cancelled) return;
        setMessages(result); setError(''); setLoading(false);
        const incoming = result.filter(m => m.senderId !== profile.id).at(-1);
        if (incoming && document.hasFocus()) {
          await rpc('markMessagesRead', {peerId, through: incoming.readKey});
          if (!cancelled) await inbox.current();
        }
      } catch (err) {if (!cancelled) {setError(err.message); setLoading(false);}}
      finally {running = false;}
    };
    poll();
    const timer = setInterval(poll, 15000);
    window.addEventListener('focus', poll); document.addEventListener('visibilitychange', poll);
    return () => {cancelled = true; clearInterval(timer); window.removeEventListener('focus', poll); document.removeEventListener('visibilitychange', poll);};
  }, [peerId, profile.id]);
  useEffect(() => {if (body.current) body.current.scrollTop = body.current.scrollHeight;}, [peerId, messages.at(-1)?.id]);
  async function send(e) {
    e.preventDefault();
    const text = (drafts[peerId] || '').trim(), target = peerId;
    if (!target || !text || sending.current) return;
    sending.current = true; setBusy(true);
    try {
      const result = await rpc('sendMessage', {peerId: target, text});
      setDrafts(values => ({...values, [target]: ''}));
      if (currentPeer.current === target) setMessages(result);
      await inbox.current();
    } catch (err) {notify(err.message);} finally {sending.current = false; setBusy(false);}
  }
  return <><div className="section-title"><div><h2>ข้อความส่วนตัว</h2><p className="muted">บทสนทนาเดียวต่อคน ใช้ร่วมกันทุกห้องเรียน · อัปเดตทุก 15 วินาที</p></div><Btn secondary icon={RefreshCw} onClick={refreshInbox}>อัปเดตรายชื่อ</Btn></div><section className="chat panel unified-chat"><aside className="chat-list"><label className="chat-search"><Search size={15}/><input aria-label="ค้นหาคู่สนทนา" placeholder="ค้นหาชื่อ / รหัสนักเรียน" value={search} onChange={e => setSearch(e.target.value)}/></label>{visible.map(c => <button key={c.peerId} onClick={() => onSelect(c.peerId)} className={peerId === c.peerId ? 'active' : ''}><Avatar name={c.name} small/><span className="chat-contact-copy"><strong>{c.name}</strong><small>{c.lastMessage ? `${c.lastMessage.senderId === profile.id ? 'คุณ: ' : ''}${c.lastMessage.text}` : c.role === 'teacher' ? 'อาจารย์ผู้สอน' : c.studentId || 'เริ่มสนทนา'}</small>{c.lastMessage && <time>{date(c.lastMessage.createdAt)}</time>}</span>{c.unreadCount > 0 && <span className="chat-unread" aria-label={`${c.unreadCount} ข้อความที่ยังไม่อ่าน`}>{c.unreadCount}</span>}</button>)}{!visible.length && <Empty icon={MessageCircle}>{search.trim() ? 'ไม่พบคู่สนทนาที่ค้นหา' : 'ยังไม่มีคู่สนทนาในห้องเรียนที่เข้าร่วม'}</Empty>}</aside><div className="chat-conversation">{selected ? <><div className="chat-head"><Avatar name={selected.name}/><div><strong>{selected.name}</strong><small>{selected.classes.map(c => c.name).join(' · ')}</small></div><Badge>ส่วนตัว</Badge></div><div className="chat-body" ref={body} aria-live="polite" aria-label={`บทสนทนากับ ${selected.name}`}>{loading ? <p className="muted" role="status">กำลังโหลดข้อความ…</p> : <>{error && <p className="error-text" role="alert">{error}</p>}{messages.map(m => <div key={m.id} className={`bubble ${m.senderId === profile.id ? 'mine' : ''}`}><p>{m.text}</p><small>{date(m.createdAt)}</small></div>)}{!messages.length && !error && <Empty icon={MessageCircle}>เริ่มบทสนทนากับ {selected.name}</Empty>}</>}</div><form className="chat-compose" onSubmit={send}><input placeholder="เขียนข้อความ…" aria-label="ข้อความส่วนตัว" value={drafts[peerId] || ''} onChange={e => setDrafts(values => ({...values, [peerId]: e.target.value}))} maxLength={2000} required/><Btn disabled={busy || loading || !(drafts[peerId] || '').trim()} icon={Send}>ส่ง</Btn></form></> : <Empty icon={MessageCircle}>เลือกคนที่ต้องการสนทนา</Empty>}</div></section></>;
}
