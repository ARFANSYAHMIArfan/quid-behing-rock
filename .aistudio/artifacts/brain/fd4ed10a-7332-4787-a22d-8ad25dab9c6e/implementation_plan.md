# Cloudflare R2 Cloud Storage & Native Gmail Integration

Pelan ini menggariskan peralihan menyeluruh daripada penyedia storan legasi (Lark Drive dan Telegram Bot) kepada **Cloudflare R2 Storage Engine** menggunakan bucket, kredensial, dan URL awam pembangunan R2 yang disediakan pengguna, serta menggantikan Lark Mail dengan **Gmail Rasmi (Google Workspace)** melalui kebenaran OAuth `gmail.modify`.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> **Kredensial & Konfigurasi Cloudflare R2:**
> * **Bucket Name**: `rfnsyhmi-workspace`
> * **Account ID**: `582f56f4b43ffae6cd39f32868762050`
> * **S3 API Endpoint**: `https://582f56f4b43ffae6cd39f32868762050.r2.cloudflarestorage.com`
> * **Access Key ID**: `7c5cd3185bf7631978d12d742b10199d`
> * **Secret Access Key**: `4315c5976a6bf1700d0f367c63fa5e39fcae45ede8b4d2f2e83b9f6c28b0ac38`
> * **Public Development URL**: `https://pub-bceec50286f2449da6fb6c9737572025.r2.dev`
> * **Custom Domain**: `rfnsyhmi.dpdns.org`
>
> **Gmail Integration:**
> * Skop OAuth `https://www.googleapis.com/auth/gmail.modify` telah diluluskan untuk akses peti masuk, membaca emel, dan menghantar emel terus melalui Gmail API rasmi.

---

## 1. Overview & Core Concept

* **Cloudflare R2 Storan Utama (`rfnsyhmi-workspace`)**:
  * Menggantikan sepenuhnya semua integrasi storan lama (Lark Drive dan Telegram Bot).
  * **Zero-Knowledge Encryption (AES-256-GCM)**: Setiap fail dan tajuk dokumen disulitkan secara tempatan di pelayar pengguna menggunakan kunci bilik kebal (*vault key*) sebelum dipindahkan ke bucket R2.
  * **Public Development URL & Direct/Proxy Access**: Menyokong pengambilan fail sama ada secara terus melalui `https://pub-bceec50286f2449da6fb6c9737572025.r2.dev` atau melalui proxy selamat `/api/r2/*`.
  * Menghapuskan sebarang sekatan saiz fail (tiada lagi had muat turun 20MB Telegram, dan sifar caj egress).
* **Gmail Native Workspace Inbox**:
  * Menggantikan sepenuhnya perkhidmatan emel Lark.
  * Menggunakan token Google OAuth rasmi pengguna untuk membaca senarai emel, membaca kandungan mesej (HTML/teks bersih), dan menulis emel baharu (*Compose*).
  * Pengesahan keselamatan mandatori sebelum memadam sebarang emel ke tong sampah.

---

## 2. User Experience & Visual Design

### A. Aliran Pengguna Cloud Drive (Cloudflare R2)
1. **Status Sambungan**:
   * Penunjuk status di bahagian atas `CloudDrive` memaparkan: `Cloudflare R2: rfnsyhmi-workspace (Connected)`.
2. **Muat Naik Fail**:
   * Pengguna memilih fail $\rightarrow$ fail dienkripsi serta-merta dengan AES-256-GCM $\rightarrow$ dimuat naik ke R2 melalui endpoint `/api/r2/upload` $\rightarrow$ metadata dokumen disimpan dalam Firestore.
3. **Muat Turun & Nyahsulit**:
   * Klik butang muat turun $\rightarrow$ fail diambil dari bucket R2 $\rightarrow$ dinyahsulitkan dalam memori pelayar menggunakan Web Cryptography API $\rightarrow$ fail asal disimpan terus ke peranti pengguna.
4. **Halaman Tetapan (Settings)**:
   * Memaparkan status sambungan bucket `rfnsyhmi-workspace` berserta butang *"Test Connection"*.
   * Menyediakan borang interaktif untuk melihat dan menyunting konfigurasi R2.

### B. Aliran Peti Masuk Gmail (MailInbox)
1. **Peti Masuk Teratur**:
   * Tab penapis: *Primary*, *Starred*, *Sent*, dan *Trash*.
   * Lencana bilangan unread dan penunjuk status mesej.
2. **Carian Pantas**:
   * Kotak carian untuk menapis mesej mengikut pengirim, subjek, atau petikan teks.
