# 🏛️ Ultimate Bagger Quant Bot (v8.5) — Elite Suite

**Ultimate Bagger v8.5 "Elite Suite"** adalah platform trading kuantitatif *professional-grade* kelas institusi. Dirancang untuk bursa saham Indonesia (IDX), sistem ini menggabungkan analisis teknikal presisi, pelacakan modal besar (*Smart Money*), dan rotasi sektor dinamis dalam satu ekosistem Telegram yang elegan.

---

## 🚀 Fitur Utama

-   **Institutional Alpha Engine**: Deteksi akumulasi institusi (*Quiet Buying*) dan lonjakan volume instan (*Fast Money*).
-   **Sector Wisdom (v8.5)**: Analisis rotasi sektor real-time untuk menemukan pimpinan pasar (*Leading Sectors*) setiap hari.
-   **Hybrid Control (Human-in-the-Loop)**: Sinyal beli memerlukan konfirmasi manual via Telegram, sementara pengamanan modal (*Trailing Stop*) bekerja 24/7 secara otomatis.
-   **Multi-Dimensional Accuracy**: Sinyal trading divalidasi menggunakan bobot gabungan Ichimoku, ADX, dan intensitas Smart Money.
-   **Evening Market Pulse**: Rangkuman otomatis performa IHSG, breakout harian, dan tren akumulasi setiap pukul 19:00 WIB.
-   **Capital Preservation Layer**: Manajemen posisi berbasis volatilitas (ATR) dengan penghentian perdagangan otomatis saat *drawdown* sistem terjadi.

---

## 🏗️ Struktur Proyek

```text
src/
├── core/           # Logic Inti (Strategy v7, Smart Money, Math, Entities)
├── application/    # Use Cases (Scanner, Sector Rotation, Morning/Evening Pulse)
├── infrastructure/ # External Services (MongoDB, Yahoo Finance, Scheduler)
└── presentation/   # Interfaces (Professional Telegram Bot, REST API)
```

---

## 🕹️ Navigasi & Command (Elite Suite)

| Perintah | Deskripsi |
| :--- | :--- |
| `/scan` | Discovery umum Top Active IDX & Ranking pasar. |
| `/hot` | **Fast Money**: Scan saham dengan volume melonjak instan. |
| `/smart` | **Smart Money**: Lacak akumulasi diam-diam modal besar. |
| `/sector` | **Market Heatmap**: Analisis rotasi & kekuatan sektoral. |
| `/analyze` | Audit mendalam: Sinyal V8, Pola Candle, & Financial Health. |
| `/signals` | *Low Noise Mode*: Hanya tampilkan sinyal BUY yang lolos 100% filter. |
| `/back` | Kembali ke Dashboard Utama (Dashboard Navigation). |

---

## 🛡️ Protokol Resiko (The "Diamond Hands" Engine)

Sistem ini tidak hanya mencari profit, tapi berfokus pada **Capital Preservation**:
-   **Max Drawdown Halt**: Sistem akan berhenti jika drawdown portofolio mencapai 15%.
-   **Daily Loss Limit**: Penghentian trading harian jika rugi mencapai 3%.
-   **Portfolio Heat**: Total resiko terbuka dibatasi maksimal 8% dari modal.
-   **ATR Sizing**: Lot dihitung otomatis berdasarkan volatilitas untuk menjaga resiko tetap 2% per trade.

---

## 🛠️ Instalasi & Setup

1.  **Clone & Install**: `npm install`
2.  **Environment**: Salin `.env.example` ke `.env` dan isi token Telegram & MongoDB.
3.  **Run**: `npm run dev`
4.  **Docker**: `docker-compose up -d`

---

## 📈 Logika Strategi V7
Menggunakan kombinasi Ichimoku Aggressive dan Volume Breakout:
-   **Trend**: Price > Cloud & IHSG Bullish.
-   **Entry**: Tenkan-Kijun Cross + Volume > 1.2x SMA20.
-   **Protection**: Trailing Stop + ATR-adjusted sizing.

---

## ⚖️ Disclaimer
Gunakan dengan bijak. Trading melibatkan resiko kapital yang nyata. Robot ini adalah alat bantu analisis dan eksekusi berbasis data (DYOR).

---
*Developed with ❤️ for Quant Trading Excellence.*
