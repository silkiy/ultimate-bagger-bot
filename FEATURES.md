# 🏛️ Ultimate Bagger V9.0: Project Features Documentation

The Ultimate Bagger V9.0 "Sovereign Edition" is an institutional-grade, semi-automatic algorithmic trading platform built on **Clean Architecture** principles. It combines high-speed market analysis with NLP sentiment intelligence, fundamental scoring, and hyper-disciplined risk management.

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
- **ATR-Based Trading Levels**: Automatic Entry, SL (2×ATR), TP1 (R:R 1:1), TP2 (1:2), TP3 (1:3).
- **Dynamic Trailing Stop**: Trails price from highest peak to lock in profits.

---

## 🧠 5. Sentiment Intelligence Engine (v18)
Hybrid NLP sentiment scoring combining news analysis with market-derived mood.
- **NLP Headline Scorer**: Bilingual financial lexicon (40+ terms EN/ID) scanning Yahoo Finance headlines.
- **Market-Derived Sentiment**: Composite score from Price Momentum (50%), Volume Trend (25%), and Volatility Signal (25%).
- **Hybrid Engine**: Auto-detects source availability — `HYBRID`, `NEWS_ONLY`, or `MARKET_ONLY`.
- **Fear-Greed Gauge**: Visual mood indicator from -100 (Extreme Fear) to +100 (Extreme Greed).
- **`/sentiment [SYM]`**: Standalone sentiment report with NLP scores, market mood breakdown, and latest headlines.

---

## 🏛️ 6. Fundamental Quant Audit (v20)
Institutional-grade financial health scoring.
- **Piotroski F-Score (0-9)**: Profitability, leverage, and operating efficiency assessment.
- **Altman Z-Score**: Bankruptcy risk prediction using balance sheet fundamentals.
- **Synthetic Quality Proxy**: Fallback scoring for IDX stocks where deep financial data is restricted.
- **Rating System**: AAA → D ratings based on combined F-Score and Z-Score analysis.
- **`/audit [SYM]`**: Full fundamental health report with breakdown and risk warnings.

---

## 🎯 7. Enriched Analysis (`/analyze`)
The `/analyze` command now delivers a complete 360° institutional audit:
- **Financial Health Table**: P/E, P/B, EPS, Market Cap (formatted T/B/M), Dividend Yield, Book Value.
- **Trading Levels**: ATR-based Entry, SL, TP1, TP2, TP3 with risk percentage.
- **Fundamental Badge**: F-Score/Z-Score rating inline.
- **Sentiment Badge**: NLP mood score inline.
- **Ichimoku Breakdown**: Cloud position, cross signal, volume breakout.
- **Smart Money**: Intensity score and accumulation detection.
- **P/B Sanity Check**: Values > 10,000 auto-filtered to prevent misleading display.

---

## 🤖 8. Interactive Telegram Interface (Sovereign Suite)
Complete platform control via professional chat interface.
- **Discovery Commands**: `/scan`, `/hot`, `/smart`, `/sector`, `/risk`, `/audit`, `/sentiment`.
- **Analysis Commands**: `/analyze [SYM]` (360° audit), `/signals` (filtered BUY only).
- **Management Commands**: `/list`, `/portfolio`, `/back`.
- **Inline Buttons**: Confirm or Ignore signals with a single tap.
- **Professional Output**: HTML-formatted with monospace tables, emojis, and visual gauges.

---

## 🏛️ 9. Institutional Alpha Suite (v15.0)
Advanced market discovery & intelligence for absolute sovereign control.
- **Smart Money Tracking**: Money Flow Multiplier logic for "Quiet Accumulation" detection (Intensity Score -100 to 100).
- **Portfolio Correlation Matrix**: Pearson's coefficient across holdings for cluster risk identification.
- **Systemic Guard (/risk)**: Diversification Score with specific overlapping risk warnings.
- **Sector Wisdom (Heatmap)**: Momentum and institutional intensity aggregated across IDX sectors.

---

## 💎 10. Compounding & Growth Engine (V7.0-7.2)
Maximizes geometric portfolio growth through adaptive risk scaling.
- **Adaptive Risk Scaling**: Dynamically adjusts risk (1.5% - 2.5%) based on equity state.
- **Automated Profit Locking**: Secures 30% of profit every 5% growth increment.
- **Asset Ranking (Top 3 Filter)**: Restricts new entries to top 3 capital efficiency scores.
- **Position Pyramiding**: Adds to winners (0.5x size) when profit > 1R and trend is peak.
- **QuantPerformanceLab**: Monte Carlo (500-run), Walk-Forward, Sharpe/Sortino, and Grid Search.

---

## 🕒 11. Automated Market Intelligence
Daily automated reporting system for institutional-style recaps.
- **Morning Discovery (10:00 WIB)**: Early participation trends and volume surges.
- **Final Scan (15:45 WIB)**: Entry signals before market close.
- **Evening Market Pulse (19:00 WIB)**: IHSG regime, breakouts, smart money, sector rotation.

---

## 🔄 12. Navigation & UX (Elite Suite)
Professional-grade interface refinements.
- **Unified Main Menu**: `/start` with Discovery, Analysis, and Management categories.
- **Universal `/back`**: Persistent escape routes in every command.
- **Enriched Alerts**: Candlestick patterns, ADX strength, institutional intensity, sentiment mood.

---

## 📈 13. Technical Summary
- **Language**: TypeScript 5.x
- **Runtime**: Node.js 18+ / Vercel Serverless
- **Database**: MongoDB (Mongoose)
- **Market Data**: Yahoo Finance v3 (IDX Optimized, News API)
- **NLP Engine**: Keyword-based bilingual financial lexicon (EN/ID)
- **Validation**: Zod & Strict Type Safety
- **Observability**: Winston Structured Logging
