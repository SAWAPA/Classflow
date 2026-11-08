import {FileText, Download, X, Upload, BookOpen} from 'lucide-react';
import {ACCEPT, openFile} from './api';
export const date = v => v ? new Date(v).toLocaleString('th-TH', {day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'}) : '—';
export const num = v => v == null ? '—' : Number(v).toLocaleString('th-TH', {maximumFractionDigits: 2});
export function Btn({children, icon: Icon, secondary, className = '', ...props}) {return <button className={`btn ${secondary ? 'secondary' : ''} ${className}`} {...props}>{Icon && <Icon size={17}/>} {children}</button>;}
export function Badge({children, tone = ''}) {return <span className={`badge ${tone}`}>{children}</span>;}
export function Avatar({name = '?', small}) {return <span className={`avatar ${small ? 'small' : ''}`}>{name.slice(0, 1)}</span>;}
export function Empty({children, icon: Icon = BookOpen}) {return <div className="empty"><Icon size={30}/><p>{children}</p></div>;}
export function Modal({title, children, close, wide}) {return <div className="overlay" onMouseDown={e => {if (close && e.target === e.currentTarget) close();}}><section className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}><div className="modal-head"><h2>{title}</h2>{close && <button className="icon-btn" aria-label="ปิด" onClick={close}><X/></button>}</div>{children}</section></div>;}
export function Field({label, ...props}) {return <label className="field">{label}<input {...props}/></label>;}
export function Files({files = [], classId, notify}) {return <div className="files">{files.map(f => <button className="file-chip" key={f.id} onClick={() => openFile(classId, f.id).catch(e => notify(e.message))}><FileText size={16}/><span>{f.filename}</span><Download size={14}/></button>)}</div>;}
export function FilePicker({onChange, multiple = true}) {return <label className="dropzone"><Upload size={22}/><strong>เลือกไฟล์แนบ</strong><span>เอกสาร, รูปภาพ, ไฟล์โค้ดโปรแกรมทุกภาษา (.py, .java, .cpp ฯลฯ), ZIP</span><small>สูงสุด 25 MB / ไฟล์ · ไม่เกิน 5 ไฟล์</small><input type="file" accept={ACCEPT} multiple={multiple} aria-label="เลือกไฟล์แนบ" onChange={e => onChange(Array.from(e.target.files).slice(0, 5))}/></label>;}