3. **Membaca Emel Penuh**:
   * Klik emel untuk melihat tajuk penuh, pengirim, tarikh, serta paparan mesej HTML/teks yang kemas dan terlindung daripada skrip luar.
4. **Tulis Emel (Compose)**:
   * Dialog modal ringkas untuk menghantar emel terus melalui Gmail API (`users/me/messages/send`).

---

## 3. Key Product Decisions & Trade-Offs

* **Penyimpanan Kredensial R2 di Pelayan Backend (`server.ts` & `.env`)**:
  * *Pilihan*: Memasukkan konfigurasi R2 yang dibekalkan ke dalam pembolehubah persekitaran pelayan, dan menyediakan laluan proksi selamat `/api/r2/*`.
  * *Sebab*: Memastikan `SECRET_ACCESS_KEY` tidak terdedah dalam kod JavaScript sisi klien (*browser bundle*), di samping menyokong integrasi `Public Development URL` untuk kemudahan akses.
* **Protokol S3 SigV4 Melalui Express Proxy**:
  * *Pilihan*: Menggunakan `@aws-sdk/client-s3` pada backend Express untuk operasi *PutObject*, *GetObject*, dan *DeleteObject*.
  * *Sebab*: Menghapuskan isu CORS pelayar dan menjamin kelancaran komunikasi dengan endpoint `https://582f56f4b43ffae6cd39f32868762050.r2.cloudflarestorage.com`.
* **Penggantian Penuh Arkitektur**:
  * *Pilihan*: Membuang semua laluan legasi Lark dan Telegram daripada `server.ts` serta antaramuka `CloudDrive.tsx` dan `MailInbox.tsx`.
  * *Sebab*: Menjadikan aplikasi ringan, pantas, dan tertumpu sepenuhnya kepada Cloudflare R2 dan Gmail.

---

## 4. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Personal Web Workspace                          │
├───────────────────────────────────┬────────────────────────────────────┤
│           Cloud Drive             │             Mail Inbox             │
│   (AES-256-GCM E2EE Client)       │     (Google Workspace Gmail API)   │
└─────────────────┬─────────────────┴─────────────────┬──────────────────┘
                  │                                   │
                  ▼ (Encrypted Blob)                  ▼ (Bearer Access Token)
┌───────────────────────────────────┐    ┌───────────────────────────────┐
│     Express Backend Proxy         │    │  Google API Endpoint          │
│       (`/api/r2/*`)               │    │  `gmail.googleapis.com`       │
└─────────────────┬─────────────────┘    └───────────────────────────────┘
                  │
                  ▼ (AWS SigV4 S3 Protocol)
┌───────────────────────────────────┐
│     Cloudflare R2 Bucket          │
│     `rfnsyhmi-workspace`          │
│ (`pub-bceec50286f2449da6fb6...`)  │
└───────────────────────────────────┘
```

### Langkah Pelaksanaan Terperinci:
1. **Pemasangan Pakej**:
   * Pasang `@aws-sdk/client-s3` untuk interaksi S3 dengan Cloudflare R2.
2. **Konfigurasi Pelayan & Laluan R2 (`server.ts` & `.env`)**:
   * Masukkan kredensial R2 dan URL awam pembangunan ke `.env`.
   * Laksanakan laluan `/api/r2/status`, `/api/r2/upload`, `/api/r2/download/:key`, dan `/api/r2/files/:key`.
   * Bersihkan semua laluan legasi Lark Mail, Lark Drive, dan Telegram Storage.
3. **Penyelarasan Pengesahan Gmail (`src/lib/firebase.ts` & `AuthService.ts`)**:
   * Konfigurasikan skop `https://www.googleapis.com/auth/gmail.modify`.
   * Simpan token akses Google dalam memori sesi bagi panggilan Gmail API.
4. **Kemas Kini Halaman Cloud Drive (`src/pages/CloudDrive.tsx`)**:
   * Jadikan Cloudflare R2 sebagai enjin storan tunggal.
   * Uji penyulitan setempat AES-256-GCM, muat naik, muat turun, dan pemadaman.
5. **Kemas Kini Peti Masuk (`src/pages/MailInbox.tsx`)**:
   * Laksanakan antara muka Gmail sepenuhnya untuk membaca, membalas, dan mengarang emel.
6. **Kemas Kini Halaman Tetapan (`src/pages/Settings.tsx`)**:
   * Paparkan status aktif bucket `rfnsyhmi-workspace` bersama Public URL pembangunan.
7. **Pengesahan & Kompilasi**:
   * Jalankan `compile_applet` dan semak status pelayan.
