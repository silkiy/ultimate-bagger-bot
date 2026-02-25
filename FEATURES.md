# 🏛️ Ultimate Bagger V9.5: Project Features Documentation

The Ultimate Bagger V9.5 "Sovereign Sentinel (Data Aligned)" is an institutional-grade, semi-automatic algorithmic trading platform built on **Clean Architecture** principles. It combines high-speed market analysis with NLP sentiment intelligence, fundamental scoring, and hyper-disciplined risk management.

---

## 🏗️ 1. Architecture: Clean & Modular
The system is built using a 4-layer Clean Architecture pattern, ensuring that business logic is isolated and the system is technology-agnostic.
- **Core Domain**: Contains pure strategy logic (Ichimoku V7), math utilities, NLP sentiment lexicon, and risk formulas. Zero external dependencies.
- **Application Layer**: Orchestrates business use cases like `RunScanner`, `AnalyzeSentiment`, `AuditFundamentalHealth`, and `AnalyzeSystemicRisk`.
- **Infrastructure Layer**: Concrete implementations for MongoDB (Persistence), Yahoo Finance (Market Data & News), and Telegram (Messaging).
- **Presentation Layer**: Entry points via REST API (Express) and Interactive Telegram Bot.

---

## 🦾 2. Hybrid Control Engine
Moves beyond simple automation to provide a "Pilot-Copilot" experience.
- **Semi-Automatic Flow**: BUY signals trigger a confirmation request via Telegram buttons instead of blind execution.
- **Human-in-the-Loop**: Confirm trades with one tap (`CONFIRM BUY`) or `IGNORE` them based on discretionary insight.
- **Full-Auto Exit**: SELL signals are executed automatically to ensure profit taking and capital protection happen without delay.
- **Scheduler**: Automated scanning at **10:00** and **15:45 WIB**, with Evening Pulse at **19:00 WIB**.

---

## 🛡️ 3. Institutional Risk Engine
A hyper-disciplined risk layer designed to protect the equity curve.
- **ATR-Adjusted Position Sizing**: Automatically reduces lots during high volatility to maintain 2% risk per trade.
- **Safe Risk Stop Loss (v9.5)**: Stop Loss is dynamically set at the safest distance between **2.5x ATR** and the **Kijun-Sen** level.
- **Portfolio Heat Limit**: Total risk exposure capped at **8%** of total equity.
- **Double Circuit Breaker**:
  - **Daily Loss Limit**: Halts new trades if equity drops **3%** within a day.
  - **System Drawdown Limit**: Total halt if drawdown exceeds **15%** from peak.
- **1% Fee Buffer**: All sizing calculations reserve 1% for IDX fees/slippage.

---

## 📊 4. Advanced Strategy & Analysis
Powered by the V7 refined Ichimoku algorithm with multi-dimensional validation.
- **Multi-Signal Detection**: Supports `STANDARD`, `AGGRESSIVE`, and `PULLBACK` entry rules.
- **Volume Breakout Filter**: Validates signals only if volume exceeds 20-day average.
- **Signal Confidence Scoring**: Every BUY signal scored 0-100% from trend strength and volume quality.
- **ATR-Based Trading Levels**: Automatic Entry, SL (v10.1 Tuned), TP1 (R:R 1:1), TP2 (1:2), TP3 (1:3).
- **Dynamic Trailing Stop**: Trails price from highest peak to lock in profits.

---

## 🧭 5. Sector Wisdom & Market Heatmap (v9.4)
Advanced market discovery through sectoral rotation analysis.
- **Sector Stability**: Implements `IDX_SECTOR_FALLBACK` for 70+ top Jakarta stocks, ensuring sector data is always available even when API data is sparse.
- **Market Heatmap**: Aggregates momentum and institutional intensity across IDX sectors to identify leading themes.
- **Discovery Breadth**: Scans the top 35 active symbols to build a comprehensive view of the market's internal strength.

---

