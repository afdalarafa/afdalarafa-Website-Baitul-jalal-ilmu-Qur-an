
> NETLIFY LOGIN FIX: Function path normalization and NETLIFY mode are enabled in this package.
# Baitul Jalal Ilmu Quran — Website Resmi

Paket ini adalah sistem web resmi Baitul Jalal Ilmu Quran untuk pengelolaan **Tahfidz, Tahsin, dan Tafsir**. Paket dibuat sebagai aplikasi yang dapat dijalankan dan menyimpan data di server, bukan halaman demo atau template statis.

## Teknologi
- Node.js 22.5+ (menggunakan `node:sqlite`, tanpa dependensi npm eksternal)
- SQLite persisten di `data/baitul-jalal.db`
- Frontend HTML/CSS/JavaScript
- Password di-hash menggunakan `crypto.scrypt`
- Session token server-side
- Upload PDF sertifikat, foto profil, bukti pembayaran, dan QR pembayaran
- Hak akses ADMIN / GURU / MURID

## Menjalankan di Windows
1. Pastikan Node.js 22 atau lebih baru terpasang.
2. Extract ZIP ini.
3. Klik dua kali `START.bat`.
4. Browser membuka `http://localhost:3000`.

Atau dari CMD:
```bat
cd /d C:\path\ke\folder
node server.js
```

## Login Admin awal
- Email: `afdalarafa75@gmail.com`
- Password: `Delisha19@`

Paket ini dapat langsung dijalankan tanpa Firebase service-account. Jika Firebase belum dikonfigurasi, login menggunakan autentikasi lokal server yang aman sehingga portal tetap berfungsi.

Kredensial awal dapat diganti melalui environment variable sebelum server pertama kali dijalankan:
```text
ADMIN_EMAIL=...
ADMIN_PASSWORD=...
```

Catatan: jika database sudah pernah dibuat, perubahan `ADMIN_PASSWORD` tidak mengubah password yang sudah tersimpan. Gunakan menu perubahan password.

## Alur utama
Website → Daftar → Pilih Guru/Murid → Verifikasi → Login → Dashboard → Pembayaran → Guru/Kelas → Jadwal → Absensi → Pembelajaran → Progres → Sertifikat → Verifikasi Sertifikat.

### Guru
Pendaftaran Guru masuk sebagai `MENUNGGU_VERIFIKASI`. Admin dapat menerima, menolak, atau meminta perbaikan. Guru aktif dapat melihat dan mengelola hanya Murid yang berada di bawah bimbingannya.

### Murid
Murid mendaftar dengan program, paket Online/Offline, dan pilihan Guru. Permintaan Guru harus disetujui. Murid hanya dapat melihat data miliknya sendiri.

### Admin
Admin memiliki kontrol penuh dan sekaligus dapat bertindak sebagai Guru Utama. Menu meliputi Dashboard, Profil Admin, Pendaftaran, Guru, Murid, Program, Kelas, Jadwal, Absensi, Progres, Pembayaran, Sertifikat, Notifikasi, Laporan, Log Aktivitas, Pengaturan, dan Logout.

## Sertifikat
Sertifikat **tidak dibuat otomatis**. Pada Dashboard Admin, bagian Sertifikat digunakan untuk mengunggah file PDF sertifikat resmi. Tidak ada formulir pembuatan sertifikat, nama Murid, program, pencapaian, nomor sertifikat, tanggal, atau QR sertifikat.

## Pembayaran
Admin dapat mengatur:
- Nama bank/e-wallet
- Nomor rekening/nomor akun
- Atas nama
- QR pembayaran

Murid mengunggah bukti pembayaran dari Dashboard Murid. Admin melihat bukti pembayaran dan memverifikasi status: BELUM BAYAR, MENUNGGU VERIFIKASI, SUDAH BAYAR, atau DITOLAK. Guru dapat melihat bukti pembayaran murid bimbingannya. Informasi pembayaran ditampilkan sebagai nama rekening/e-wallet, nomor rekening, dan atas nama.

## Keamanan
- Password tidak disimpan sebagai teks biasa.
- Hak akses dipisahkan berdasarkan role.
- Guru dibatasi ke Murid bimbingannya.
- Murid dibatasi ke datanya sendiri.
- Session memiliki masa berlaku.
- Upload memiliki pembatasan tipe dan ukuran.
- Penghapusan/keputusan administratif dicatat di Log Aktivitas.
- Database disimpan di server, bukan localStorage browser.
- Gunakan HTTPS/reverse proxy saat dipasang ke domain publik.
- Backup folder `data/` dan `uploads/` secara berkala.

