const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { URL } = require('url');
const { DatabaseSync } = require('node:sqlite');
let admin = null;
let google = null;
try { admin = require('firebase-admin'); } catch {}
try { ({ google } = require('googleapis')); } catch {}

// Load a local .env file without requiring another dependency.
function loadEnvFile(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i < 1) continue;
    const key = line.slice(0, i).trim();
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnvFile(path.join(__dirname, '.env'));

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const NETLIFY_MODE = String(process.env.NETLIFY || '').toLowerCase() === 'true' || !!process.env.NETLIFY_FUNCTIONS;
const NETLIFY_BLOB_STORE = process.env.NETLIFY_BLOB_STORE || 'baitul-jalal-ilmu-quran';
let blobStore = null;
async function getBlobStore(){
  if(!blobStore){ const { getStore } = require('@netlify/blobs'); blobStore = getStore(NETLIFY_BLOB_STORE); }
  return blobStore;
}
const UPLOAD_DIR = path.join(ROOT, 'uploads');
const CERT_DIR = path.join(UPLOAD_DIR, 'certificates');
const PROFILE_DIR = path.join(UPLOAD_DIR, 'profiles');
const PAYMENT_DIR = path.join(UPLOAD_DIR, 'payments');
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'afdalarafa75@gmail.com').trim().toLowerCase();
// Single built-in Admin account. The password is never stored in plaintext.
// This hash corresponds to the pre-seeded Admin password: Delisha19@
const ADMIN_PASSWORD_HASH = '08a85fb60bb69ebee8386a04b118450e:bd5bd13194b63392b6dcb82059f7987bdcd25306a03fe3f97c16c811e85fec5e74d84f6b255ade1b7917bf3e0197367e5791c907b10828022720408b76313166';
const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);
const MAX_BODY = 20 * 1024 * 1024;
const FIREBASE_SERVICE_ACCOUNT_FILE = process.env.FIREBASE_SERVICE_ACCOUNT_FILE || 'firebase-service-account.json';
const FIREBASE_ENABLED = String(process.env.FIREBASE_ENABLED || '').trim() ? String(process.env.FIREBASE_ENABLED).toLowerCase() === 'true' : fs.existsSync(path.resolve(__dirname, FIREBASE_SERVICE_ACCOUNT_FILE));
let FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID || '';
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY || '';
const FIREBASE_SERVICE_ACCOUNT_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
const GOOGLE_DRIVE_ENABLED = String(process.env.GOOGLE_DRIVE_ENABLED || '').trim() ? String(process.env.GOOGLE_DRIVE_ENABLED).toLowerCase() === 'true' : fs.existsSync(path.resolve(__dirname, FIREBASE_SERVICE_ACCOUNT_FILE));
const GOOGLE_DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID || '';
const GOOGLE_SERVICE_ACCOUNT_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
const GOOGLE_SERVICE_ACCOUNT_FILE = process.env.GOOGLE_SERVICE_ACCOUNT_FILE || FIREBASE_SERVICE_ACCOUNT_FILE;
let firebaseAuth=null, drive=null;
let firebaseWebApiKeyPromise=null;
async function resolveFirebaseWebApiKey(){
  if(FIREBASE_WEB_API_KEY) return FIREBASE_WEB_API_KEY;
  const sa=parseServiceAccount(FIREBASE_SERVICE_ACCOUNT_JSON,FIREBASE_SERVICE_ACCOUNT_FILE);
  FIREBASE_PROJECT_ID = FIREBASE_PROJECT_ID || sa?.project_id || '';
  if(!FIREBASE_PROJECT_ID) throw new Error('FIREBASE_PROJECT_ID_REQUIRED');
  if(!sa) throw new Error('FIREBASE_SERVICE_ACCOUNT_REQUIRED');
  const auth=new google.auth.GoogleAuth({credentials:sa,scopes:['https://www.googleapis.com/auth/cloud-platform.read-only']});
  const client=await auth.getClient();
  const tokenResponse=await client.getAccessToken();
  const token=typeof tokenResponse==='string'?tokenResponse:tokenResponse?.token;
  if(!token) throw new Error('FIREBASE_MANAGEMENT_AUTH_FAILED');
  const list=await fetch(`https://firebase.googleapis.com/v1beta1/projects/${encodeURIComponent(FIREBASE_PROJECT_ID)}/webApps`,{headers:{Authorization:`Bearer ${token}`}});
  if(!list.ok) throw new Error(`FIREBASE_WEB_APP_LOOKUP_FAILED_${list.status}`);
  const data=await list.json();
  const apps=Array.isArray(data.apps)?data.apps:[];
  if(!apps.length) throw new Error('FIREBASE_WEB_APP_NOT_FOUND');
  const cfg=await fetch(`https://firebase.googleapis.com/v1beta1/projects/-/webApps/${encodeURIComponent(apps[0].appId)}/config`,{headers:{Authorization:`Bearer ${token}`}});
  if(!cfg.ok) throw new Error(`FIREBASE_WEB_CONFIG_LOOKUP_FAILED_${cfg.status}`);
  const c=await cfg.json();
  if(!c.apiKey) throw new Error('FIREBASE_WEB_API_KEY_NOT_FOUND');
  return c.apiKey;
}
function parseServiceAccount(raw, file=''){
  let source = raw || '';
  if(!source && file){
    const full = path.resolve(__dirname, file);
    if(fs.existsSync(full)) source = fs.readFileSync(full, 'utf8');
  }
  if(!source) return null;
  try{return JSON.parse(source)}catch{throw new Error('SERVICE_ACCOUNT_JSON_INVALID')}
}
function initExternalServices(){
  if(FIREBASE_ENABLED){
    if(!admin) throw new Error('FIREBASE_ADMIN_SDK_NOT_INSTALLED');
    const sa=parseServiceAccount(FIREBASE_SERVICE_ACCOUNT_JSON,FIREBASE_SERVICE_ACCOUNT_FILE);
    if(!sa)throw new Error('FIREBASE_SERVICE_ACCOUNT_REQUIRED');
    FIREBASE_PROJECT_ID = FIREBASE_PROJECT_ID || sa.project_id || '';
    if(!FIREBASE_PROJECT_ID)throw new Error('FIREBASE_PROJECT_ID_REQUIRED');
    if(!admin.apps.length)admin.initializeApp({credential:admin.credential.cert(sa),projectId:FIREBASE_PROJECT_ID});
    firebaseAuth=admin.auth();
    firebaseWebApiKeyPromise=FIREBASE_WEB_API_KEY ? Promise.resolve(FIREBASE_WEB_API_KEY) : null;
    console.log(`[Firebase] enabled: project=${FIREBASE_PROJECT_ID}, admin=${ADMIN_EMAIL}`);
  }
  if(GOOGLE_DRIVE_ENABLED){
    if(!google) throw new Error('GOOGLE_API_SDK_NOT_INSTALLED');
    const sa=parseServiceAccount(GOOGLE_SERVICE_ACCOUNT_JSON,GOOGLE_SERVICE_ACCOUNT_FILE);
    if(!sa||!GOOGLE_DRIVE_FOLDER_ID)throw new Error('GOOGLE_DRIVE_CONFIGURATION_REQUIRED');
    const auth=new google.auth.GoogleAuth({credentials:sa,scopes:['https://www.googleapis.com/auth/drive']});
    drive=google.drive({version:'v3',auth});
    console.log(`[Google Drive] enabled: folder=${GOOGLE_DRIVE_FOLDER_ID}`);
  }
}
async function firebasePasswordSignIn(email,password){if(!firebaseWebApiKeyPromise)firebaseWebApiKeyPromise=resolveFirebaseWebApiKey();const webApiKey=await firebaseWebApiKeyPromise;const r=await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(webApiKey)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,returnSecureToken:true})});const d=await r.json();if(!r.ok)throw Object.assign(new Error('EMAIL_OR_PASSWORD_INVALID'),{status:401});const decoded=await firebaseAuth.verifyIdToken(d.idToken);return{uid:decoded.uid,email:(decoded.email||email).toLowerCase(),emailVerified:!!decoded.email_verified}}
async function firebaseCreateUser(email,password=''){if(!firebaseAuth)return '';const opts={email:String(email).toLowerCase()};if(password)opts.password=String(password);const u=await firebaseAuth.createUser(opts);return u.uid}
async function firebaseSetPassword(uid,password){if(firebaseAuth)await firebaseAuth.updateUser(uid,{password:String(password)})}
async function firebaseDeleteUser(uid){if(firebaseAuth&&uid){try{await firebaseAuth.deleteUser(uid)}catch{}}}
async function driveUploadDataUrl(dataUrl,name){const m=String(dataUrl||'').match(/^data:([^;]+);base64,(.+)$/s);if(!m)throw Object.assign(new Error('INVALID_FILE'),{status:400});const buf=Buffer.from(m[2],'base64');const r=await drive.files.create({requestBody:{name,parents:[GOOGLE_DRIVE_FOLDER_ID]},media:{mimeType:m[1],body:require('stream').Readable.from(buf)},fields:'id,name,mimeType'});return `drive://${r.data.id}`}
async function driveDownload(fileId){return (await drive.files.get({fileId,alt:'media'},{responseType:'stream'})).data}
async function driveDelete(fileId){if(drive&&fileId){try{await drive.files.delete({fileId})}catch{}}}
function isDrivePath(v){return String(v||'').startsWith('drive://')}
function driveId(v){return String(v||'').replace(/^drive:\/\//,'')}
initExternalServices();


for (const d of [DATA_DIR, UPLOAD_DIR, CERT_DIR, PROFILE_DIR, PAYMENT_DIR]) fs.mkdirSync(d, { recursive: true });

let db = new DatabaseSync(path.join(DATA_DIR, 'baitul-jalal.db'));
const DB_FILE = path.join(DATA_DIR, 'baitul-jalal.db');
db.exec(`
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 role TEXT NOT NULL CHECK(role IN ('ADMIN','GURU','MURID')),
 name TEXT NOT NULL, whatsapp TEXT DEFAULT '', email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'MENUNGGU_VERIFIKASI',
 email_verified INTEGER NOT NULL DEFAULT 0, photo TEXT DEFAULT '', address TEXT DEFAULT '',
 experience TEXT DEFAULT '', programs TEXT DEFAULT '', package TEXT DEFAULT '', learning_mode TEXT DEFAULT 'ONLINE', teacher_id INTEGER,
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_login TEXT DEFAULT '',
 FOREIGN KEY(teacher_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS programs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, description TEXT DEFAULT '', video_link TEXT DEFAULT '', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS classes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, program_id INTEGER, teacher_id INTEGER,
 package TEXT DEFAULT 'PAKET SORE', mode TEXT DEFAULT 'OFFLINE', link TEXT DEFAULT '', room TEXT DEFAULT '', active INTEGER DEFAULT 1,
 FOREIGN KEY(program_id) REFERENCES programs(id) ON DELETE SET NULL,
 FOREIGN KEY(teacher_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS schedules (
 id INTEGER PRIMARY KEY AUTOINCREMENT, program_id INTEGER, teacher_id INTEGER, class_id INTEGER, day TEXT NOT NULL,
 start_time TEXT NOT NULL, end_time TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'ONLINE', link TEXT DEFAULT '', room TEXT DEFAULT '',
 material TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'AKTIF', created_at TEXT NOT NULL,
 FOREIGN KEY(program_id) REFERENCES programs(id) ON DELETE SET NULL,
 FOREIGN KEY(teacher_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY(class_id) REFERENCES classes(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS teacher_transfers (id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, from_teacher_id INTEGER, to_teacher_id INTEGER, moved_by INTEGER, moved_at TEXT NOT NULL, note TEXT DEFAULT '', FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(from_teacher_id) REFERENCES users(id) ON DELETE SET NULL, FOREIGN KEY(to_teacher_id) REFERENCES users(id) ON DELETE SET NULL, FOREIGN KEY(moved_by) REFERENCES users(id) ON DELETE SET NULL);
CREATE TABLE IF NOT EXISTS student_requests (
 id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, teacher_id INTEGER, program TEXT DEFAULT '', package TEXT DEFAULT '', mode TEXT DEFAULT 'OFFLINE',
 status TEXT NOT NULL DEFAULT 'MENUNGGU', created_at TEXT NOT NULL, decided_at TEXT DEFAULT '',
 FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(teacher_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS attendance (
 id INTEGER PRIMARY KEY AUTOINCREMENT, schedule_id INTEGER, teacher_id INTEGER, student_id INTEGER, role TEXT NOT NULL,
 attendance_date TEXT NOT NULL, check_in TEXT DEFAULT '', status TEXT NOT NULL DEFAULT 'HADIR', method TEXT DEFAULT '',
 FOREIGN KEY(schedule_id) REFERENCES schedules(id) ON DELETE SET NULL,
 FOREIGN KEY(teacher_id) REFERENCES users(id) ON DELETE SET NULL,
 FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS progress (
 id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, teacher_id INTEGER, program TEXT NOT NULL,
 juz INTEGER DEFAULT 0, status TEXT DEFAULT '', makharij TEXT DEFAULT '', tajwid TEXT DEFAULT '', fluency TEXT DEFAULT '', length_rule TEXT DEFAULT '',
 material TEXT DEFAULT '', understanding TEXT DEFAULT '', score REAL, notes TEXT DEFAULT '', learning_date TEXT DEFAULT '',
 FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE,
 FOREIGN KEY(teacher_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS materials (
 id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER, title TEXT NOT NULL, description TEXT DEFAULT '', program TEXT DEFAULT '', file_path TEXT DEFAULT '',
 created_at TEXT NOT NULL, FOREIGN KEY(teacher_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS notes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, teacher_id INTEGER, student_id INTEGER NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL,
 FOREIGN KEY(teacher_id) REFERENCES users(id) ON DELETE SET NULL, FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS payments (
 id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, amount INTEGER DEFAULT 0, method TEXT DEFAULT '', proof_path TEXT DEFAULT '',
 status TEXT NOT NULL DEFAULT 'BELUM BAYAR', note TEXT DEFAULT '', created_at TEXT NOT NULL, verified_at TEXT DEFAULT '',
 FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS settings (
 key TEXT PRIMARY KEY, value TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS certificates (
 id INTEGER PRIMARY KEY AUTOINCREMENT, student_id INTEGER NOT NULL, program TEXT DEFAULT '', achievement TEXT DEFAULT '', certificate_number TEXT NOT NULL UNIQUE,
 issue_date TEXT DEFAULT '', institution_name TEXT DEFAULT 'Baitul Jalal Ilmu Quran', pdf_path TEXT DEFAULT '', qr_path TEXT DEFAULT '', status TEXT DEFAULT 'TERVERIFIKASI',
 uploaded_by INTEGER, created_at TEXT NOT NULL,
 FOREIGN KEY(student_id) REFERENCES users(id) ON DELETE CASCADE, FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS certificate_uploads (
 id INTEGER PRIMARY KEY AUTOINCREMENT, pdf_path TEXT NOT NULL, uploaded_by INTEGER, created_at TEXT NOT NULL,
 FOREIGN KEY(uploaded_by) REFERENCES users(id) ON DELETE SET NULL
);
CREATE TABLE IF NOT EXISTS notifications (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, title TEXT NOT NULL, message TEXT NOT NULL, type TEXT DEFAULT 'INFO', is_read INTEGER DEFAULT 0,
 created_at TEXT NOT NULL, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS activity_logs (
 id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id INTEGER, action TEXT NOT NULL, target_type TEXT DEFAULT '', target_id INTEGER, detail TEXT DEFAULT '', created_at TEXT NOT NULL,
 FOREIGN KEY(actor_id) REFERENCES users(id) ON DELETE SET NULL
);
`);

// Backward-compatible migrations for existing installations.
for (const [table, column, definition] of [
  ['users','learning_mode',"TEXT DEFAULT 'ONLINE'"],
  ['classes','mode',"TEXT DEFAULT 'OFFLINE'"],
  ['classes','link',"TEXT DEFAULT ''"],
  ['student_requests','mode',"TEXT DEFAULT 'OFFLINE'"],
  ['users','payment_bank',"TEXT DEFAULT ''"],
  ['users','payment_account',"TEXT DEFAULT ''"],
  ['users','payment_owner',"TEXT DEFAULT ''"],
  ['programs','video_link',"TEXT DEFAULT ''"],
  ['users','firebase_uid',"TEXT DEFAULT ''"]
]) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(x=>x.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}

function now() { return new Date().toISOString(); }
function today() { return new Date().toISOString().slice(0,10); }
function safeJson(s, fallback={}) { try { return JSON.parse(s); } catch { return fallback; } }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex'); return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':'); if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(candidate,'hex'), Buffer.from(hash,'hex'));
}
function seed() {
  const t = now();
  // Enforce exactly one built-in Admin account. Any accidental extra ADMIN rows are disabled.
  const admin = db.prepare("SELECT id FROM users WHERE email=?").get(ADMIN_EMAIL);
  if (!admin) db.prepare(`INSERT INTO users(role,name,email,password_hash,status,email_verified,created_at,updated_at) VALUES('ADMIN',?,?,?,?,?,?,?)`)
    .run('Administrator', ADMIN_EMAIL, FIREBASE_ENABLED ? '' : ADMIN_PASSWORD_HASH, 'AKTIF', 1, t, t);
  else db.prepare("UPDATE users SET role='ADMIN', password_hash=?, status='AKTIF', email_verified=1, updated_at=? WHERE id=?").run(FIREBASE_ENABLED ? '' : ADMIN_PASSWORD_HASH,t,admin.id);
  db.prepare("UPDATE users SET status='NONAKTIF', updated_at=? WHERE role='ADMIN' AND email<>?").run(t, ADMIN_EMAIL);
  for (const [name, description] of [
    ['TAHFIDZ','Program menghafal Al-Qur’an Juz 1–30 secara terarah dan berkesinambungan.'],
    ['TAHSIN','Program perbaikan bacaan Al-Qur’an meliputi makharijul huruf, tajwid, kelancaran, dan panjang pendek.'],
    ['TAFSIR','Program memahami kandungan, materi, dan nilai Al-Qur’an secara bertahap.']
  ]) db.prepare('INSERT OR IGNORE INTO programs(name,description,video_link,active) VALUES(?,?,?,1)').run(name,description,'');
  const defaults = {
    site_name:'Baitul Jalal Ilmu Quran', whatsapp:'', address:'', website:'', social_facebook:'', social_instagram:'', social_youtube:'', social_tiktok:'', payment_bank:'', payment_account:'', payment_owner:'', payment_qr:'', certificate_institution:'Baitul Jalal Ilmu Quran'
  };
  for (const [k,v] of Object.entries(defaults)) db.prepare('INSERT OR IGNORE INTO settings(key,value) VALUES(?,?)').run(k,v);
}
seed();

async function hydrateDatabase(){
  if(!NETLIFY_MODE) return;
  const store=await getBlobStore();
  const data=await store.get('database/baitul-jalal.db.gz',{type:'arrayBuffer'});
  if(data){
    try{ db.close(); }catch{}
    fs.writeFileSync(DB_FILE,zlib.gunzipSync(Buffer.from(data)));
    db=new DatabaseSync(DB_FILE);
    db.exec('PRAGMA foreign_keys = ON;');
  }
}
async function persistDatabase(){
  if(!NETLIFY_MODE) return;
  const store=await getBlobStore();
  try{ db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); }catch{}
  await store.set('database/baitul-jalal.db.gz',zlib.gzipSync(fs.readFileSync(DB_FILE)));
}

