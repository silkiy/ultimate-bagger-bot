# 🦅 Ultimate Bagger Quant Bot (v13.2) — Broker Summary Edition

**Ultimate Bagger v13.2 "Broker Summary"** adalah platform trading kuantitatif *institutional-grade* yang dirancang khusus untuk pasar saham Indonesia (IDX). Sistem ini kini dilengkapi dengan **Algorithmic Broker Summary (Brosum)**, di samping fitur unggulan **Market Regime Auto-Pilot**, **Intrinsic Value Audit**, **Whale Radar**, dan **Portfolio Rebalancer**.

---

## 🚀 Fitur Utama

-   **Broker Summary (NEW v13.2)**: Klasifikasi otomatis akumulasi/distribusi broker (BIG ACCUM, ACCUM, NEUTRAL, DIST, BIG DIST) menggunakan proksi Money Flow & Volume Surge.
-   **Prime Alpha Engine (v11.0)**: Metrik konvinsi tunggal (0-100) yang menggabungkan Tech + Fund + Sent + Smart Money untuk keputusan trading yang tidak bias.
-   **Market Breadth (v11.0)**: Fitur `/breadth` untuk memantau kesehatan ekosistem pasar (Advance/Decline vs SMA-50).
-   **Sector Wisdom**: Rotasi sektor real-time dengan *hardcoded fallback* untuk 70+ saham utama IDX.
-   **Sentiment Intelligence (NLP v18)**: Analisis sentimen hybrid dari berita (NLP bilingual EN/ID) dan mood pasar (momentum, volume, volatilitas).
-   **Fundamental Quant Audit**: Penilaian kesehatan keuangan dengan Piotroski F-Score dan Altman Z-Score.
-   **ATR-Based Trading Levels**: Entry, Stop Loss (v10.1 Tuned), dan Take Profit (R:R 1:1 / 1:2 / 1:3) dihitung otomatis dari volatilitas aktual.
-   **Systemic Risk Audit**: Analisis korelasi portofolio dan diversifikasi untuk mencegah cluster risk.
-   **Evening Market Pulse**: Rangkuman harian otomatis pukul 19:00 WIB, kini dilengkapi dengan label **Brosum**.
-   **Hybrid Control (Human-in-the-Loop)**: Sinyal beli memerlukan konfirmasi manual, sementara proteksi modal berjalan 24/7.

---

## 🏗️ Struktur Proyek

```text
src/
├── core/           # Logic Inti (Strategy V7, Smart Money, Sentiment NLP, Math)
├── application/    # Use Cases (Scanner, Audit, Sentiment, Sector Rotation)
├── infrastructure/ # External Services (MongoDB, Yahoo Finance, Scheduler)
└── presentation/   # Interfaces (Professional Telegram Bot, REST API)
```

---

## 🕹️ Navigasi & Command (Sovereign Suite)

### 🎯 Discovery (Pencarian Saham)
| Perintah | Deskripsi |
| :--- | :--- |
| `/scan` | Discovery umum Top Active IDX & Ranking pasar. |
| `/whale` | 🐋 **Whale Radar**: Lacak akumulasi institutional porsi besar. |
| `/hot` | **Fast Money**: Scan saham dengan volume melonjak instan. |
| `/smart` | **Smart Money**: Lacak akumulasi diam-diam modal besar. |
| `/sector` | **Market Heatmap**: Analisis rotasi & kekuatan sektoral. |
| `/risk` | **Risk Audit**: Deteksi korelasi portofolio & resiko sistemik. |
| `/audit [SYM]` | **Fundamental Audit**: Piotroski F-Score & Altman Z-Score. |
| `/valuation [SYM]` | **Intrinsic Audit**: Valuasi harga wajar Benjamin Graham. |
| `/sentiment [SYM]` | **Sentiment NLP**: Analisis mood pasar hybrid (NLP + Market). |

### 🔬 Analysis (Deep Insights)
| Perintah | Deskripsi |
| :--- | :--- |
| `/analyze [SYM]` | Audit 360°: Teknikal, Fundamental, Sentiment, Entry/TP/SL. |
| `/signals` | *Low Noise Mode*: Hanya sinyal BUY yang lolos 100% filter. |

### 📂 Management
| Perintah | Deskripsi |
| :--- | :--- |
| `/list` | Lihat Daftar Pantau (Watchlist). |
| `/optimize` | ⚖️ **Portfolio Rebalancer**: Saran Alpha-Swap otomatis. |
| `/portfolio` | Aktif Positions & P/L. |
| `/back` | 🔙 Kembali ke Dashboard Utama. |

---

## 🛡️ Protokol Resiko (Capital Preservation Layer)

-   **Max Drawdown Halt**: Trading otomatis berhenti jika drawdown portofolio 15%.
-   **Daily Loss Limit**: Penghentian harian jika rugi harian 3%.
-   **Portfolio Heat**: Total resiko terbuka dibatasi 8% dari modal.
-   **ATR Sizing**: Lot dihitung otomatis berdasarkan volatilitas (2% resiko/trade).
-   **ATR-Based SL**: Stop Loss dihitung dari 2× ATR(14) di bawah harga entry.

---

## 📈 Logika Strategi V7
-   **Trend**: Price > Cloud & IHSG Bullish.
-   **Entry**: Tenkan-Kijun Cross + Volume > 1.2x SMA20.
-   **Protection**: Trailing Stop + ATR-adjusted sizing.
-   **Levels**: Entry, SL (2×ATR), TP1 (R:R 1:1), TP2 (1:2), TP3 (1:3).

---

## 🛠️ Instalasi & Setup

1.  **Clone & Install**: `npm install`
2.  **Environment**: Salin `.env.example` ke `.env` dan isi token Telegram & MongoDB.
3.  **Run**: `npm run dev`
4.  **Docker**: `docker-compose up -d`
5.  **Vercel**: `vercel deploy` (Serverless Mode)

---

## ⚖️ Disclaimer
Gunakan dengan bijak. Trading melibatkan resiko kapital yang nyata. Robot ini adalah alat bantu analisis dan eksekusi berbasis data (DYOR).

---
*Developed with ❤️ for Institutional Quant Trading Excellence.*