## 🧠 6. Sentiment Intelligence Engine (v18)
Hybrid NLP sentiment scoring combining news analysis with market-derived mood.
- **NLP Headline Scorer**: Bilingual financial lexicon (40+ terms EN/ID) scanning Yahoo Finance headlines.
- **Market-Derived Sentiment**: Composite score from Price Momentum (50%), Volume Trend (25%), and Volatility Signal (25%).
- **Hybrid Engine**: Auto-detects source availability — `HYBRID`, `NEWS_ONLY`, or `MARKET_ONLY`.
- **Fear-Greed Gauge**: Visual mood indicator from -100 (Extreme Fear) to +100 (Extreme Greed).
- **`/sentiment [SYM]`**: Standalone sentiment report with NLP scores, market mood breakdown, and latest headlines.

---

## 🏛️ 7. Fundamental Quant Audit (v20-v26)
Institutional-grade financial health scoring.
- **Piotroski F-Score (0-9)**: Profitability, leverage, and operating efficiency assessment.
- **Altman Z-Score**: Bankruptcy risk prediction using balance sheet fundamentals.
- **Rich Data Depth (v26)**: Uses `quoteSummary` to pull deep balance sheet and profile data.
- **Currency-Aware Scaling**: Heuristic scaling legacy USD values to IDR for IDX fundamentals (e.g., MDKA.JK).
- **Synthetic PB Calculation**: Fallback P/B calculation when official exchange data is missing.
- **Rating System**: AAA → D ratings based on combined F-Score and Z-Score analysis.
- **`/audit [SYM]`**: Full fundamental health report with breakdown and risk warnings.

---

## 🎯 8. Scanner Data Alignment (v9.5)
Ensures a professional-grade dashboard experience without data gaps.
- **HOLD Logic Realignment**: Sinyal `HOLD` kini menangkap harga pasar terakhir dan memiliki skor keyakinan dasar berbasis ADX.
- **Transparent Pricing**: Dashboard `/scan` kini selalu menampilkan kolom **Harga** dan **Sig** (Sinyal) yang utuh.
- **Robust Asset Ranking**: Semua saham aktif diberikan ranking skor komparatif untuk memudahkan navigasi watchlist.

---

## 🤖 9. Interactive Telegram Interface
Complete platform control via professional chat interface.
- **Discovery Commands**: `/scan`, `/hot`, `/smart`, `/sector`, `/risk`, `/audit`, `/sentiment`.
- **Analysis Commands**: `/analyze [SYM]` (360° audit), `/signals` (filtered BUY only).
- **Management Commands**: `/list`, `/portfolio`, `/back`.
- **Inline Buttons**: Confirm or Ignore signals with a single tap.
- **Professional Output**: HTML-formatted with monospace tables, emojis, and visual gauges.

---

## 🚨 10. Sovereign Sentinel (Anomaly Detection)
Real-time guardian for your personal watchlist.
- **24/7 Monitoring**: Automatically triggers every 30 minutes during market hours.
- **Volume Spike Alert**: Immediate notification if current Volume > 1.5x of 22-Day Average.
- **Price Jump Alert**: Immediate notification if Price > 5% change from Previous Close.
- **Trend Deviation**: Alerts if price deviates > 3% from the Weekly Trend (SMA-5).
- **Personal Isolation**: Alerts are sent only to the user who owns the stock in their watchlist.

---

## 🔄 11. Navigation & UX (Elite Suite)
Professional-grade interface refinements.
- **Unified Main Menu**: `/start` with Discovery, Analysis, and Management categories.
- **Universal `/back`**: Persistent escape routes in every command.
- **Enriched Alerts**: Candlestick patterns, ADX strength, institutional intensity, sentiment mood.

---

## 📈 12. Technical Summary
- **Language**: TypeScript 5.x
- **Runtime**: Node.js 18+ / Vercel Serverless
- **Database**: MongoDB (Mongoose)
- **Market Data**: Yahoo Finance v3 (IDX Optimized, News API)
- **NLP Engine**: Keyword-based bilingual financial lexicon (EN/ID)
- **Validation**: Zod & Strict Type Safety
- **Observability**: Winston Structured Logging
