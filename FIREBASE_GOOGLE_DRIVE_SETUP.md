# Baitul Jalal Ilmu Quran — Firebase + Google Drive

Paket ini mempertahankan website yang ada. Integrasi memakai:

- Firebase Authentication untuk akun/login.
- Akun Admin utama dibuat di Firebase Console.
- Guru dan Murid memakai akun masing-masing; setelah akun aktif, password dapat dibuat sendiri.
- Google Drive untuk file upload: bukti pembayaran, sertifikat PDF, dan foto profil.
- SQLite tetap menjadi data aplikasi internal server. Saat Firebase aktif, password login Guru/Murid dikelola oleh Firebase Authentication.

## 1. Firebase Console

1. Buka project `baitul-jalal`.
2. Authentication → Sign-in method → pastikan **Email/Password** aktif.
3. Authentication → Users → buat akun Admin utama.
4. Email Admin harus sama dengan `ADMIN_EMAIL` pada `.env`. Default: `afdalarafa75@gmail.com`.
5. Web API Key tidak wajib diisi manual. Server akan mencoba mengambilnya otomatis dari Firebase Web App menggunakan service-account yang sama. Jika otomatis gagal, barulah isi `FIREBASE_WEB_API_KEY` dari Firebase Project settings → General.
6. Project settings → Service accounts → Generate new private key.
7. Simpan JSON key baru **di folder website dengan nama `firebase-service-account.json`**. Jangan kirim/upload key ini ke ChatGPT dan jangan masukkan ke GitHub.

## 2. Google Drive

1. Gunakan folder Drive `Baitul jalal`.
2. Pastikan folder dibagikan sebagai Editor kepada service account Firebase:
   `firebase-adminsdk-fbsvc@baitul-jalal.iam.gserviceaccount.com`
3. Folder ID yang digunakan adalah:
   `1P5F6X7NonpljF7SKtxJa1nRUhrePSCqf`
4. File pembayaran, sertifikat, dan foto profil akan dikirim melalui server ke Drive ketika `GOOGLE_DRIVE_ENABLED=true`.

## 3. File `.env`

Salin `.env.example` menjadi `.env`, lalu isi Web API Key Firebase:

```text
PORT=3000
HOST=0.0.0.0
SESSION_HOURS=12
ADMIN_EMAIL=afdalarafa75@gmail.com

FIREBASE_ENABLED=true
FIREBASE_PROJECT_ID=baitul-jalal
FIREBASE_WEB_API_KEY=ISI_WEB_API_KEY_FIREBASE
FIREBASE_SERVICE_ACCOUNT_FILE=firebase-service-account.json

GOOGLE_DRIVE_ENABLED=true
GOOGLE_DRIVE_FOLDER_ID=1P5F6X7NonpljF7SKtxJa1nRUhrePSCqf
GOOGLE_SERVICE_ACCOUNT_FILE=firebase-service-account.json
```

Jika email Admin Anda di Firebase berbeda, ubah `ADMIN_EMAIL` menjadi email Admin tersebut. Tidak perlu mengubah kode.

## 4. Jalankan

Di folder website:

```bat
npm install
npm start
```

Saat server berjalan, terminal harus menampilkan:

```text
[Firebase] enabled: project=baitul-jalal, admin=...
[Google Drive] enabled: folder=1P5F6X7NonpljF7SKtxJa1nRUhrePSCqf
```

Buka:

`http://localhost:3000/api/health`

Hasil harus menunjukkan `firebase_enabled: true` dan `google_drive_enabled: true`.

## Keamanan

Jangan memasukkan private key service account ke `server.js`, GitHub, atau ZIP publik. File `firebase-service-account.json` sudah dimasukkan ke `.gitignore`.
