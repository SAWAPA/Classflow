import {useEffect, useRef, useState} from 'react';
import {createPortal} from 'react-dom';
import {FileText, Download, X, Upload, BookOpen, Eye, Trash2, CheckCircle2, Image as ImageIcon, FileCode, Archive, Edit3, Clock, Paperclip} from 'lucide-react';
import {ACCEPT, openFile, rpc} from './api';
export const date = v => v ? new Date(v).toLocaleString('th-TH', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—';
export const fullDate = v => {
  if (!v) return '—';
  const d = new Date(v);
  const dateStr = d.toLocaleDateString('th-TH', {day: 'numeric', month: 'short', year: 'numeric'});
  const timeStr = d.toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'});
  return `${dateStr}, ${timeStr} น.`;
};
export const num = v => v == null ? '—' : Number(v).toLocaleString('th-TH', {maximumFractionDigits: 2});
export function formatBytes(bytes) {
  if (bytes == null || isNaN(bytes)) return '';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
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
export function Files({files = [], classId, notify, onRemove, disabled = false}) {
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
  return <><div className="files">{files.map(file => <div className="file-chip" key={file.id}><button type="button" className="file-preview-trigger" onClick={() => viewFile(file)}><FileText size={16}/><span>{file.filename}</span>{previewKind(file) && <Eye size={14}/>}</button><button type="button" className="file-download" aria-label={`ดาวน์โหลด ${file.filename}`} onClick={() => openFile(classId, file.id).catch(e => notify(e.message))}><Download size={14}/></button>{onRemove && <button type="button" className="file-remove-chip-btn" title={`ลบไฟล์ ${file.filename}`} aria-label={`ลบไฟล์ ${file.filename}`} disabled={disabled} onClick={() => onRemove(file.id)}><Trash2 size={13}/></button>}</div>)}</div>{preview && <Modal title={`ตัวอย่างไฟล์ · ${preview.filename}`} close={closePreview} wide><div className="file-preview-content">{preview.loading ? <p role="status">กำลังโหลดตัวอย่างไฟล์…</p> : preview.error ? <div className="empty"><p role="alert">{preview.error}</p><Btn secondary onClick={() => viewFile(preview)}>ลองใหม่</Btn></div> : preview.kind === 'image' ? <img className="file-preview-image" src={preview.url} alt={preview.filename} onError={() => setPreview(current => ({...current, error: 'ไม่สามารถแสดงรูปนี้ได้ กรุณาลองใหม่หรือดาวน์โหลดไฟล์'}))}/> : <iframe className="file-preview-frame" src={preview.url} title={preview.filename}/>}</div><div className="modal-actions"><Btn secondary onClick={() => openFile(classId, preview.id).catch(e => notify(e.message))} icon={Download}>ดาวน์โหลดไฟล์</Btn></div></Modal>}</>;
}

function ImageThumb({file}) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  if (!url) return <div className="attached-file-placeholder"><ImageIcon size={22}/></div>;
  return <img src={url} alt={file.name} className="attached-file-thumb" />;
}

export function SelectedFilesList({files = [], onRemove, disabled = false}) {
  if (!files.length) return null;
  return (
    <div className="attached-files-container" aria-label="รายการไฟล์ที่แนบ">
      <div className="attached-files-heading">
        <div className="attached-files-title">
          <CheckCircle2 size={16} className="attached-heading-icon"/>
          <span>ไฟล์ที่แนบเรียบร้อยแล้ว ({files.length} / 5 ไฟล์)</span>
        </div>
        <span className="attached-files-hint">มองเห็นชัดเจน สามารถกดลบไฟล์ออกได้ทันที</span>
      </div>
      <div className="attached-files-list">
        {files.map((file, idx) => {
          const isImg = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(file.name);
          const ext = (file.name.split('.').pop() || '').toUpperCase();
          const isCode = /\.(py|js|jsx|ts|tsx|html|css|cpp|c|java|cs|php|rb|go|rs|sql|json|xml)$/i.test(file.name);
          const isZip = /\.(zip|rar|7z|tar|gz)$/i.test(file.name);
          const isPdf = /\.(pdf)$/i.test(file.name);
          const visualClass = isImg ? 'visual-img' : isPdf ? 'visual-pdf' : isCode ? 'visual-code' : isZip ? 'visual-zip' : 'visual-doc';

          return (
            <div className="attached-file-item" key={`${file.name}-${idx}-${file.size || ''}`}>
              <div className={`attached-file-visual ${visualClass}`}>
                {isImg ? (
                  <ImageThumb file={file}/>
                ) : isCode ? (
                  <div className="attached-icon-inner"><FileCode size={24}/><span className="ext-badge">{ext}</span></div>
                ) : isZip ? (
                  <div className="attached-icon-inner"><Archive size={24}/><span className="ext-badge">{ext}</span></div>
                ) : (
                  <div className="attached-icon-inner"><FileText size={24}/><span className="ext-badge">{ext}</span></div>
                )}
              </div>
              <div className="attached-file-details">
                <strong className="attached-file-name" title={file.name}>{file.name}</strong>
                <div className="attached-file-subtext">
                  <span className="attached-file-size">{formatBytes(file.size)}</span>
                  <span className="attached-dot">•</span>
                  <span className="attached-ext-tag">{ext || 'FILE'}</span>
                  <span className="attached-dot">•</span>
                  <span className="attached-file-ready">พร้อมแนบ</span>
                </div>
              </div>
              {onRemove && (
                <button
                  type="button"
                  className="attached-file-remove-btn"
                  onClick={() => onRemove(idx)}
                  disabled={disabled}
                  title={`ลบไฟล์ ${file.name} ออก`}
                  aria-label={`ลบไฟล์ ${file.name} ออก`}
                >
                  <Trash2 size={15}/>
                  <span>ลบไฟล์</span>
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FilePicker({onChange, multiple = true, disabled = false}) {
  return (
    <label className={`dropzone ${disabled ? 'disabled' : ''}`}>
      <Upload size={22}/>
      <strong>เลือกไฟล์แนบ</strong>
      <span>เอกสาร, รูปภาพ, ไฟล์โค้ดโปรแกรมทุกภาษา (.py, .java, .cpp ฯลฯ), ZIP</span>
      <small>สูงสุด 25 MB / ไฟล์ · ไม่เกิน 5 ไฟล์</small>
      <input
        type="file"
        accept={ACCEPT}
        multiple={multiple}
        disabled={disabled}
        aria-label="เลือกไฟล์แนบ"
        onChange={e => {
          const selected = Array.from(e.target.files || []);
          if (selected.length > 0) onChange(selected);
          e.target.value = '';
        }}
      />
    </label>
  );
}
