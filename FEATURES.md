# 🏛️ Ultimate Bagger V7: Project Features Documentation

The Ultimate Bagger V7 is an institutional-grade, semi-automatic algorithmic trading platform built on **Clean Architecture** principles. It combines high-speed market analysis with human-in-the-loop control and hyper-disciplined risk management.

---

## 🏗️ 1. Architecture: Clean & Modular
The system is built using a 4-layer Clean Architecture pattern, ensuring that business logic is isolated and the system is technology-agnostic.
- **Core Domain**: Contains pure strategy logic (Ichimoku V7), math utilities, and risk formulas. Zero external dependencies.
- **Application Layer**: Orchestrates business use cases like `RunScanner`, `ExecuteBacktest`, and `HandleTradingDecision`.
- **Infrastructure Layer**: Concrete implementations for MongoDB (Persistence), Yahoo Finance (Market Data), and Telegram (Messaging).
- **Presentation Layer**: Entry points via REST API (Express) and Interactive Telegram Bot.

---

## 🦾 2. Hybrid Control Engine
Moves beyond simple automation to provide a "Pilot-Copilot" experience.
- **Semi-Automatic Flow**: BUY signals trigger a confirmation request via Telegram buttons instead of blind execution.
- **Human-in-the-Loop**: Confirm trades with one tap (`CONFIRM BUY`) or `IGNORE` them based on discretionary insight.
- **Full-Auto Exit**: SELL signals are executed automatically to ensure profit taking and capital protection happen without delay.
- **Scheduler**: Automated scanning and analysis runs every market day at **15:45 WIB** (configurable).

---

## 🛡️ 3. Institutional Risk Engine
A hyper-disciplined risk layer designed to protect the equity curve.
- **ATR-Adjusted Position Sizing**: Automatically reduces number of lots during high volatility (Average True Range) to maintain a constant 2% risk per trade.
- **Portfolio Heat Limit**: Total risk exposure across all open positions is capped at **8%** of total equity.
- **Double Circuit Breaker**: 
  - **Daily Loss Limit**: Halts new trades if equity drops **3%** within a standard day.
  - **System Drawdown Limit**: Total halt and warning if drawdown exceeds **15%** from all-time peak.
- **1% Fee Buffer**: All sizing calculations reserved 1% capital for IDX fees/slippage.

---

## 📊 4. Advanced Strategy & Analysis
Powered by the V7 refined Ichimoku algorithm.
- **Multi-Signal Detection**: Supports `STANDARD`, `AGGRESSIVE`, and `PULLBACK` entry rules.
- **Volume Breakout Filter**: Validates signals only if volume exceeds 20-day average with a configurable multiplier.
- **Signal Confidence Scoring**: Every BUY signal comes with a `Confidence Score (0-100%)` calculated from trend strength and volume breakout quality.
- **Dynamic Trailing Stop**: Trails price from the highest peak to lock in profits, ignoring "exit on signal" if trailing stop hit first.

---

## 🤖 5. Interactive Telegram Interface
Complete platform control via professional chat interface.
- **Commands**:
  - `/scan`: Manual market-wide scan trigger.
  - `/analyze <TICKER>`: Deep-dive report including Cloud status, Volume breakout, Risk breakdown, and Entry Specs.
  - `/status`: Real-time portfolio dashboard showing growth, lots, and entry prices.
  - `/backtest <TICKER>`: Instant 150-day simulation of current strategy performance.
- **Interactions**:
  - **Inline Buttons**: Confirm or Ignore signals with a single tap.
  - **Structured Alerts**: Professional HTML-formatted messages with emojis for instant readability.

---

## 💾 6. High-Fidelity Persistence & Analytics
Comprehensive data logging for audit and machine learning preparation.
- **Trade Logging**: Stores every single buy/sell event with precision execution price, slippage, and reasons.
- **Signal History**: Logs every strategy hit even if the user chooses to ignore it (for signal quality analysis).
- **Equity Snapshots**: Daily tracking of total portfolio value and drawdown for equity curve visualization.
- **Structured JSON Logging**: Powered by Winston for institutional observability.

---

## 🚀 7. Production-Ready Infrastructure
- **Environment Driven**: 100% configuration via `.env` with strict **Zod validation** at startup.
- **Dockerized**: Includes `Dockerfile` and `docker-compose.yml` for instant deployment to cloud servers.
- **Type Safety**: 100% TypeScript coverage with strict mode, ensuring no runtime "undefined" errors.
- **Market Data Abstraction**: Ready-to-use Yahoo Finance v3 integration with a provider interface that can be easily swapped for Direct Feed.

---

## � 9. Capital Preservation Layer
Institutional equity protection system to stabilize long-term growth.
- **Equity Curve Control**: Automatic risk reduction tiers (Multiplier: 1.0 down to 0.5) based on drawdown depth (0-15%).
- **Dynamic Growth Scaling**: Increases risk cap from 2% to 2.5% when equity creates new 10% peaks above previous highs.
- **Regime-Based Capital Allocation**: Dynamically shifts capital usage based on market state (Bull: 100%, Sideways: 70%, Bear: 30%).
- **Losing Streak Filter**: Automatically tightens signal requirements (Confidence Req: 60% -> 80%) after a series of losses to prevent "revenge trading" or deep drawdown clusters.