const SESSION_SECRET = process.env.SESSION_SECRET || 'baitul-jalal-netlify-change-this-secret';
function signSession(payload){
  const body=Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig=crypto.createHmac('sha256',SESSION_SECRET).update(body).digest('base64url');
  return body+'.'+sig;
}
function verifySession(token){
  const [body,sig]=String(token||'').split('.'); if(!body||!sig)return null;
  const expected=crypto.createHmac('sha256',SESSION_SECRET).update(body).digest('base64url');
  if(sig.length!==expected.length || !crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(expected)))return null;
  try{ const p=JSON.parse(Buffer.from(body,'base64url').toString('utf8')); return p.expires>Date.now()?p:null; }catch{return null;}
}
function createSession(user) { return signSession({userId:user.id,expires:Date.now()+SESSION_HOURS*3600*1000}); }
function auth(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const s = verifySession(token);
  if (!s) return null;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(s.userId);
  if (!u || u.status !== 'AKTIF') return null;
  return { user:u, token };
}
function requireRole(req, roles) {
  const a = auth(req); if (!a) throw Object.assign(new Error('UNAUTHORIZED'),{status:401});
  if (!roles.includes(a.user.role)) throw Object.assign(new Error('FORBIDDEN'),{status:403});
  return a;
}
function log(actorId, action, targetType='', targetId=null, detail='') {
  db.prepare('INSERT INTO activity_logs(actor_id,action,target_type,target_id,detail,created_at) VALUES(?,?,?,?,?,?)').run(actorId,action,targetType,targetId,detail,now());
}
function notify(userId,title,message,type='INFO') { if (userId) db.prepare('INSERT INTO notifications(user_id,title,message,type,created_at) VALUES(?,?,?,?,?)').run(userId,title,message,type,now()); }
function publicUser(u) { if (!u) return null; const {password_hash,...x}=u; return x; }
function send(res, status, data, headers={}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers}); res.end(body);
}
function sendText(res,status,text,type='text/plain; charset=utf-8') { res.writeHead(status,{'Content-Type':type}); res.end(text); }
function securityHeaders(){ return {
  'X-Content-Type-Options':'nosniff',
  'X-Frame-Options':'SAMEORIGIN',
  'Referrer-Policy':'strict-origin-when-cross-origin',
  'Permissions-Policy':'camera=(), microphone=(), geolocation=()',
  'X-XSS-Protection':'0'
}; }
const loginAttempts = new Map();
function loginRateLimited(ip){
  const nowMs=Date.now(); const x=loginAttempts.get(ip);
  if(!x || x.resetAt < nowMs){ loginAttempts.set(ip,{count:1,resetAt:nowMs+15*60*1000}); return false; }
  x.count++; return x.count > 15;
}
function clearLoginAttempts(ip){ loginAttempts.delete(ip); }
function readBody(req) { return new Promise((resolve,reject)=>{
  let chunks=[]; let size=0;
  req.on('data',c=>{ size+=c.length; if(size>MAX_BODY){ reject(Object.assign(new Error('BODY_TOO_LARGE'),{status:413})); req.destroy(); return;} chunks.push(c); });
  req.on('end',()=>{ const raw=Buffer.concat(chunks).toString('utf8'); resolve(safeJson(raw,{})); }); req.on('error',reject);
});}
function cleanFileName(name){ return String(name||'file').replace(/[^a-zA-Z0-9._-]/g,'_').slice(0,120); }
async function saveDataUrl(dataUrl, folder, prefix) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return '';
  const m=dataUrl.match(/^data:([^;]+);base64,(.+)$/s); if(!m) throw Object.assign(new Error('INVALID_FILE'),{status:400});
  const mime=m[1].toLowerCase(); const ext={ 'application/pdf':'.pdf','image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp','image/svg+xml':'.svg' }[mime];
  if(!ext) throw Object.assign(new Error('FILE_TYPE_NOT_ALLOWED'),{status:400});
  const buf=Buffer.from(m[2],'base64'); if(buf.length>(NETLIFY_MODE?4*1024*1024:8*1024*1024)) throw Object.assign(new Error('FILE_TOO_LARGE'),{status:413});
  const fn=`${prefix}-${Date.now()}-${crypto.randomBytes(5).toString('hex')}${ext}`;
  if(GOOGLE_DRIVE_ENABLED)return await driveUploadDataUrl(dataUrl,fn);
  const area=path.basename(folder);
  if(NETLIFY_MODE){ const store=await getBlobStore(); await store.set(`uploads/${area}/${fn}`,buf,{contentType:mime}); return '/uploads/'+area+'/'+fn; }
  const full=path.join(folder,fn); fs.writeFileSync(full,buf); return '/uploads/'+area+'/'+fn;
}
function parsePrograms(v){
  if(Array.isArray(v)) return v.map(String).map(x=>x.trim()).filter(Boolean);
  const s=String(v||'').trim();
  if(!s) return [];
  try { const parsed=JSON.parse(s); if(Array.isArray(parsed)) return parsed.map(String).map(x=>x.trim()).filter(Boolean); } catch {}
  return s.split(',').map(x=>x.trim()).filter(Boolean);
}
function userWithRelations(u){
  const x=publicUser(u); x.programs=parsePrograms(x.programs); if(x.teacher_id) x.teacher=db.prepare('SELECT id,name,email,whatsapp FROM users WHERE id=?').get(x.teacher_id); return x;
}
function teacherStudents(teacherId){ return db.prepare(`SELECT id,name,whatsapp,email,programs,package,learning_mode,status,created_at FROM users WHERE role='MURID' AND teacher_id=? ORDER BY name`).all(teacherId); }

