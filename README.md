# 🏛️ Ultimate Bagger Quant Bot (V7) - Institutional Edition

**Ultimate Bagger V7** adalah platform trading kuantitatif *semi-automatic* kelas institusi. Dirancang dengan **Clean Architecture**, sistem ini menggabungkan algoritma Ichimoku tingkat lanjut dengan lapisan kendali manusia (*Hybrid Control*) dan protokol perlindungan modal yang sangat disiplin (*Capital Preservation Layer*).

---

## 🚀 Fitur Utama

-   **Hybrid Control Engine**: Sinyal BUY memerlukan konfirmasi manual via Telegram, sementara SELL dieksekusi otomatis untuk proteksi modal.
-   **Institutional Risk Engine**: Manejemen posisi berbasis volatilitas (ATR) dengan pelacakan *drawdown* real-time.
-   **Capital Preservation Layer**:
    -   *Equity Curve Control*: Pengurangan resiko otomatis saat *drawdown*.
    -   *Regime Allocation*: Alokasi modal cerdas (Bull/Sideways/Bear).
    -   *Streak Protection*: Pengetatan syarat sinyal setelah kerugian beruntun.
-   **Compounding Optimization (V7.0)**: Algoritma cerdas untuk pertumbuhan geometris maksimal melalui *adaptive scaling*, *profit locking*, dan *asset ranking*.
-   **Clean Architecture (4-Layer)**: Struktur kode profesional yang modular, *testable*, dan independen terhadap *framework*.
-   **Professional Dashboard**: Laporan status portofolio, riwayat trade, dan analisis sinyal mendalam lewat Telegram.

---

## 🏗️ Struktur Proyek

```text
src/
├── core/           # Domain Logic (Strategy, Risk, Math, Entities)
├── application/    # Use Cases (Scanner, Backtest, Decisions)
├── infrastructure/ # External Services (MongoDB, Yahoo, Telegram)
└── presentation/   # Interfaces (Interactive Bot, API Controller)
```

---

## 🕹️ Perintah Telegram (Interaktif)

| Perintah | Deskripsi |
| :--- | :--- |
| `/scan` | Jalankan pemindaian pasar manual segera. |
| `/analyze <TICKER>` | Laporan analisis mendalam (Cloud, Volume, Risk Score). |
| `/status` | Portfolio dashboard: Growth, Drawdown, Heat, & Positions. |
| `/backtest <TICKER>` | Simulasi historis performa strategi V7. |

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
