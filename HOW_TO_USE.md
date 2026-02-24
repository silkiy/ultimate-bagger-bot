# 🏛️ Panduan Penggunaan Ultimate Bagger Bot v8.5

Selamat datang di **Elite Suite**! Bot Anda kini telah berevolusi menjadi instrumen kuantitatif tingkat lanjut. Gunakan panduan ini untuk mengoptimalkan navigasi dan strategi trading Anda.

---

## 🛠️ Persiapan & Cara Menjalankan

### Metode A: Docker (Recommended 🚀)
1. Salin `.env.example` ke `.env`.
2. Isi `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, dan kredensial MongoDB.
3. Jalankan: `docker-compose up --build -d`

### Metode B: Vercel Serverless
1. Deploy ke Vercel menggunakan `vercel deploy`.
2. Pastikan environment variables sudah di-set di Dashboard Vercel.
3. Setup **Cron Job** pada Dashboard Vercel (pkl 10:00 dan 15:45 WIB).

---

## 📱 Daftar Perintah & Navigasi (Elite Suite)

Bot menggunakan sistem menu terpusat. Gunakan `/back` untuk kembali ke dashboard utama kapan saja.

| Perintah | Fungsi |
| :--- | :--- |
| `/start` | Menu Utama & Dashboard Navigasi. |
| `/scan` | Discovery umum Top Active IDX & Ranking pasar harian. |
| `/hot` | **Fast Money**: Scan saham dengan lonjakan volume mendadak. |
| `/smart` | **Smart Money**: Lacak akumulasi diam-diam broker/institusi. |
| `/sector` | **Market Heatmap**: Analisis rotasi sektor & pimpinan pasar. |
| `/analyze [SYM]` | Audit 360° (Teknikal, Funda, Smart Money, Candle Pattern). |
| `/signals` | *Low Noise Mode*: Hanya sinyal dengan akurasi 100% filter. |
| `/back` | 🔙 Kembali ke Menu Utama dari perintah mana pun secara instan. |

---

## 🧠 Eksploitasi Fitur (Institutional Strategy)

### 1. Deteksi "Quiet Accumulation" (/smart)
Gunakan fitur ini setiap sesi siang untuk mendeteksi saham yang sedang "diserap" lot besar tanpa menggerakkan harga secara drastis (Score > 40).

### 2. Rotasi Sektor (/sector)
Cari sektor dengan **Heat Score > 65** dan status **BULLISH**. Fokuskan modal trading Anda pada saham *Top Pick* yang muncul di sektor-sektor leading tersebut.

### 3. Sinyal V8 (Multi-Dimensional Accuracy)
Sinyal BUY kini tidak hanya berdasarkan Ichimoku, tapi harus lolos:
- **Price > Cloud** (Ichimoku Confirmation)
- **Vol > 1.2x** (Participation Filter)
- **ADX > 20** (Trend Strength Filter)
- **Smart Money Score > 0** (Institutional Support)

---

## 🕒 Workflow Harian Otomatis

1.  **10:00 WIB (Morning Discovery)**: Bot mengirimkan update saham-saham dengan partisipasi volume awal yang kuat.
2.  **15:45 WIB (Final Market Scan)**: Bot mengirimkan sinyal masuk final sebelum pasar tutup.
3.  **19:00 WIB (Evening Market Pulse)**: Bot mengirimkan rangkuman lengkap bursa hari itu, termasuk akumulasi broker dan rotasi sektor hari esok.

---
> [!IMPORTANT]
> **Selalu periksa /analyze** sebelum menekan tombol BELI untuk memverifikasi intensitas Smart Money dan Pola Candle yang muncul.