## Deployment
Server dapat dijalankan dengan:
```bash
node server.js
```
Gunakan `PORT` dari environment jika penyedia hosting menetapkannya. Endpoint health:
`/api/health`

Untuk deployment publik yang membutuhkan email verifikasi/reset email sungguhan, sambungkan layanan SMTP/email resmi lembaga. Alur akun, status, reset melalui Admin, dan penyimpanan status email sudah disiapkan di aplikasi.

## Struktur
```text
Baitul_Jalal_Ilmu_Quran/
├─ server.js
├─ package.json
├─ .env.example
├─ .gitignore
├─ README.md
├─ START.bat
├─ public/
│  ├─ index.html
│  ├─ app.js
│  ├─ styles.css
│  └─ logo.png
├─ data/
│  └─ (database dibuat otomatis)
└─ uploads/
   ├─ certificates/
   ├─ payments/
   └─ profiles/
```

## Paket dan metode pembelajaran
- Paket: PAKET SORE dan PAKET MALAM.
- ONLINE: pembelajaran melalui video call via WhatsApp menggunakan link yang dibagikan Guru/Admin.
- OFFLINE: pembelajaran langsung tatap muka.
- Upload bukti pembayaran hanya dilakukan Murid melalui Dashboard Murid.

## Paket dan metode pembelajaran
- Paket: PAKET SORE dan PAKET MALAM.
- ONLINE: pembelajaran melalui video call via WhatsApp menggunakan link yang dibagikan Guru/Admin.
- OFFLINE: pembelajaran langsung tatap muka.
- Upload bukti pembayaran hanya dilakukan Murid melalui Dashboard Murid.
- Dashboard Admin menampilkan bukti pembayaran Murid untuk verifikasi.
- Dashboard Guru menampilkan NAMA REKENING/E-WALLET, NOMOR REKENING, ATAS NAMA, serta bukti pembayaran Murid bimbingannya.


## Deployment Production (Node.js / Docker)

Paket ini sekarang menyertakan `Dockerfile`, `docker-compose.yml`, `.env.production.example`, dan script backup. SQLite dan folder `uploads/` harus dipasang pada storage persisten. Jangan menggunakan hosting static-only untuk backend ini.

### VPS/Linux
```bash
cp .env.production.example .env.production
# edit .env.production dan isi ADMIN_PASSWORD
docker compose up -d --build
```

Health check:
`http://SERVER-ANDA:3000/api/health`

Untuk domain publik, pasang reverse proxy HTTPS (misalnya Nginx/Caddy) di depan port 3000. Backup database dan `uploads/` menggunakan `scripts/backup.sh` atau `scripts/backup.ps1`.

### Catatan keamanan
- `uploads/profiles/` boleh diakses publik karena foto profil guru digunakan di halaman publik.
- Bukti pembayaran dan PDF sertifikat sekarang dilayani melalui endpoint privat dan memerlukan session login.
- Pada mode production, `ADMIN_PASSWORD` wajib diisi dan minimal 12 karakter.
- Password default hanya dipakai untuk pengembangan lokal; ganti password Admin setelah deployment.

## ADMIN TUNGGAL (WAJIB)
Aplikasi ini menggunakan **satu akun Admin bawaan**. Admin tidak dibuat melalui form pendaftaran dan API tidak menyediakan pembuatan Admin baru.

- Email Admin: `afdalarafa75@gmail.com`
- Password awal bawaan: `Delisha19@`
- Ganti password Admin bawaan dengan mekanisme perubahan password yang tersedia sebelum publikasi jika Anda ingin password berbeda.

Catatan keamanan: password awal di atas bersifat rahasia operasional. Jangan memasukkannya ke dokumentasi publik, GitHub, atau screenshot.

## DEPLOYMENT PRODUCTION
Aplikasi ini adalah Node.js + SQLite dan **bukan situs statis Netlify**. Gunakan hosting yang menjalankan Node.js dan menyediakan penyimpanan/disk persisten untuk folder `data/` dan `uploads/`.

### 1. Lokal
```bat
npm install
npm start
```
Buka `http://localhost:3000` dan cek `http://localhost:3000/api/health`.

### 2. Production
- Set `NODE_ENV=production`.
- Jalankan `npm start` atau gunakan Docker.
- Pasang persistent disk/volume untuk `/app/data` dan `/app/uploads`.
- Aktifkan HTTPS pada domain.
- Jangan menghapus volume saat redeploy.

### 3. Docker
```bash
docker compose up -d --build
```
Docker Compose pada paket ini memasang volume persisten untuk database dan upload.
