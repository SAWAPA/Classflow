import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {FileText, Download, X, Upload, BookOpen, Eye} from 'lucide-react';
import {ACCEPT, openFile, rpc} from './api';
export const date = v => v ? new Date(v).toLocaleString('th-TH', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—';
export const num = v => v == null ? '—' : Number(v).toLocaleString('th-TH', {maximumFractionDigits: 2});
export function Btn({children, icon: Icon, secondary, className = '', ...props}) {return <button className={`btn ${secondary ? 'secondary' : ''} ${className}`} {...props}>{Icon && <Icon size={17}/>} {children}</button>;}
export function Badge({children, tone = ''}) {return <span className={`badge ${tone}`}>{children}</span>;}
export function Avatar({name = '?', small}) {return <span className={`avatar ${small ? 'small' : ''}`}>{name.slice(0, 1)}</span>;}
export function Empty({children, icon: Icon = BookOpen}) {return <div className="empty"><Icon size={30}/><p>{children}</p></div>;}
export function Modal({title, children, close, wide}) {
  useEffect(() => {const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => {document.body.style.overflow = previous;};}, []);
  return createPortal(<div className="overlay" onMouseDown={e => {if (close && e.target === e.currentTarget) close();}}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2>{close && <button type="button" className="icon-btn" aria-label="ปิด" onClick={close}><X/></button>}</div>{children}</section></div>, document.body);
}
export function Field({label, ...props}) {return <label className="field">{label}<input {...props}/></label>;}
function previewKind(file) {
  const extension = String(file.filename || '').toLowerCase().split('.').pop();
  if (file.mime?.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(extension)) return 'image';
  if (file.mime === 'application/pdf' || extension === 'pdf') return 'pdf';
  return '';
}
export function Files({files = [], classId, notify}) {
  const [preview, setPreview] = useState(null);
  const pending = useRef(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => {const url = preview?.url; return () => {if (url) URL.revokeObjectURL(url);};}, [preview?.url]);
  function closePreview() {pending.current?.abort(); setPreview(null);}
  async function viewFile(file) {
    const kind = previewKind(file);
    if (!kind) return openFile(classId, file.id).catch(e => notify(e.message));
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setPreview({...file, kind, loading: true});
    try {
      const result = await rpc('downloadFile', {classId, fileId: file.id, inline: true});
      if (controller.signal.aborted) return;
      const response = await fetch(result.url, {signal: controller.signal, credentials: 'omit'});
      if (!response.ok) throw new Error(`โหลดไฟล์ไม่สำเร็จ (${response.status}) กรุณาลองใหม่`);
      const blob = await response.blob();
      if (!blob.size) throw new Error('ไฟล์ว่าง ไม่สามารถแสดงตัวอย่างได้');
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(new Blob([blob], {type: file.mime || (kind === 'pdf' ? 'application/pdf' : blob.type)}));
      setPreview({...file, kind, url, loading: false});
    } catch (error) {if (!controller.signal.aborted) setPreview({...file, kind, error: error.message || 'ไม่สามารถโหลดตัวอย่างไฟล์ได้', loading: false});}
  }
  return <><div className="files">{files.map(file => <div className="file-chip" key={file.id}><button type="button" className="file-preview-trigger" onClick={() => viewFile(file)}><FileText size={16}/><span>{file.filename}</span>{previewKind(file) && <Eye size={14}/>}</button><button type="button" className="file-download" aria-label={`ดาวน์โหลด ${file.filename}`} onClick={() => openFile(classId, file.id).catch(e => notify(e.message))}><Download size={14}/></button></div>)}</div>{preview && <Modal title={`ตัวอย่างไฟล์ · ${preview.filename}`} close={closePreview} wide><div className="file-preview-content">{preview.loading ? <p role="status">กำลังโหลดตัวอย่างไฟล์…</p> : preview.error ? <div className="empty"><p role="alert">{preview.error}</p><Btn secondary onClick={() => viewFile(preview)}>ลองใหม่</Btn></div> : preview.kind === 'image' ? <img className="file-preview-image" src={preview.url} alt={preview.filename} onError={() => setPreview(current => ({...current, error: 'ไม่สามารถแสดงรูปนี้ได้ กรุณาลองใหม่หรือดาวน์โหลดไฟล์'}))}/> : <iframe className="file-preview-frame" src={preview.url} title={preview.filename}/>}</div><div className="modal-actions"><Btn secondary onClick={() => openFile(classId, preview.id).catch(e => notify(e.message))} icon={Download}>ดาวน์โหลดไฟล์</Btn></div></Modal>}</>;
}
export function FilePicker({onChange, multiple = true}) {return <label className="dropzone"><Upload size={22}/><strong>เลือกไฟล์แนบ</strong><span>เอกสาร, รูปภาพ, ไฟล์โค้ดโปรแกรมทุกภาษา (.py, .java, .cpp ฯลฯ), ZIP</span><small>สูงสุด 25 MB / ไฟล์ · ไม่เกิน 5 ไฟล์</small><input type="file" accept={ACCEPT} multiple={multiple} aria-label="เลือกไฟล์แนบ" onChange={e => onChange(Array.from(e.target.files).slice(0, 5))}/></label>;}
