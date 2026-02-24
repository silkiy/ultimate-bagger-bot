# 🏛️ Panduan Penggunaan Ultimate Bagger Bot v9.0 — Sovereign Edition

Selamat datang di **Sovereign Edition**! Bot Anda kini merupakan instrumen kuantitatif tingkat institusi dengan **Sentiment Intelligence**, **Fundamental Audit**, dan **ATR Trading Levels**.

---

## 🛠️ Persiapan & Cara Menjalankan

### Metode A: Docker (Recommended 🚀)
1. Salin `.env.example` ke `.env`.
2. Isi `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, dan kredensial MongoDB.
3. Jalankan: `docker-compose up --build -d`

### Metode B: Vercel Serverless
1. Deploy ke Vercel: `vercel deploy`.
2. Set environment variables di Dashboard Vercel.
3. Setup **Cron Job** (10:00, 15:45, 19:00 WIB).

---

## 📱 Daftar Perintah (Sovereign Suite)

Gunakan `/back` untuk kembali ke Dashboard kapan saja.

### 🎯 Discovery (Pencarian Saham)
| Perintah | Fungsi |
| :--- | :--- |
| `/scan` | Discovery umum Top Active IDX & Ranking pasar. |
| `/hot` | **Fast Money**: Saham dengan lonjakan volume mendadak. |
| `/smart` | **Smart Money**: Akumulasi diam-diam broker/institusi. |
| `/sector` | **Market Heatmap**: Rotasi sektor & pimpinan pasar. |
| `/risk` | **Risk Audit**: Korelasi portofolio & resiko sistemik. |
| `/audit [SYM]` | **Fund Audit**: F-Score & Z-Score (kesehatan keuangan). |
| `/sentiment [SYM]` | **Sentiment NLP**: Mood pasar hybrid (berita + teknikal). |

### 🔬 Analysis
| Perintah | Fungsi |
| :--- | :--- |
| `/analyze [SYM]` | Audit 360° lengkap dengan Entry, TP, SL. |
| `/signals` | Hanya sinyal BUY dengan akurasi 100% filter. |

### 📂 Management
| Perintah | Fungsi |
| :--- | :--- |
| `/list` | Daftar Pantau (Watchlist). |
| `/portfolio` | Aktif Positions & P/L. |
| `/start` | Menu Utama & Dashboard Navigasi. |
| `/back` | 🔙 Kembali ke Menu Utama. |

---

## 🧠 Eksploitasi Fitur (Institutional Strategy)

### 1. Analisis 360° (`/analyze`)
Command paling penting. Output kini mencakup:
- **Financial Health**: P/E, P/B, EPS, Market Cap, Dividend Yield, Book Value
- **Trading Levels**: Entry, SL (2×ATR), TP1 (1:1), TP2 (1:2), TP3 (1:3)
- **Fundamental Badge**: F-Score & Z-Score rating
- **Sentiment Badge**: NLP mood score
- **Ichimoku**: Cloud, Cross, Volume Breakout
- **Smart Money**: Intensity & Akumulasi

### 2. Sentiment Intelligence (`/sentiment`)
Gunakan sebelum entry untuk memahami "mood pasar":
- **Score > +20**: Pasar bullish, konfirmasi untuk BUY
- **Score < -20**: Pasar bearish, defensive positioning
- **Score -20 s/d +20**: Netral, tunggu konfirmasi lain

### 3. Fundamental Audit (`/audit`)
Periksa kesehatan keuangan emiten sebelum berinvestasi:
- **F-Score ≥ 7**: Kesehatan keuangan sangat baik
- **Z-Score > 3.0**: Resiko bangkrut rendah
- **Rating AAA/AA**: Layak investasi jangka menengah

### 4. Deteksi Smart Money (`/smart`)
Gunakan setiap sesi siang untuk mendeteksi saham yang sedang "diserap" lot besar (Score > 40).

### 5. Rotasi Sektor (`/sector`)
Cari sektor **Heat Score > 65** dan status **BULLISH**. Fokuskan modal trading di saham Top Pick dari sektor leading tersebut.

### 6. Risk Audit (`/risk`)
Periksa korelasi portofolio Anda. Diversification Score rendah = cluster risk tinggi.

---

## 🎯 Cara Menggunakan Trading Levels

Setiap `/analyze` kini menampilkan level ATR-based:

```
🎯 Trading Levels (ATR-based):
📍 Entry   : Rp 9.250
🛑 SL      : Rp 8.850 (-4.32%)
✅ TP1 1:1 : Rp 9.650
✅ TP2 1:2 : Rp 10.050
✅ TP3 1:3 : Rp 10.450
```

- **Entry**: Harga saat ini sebagai referensi masuk
- **SL**: Stop Loss = Entry - 2× ATR(14), berbasis volatilitas aktual
- **TP1**: Take Profit konservatif (Risk:Reward 1:1)
- **TP2**: Take Profit normal (Risk:Reward 1:2)
- **TP3**: Take Profit agresif (Risk:Reward 1:3)

---

## 🕒 Workflow Harian Otomatis

1.  **10:00 WIB (Morning Discovery)**: Update saham dengan partisipasi volume awal kuat.
2.  **15:45 WIB (Final Market Scan)**: Sinyal masuk final sebelum pasar tutup.
3.  **19:00 WIB (Evening Market Pulse)**: Rangkuman lengkap termasuk akumulasi broker dan rotasi sektor.

---

## 🔄 Workflow Trading Optimal

```
Pagi → /sector (cari sektor bullish)
       → /smart (cari akumulasi institusi)
       → /hot (cari volume surge)

Siang → /analyze [SYM] (audit 360° + Entry/TP/SL)
       → /sentiment [SYM] (konfirmasi mood pasar)
       → /audit [SYM] (verifikasi kesehatan keuangan)

Sore  → /signals (eksekusi sinyal BUY terbaik)
       → /risk (periksa korelasi portofolio)

Malam → Evening Pulse (evaluasi performa hari ini)
```

---
> [!IMPORTANT]
> **Selalu jalankan `/analyze` DAN `/sentiment`** sebelum menekan tombol BELI. Kombinasi Entry/TP/SL + Mood Pasar + Fundamental Rating memberikan gambaran lengkap sebelum eksekusi.