---

## 💎 10. Compounding Optimization Engine (V7.0)
Maximizes geometric portfolio growth through adaptive risk scaling and capital efficiency.
- **Adaptive Risk Scaling**: Dynamically adjusts risk (1.5%, 2.0%, 2.25%, 2.5%) based on equity states (Drawdown, Normal, Growth).
- **Automated Profit Locking**: Secures 30% of profit every 5% growth increment above previous peaks, excluding it from future risk sizing.
- **Asset Ranking (Top 3 Filter)**: Global ranking system that restricts new entries only to the top 3 assets with the highest capital efficiency scores.
- **High Conviction Boost**: Automatically increases position size by 20% for signals with very high confidence (>85%) during bullish market regimes.
- **Equity Momentum Filter**: Detects negative equity curve slopes (10-day lookback) to proactively reduce risk and increase signal requirements.

---

## 🚀 11. Growth Acceleration Engine (V7.1)
- **Growth Acceleration (V7.1)**: "Turbo Mode" yang mempercepat profit saat performa optimal melalui *pyramiding* dan *multi-tier scaling*.
- **QuantPerformanceLab (V7.2)**: Fasilitas riset kuantitatif untuk optimasi parameter, simulasi Monte Carlo, dan pelaporan performa kelas institusi.
- **Clean Architecture (4-Layer)**: Struktur kode profesional yang modular, *testable*, dan independen terhadap *framework*.
- **Position Pyramiding (Scale-in)**: Adds to winning positions (0.5x size) when trade profit > 1R and trend strength is peak.
- **Institutional Volatility Filter**: Instant deactivation of acceleration if ATR expands > 1.5x of the moving average.
- **Optimal Regime Guard**: Only activates when drawdown < 5%, market is BULL, and equity slope is positive for 15 days.
- **Auto-Reset Protocol**: Instant fallback to baseline compounding if 2 consecutive losses occur or drawdown breaches 5%.

---

## 🧪 12. QuantPerformanceLab (v7.2)
Advanced research suite for strategy validation and optimization.
- **Institutional Metrics**: Professional performance analysis including CAGR, Sharpe Ratio, Sortino Ratio, and Recovery Factor.
- **Monte Carlo Simulator**: 500-run simulation suite to determine statistical drawdown probabilities (95% CI).
- **Strategy Tuning Engine**: Automated Grid Search optimization for key parameters like ATR multipliers and confidence thresholds.
- **Walk-Forward Analysis**: Dynamic backtesting mode that simulates out-of-sample performance to guard against overfitting.
- **Export & Reporting Service**: Automated generation of CSV trade logs and JSON summary reports for external analysis.

---

## 🏛️ 13. Institutional Alpha Suite (v8.5)
Advanced market discovery tools for detecting institutional presence.
- **Smart Money Tracking**: Uses Money Flow Multiplier logic to detect "Quiet Accumulation" (Price stability + Volume surge) and assigns an Intensity Score (-100 to 100).
- **Sector Wisdom (Heatmap)**: Aggregates momentum and institutional intensity of constituents across all IDX sectors to identify leading market segments.
- **Fast Money (Hotlist)**: Real-time volume surge scanner that identifies stocks experiencing immediate participation breakouts (>2.0x average volume).
- **Multi-Dimensional Logic**: Signal validation now integrates ADX (Trend Strength) and Smart Money Intensity for institutional-grade reliability.

---

## 🕒 14. Automated Market Intelligence (v13.0)
Daily automated reporting system for institutional-style market recaps.
- **Evening Market Pulse**: Automated daily report at 19:00 WIB covering IHSG regime, top breakouts, smart money accumulation, and leading sectors.
- **Morning Discovery**: Automated market-wide scan at 10:00 WIB to identify early participation trends.
- **Broadcast System**: Multi-user notification engine that ensures all approved traders receive mission-critical alerts.

---

## 🔄 15. Elite Suite Navigation & UX (v8.5)
Professional-grade interface refinements for seamless operation.
- **Unified Main Menu**: Redesigned `/start` interface categorizing features into Discovery, Analysis, and Management.
- **Universal `/back` Navigation**: Persistent escape routes in every command message, allowing users to return to the institutional dashboard with one click.
- **Refined Signal Alerts**: Enriched signal reports including candlestick patterns (Hammer, Marubozu), ADX strength, and institutional intensity metrics.

---

## 📈 16. Technical Summary
- **Language**: TypeScript 5.x
- **Runtime**: Node.js 18+ / Vercel Serverless
- **Database**: MongoDB (Mongoose)
- **Market Data**: Yahoo Finance v3 (Refined for IDX)
- **Validation**: Zod & Strict Type Safety
- **Observability**: Winston Structured Logging
