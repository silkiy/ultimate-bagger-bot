# 🏛️ Panduan Penggunaan Ultimate Bagger Bot V7.2

Selamat! Bot trading kuantitatif Anda telah siap. Gunakan panduan ini untuk mengoperasikan sistem baik dari sisi teknis maupun operasional di Telegram.

---

## 🛠️ Persiapan & Cara Menjalankan

### Metode A: Docker (Paling Cepat 🚀)
1. Salin file `.env.example` menjadi `.env`.
2. Masukkan `TELEGRAM_BOT_TOKEN` (dari @BotFather) dan `TELEGRAM_CHAT_ID` (dari @userinfobot).
3. Jalankan perintah:
   ```bash
   docker-compose up --build
   ```

### Metode B: Manual (Node.js)
1. Install dependensi: `npm install`
2. Atur file `.env` dengan kredensial Anda.
3. Jalankan database MongoDB lokal.
4. Jalankan bot: `npm run dev`

---

## 📱 Daftar Perintah Telegram

Ketik perintah berikut langsung ke bot Anda:

| Perintah | Fungsi |
| :--- | :--- |
| `/start` | Menginisialisasi bot dan cek koneksi. |
| `/scan` | Mencari peluang beli di seluruh watchlist pasar. |
| `/analyze <SYMBOL>` | Audit teknikal mendalam (Contoh: `/analyze BBCA.JK`). |
| `/backtest <SYMBOL>` | simulasi performa 2 tahun terakhir + Monte Carlo. |
| `/status` | Cek portofolio, saldo, dan posisi aktif. |

---

## 🧠 Cara Kerja Algoritma (Algo Logic)

Bot ini menggunakan sistem **Hybrid Control V7.2** yang menggabungkan kecepatan kalkulasi komputer dengan kebijaksanaan manusia.

### 1. Deteksi & Sinyal (Buying)
Saat Anda menjalankan `/scan`:
- Bot memfilter saham yang berada di atas **Ichimoku Cloud**.
- Bot memastikan ada "K-Cross" (Tenkan-Sen memotong Kijun-Sen).
- Bot memverifikasi volume transaksi minimal **1.3x** rata-rata.
- Jika lolos, bot mengirimkan **Notifikasi Interaktif**. Anda harus menekan tombol **Confirm Buy** untuk mengeksekusi.

### 2. Manajemen Resiko Dinamis
- **Adaptive Risk**: Resiko per trade berubah otomatis (1.5% - 3.0%) tergantung seberapa sehat portofolio Anda.
- **Losing Streak Filter**: Jika Anda rugi beruntun, bot otomatis menjadi "Galak" (syarat sinyal diperketat hingga 80% confidence).
- **Profit Locking**: Bot mengunci 30% floating profit secara bertahap setiap kenaikan 5%.

### 3. Eksekusi Jual (Selling)
- **Automatic Trailing Stop**: Jual otomatis jika harga jatuh di bawah level volatilitas ATR yang sudah ditentukan.
- **Regime Exit**: Jika pasar berubah dari Bullish ke Bearish, bot akan lebih protektif terhadap modal Anda.

---

## 🧪 Fasilitas Riset (Quant Lab)
Hasil dari perintah `/backtest` akan menghasilkan laporan profesional di folder `research_out/`:
- **CAGR & Sharpe Ratio**: Mengukur seberapa efisien keuntungan Anda dibanding resikonya.
- **Monte Carlo**: Memberitahu Anda resiko kerugian terburuk (Drawdown) secara statistik dari 500 simulasi acak.

---
> [!TIP]
> **Selalu jalankan `/analyze`** sebelum konfirmasi beli untuk melihat visualisasi data dan skor keyakinan bot.