async function api(req,res,url){
  const p=url.pathname;
  if(req.method==='GET' && p==='/api/health') return send(res,200,{ok:true,service:'baitul-jalal-ilmu-quran',version:'1.0.0',database:true,environment:NODE_ENV,firebase_enabled:FIREBASE_ENABLED,firebase_project:FIREBASE_ENABLED?FIREBASE_PROJECT_ID:'',google_drive_enabled:GOOGLE_DRIVE_ENABLED,uptime:Math.round(process.uptime()),time:now()});
  if(req.method==='GET' && p==='/api/public/stats'){
    const count=r=>db.prepare('SELECT COUNT(*) c FROM users WHERE '+r).get().c;
    return send(res,200,{teachers:count("role='GURU' AND status='AKTIF'"),students:count("role='MURID' AND status='AKTIF'"),tahfidz:count("role='MURID' AND status='AKTIF' AND programs LIKE '%TAHFIDZ%'"),tahsin:count("role='MURID' AND status='AKTIF' AND programs LIKE '%TAHSIN%'"),tafsir:count("role='MURID' AND status='AKTIF' AND programs LIKE '%TAFSIR%'"),pending:count("status='MENUNGGU_VERIFIKASI'")});
  }
  if(req.method==='GET' && p==='/api/public/teachers') return send(res,200,db.prepare("SELECT id,name,whatsapp,programs,photo,experience,status FROM users WHERE role='GURU' AND status='AKTIF' ORDER BY name").all().map(x=>({...x,programs:parsePrograms(x.programs),photo:isDrivePath(x.photo)?('/api/public-file?path='+encodeURIComponent(x.photo)):x.photo})));
  if(req.method==='GET' && p==='/api/public/programs') return send(res,200,db.prepare('SELECT * FROM programs WHERE active=1 ORDER BY id').all());
  if(req.method==='GET' && p==='/api/public/settings') { const rows=db.prepare('SELECT key,value FROM settings').all(); return send(res,200,Object.fromEntries(rows.map(x=>[x.key,x.value]))); }
  if(req.method==='GET' && p==='/api/public/certificate') { const n=url.searchParams.get('number')||''; const c=db.prepare(`SELECT c.id,c.program,c.achievement,c.certificate_number,c.issue_date,c.institution_name,c.status,u.name student_name FROM certificates c JOIN users u ON u.id=c.student_id WHERE c.certificate_number=?`).get(n); return send(res,200,c?{found:true,certificate:c}:{found:false}); }
  if(req.method==='POST' && p==='/api/register/guru'){
    const b=await readBody(req); const required=['name','whatsapp','email','password']; for(const k of required) if(!String(b[k]||'').trim()) throw Object.assign(new Error(`FIELD_${k}`),{status:400});
    const programs=parsePrograms(b.programs); if(!programs.length) throw Object.assign(new Error('PROGRAM_REQUIRED'),{status:400});
    const email=String(b.email).toLowerCase(); if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw Object.assign(new Error('EMAIL_ALREADY_EXISTS'),{status:409});
    const t=now(); let photo=''; if(b.photo) photo=await saveDataUrl(b.photo,PROFILE_DIR,'guru');
    const firebaseUid=FIREBASE_ENABLED?await firebaseCreateUser(email,String(b.password)):''; const r=db.prepare(`INSERT INTO users(role,name,whatsapp,email,password_hash,status,email_verified,photo,address,experience,programs,firebase_uid,created_at,updated_at) VALUES('GURU',?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.name,b.whatsapp,email,FIREBASE_ENABLED?'firebase-managed:'+firebaseUid:hashPassword(String(b.password)),'MENUNGGU_VERIFIKASI',0,photo,b.address||'',b.experience||'',JSON.stringify(programs),firebaseUid,t,t);
    const admins=db.prepare("SELECT id FROM users WHERE role='ADMIN' AND status='AKTIF'").all(); admins.forEach(a=>notify(a.id,'Pendaftaran Guru Baru',`${b.name} mendaftar sebagai Guru. Menunggu verifikasi.`,'VERIFIKASI'));
    return send(res,201,{ok:true,message:'Pendaftaran berhasil dikirim. Silakan menunggu verifikasi Admin.',id:Number(r.lastInsertRowid)});
  }
  if(req.method==='POST' && p==='/api/register/murid'){
    const b=await readBody(req); const required=['name','whatsapp','email','password']; for(const k of required) if(!String(b[k]||'').trim()) throw Object.assign(new Error(`FIELD_${k}`),{status:400});
    const programs=parsePrograms(b.programs); if(!programs.length) throw Object.assign(new Error('PROGRAM_REQUIRED'),{status:400});
    const email=String(b.email).toLowerCase(); if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw Object.assign(new Error('EMAIL_ALREADY_EXISTS'),{status:409});
    const t=now(); let photo=''; if(b.photo) photo=await saveDataUrl(b.photo,PROFILE_DIR,'murid');
    const firebaseUid=FIREBASE_ENABLED?await firebaseCreateUser(email,String(b.password)):''; const r=db.prepare(`INSERT INTO users(role,name,whatsapp,email,password_hash,status,email_verified,photo,address,programs,package,learning_mode,firebase_uid,created_at,updated_at) VALUES('MURID',?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(b.name,b.whatsapp,email,FIREBASE_ENABLED?'firebase-managed:'+firebaseUid:hashPassword(String(b.password)),'MENUNGGU_VERIFIKASI',0,photo,b.address||'',JSON.stringify(programs),b.package||'PAKET SORE',b.mode||'ONLINE',firebaseUid,t,t);
    const sid=Number(r.lastInsertRowid); if(b.teacherId) db.prepare('INSERT INTO student_requests(student_id,teacher_id,program,package,mode,status,created_at) VALUES(?,?,?,?,?,?,?)').run(sid,Number(b.teacherId),programs[0],b.package||'PAKET SORE',b.mode||'ONLINE','MENUNGGU',t);
    const admins=db.prepare("SELECT id FROM users WHERE role='ADMIN' AND status='AKTIF'").all(); admins.forEach(a=>notify(a.id,'Pendaftaran Murid Baru',`${b.name} mendaftar sebagai Murid. Menunggu proses.`,'VERIFIKASI'));
    if(b.teacherId) notify(Number(b.teacherId),'Permintaan Murid Baru',`${b.name} memilih Anda sebagai Guru. Silakan terima atau tolak.`,'PERMINTAAN');
    return send(res,201,{ok:true,message:'Pendaftaran berhasil. Silakan menunggu proses aktivasi.',id:sid});
  }
  if(req.method==='POST' && p==='/api/auth/set-initial-password') {
    const b=await readBody(req); const role=String(b.role||'').toUpperCase(); const email=String(b.email||'').trim().toLowerCase(); const whatsapp=String(b.whatsapp||'').trim(); const password=String(b.password||'');
    if(!['GURU','MURID'].includes(role)) return send(res,400,{error:'ROLE_REQUIRED'});
    if(!email||!whatsapp||password.length<8) return send(res,400,{error:'PASSWORD_SETUP_FIELDS_REQUIRED'});
    const u=db.prepare("SELECT * FROM users WHERE role=? AND lower(email)=?").get(role,email);
    if(!u || String(u.whatsapp||'').trim()!==whatsapp) return send(res,401,{error:'IDENTITY_DATA_INVALID'});
    if(u.status!=='AKTIF') return send(res,403,{error:'ACCOUNT_NOT_ACTIVE',status:u.status});
    if(String(u.password_hash||'') && !String(u.password_hash||'').startsWith('firebase-managed:')) return send(res,409,{error:'PASSWORD_ALREADY_SET'});
    try {
      if(FIREBASE_ENABLED){
        if(!u.firebase_uid) {
          const fbUser=await firebaseCreateUser(email);
          db.prepare('UPDATE users SET firebase_uid=?,updated_at=? WHERE id=?').run(fbUser,now(),u.id);
          u.firebase_uid=fbUser;
        }
        await firebaseSetPassword(u.firebase_uid,password);
        db.prepare('UPDATE users SET password_hash=?,email_verified=1,updated_at=? WHERE id=?').run('firebase-managed:'+u.firebase_uid,now(),u.id);
      } else {
        db.prepare('UPDATE users SET password_hash=?,email_verified=1,updated_at=? WHERE id=?').run(hashPassword(password),now(),u.id);
      }
    } catch(err) {
      console.error('[Firebase] password setup failed:',err.message);
      return send(res,500,{error:'FIREBASE_PASSWORD_SETUP_FAILED'});
    }
    notify(u.id,'Password Akun Berhasil Dibuat','Password login berhasil dibuat oleh Anda.','AKUN');
    return send(res,200,{ok:true,message:'Password berhasil dibuat. Silakan login dengan email dan password Anda.'});
  }
  if(req.method==='POST' && p==='/api/login'){
    const b=await readBody(req); const ip=req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || 'unknown'; if(loginRateLimited(ip))return send(res,429,{error:'TOO_MANY_LOGIN_ATTEMPTS'});
    const role=String(b.role||'').toUpperCase(),email=String(b.email||'').trim().toLowerCase(),password=String(b.password||''); let u=db.prepare('SELECT * FROM users WHERE email=? AND role=?').get(email,role);
    if(FIREBASE_ENABLED){
      try{
        if(role==='ADMIN'&&email!==ADMIN_EMAIL)throw new Error('EMAIL_OR_PASSWORD_INVALID');
        const fb=await firebasePasswordSignIn(email,password);
        if(!u)throw new Error('ACCOUNT_NOT_REGISTERED');
        if(u.firebase_uid!==fb.uid)db.prepare('UPDATE users SET firebase_uid=?,email_verified=1,updated_at=? WHERE id=?').run(fb.uid,now(),u.id);
        u=db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
      }catch(err){
        console.error('[Firebase] login failed:',err.message);
        loginAttempts.get(ip).count++;
        const clientError=String(err.message||'').startsWith('FIREBASE_')?'FIREBASE_CONFIGURATION_ERROR':(err.message==='ACCOUNT_NOT_REGISTERED'?'ACCOUNT_NOT_REGISTERED':'EMAIL_OR_PASSWORD_INVALID');
        return send(res,clientError==='FIREBASE_CONFIGURATION_ERROR'?503:401,{error:clientError});
      }
    }else if(!u||u.status!=='AKTIF'||!verifyPassword(password,u.password_hash)){loginAttempts.get(ip).count++;return send(res,401,{error:u&&u.status!=='AKTIF'?'ACCOUNT_NOT_ACTIVE':'EMAIL_OR_PASSWORD_INVALID'});}
    if(!u||u.status!=='AKTIF')return send(res,401,{error:'ACCOUNT_NOT_ACTIVE'}); clearLoginAttempts(ip);const token=createSession(u);db.prepare('UPDATE users SET last_login=?,updated_at=? WHERE id=?').run(now(),now(),u.id);log(u.id,'LOGIN','USER',u.id,'Login berhasil');return send(res,200,{ok:true,token,user:userWithRelations(u)});
  }
  if(req.method==='POST' && p==='/api/logout'){ const a=auth(req); if(a){log(a.user.id,'LOGOUT','USER',a.user.id,'Logout');} return send(res,200,{ok:true}); }
  if(req.method==='POST' && p==='/api/auth/forgot') { const b=await readBody(req); const u=db.prepare('SELECT id FROM users WHERE email=?').get(String(b.email||'').toLowerCase()); if(u) { const token=crypto.randomBytes(24).toString('hex'); db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('reset:'+u.id,JSON.stringify({token,expires:Date.now()+30*60*1000})); notify(u.id,'Permintaan Reset Password','Gunakan tautan reset yang diberikan oleh Admin atau hubungi lembaga.','AKUN'); } return send(res,200,{ok:true,message:'Jika email terdaftar, permintaan reset password telah dicatat. Untuk keamanan, proses reset dilanjutkan melalui Admin.'}); }
  if(req.method==='GET' && p==='/api/me'){ const a=requireRole(req,['ADMIN','GURU','MURID']); return send(res,200,{user:userWithRelations(a.user)}); }
  if(req.method==='POST' && p==='/api/change-password'){
    const a=requireRole(req,['ADMIN']);
    return send(res,403,{error:'BUILT_IN_ADMIN_PASSWORD_LOCKED',message:'Password Admin bawaan dikunci oleh sistem dan tidak dapat diubah.'});
  }


  const a=auth(req); if(!a) throw Object.assign(new Error('UNAUTHORIZED'),{status:401});
  const role=a.user.role; const b=(req.method==='POST'||req.method==='PUT'||req.method==='PATCH')?await readBody(req):{};

  if(p==='/api/dashboard' && req.method==='GET'){
    if(role==='ADMIN'){
      const q=s=>db.prepare(s).get().c;
      return send(res,200,{role,stats:{teachers:q("SELECT COUNT(*) c FROM users WHERE role='GURU' AND status='AKTIF'"),students:q("SELECT COUNT(*) c FROM users WHERE role='MURID' AND status='AKTIF'"),tahfidz:q("SELECT COUNT(*) c FROM users WHERE role='MURID' AND status='AKTIF' AND programs LIKE '%TAHFIDZ%'"),tahsin:q("SELECT COUNT(*) c FROM users WHERE role='MURID' AND status='AKTIF' AND programs LIKE '%TAHSIN%'"),tafsir:q("SELECT COUNT(*) c FROM users WHERE role='MURID' AND status='AKTIF' AND programs LIKE '%TAFSIR%'"),pending:q("SELECT COUNT(*) c FROM users WHERE status='MENUNGGU_VERIFIKASI'"),payments:q("SELECT COUNT(*) c FROM payments WHERE status='MENUNGGU VERIFIKASI'")},recentLogs:db.prepare(`SELECT l.*,u.name actor_name FROM activity_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT 12`).all()});
    }
    if(role==='GURU'){ const students=teacherStudents(a.user.id); const stats={total:students.length,active:students.filter(x=>x.status==='AKTIF').length,schedules:db.prepare("SELECT COUNT(*) c FROM schedules WHERE teacher_id=? AND status='AKTIF'").get(a.user.id).c,attendance:db.prepare("SELECT COUNT(*) c FROM attendance WHERE teacher_id=? AND attendance_date=? AND status='HADIR'").get(a.user.id,today()).c}; return send(res,200,{role,stats,students}); }
    const s=a.user; return send(res,200,{role,stats:{teacher:s.teacher||null,schedules:db.prepare("SELECT COUNT(*) c FROM schedules WHERE teacher_id=? AND status='AKTIF'").get(s.teacher_id||0).c,attendance:db.prepare("SELECT COUNT(*) c FROM attendance WHERE student_id=? AND status='HADIR'").get(s.id).c,certificates:db.prepare('SELECT COUNT(*) c FROM certificates WHERE student_id=?').get(s.id).c},user:userWithRelations(s)});
  }

  if(role==='ADMIN'){
    if(p==='/api/admin/registrations' && req.method==='GET') return send(res,200,{teachers:db.prepare("SELECT id,name,whatsapp,email,programs,status,created_at FROM users WHERE role='GURU' AND status='MENUNGGU_VERIFIKASI' ORDER BY id DESC").all(),students:db.prepare("SELECT id,name,whatsapp,email,programs,package,learning_mode,status,created_at FROM users WHERE role='MURID' AND status='MENUNGGU_VERIFIKASI' ORDER BY id DESC").all()});
    if(p==='/api/admin/users' && req.method==='GET') { const r=url.searchParams.get('role'); const sql=r? 'SELECT id,role,name,whatsapp,email,programs,package,learning_mode,status,teacher_id,created_at,last_login FROM users WHERE role=? ORDER BY id DESC':'SELECT id,role,name,whatsapp,email,programs,package,learning_mode,status,teacher_id,created_at,last_login FROM users ORDER BY id DESC'; return send(res,200,db.prepare(sql).all(...(r?[r]:[]))); }
    if(p==='/api/admin/delete-user' && req.method==='POST'){ const id=Number(b.id); const u=db.prepare("SELECT * FROM users WHERE id=? AND role<>'ADMIN'").get(id); if(!u) throw Object.assign(new Error('NOT_FOUND'),{status:404}); log(a.user.id,'HAPUS_AKUN',u.role,id,u.name); if(u.firebase_uid) await firebaseDeleteUser(u.firebase_uid); if(isDrivePath(u.photo)) await driveDelete(driveId(u.photo)); db.prepare('DELETE FROM users WHERE id=?').run(id); return send(res,200,{ok:true}); }
    if(p==='/api/admin/user-status' && req.method==='POST'){ const id=Number(b.id), status=String(b.status||''); if(!['AKTIF','NONAKTIF','DITOLAK','MENUNGGU_VERIFIKASI'].includes(status)) throw Object.assign(new Error('INVALID_STATUS'),{status:400}); db.prepare('UPDATE users SET status=?,updated_at=? WHERE id=?').run(status,now(),id); const u=db.prepare('SELECT name,role FROM users WHERE id=?').get(id); if(u) notify(id,'Status Akun Berubah',`Status akun Anda sekarang: ${status}.`,'AKUN'); log(a.user.id,'UBAH_STATUS','USER',id,`${u?.role||''} ${u?.name||''} → ${status}`); return send(res,200,{ok:true}); }
    if(p==='/api/admin/teacher-decision' && req.method==='POST'){ const id=Number(b.id), decision=String(b.decision||''); const u=db.prepare("SELECT * FROM users WHERE id=? AND role='GURU'").get(id); if(!u) throw Object.assign(new Error('NOT_FOUND'),{status:404}); const map={TERIMA:'AKTIF',TOLAK:'DITOLAK','MINTA PERBAIKAN':'PERBAIKAN'}; const st=map[decision]; if(!st) throw Object.assign(new Error('INVALID_DECISION'),{status:400}); db.prepare('UPDATE users SET status=?,updated_at=? WHERE id=?').run(st,now(),id); notify(id,'Hasil Verifikasi Guru',`Pendaftaran Anda: ${decision}. Status: ${st}.`,'VERIFIKASI'); log(a.user.id,decision,'GURU',id,u.name); return send(res,200,{ok:true,status:st}); }
    if(p==='/api/admin/student-decision' && req.method==='POST'){ const id=Number(b.id), status=String(b.status||''); if(!['AKTIF','DITOLAK'].includes(status)) throw Object.assign(new Error('INVALID_STATUS'),{status:400}); db.prepare('UPDATE users SET status=?,updated_at=? WHERE id=? AND role=\'MURID\'').run(status,now(),id); notify(id,'Status Pendaftaran Murid',`Status akun Anda: ${status}.`,'VERIFIKASI'); log(a.user.id,'UBAH_STATUS','MURID',id,status); return send(res,200,{ok:true}); }
    if(p==='/api/admin/add-teacher' && req.method==='POST'){ const t=now(); if(!b.name||!b.email) throw Object.assign(new Error('NAME_EMAIL_REQUIRED'),{status:400}); const email=String(b.email).toLowerCase(); if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw Object.assign(new Error('EMAIL_ALREADY_EXISTS'),{status:409}); const firebaseUid=FIREBASE_ENABLED?await firebaseCreateUser(email):''; const r=db.prepare(`INSERT INTO users(role,name,whatsapp,email,password_hash,status,email_verified,programs,firebase_uid,created_at,updated_at) VALUES('GURU',?,?,?,?,?,0,?,?,?,?)`).run(b.name,b.whatsapp||'',email,'',b.status||'AKTIF',JSON.stringify(parsePrograms(b.programs)),firebaseUid,t,t); log(a.user.id,'TAMBAH_GURU_MANUAL','GURU',Number(r.lastInsertRowid),b.name); return send(res,201,{ok:true,id:Number(r.lastInsertRowid),message:'Akun Guru berhasil dibuat.'}); }
    if(p==='/api/admin/add-student' && req.method==='POST'){ const t=now(); if(!b.name||!b.whatsapp||!b.email||!b.program||!b.package||!b.mode) throw Object.assign(new Error('STUDENT_FIELDS_REQUIRED'),{status:400}); const email=String(b.email).toLowerCase(); if(db.prepare('SELECT id FROM users WHERE email=?').get(email)) throw Object.assign(new Error('EMAIL_ALREADY_EXISTS'),{status:409}); const teacherId=Number(b.teacherId)||null; if(teacherId){const teacher=db.prepare("SELECT id FROM users WHERE id=? AND role='GURU' AND status='AKTIF'").get(teacherId); if(!teacher) throw Object.assign(new Error('TEACHER_NOT_AVAILABLE'),{status:400});} const programs=JSON.stringify(parsePrograms([b.program])); const firebaseUid=FIREBASE_ENABLED?await firebaseCreateUser(email):''; const r=db.prepare(`INSERT INTO users(role,name,whatsapp,email,password_hash,status,email_verified,address,programs,package,learning_mode,teacher_id,firebase_uid,created_at,updated_at) VALUES('MURID',?,?,?,?, 'MENUNGGU_VERIFIKASI',0,?,?,?,?,?,?,?,?)`).run(b.name,b.whatsapp,email,'',b.address||'',programs,b.package,b.mode,teacherId,firebaseUid,t,t); const sid=Number(r.lastInsertRowid); if(teacherId){db.prepare('INSERT INTO student_requests(student_id,teacher_id,program,package,mode,status,created_at) VALUES(?,?,?,?,?,?,?)').run(sid,teacherId,b.program,b.package,b.mode,'DITERIMA',t); notify(teacherId,'Murid Baru Ditambahkan',`${b.name} telah ditambahkan oleh Admin dan ditetapkan kepada Anda.`,'MURID');} log(a.user.id,'TAMBAH_MURID_MANUAL','MURID',sid,b.name); return send(res,201,{ok:true,id:sid,message:'Murid berhasil dibuat.'}); }
    if(p==='/api/admin/move-student' && req.method==='POST'){ const id=Number(b.studentId), tid=Number(b.teacherId)||null; const s=db.prepare("SELECT * FROM users WHERE id=? AND role='MURID'").get(id); if(!s) throw Object.assign(new Error('STUDENT_NOT_FOUND'),{status:404}); const oldTeacher=s.teacher_id||null; db.prepare('UPDATE users SET teacher_id=?,updated_at=? WHERE id=?').run(tid,now(),id); db.prepare('INSERT INTO teacher_transfers(student_id,from_teacher_id,to_teacher_id,moved_by,moved_at,note) VALUES(?,?,?,?,?,?)').run(id,oldTeacher,tid,a.user.id,now(),b.note||'Pemindahan oleh Admin'); if(tid) notify(tid,'Murid Dipindahkan',`${s.name} telah ditetapkan kepada Anda oleh Admin.`,'KELAS'); log(a.user.id,'PINDAH_MURID','MURID',id,`from=${oldTeacher||'-'} to=${tid||'-'}`); return send(res,200,{ok:true}); }
    if(p==='/api/admin/delete-record' && req.method==='POST'){
      const type=String(b.type||''); const id=Number(b.id);
      const allowed={programs:'programs',classes:'classes',schedules:'schedules',attendance:'attendance',progress:'progress',payments:'payments',notifications:'notifications'};
      const table=allowed[type];
      if(!table || !id) throw Object.assign(new Error('DELETE_DATA_REQUIRED'),{status:400});
      const exists=db.prepare(`SELECT * FROM ${table} WHERE id=?`).get(id);
      if(!exists) throw Object.assign(new Error('NOT_FOUND'),{status:404});
      db.prepare(`DELETE FROM ${table} WHERE id=?`).run(id);
      log(a.user.id,'HAPUS_DATA',type.toUpperCase(),id,`Data ${type} dihapus`);
      return send(res,200,{ok:true});
    }
    if(p==='/api/admin/programs' && req.method==='GET') return send(res,200,db.prepare('SELECT * FROM programs ORDER BY id').all());
    if(p==='/api/admin/programs/link' && req.method==='POST'){ const id=Number(b.id); if(!id) throw Object.assign(new Error('PROGRAM_ID_REQUIRED'),{status:400}); const r=db.prepare('UPDATE programs SET video_link=? WHERE id=?').run(String(b.videoLink||'').trim(),id); if(!r.changes) throw Object.assign(new Error('NOT_FOUND'),{status:404}); log(a.user.id,'UBAH_LINK_VIDEO_CALL','PROGRAM',id,String(b.videoLink||'').trim()); return send(res,200,{ok:true}); }
    if(p==='/api/admin/programs' && req.method==='POST'){ const r=db.prepare('INSERT INTO programs(name,description,video_link,active) VALUES(?,?,?,?)').run(b.name,b.description||'',String(b.videoLink||'').trim(),b.active===false?0:1); log(a.user.id,'TAMBAH_PROGRAM','PROGRAM',Number(r.lastInsertRowid),b.name); return send(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if(p==='/api/admin/classes' && req.method==='GET') return send(res,200,db.prepare(`SELECT c.*,p.name program_name,u.name teacher_name FROM classes c LEFT JOIN programs p ON p.id=c.program_id LEFT JOIN users u ON u.id=c.teacher_id ORDER BY c.id DESC`).all());
    if(p==='/api/admin/classes' && req.method==='POST'){ const r=db.prepare('INSERT INTO classes(name,program_id,teacher_id,package,mode,link,room,active) VALUES(?,?,?,?,?,?,?,1)').run(b.name,Number(b.programId)||null,Number(b.teacherId)||null,b.package||'PAKET SORE',b.mode||'OFFLINE',b.link||'',b.room||''); log(a.user.id,'TAMBAH_KELAS','CLASS',Number(r.lastInsertRowid),b.name); return send(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if(p==='/api/admin/schedules' && req.method==='GET') return send(res,200,db.prepare(`SELECT s.*,p.name program_name,u.name teacher_name,c.name class_name FROM schedules s LEFT JOIN programs p ON p.id=s.program_id LEFT JOIN users u ON u.id=s.teacher_id LEFT JOIN classes c ON c.id=s.class_id ORDER BY s.id DESC`).all());
    if(p==='/api/admin/schedules' && req.method==='POST'){ const program=Number(b.programId)?db.prepare('SELECT video_link FROM programs WHERE id=?').get(Number(b.programId)):null; const scheduleLink=(String(b.link||'').trim()||String(program?.video_link||'').trim()); if((b.mode||'ONLINE')==='ONLINE' && !scheduleLink) throw Object.assign(new Error('WHATSAPP_LINK_REQUIRED'),{status:400}); if((b.mode||'ONLINE')==='OFFLINE' && !String(b.room||'').trim()) throw Object.assign(new Error('ROOM_REQUIRED'),{status:400}); const r=db.prepare('INSERT INTO schedules(program_id,teacher_id,class_id,day,start_time,end_time,mode,link,room,material,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(Number(b.programId)||null,Number(b.teacherId)||null,Number(b.classId)||null,b.day,b.startTime,b.endTime,b.mode||'ONLINE',scheduleLink,b.room||'',b.material||'',b.status||'AKTIF',now()); if(b.teacherId) notify(Number(b.teacherId),'Jadwal Baru',`${b.day} ${b.startTime}-${b.endTime} (${b.mode||'ONLINE'})`,'JADWAL'); log(a.user.id,'TAMBAH_JADWAL','SCHEDULE',Number(r.lastInsertRowid),`${b.day} ${b.startTime}`); return send(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if(p==='/api/admin/payments' && req.method==='GET') return send(res,200,db.prepare(`SELECT p.*,u.name student_name FROM payments p JOIN users u ON u.id=p.student_id ORDER BY p.id DESC`).all());
    if(p==='/api/admin/payment-settings' && req.method==='POST'){ for(const k of ['payment_bank','payment_account','payment_owner','payment_qr']) if(k in b) db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,String(b[k]||'')); log(a.user.id,'UBAH_REKENING_PEMBAYARAN','SETTINGS',null,'Informasi pembayaran diperbarui'); return send(res,200,{ok:true}); }
    if(p==='/api/admin/payment-status' && req.method==='POST'){ const id=Number(b.id),st=String(b.status||''); if(!['BELUM BAYAR','MENUNGGU VERIFIKASI','SUDAH BAYAR','DITOLAK'].includes(st)) throw Object.assign(new Error('INVALID_PAYMENT_STATUS'),{status:400}); const x=db.prepare('SELECT student_id FROM payments WHERE id=?').get(id); db.prepare('UPDATE payments SET status=?,verified_at=? WHERE id=?').run(st,now(),id); if(x) notify(x.student_id,'Status Pembayaran',`Pembayaran Anda: ${st}.`,'PEMBAYARAN'); log(a.user.id,'VERIFIKASI_PEMBAYARAN','PAYMENT',id,st); return send(res,200,{ok:true}); }
    if(p==='/api/admin/certificates' && req.method==='GET') return send(res,200,db.prepare(`SELECT cu.id,cu.pdf_path,cu.created_at,c.id certificate_id,c.student_id,u.name student_name,c.program,c.achievement,c.certificate_number,c.issue_date,c.status FROM certificate_uploads cu LEFT JOIN certificates c ON c.pdf_path=cu.pdf_path LEFT JOIN users u ON u.id=c.student_id ORDER BY cu.id DESC`).all());
    if(p==='/api/admin/certificates' && req.method==='POST'){ if(!b.pdf) throw Object.assign(new Error('PDF_REQUIRED'),{status:400}); const studentId=Number(b.studentId)||0; if(!studentId) throw Object.assign(new Error('STUDENT_REQUIRED'),{status:400}); const student=db.prepare(`SELECT id,name,programs FROM users WHERE id=? AND role='MURID'`).get(studentId); if(!student) throw Object.assign(new Error('STUDENT_NOT_FOUND'),{status:404}); const pdf=await saveDataUrl(b.pdf,CERT_DIR,'certificate'); const certificateNumber=`BJIQ-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${student.id}-${Date.now().toString().slice(-6)}`; const issueDate=new Date().toISOString().slice(0,10); db.prepare(`INSERT INTO certificates(student_id,program,achievement,certificate_number,issue_date,institution_name,pdf_path,qr_path,status,uploaded_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)`).run(student.id,(Array.isArray(student.programs)?student.programs.join(', '):String(student.programs||'')),b.achievement||'',certificateNumber,issueDate,'Baitul Jalal Ilmu Quran',pdf,'','TERVERIFIKASI',a.user.id,now()); const r=db.prepare(`INSERT INTO certificate_uploads(pdf_path,uploaded_by,created_at) VALUES(?,?,?)`).run(pdf,a.user.id,now()); notify(student.id,'Sertifikat Tersedia',`Sertifikat Anda sudah tersedia di Dashboard Murid. Nomor: ${certificateNumber}`,'SERTIFIKAT'); log(a.user.id,'UNGGAH_SERTIFIKAT_PDF','CERTIFICATE_UPLOAD',Number(r.lastInsertRowid),`PDF dihubungkan ke murid ${student.name}`); return send(res,201,{ok:true,id:Number(r.lastInsertRowid),certificate_number:certificateNumber,pdf_path:pdf}); }
    if(p==='/api/admin/certificates/delete' && req.method==='POST'){ const c=db.prepare('SELECT * FROM certificate_uploads WHERE id=?').get(Number(b.id)); if(!c) throw Object.assign(new Error('NOT_FOUND'),{status:404}); db.prepare('DELETE FROM certificates WHERE pdf_path=?').run(c.pdf_path); if(isDrivePath(c.pdf_path)) await driveDelete(driveId(c.pdf_path)); db.prepare('DELETE FROM certificate_uploads WHERE id=?').run(c.id); log(a.user.id,'HAPUS_SERTIFIKAT_PDF','CERTIFICATE_UPLOAD',c.id,'PDF dihapus'); return send(res,200,{ok:true}); }
    if(p==='/api/admin/attendance' && req.method==='GET') return send(res,200,db.prepare(`SELECT a.*,u.name student_name,t.name teacher_name,s.day,s.start_time,s.end_time FROM attendance a LEFT JOIN users u ON u.id=a.student_id LEFT JOIN users t ON t.id=a.teacher_id LEFT JOIN schedules s ON s.id=a.schedule_id ORDER BY a.id DESC LIMIT 300`).all());
    if(p==='/api/admin/progress' && req.method==='GET') return send(res,200,db.prepare(`SELECT p.*,u.name student_name,t.name teacher_name FROM progress p JOIN users u ON u.id=p.student_id LEFT JOIN users t ON t.id=p.teacher_id ORDER BY p.id DESC LIMIT 300`).all());
    if(p==='/api/admin/notifications' && req.method==='GET') return send(res,200,db.prepare(`SELECT n.*,u.name user_name FROM notifications n LEFT JOIN users u ON u.id=n.user_id ORDER BY n.id DESC LIMIT 100`).all());
    if(p==='/api/admin/logs' && req.method==='GET') return send(res,200,db.prepare(`SELECT l.*,u.name actor_name FROM activity_logs l LEFT JOIN users u ON u.id=l.actor_id ORDER BY l.id DESC LIMIT 200`).all());
    if(p==='/api/admin/logs/delete' && req.method==='POST'){ const id=Number(b.id); if(!id) throw Object.assign(new Error('LOG_ID_REQUIRED'),{status:400}); const r=db.prepare('DELETE FROM activity_logs WHERE id=?').run(id); if(!r.changes) throw Object.assign(new Error('NOT_FOUND'),{status:404}); return send(res,200,{ok:true}); }
    if(p==='/api/admin/settings/delete' && req.method==='POST'){
      db.prepare('DELETE FROM settings').run();
      log(a.user.id,'HAPUS_PENGATURAN','SETTINGS',null,'Semua pengaturan dihapus');
      return send(res,200,{ok:true});
    }
    if(p==='/api/admin/settings' && req.method==='GET') { const rows=db.prepare('SELECT key,value FROM settings').all(); return send(res,200,Object.fromEntries(rows.map(x=>[x.key,x.value]))); }
    if(p==='/api/admin/settings' && req.method==='POST'){ for(const [k,v] of Object.entries(b)) if(typeof v==='string' && k!=='password') db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k,v); log(a.user.id,'UBAH_PENGATURAN','SETTINGS',null,'Pengaturan diperbarui'); return send(res,200,{ok:true}); }
    if(p==='/api/admin/profile' && req.method==='POST'){ const photo=b.photo?await saveDataUrl(b.photo,PROFILE_DIR,'admin'):null; db.prepare('UPDATE users SET name=?,whatsapp=?,photo=?,updated_at=? WHERE id=?').run(b.name||a.user.name,b.whatsapp||a.user.whatsapp,photo||a.user.photo,now(),a.user.id); log(a.user.id,'EDIT_PROFIL_ADMIN','USER',a.user.id,'Profil admin diperbarui'); return send(res,200,{ok:true}); }
  }

  if(role==='GURU'){
    if(p==='/api/teacher/students' && req.method==='GET') return send(res,200,teacherStudents(a.user.id));
    if(p==='/api/teacher/requests' && req.method==='GET') return send(res,200,db.prepare(`SELECT r.*,u.name student_name,u.whatsapp,u.email FROM student_requests r JOIN users u ON u.id=r.student_id WHERE r.teacher_id=? AND r.status='MENUNGGU' ORDER BY r.id DESC`).all(a.user.id));
    if(p==='/api/teacher/request-decision' && req.method==='POST'){ const r=db.prepare('SELECT * FROM student_requests WHERE id=? AND teacher_id=?').get(Number(b.id),a.user.id); if(!r) throw Object.assign(new Error('NOT_FOUND'),{status:404}); const st=b.decision==='TERIMA'?'DITERIMA':'DITOLAK'; db.prepare('UPDATE student_requests SET status=?,decided_at=? WHERE id=?').run(st,now(),r.id); if(st==='DITERIMA') db.prepare('UPDATE users SET teacher_id=?,status=\'AKTIF\',updated_at=? WHERE id=?').run(a.user.id,now(),r.student_id); notify(r.student_id,'Permintaan Guru',`Permintaan kepada ${a.user.name}: ${st}.`,'GURU'); log(a.user.id,st,'STUDENT_REQUEST',r.id,''); return send(res,200,{ok:true}); }
    if(p==='/api/teacher/schedules' && req.method==='GET') return send(res,200,db.prepare(`SELECT s.*,p.name program_name,c.name class_name FROM schedules s LEFT JOIN programs p ON p.id=s.program_id LEFT JOIN classes c ON c.id=s.class_id WHERE s.teacher_id=? ORDER BY s.id DESC`).all(a.user.id));
    if(p==='/api/teacher/schedules' && req.method==='POST'){ if((b.mode||'ONLINE')==='ONLINE' && !String(b.link||'').trim()) throw Object.assign(new Error('WHATSAPP_LINK_REQUIRED'),{status:400}); if((b.mode||'ONLINE')==='OFFLINE' && !String(b.room||'').trim()) throw Object.assign(new Error('ROOM_REQUIRED'),{status:400}); const r=db.prepare('INSERT INTO schedules(program_id,teacher_id,class_id,day,start_time,end_time,mode,link,room,material,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(Number(b.programId)||null,a.user.id,Number(b.classId)||null,b.day,b.startTime,b.endTime,b.mode||'ONLINE',b.link||'',b.room||'',b.material||'',b.status||'AKTIF',now()); const students=teacherStudents(a.user.id); students.forEach(s=>notify(s.id,'Jadwal Baru',`${b.day} ${b.startTime}-${b.endTime}`,'JADWAL')); log(a.user.id,'TAMBAH_JADWAL','SCHEDULE',Number(r.lastInsertRowid),''); return send(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if(p==='/api/teacher/start-class' && req.method==='POST'){ const sid=Number(b.scheduleId); const s=db.prepare('SELECT * FROM schedules WHERE id=? AND teacher_id=?').get(sid,a.user.id); if(!s) throw Object.assign(new Error('NOT_FOUND'),{status:404}); const ex=db.prepare('SELECT id FROM attendance WHERE schedule_id=? AND teacher_id=? AND attendance_date=?').get(sid,a.user.id,today()); if(!ex) db.prepare('INSERT INTO attendance(schedule_id,teacher_id,role,attendance_date,check_in,status,method) VALUES(?,?,?,?,?,?,?)').run(sid,a.user.id,'GURU',today(),now(),'HADIR','MULAI_KELAS'); notifyStudentsByTeacher(a.user.id,'Kelas Dimulai',`Kelas ${s.day} ${s.start_time}-${s.end_time} sedang aktif.`,'KELAS'); log(a.user.id,'MULAI_KELAS','SCHEDULE',sid,''); return send(res,200,{ok:true,message:'Kelas dimulai dan absensi Guru tercatat.'}); }
    if(p==='/api/teacher/attendance' && req.method==='POST'){ const sid=Number(b.scheduleId), studentId=Number(b.studentId); const own=db.prepare('SELECT id FROM users WHERE id=? AND role=\'MURID\' AND teacher_id=?').get(studentId,a.user.id); if(!own) throw Object.assign(new Error('FORBIDDEN'),{status:403}); db.prepare('INSERT INTO attendance(schedule_id,teacher_id,student_id,role,attendance_date,check_in,status,method) VALUES(?,?,?,?,?,?,?,?)').run(sid,a.user.id,studentId,'MURID',b.date||today(),now(),b.status||'HADIR',b.method||'GURU'); log(a.user.id,'ABSEN_MURID','ATTENDANCE',studentId,b.status||'HADIR'); return send(res,200,{ok:true}); }
    if(p==='/api/teacher/progress' && req.method==='GET'){ const sid=Number(url.searchParams.get('studentId')||0); if(sid){ const own=db.prepare('SELECT id FROM users WHERE id=? AND role=\'MURID\' AND teacher_id=?').get(sid,a.user.id); if(!own) throw Object.assign(new Error('FORBIDDEN'),{status:403}); } return send(res,200,db.prepare(`SELECT * FROM progress WHERE teacher_id=? ${sid?'AND student_id=?':''} ORDER BY id DESC`).all(...(sid?[a.user.id,sid]:[a.user.id]))); }
    if(p==='/api/teacher/progress' && req.method==='POST'){ const own=db.prepare('SELECT id FROM users WHERE id=? AND role=\'MURID\' AND teacher_id=?').get(Number(b.studentId),a.user.id); if(!own) throw Object.assign(new Error('FORBIDDEN'),{status:403}); const r=db.prepare(`INSERT INTO progress(student_id,teacher_id,program,juz,status,makharij,tajwid,fluency,length_rule,material,understanding,score,notes,learning_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(Number(b.studentId),a.user.id,b.program||'TAHFIDZ',Number(b.juz)||0,b.status||'',b.makharij||'',b.tajwid||'',b.fluency||'',b.lengthRule||'',b.material||'',b.understanding||'',b.score?Number(b.score):null,b.notes||'',b.learningDate||today()); notify(Number(b.studentId),'Progres Belajar Diperbarui',`Guru memperbarui progres ${b.program||''}.`,'PROGRES'); log(a.user.id,'INPUT_PROGRES','PROGRESS',Number(r.lastInsertRowid),''); return send(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if(p==='/api/teacher/note' && req.method==='POST'){ const own=db.prepare('SELECT id FROM users WHERE id=? AND role=\'MURID\' AND teacher_id=?').get(Number(b.studentId),a.user.id); if(!own) throw Object.assign(new Error('FORBIDDEN'),{status:403}); const r=db.prepare('INSERT INTO notes(teacher_id,student_id,content,created_at) VALUES(?,?,?,?)').run(a.user.id,Number(b.studentId),b.content,now()); notify(Number(b.studentId),'Catatan Guru Baru',b.content,'CATATAN'); log(a.user.id,'TAMBAH_CATATAN','NOTE',Number(r.lastInsertRowid),''); return send(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if(p==='/api/teacher/material' && req.method==='POST'){ const r=db.prepare('INSERT INTO materials(teacher_id,title,description,program,file_path,created_at) VALUES(?,?,?,?,?,?)').run(a.user.id,b.title,b.description||'',b.program||'',b.filePath||'',now()); teacherStudents(a.user.id).forEach(s=>notify(s.id,'Materi Baru',b.title,'MATERI')); log(a.user.id,'TAMBAH_MATERI','MATERIAL',Number(r.lastInsertRowid),b.title); return send(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if(p==='/api/teacher/certificates' && req.method==='GET') return send(res,200,db.prepare(`SELECT c.*,u.name student_name FROM certificates c JOIN users u ON u.id=c.student_id WHERE u.teacher_id=? ORDER BY c.id DESC`).all(a.user.id));
    if(p==='/api/teacher/payment-settings' && req.method==='GET') return send(res,200,{payment_bank:a.user.payment_bank||'',payment_account:a.user.payment_account||'',payment_owner:a.user.payment_owner||''});
    if(p==='/api/teacher/payment-settings' && req.method==='POST'){ db.prepare('UPDATE users SET payment_bank=?,payment_account=?,payment_owner=?,updated_at=? WHERE id=? AND role=\'GURU\'').run(String(b.payment_bank||'').trim(),String(b.payment_account||'').trim(),String(b.payment_owner||'').trim(),now(),a.user.id); log(a.user.id,'UBAH_INFORMASI_PEMBAYARAN','USER',a.user.id,'Informasi rekening/e-wallet Guru diperbarui'); return send(res,200,{ok:true}); }
    if(p==='/api/teacher/payments' && req.method==='GET') return send(res,200,db.prepare(`SELECT p.id,p.proof_path,p.status,p.created_at,u.name student_name FROM payments p JOIN users u ON u.id=p.student_id WHERE u.teacher_id=? ORDER BY p.id DESC`).all(a.user.id));
    if(p==='/api/teacher/profile' && req.method==='POST'){ const photo=b.photo?await saveDataUrl(b.photo,PROFILE_DIR,'guru'):null; db.prepare('UPDATE users SET name=?,whatsapp=?,photo=?,address=?,experience=?,programs=?,updated_at=? WHERE id=?').run(b.name||a.user.name,b.whatsapp||a.user.whatsapp,photo||a.user.photo,b.address||a.user.address,b.experience||a.user.experience,JSON.stringify(parsePrograms(b.programs||a.user.programs)),now(),a.user.id); log(a.user.id,'EDIT_PROFIL_GURU','USER',a.user.id,''); return send(res,200,{ok:true}); }
  }

  if(role==='MURID'){
    if(p==='/api/student/schedules' && req.method==='GET') return send(res,200,db.prepare(`SELECT s.*,p.name program_name,u.name teacher_name,c.name class_name FROM schedules s LEFT JOIN programs p ON p.id=s.program_id LEFT JOIN users u ON u.id=s.teacher_id LEFT JOIN classes c ON c.id=s.class_id WHERE s.teacher_id=? AND s.status='AKTIF' ORDER BY s.id DESC`).all(a.user.teacher_id||0));
    if(p==='/api/student/attendance' && req.method==='POST'){ const sid=Number(b.scheduleId); const s=db.prepare('SELECT * FROM schedules WHERE id=? AND teacher_id=?').get(sid,a.user.teacher_id||0); if(!s) throw Object.assign(new Error('NOT_FOUND'),{status:404}); db.prepare('INSERT INTO attendance(schedule_id,student_id,teacher_id,role,attendance_date,check_in,status,method) VALUES(?,?,?,?,?,?,?,?)').run(sid,a.user.id,a.user.teacher_id,'MURID',today(),now(),'HADIR',b.method||'KODE_KELAS'); return send(res,200,{ok:true,message:'Kehadiran tercatat.'}); }
    if(p==='/api/student/progress' && req.method==='GET') return send(res,200,db.prepare('SELECT * FROM progress WHERE student_id=? ORDER BY id DESC').all(a.user.id));
    if(p==='/api/student/notes' && req.method==='GET') return send(res,200,db.prepare(`SELECT n.*,u.name teacher_name FROM notes n LEFT JOIN users u ON u.id=n.teacher_id WHERE n.student_id=? ORDER BY n.id DESC`).all(a.user.id));
    if(p==='/api/student/materials' && req.method==='GET') return send(res,200,db.prepare(`SELECT m.*,u.name teacher_name FROM materials m LEFT JOIN users u ON u.id=m.teacher_id WHERE m.teacher_id=? ORDER BY m.id DESC`).all(a.user.teacher_id||0));
    if(p==='/api/student/payment-info' && req.method==='GET') return send(res,200,db.prepare(`SELECT u.id teacher_id,u.name teacher_name,u.payment_bank,u.payment_account,u.payment_owner FROM users s LEFT JOIN users u ON u.id=s.teacher_id AND u.role='GURU' WHERE s.id=?`).get(a.user.id)||{});
    if(p==='/api/student/payments' && req.method==='GET') return send(res,200,db.prepare('SELECT * FROM payments WHERE student_id=? ORDER BY id DESC').all(a.user.id));
    if(p==='/api/student/payment' && req.method==='POST'){ if(!b.proof) throw Object.assign(new Error('BUKTI_PEMBAYARAN_REQUIRED'),{status:400}); const proof=await saveDataUrl(b.proof,PAYMENT_DIR,'payment'); const r=db.prepare('INSERT INTO payments(student_id,amount,method,proof_path,status,note,created_at) VALUES(?,?,?,?,?,?,?)').run(a.user.id,Number(b.amount)||0,b.method||'',proof,'MENUNGGU VERIFIKASI',b.note||'',now()); const admins=db.prepare("SELECT id FROM users WHERE role='ADMIN'").all(); admins.forEach(x=>notify(x.id,'Bukti Pembayaran Baru',`${a.user.name} mengirim pembayaran untuk diverifikasi.`,'PEMBAYARAN')); return send(res,201,{ok:true,id:Number(r.lastInsertRowid)}); }
    if(p==='/api/student/certificates' && req.method==='GET') return send(res,200,db.prepare('SELECT * FROM certificates WHERE student_id=? ORDER BY id DESC').all(a.user.id));
    if(p==='/api/student/profile' && req.method==='POST'){ const photo=b.photo?await saveDataUrl(b.photo,PROFILE_DIR,'murid'):null; db.prepare('UPDATE users SET name=?,whatsapp=?,photo=?,address=?,updated_at=? WHERE id=?').run(b.name||a.user.name,b.whatsapp||a.user.whatsapp,photo||a.user.photo,b.address||a.user.address,now(),a.user.id); log(a.user.id,'EDIT_PROFIL_MURID','USER',a.user.id,''); return send(res,200,{ok:true}); }
  }

  if(p==='/api/notifications' && req.method==='GET') return send(res,200,db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 100').all(a.user.id));
  if(p==='/api/notifications/read' && req.method==='POST'){ db.prepare('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?').run(Number(b.id),a.user.id); return send(res,200,{ok:true}); }
  if(p==='/api/admin/reports' && role==='ADMIN' && req.method==='GET'){ return send(res,200,{teachers:db.prepare("SELECT status,COUNT(*) c FROM users WHERE role='GURU' GROUP BY status").all(),students:db.prepare("SELECT status,COUNT(*) c FROM users WHERE role='MURID' GROUP BY status").all(),attendance:db.prepare("SELECT role,status,COUNT(*) c FROM attendance GROUP BY role,status").all(),payments:db.prepare("SELECT status,COUNT(*) c,SUM(amount) total FROM payments GROUP BY status").all(),certificates:db.prepare('SELECT COUNT(*) c FROM certificates').get().c}); }

  throw Object.assign(new Error('NOT_FOUND'),{status:404});
}

function notifyStudentsByTeacher(teacherId,title,message,type){ teacherStudents(teacherId).forEach(s=>notify(s.id,title,message,type)); }

const server=http.createServer(async(req,res)=>{
  try{
    const u=new URL(req.url,`http://${req.headers.host||'localhost'}`);
    if(u.pathname.startsWith('/api/')) return await api(req,res,u);
    if(u.pathname.startsWith('/uploads/')){
      const rel=u.pathname.replace(/^\/uploads\//,'');
      const area=rel.split('/')[0];
      if(area!=='profiles') return sendText(res,403,'Private file.');
      const ext=path.extname(rel).toLowerCase(); const types={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
      if(NETLIFY_MODE){ const store=await getBlobStore(); const data=await store.get(`uploads/${rel}`,{type:'arrayBuffer'}); if(!data)return sendText(res,404,'Not found'); res.writeHead(200,{...securityHeaders(),'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'}); return res.end(Buffer.from(data)); }
      const full=path.resolve(UPLOAD_DIR,rel); if(!full.startsWith(path.resolve(UPLOAD_DIR))) return sendText(res,403,'Forbidden');
      if(!fs.existsSync(full)) return sendText(res,404,'Not found'); res.writeHead(200,{...securityHeaders(),'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'public, max-age=86400'}); return fs.createReadStream(full).pipe(res);
    }
    if(u.pathname==='/api/public-file') {
      const filePath=String(u.searchParams.get('path')||'');
      if(!isDrivePath(filePath)) return send(res,404,{error:'NOT_FOUND'});
      const row=db.prepare("SELECT id FROM users WHERE photo=? AND role='GURU' AND status='AKTIF'").get(filePath);
      if(!row) return send(res,403,{error:'FORBIDDEN'});
      const stream=await driveDownload(driveId(filePath));
      res.writeHead(200,{...securityHeaders(),'Content-Type':'image/jpeg','Cache-Control':'public, max-age=3600'}); return stream.pipe(res);
    }
    if(u.pathname==='/api/private-file') {
      const a=auth(req); if(!a) return send(res,401,{error:'UNAUTHORIZED'});
      const requested=String(u.searchParams.get('path')||'');
      const isAdmin=a.user.role==='ADMIN'; let row=null;
      if(isDrivePath(requested)) {
        row=db.prepare(`SELECT p.id,'payments' area FROM payments p WHERE p.proof_path=? AND (p.student_id=? OR EXISTS(SELECT 1 FROM users s WHERE s.id=p.student_id AND s.teacher_id=?)) UNION ALL SELECT c.id,'certificates' area FROM certificates c JOIN users s ON s.id=c.student_id WHERE c.pdf_path=? AND (c.student_id=? OR s.teacher_id=?)`).get(requested,a.user.id,a.user.id,requested,a.user.id,a.user.id);
        if(!isAdmin && !row) return send(res,403,{error:'FORBIDDEN'});
        const stream=await driveDownload(driveId(requested)); const ext=(row?.area==='certificates')?'application/pdf':'application/octet-stream'; res.writeHead(200,{...securityHeaders(),'Content-Type':ext,'Cache-Control':'private, no-store','Content-Disposition':'inline'}); return stream.pipe(res);
      }
      const rel=requested.replace(/^\/+/,''),area=rel.split('/')[0]; if(!['payments','certificates'].includes(area))return send(res,403,{error:'FORBIDDEN'});
      if(NETLIFY_MODE){ const store=await getBlobStore(); const data=await store.get(`uploads/${rel}`,{type:'arrayBuffer'}); if(!data)return send(res,404,{error:'NOT_FOUND'}); const ext=path.extname(rel).toLowerCase(),types={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'}; res.writeHead(200,{...securityHeaders(),'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'private, no-store','Content-Disposition':'inline'}); return res.end(Buffer.from(data)); }
      const full=path.resolve(UPLOAD_DIR,rel); if(!full.startsWith(path.resolve(UPLOAD_DIR)))return send(res,403,{error:'FORBIDDEN'}); if(!fs.existsSync(full))return send(res,404,{error:'NOT_FOUND'});
      if(!isAdmin){row=area==='payments'?db.prepare(`SELECT p.id FROM payments p WHERE p.proof_path=? AND (p.student_id=? OR EXISTS(SELECT 1 FROM users s WHERE s.id=p.student_id AND s.teacher_id=?))`).get('/uploads/'+rel,a.user.id,a.user.id):db.prepare(`SELECT c.id FROM certificates c JOIN users s ON s.id=c.student_id WHERE c.pdf_path=? AND (c.student_id=? OR s.teacher_id=?)`).get('/uploads/'+rel,a.user.id,a.user.id);if(!row)return send(res,403,{error:'FORBIDDEN'});}
      const ext=path.extname(full).toLowerCase(),types={'.pdf':'application/pdf','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp'};res.writeHead(200,{...securityHeaders(),'Content-Type':types[ext]||'application/octet-stream','Cache-Control':'private, no-store','Content-Disposition':'inline'});return fs.createReadStream(full).pipe(res);
    }
    let file=u.pathname==='/'?path.join(PUBLIC,'index.html'):path.join(PUBLIC,u.pathname.replace(/^\//,'')); if(!file.startsWith(path.resolve(PUBLIC))) return sendText(res,403,'Forbidden'); if(!fs.existsSync(file)||fs.statSync(file).isDirectory()) file=path.join(PUBLIC,'index.html');
    const ext=path.extname(file); const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'}; res.writeHead(200,{...securityHeaders(),'Content-Type':types[ext]||'application/octet-stream'}); fs.createReadStream(file).pipe(res);
  }catch(e){ const status=e.status||500; if(!res.headersSent) send(res,status,{error:e.message||'SERVER_ERROR'}); else res.end(); }
});
if(require.main===module){ server.listen(PORT,HOST,()=>console.log(`Baitul Jalal Ilmu Quran running at http://localhost:${PORT}`)); }
module.exports={server,hydrateDatabase,persistDatabase};
