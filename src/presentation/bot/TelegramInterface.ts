import { Telegraf, Context, Markup } from 'telegraf';
import { RunScanner } from '../../application/use-cases/RunScanner';
import { ExecuteBacktest } from '../../application/use-cases/ExecuteBacktest';
import { PerformManualAnalysis } from '../../application/use-cases/PerformManualAnalysis';
import { CalculateHotlist } from '../../application/use-cases/CalculateHotlist';
import { TrackSmartMoney } from '../../application/use-cases/TrackSmartMoney';
import { AnalyzeSectorRotation } from '../../application/use-cases/AnalyzeSectorRotation';
import { AnalyzeSystemicRisk } from '../../application/use-cases/AnalyzeSystemicRisk';
import { AuditFundamentalHealth } from '../../application/use-cases/AuditFundamentalHealth';
import { AnalyzeSentiment } from '../../application/use-cases/AnalyzeSentiment';
import { HandleTradingDecision } from '../../application/use-cases/HandleTradingDecision';
import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { IUserRepository } from '../../core/domain/interfaces/UserRepository';
import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { ScanWhaleActivity } from '../../application/use-cases/ScanWhaleActivity';
import { AuditIntrinsicValue } from '../../application/use-cases/AuditIntrinsicValue';
import { OptimizePortfolio } from '../../application/use-cases/OptimizePortfolio';
import { logger } from '../../infrastructure/logging/WinstonLogger';
import { DomainTicker } from '../../core/domain/entities/Ticker';
import { YahooFinanceProvider } from '../../infrastructure/external/YahooFinanceProvider';
import { ENV } from '../../infrastructure/config/env';
import { PerformanceCalculator, MonteCarloSimulator } from '../../core/domain/logic/PerformanceAnalytics';

export class TelegramInterface {
    constructor(
        private bot: Telegraf,
        private scanner: RunScanner,
        private backtester: ExecuteBacktest,
        private manualAnalysis: PerformManualAnalysis,
        private handleDecision: HandleTradingDecision,
        private tickerRepo: ITickerRepository,
        private userRepo: IUserRepository,
        private marketData: IMarketDataProvider,
        private calculateHotlist: CalculateHotlist,
        private trackSmartMoney: TrackSmartMoney,
        private analyzeSector: AnalyzeSectorRotation,
        private analyzeRisk: AnalyzeSystemicRisk,
        private auditFundamental: AuditFundamentalHealth,
        private analyzeSentiment: AnalyzeSentiment,
        private scanWhale: ScanWhaleActivity,
        private auditIntrinsic: AuditIntrinsicValue,
        private optimizePortfolio: OptimizePortfolio
    ) { }

    // Helper: get admin name string
    private get adminId(): string { return ENV.TELEGRAM_CHAT_ID; }
    private isAdmin(telegramId: string): boolean { return telegramId === this.adminId; }

    init() {
        // ─── Multi-User Auth Middleware ───────────────────────────────────────
        // /start and /register bypass auth so new users can register
        this.bot.use(async (ctx, next) => {
            const telegramId = ctx.from?.id?.toString();
            if (!telegramId) return;

            // Extract command text
            const text = (ctx.message as any)?.text || '';
            const command = text.split(' ')[0]?.toLowerCase();

            // Allow /start and /register without DB check
            if (command === '/start' || command === '/register') {
                return next();
            }

            // All other commands: check user in DB
            const user = await this.userRepo.findByTelegramId(telegramId);
            if (!user) {
                return ctx.reply(
                    '👋 Kamu belum terdaftar.\n\n' +
                    'Gunakan /register untuk membuat akun.'
                );
            }
            if (user.status === 'PENDING') {
                return ctx.reply(
                    '⏳ <b>Pendaftaranmu sedang ditinjau.</b>\n' +
                    'Admin akan segera mengkonfirmasi aksesmu.',
                    { parse_mode: 'HTML' }
                );
            }
            if (user.status === 'BLOCKED') {
                return ctx.reply('🚫 Akunmu telah diblokir. Hubungi admin.');
            }

            // APPROVED — proceed
            return next();
        });

        // ─── /start & /back ──────────────────────────────────────────────────
        this.bot.start(async (ctx) => {
            const telegramId = ctx.from.id.toString();
            const user = await this.userRepo.findByTelegramId(telegramId);
            await this.sendMainMenu(ctx, user);
        });

        this.bot.command('back', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            const user = await this.userRepo.findByTelegramId(telegramId);
            await this.sendMainMenu(ctx, user);
        });

        // ─── /register ────────────────────────────────────────────────────────
        this.bot.command('register', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            const existing = await this.userRepo.findByTelegramId(telegramId);
            if (existing) {
                const statusMap = { PENDING: '⏳ Menunggu approval', APPROVED: '✅ Sudah aktif', BLOCKED: '🚫 Diblokir' };
                return ctx.reply(`ℹ️ Kamu sudah terdaftar.\nStatus: ${statusMap[existing.status]}`);
            }

            // Admin (TELEGRAM_CHAT_ID) gets auto-approved on first register
            const isAdmin = this.isAdmin(telegramId);
            const status = isAdmin ? 'APPROVED' : 'PENDING';

            await this.userRepo.create({
                telegramId,
                username: ctx.from.username || '',
                firstName: ctx.from.first_name || '',
                status,
                capital: 10_000_000,
                registeredAt: new Date()
            });

            if (isAdmin) {
                // Auto-approve in DB too
                await this.userRepo.approve(telegramId);
                logger.info(`✅ Admin registered and auto-approved: ${telegramId}`);
                return ctx.reply(
                    `✅ <b>Selamat datang, Admin!</b>\n\n` +
                    `Akun kamu langsung aktif.\nKetik /start untuk mulai.`,
                    { parse_mode: 'HTML' }
                );
            }

            logger.info(`📝 New registration: ${telegramId} (@${ctx.from.username})`);
            // Notify admin
            try {
                await this.bot.telegram.sendMessage(
                    this.adminId,
                    `👤 <b>Registrasi Baru!</b>\n` +
                    `Nama: <b>${ctx.from.first_name}</b>\n` +
                    `Username: @${ctx.from.username || '-'}\n` +
                    `Telegram ID: <code>${telegramId}</code>\n\n` +
                    `Setujui dengan:\n<code>/approve @${ctx.from.username || telegramId}</code>`,
                    { parse_mode: 'HTML' }
                );
            } catch { /* admin might not have started the bot */ }
            return ctx.reply(
                `✅ <b>Pendaftaran berhasil!</b>\n\n` +
                `⏳ Menunggu approval admin.\n` +
                `Kamu akan mendapat notifikasi setelah disetujui.`,
                { parse_mode: 'HTML' }
            );
        });

        // ─── /whale (v13.2) ───────────────────────────────────────────────────
        this.bot.command('whale', async (ctx) => {
            const loading = await ctx.reply('🐋 <b>Menjalankan Whale Radar V13.2...</b>\n<i>Memindai 70+ saham untuk melacak akumulasi institutional.</i>', { parse_mode: 'HTML' });
            try {
                const results = await this.scanWhale.execute();
                if (results.length === 0) {
                    return ctx.reply('⏸️ Belum ada pergerakan "Whale" yang signifikan terdeteksi saat ini.');
                }

                let msg = `🐋 <b>WHALE RADAR Dashboard (v13.2)</b>\n`;
                msg += `<i>Institutional Sovereign — Smart Money Flow</i>\n\n`;
                msg += `<code>No Saham      Score  Status</code>\n`;

                results.forEach((item, idx) => {
                    const no = String(idx + 1).padStart(2, ' ');
                    const sym = item.symbol.replace('.JK', '').padEnd(10, ' ');
                    const score = item.intensity.toString().padStart(5, ' ');
                    const status = item.isAccumulating ? '🤫 QUIET ACC' : '🟢 ACTIVE';
                    msg += `<code>${no}. ${sym} ${score}  </code> ${status}\n`;
                });

                msg += `\n🤫 <b>QUIET ACC:</b> Bandar cicil beli (Low Volatility).\n`;
                msg += `🟢 <b>ACTIVE:</b> Bandar mulai kerek harga (High Intensity).\n`;
                msg += `\n👉 Gunakan <code>/analyze [Saham]</code> untuk cek Golden Pocket.\n\n🔙 Kembali: /back`;

                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                logger.error('Whale command error:', err);
                await ctx.reply('❌ Gagal melakukan scanning Whale Radar.');
            } finally {
                ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => { });
            }
        });

        // ─── /valuation (v13.0) ────────────────────────────────────────────────
        this.bot.command('valuation', async (ctx) => {
            const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
            if (!symbol) return ctx.reply('Usage: /valuation <SYMBOL.JK>\nContoh: /valuation BBCA.JK');

            const loading = await ctx.reply(`⚖️ <b>Menganalisis Nilai Intrinsik ${symbol}...</b>\n<i>Menghitung Benjamin Graham Fair Value...</i>`, { parse_mode: 'HTML' });
            try {
                const result = await this.auditIntrinsic.execute(symbol);
                if (!result) return ctx.reply(`❌ Data fundamental tidak cukup untuk menghitung valuasi ${symbol}.`);

                const marginEmoji = result.safetyMargin > 20 ? '✅' : result.safetyMargin < -5 ? '🔴' : '🟡';
                let msg = `⚖️ <b>Intrinsic Value Audit: ${symbol}</b>\n`;
                msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                msg += `💵 Harga Sekarang : <b>Rp ${result.currentPrice.toLocaleString('id-ID')}</b>\n`;
                msg += `💎 Harga Wajar (IV): <b>Rp ${result.intrinsicValue.toLocaleString('id-ID')}</b>\n`;
                msg += `${marginEmoji} Safety Margin : <b>${result.safetyMargin.toFixed(1)}%</b>\n\n`;

                msg += `📑 <b>Valuation Metrics:</b>\n`;
                msg += `• EPS (TTM): <b>${result.eps.toFixed(2)}</b>\n`;
                msg += `• Growth (g): <b>${result.growthRate}%</b>\n`;
                msg += `• Yield (Y): <b>${result.bondYield}%</b>\n\n`;

                msg += `📈 <b>Rating: ${result.rating}</b>\n`;
                if (result.rating === 'UNDERVALUED') msg += `<i>💡 Saham ini diperdagangkan jauh di bawah harga wajarnya. Potensi Margin of Safety tinggi.</i>\n`;
                else if (result.rating === 'OVERVALUED') msg += `<i>⚠️ Harga pasar sudah melampaui estimasi nilai intrinsik. Resiko tinggi.</i>\n`;
                else msg += `<i>⚖️ Harga pasar mencerminkan nilai wajar perusahaan saat ini.</i>\n`;

                msg += `\n🔙 Kembali: /back`;
                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.reply(`❌ Valuation error: ${err.message}`);
            } finally {
                ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => { });
            }
        });

        // ─── /optimize (v13.0) ────────────────────────────────────────────────
        this.bot.command('optimize', async (ctx) => {
            const userId = ctx.from.id.toString();
            const loading = await ctx.reply('⚖️ <b>Menganalisis Portfolio & Watchlist...</b>\n<i>Mencari "Alpha Swaps" untuk optimalisasi capital...</i>', { parse_mode: 'HTML' });
            try {
                const report = await this.optimizePortfolio.execute(userId);

                let msg = `⚖️ <b>Portfolio Rebalancer</b>\n`;
                msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

                msg += `📊 Portfolio Health: <b>${report.portfolioHealth}α</b>\n`;
                msg += `<i>(Skala 0-100 Alpha Score)</i>\n\n`;

                if (report.recommendations.length === 0) {
                    msg += `✅ <b>Portfolio Teroptimal.</b>\nTidak ditemukan peluang swap yang signifikan atau portfolio sudah berisi aset high-conviction.`;
                } else {
                    msg += `🚀 <b>REKOMENDASI SWAP (${report.recommendations.length}):</b>\n\n`;
                    report.recommendations.forEach(r => {
                        msg += `🔄 <b>SELL</b> ${r.currentSymbol} (${r.currentAlpha}α)\n`;
                        msg += `➡️ <b>BUY</b>  ${r.recommendedSymbol} (${r.recommendedAlpha}α)\n`;
                        msg += `💡 <i>${r.reason}</i>\n\n`;
                    });
                    msg += `⚠️ <i>Gunakan /analyze pada target sebelum eksekusi.</i>\n`;
                }

                msg += `\n🔙 Kembali: /back`;
                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                logger.error('Optimize command error:', err);
                await ctx.reply('❌ Gagal melakukan optimasi portfolio.');
            } finally {
                ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => { });
            }
        });

        // ─── /approve (admin only) ─────────────────────────────────────────────
        this.bot.command('approve', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            if (!this.isAdmin(telegramId)) return ctx.reply('🚫 Hanya admin yang bisa menggunakan command ini.');
            const arg = ctx.message.text.split(' ')[1];
            if (!arg) return ctx.reply(
                'Usage: /approve @username\nAtau: /approve 123456789\nContoh: /approve @SotoKarii'
            );

            // Resolve target: numeric ID → findByTelegramId, otherwise → findByUsername
            let target = /^\d+$/.test(arg)
                ? await this.userRepo.findByTelegramId(arg)
                : await this.userRepo.findByUsername(arg);

            if (!target) return ctx.reply(
                `❌ User <code>${arg}</code> tidak ditemukan.\n` +
                `Gunakan /users untuk lihat daftar user.`,
                { parse_mode: 'HTML' }
            );
            await this.userRepo.approve(target.telegramId);
            await ctx.reply(
                `✅ User <b>${target.firstName}</b> (@${target.username || '-'}) telah disetujui.`,
                { parse_mode: 'HTML' }
            );
            try {
                await this.bot.telegram.sendMessage(
                    target.telegramId,
                    `🎉 <b>Akses Disetujui!</b>\n\n` +
                    `Selamat, akun kamu di Ultimate Bagger Bot telah aktif.\n` +
                    `Ketik /start untuk mulai.`,
                    { parse_mode: 'HTML' }
                );
            } catch { /* user may not have started the bot */ }
        });

        // ─── /block (admin only) ───────────────────────────────────────────────
        this.bot.command('block', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            if (!this.isAdmin(telegramId)) return ctx.reply('🚫 Hanya admin.');
            const targetId = ctx.message.text.split(' ')[1];
            if (!targetId) return ctx.reply('Usage: /block [telegramId]');
            await this.userRepo.block(targetId);
            await ctx.reply(`🚫 User ${targetId} telah diblokir.`);
        });

        // ─── /users (admin only) ───────────────────────────────────────────────
        this.bot.command('users', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            if (!this.isAdmin(telegramId)) return ctx.reply('🚫 Hanya admin.');
            try {
                const users = await this.userRepo.findAll();
                if (users.length === 0) return ctx.reply('📭 Belum ada user terdaftar.');
                let msg = `👥 <b>Daftar User (${users.length})</b>\n\n`;
                users.forEach((u, i) => {
                    const emoji = u.status === 'APPROVED' ? '✅' : u.status === 'PENDING' ? '⏳' : '🚫';
                    msg += `${i + 1}. ${emoji} <b>${u.firstName}</b> (@${u.username || '-'})\n`;
                    msg += `   ID: <code>${u.telegramId}</code> | Modal: Rp ${u.capital.toLocaleString('id-ID')}\n\n`;
                });
                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) { await ctx.reply(`❌ Error: ${err.message}`); }
        });

        // ─── /myprofile ────────────────────────────────────────────────────────
        this.bot.command('myprofile', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            const user = await this.userRepo.findByTelegramId(telegramId);
            if (!user) return ctx.reply('❌ Profil tidak ditemukan.');
            const statusMap = { PENDING: '⏳ Pending', APPROVED: '✅ Aktif', BLOCKED: '🚫 Diblokir' };
            const tickers = await this.tickerRepo.findAll(telegramId);
            await ctx.reply(
                `👤 <b>Profil Kamu</b>\n\n` +
                `Nama: <b>${user.firstName}</b> (@${user.username || '-'})\n` +
                `Status: ${statusMap[user.status]}\n` +
                `Modal: <b>Rp ${user.capital.toLocaleString('id-ID')}</b>\n` +
                `Watchlist: <b>${tickers.length} saham</b>\n` +
                `Bergabung: ${new Date(user.registeredAt).toLocaleDateString('id-ID')}\n\n` +
                `Ubah modal: <code>/setcapital [NOMINAL]</code>\n` +
                `Contoh: <code>/setcapital 15000000</code>\n\n` +
                `🔙 Kembali: /back`,
                { parse_mode: 'HTML' }
            );
        });

        // ─── /setcapital ───────────────────────────────────────────────────────
        this.bot.command('setcapital', async (ctx) => {
            const telegramId = ctx.from.id.toString();
            const amountStr = ctx.message.text.split(' ')[1];
            const amount = parseInt(amountStr);
            if (!amountStr || isNaN(amount) || amount < 100_000) {
                return ctx.reply('Usage: /setcapital [NOMINAL]\nMinimum Rp 100.000\nContoh: /setcapital 15000000');
            }
            await this.userRepo.setCapital(telegramId, amount);
            await ctx.reply(
                `✅ Modal diperbarui: <b>Rp ${amount.toLocaleString('id-ID')}</b>\n\n🔙 Kembali: /back`,
                { parse_mode: 'HTML' }
            );
        });

        // ─── /help ────────────────────────────────────────────────────────────
        this.bot.command('help', (ctx) => ctx.reply(
            '📖 <b>PANDUAN ULTIMATE BAGGER BOT — Sovereign Sentinel</b>\n\n' +
            'Bot ini adalah asisten kuantitatif institusional yang bekerja secara proaktif untuk menjaga dan mencari peluang di pasar IDX.\n\n' +
            '🏛️ <b>SOVEREIGN ALPHA SCORE (α) GUIDE</b>\n' +
            'Alpha Score adalah metrik tunggal kecerdasan bot (0-100):\n' +
            '• <b>70-100 💎 DIAMOND</b>: High Conviction. Agresif BUY pada pantulan.\n' +
            '• <b>50-69 🛡️ SHIELD</b>: Quality Asset. Selective BUY di Golden Pocket.\n' +
            '• <b>30-49 ⚪ NEUTRAL</b>: Wait & See. Monitor konfirmasi volume.\n' +
            '• <b>&lt; 30 ⚠️ WARNING</b>: Systemic Risk. Hindari/Exit segera.\n\n' +
            '🔍 <b>TRIPLE CHECK CONFLUENCE:</b>\n' +
            '1. <b>Whale Context</b>: Harga wajib dekat VWAP/POC.\n' +
            '2. <b>Golden Pocket</b>: Retrace sehat ke area Fib 0.5 - 0.618.\n' +
            '3. <b>Broker Summary</b>: Wajib ACCUM atau BIG ACCUM.\n\n' +
            '🛡️ <b>SOVEREIGN SENTINEL (Anomaly Detection)</b>\n' +
            'Penjaga otomatis yang memantau watchlist Anda setiap 30 menit:\n' +
            '• <b>Volume Spike</b>: Notifikasi jika volume > 1.5x rata-rata 1 bulan.\n' +
            '• <b>Price Jump</b>: Notifikasi jika harga melonjak/anjlok > 5%.\n' +
            '• <b>Trend Deviation</b>: Notifikasi jika harga melenceng > 3% dari MA-5.\n\n' +
            '📡 <b>PENCARIAN PELUANG (DISCOVERY)</b>\n' +
            '• <code>/scan</code> — Scan Top Active IDX & Ranking Alpha.\n' +
            '• <code>/whale</code> — 🐋 Whale Radar. Lacak akumulasi institutional.\n' +
            '• <code>/hot</code> — ⚡ Fast Money. Deteksi lonjakan volume instan.\n' +
            '• <code>/sector</code> — 🧭 Market Heatmap. Analisis rotasi sektor.\n\n' +
            '🔬 <b>ANALISIS MENDALAM (ANALYSIS)</b>\n' +
            '• <code>/analyze [SYM]</code> — <b>Audit 360°.</b> Teknikal, Fundamental, & S/R.\n' +
            '• <code>/risk</code> — Audit korelasi & risiko sistemik portofolio.\n' +
            '• <code>/valuation [SYM]</code> — Audit nilai wajar (Graham Formula).\n\n' +
            '📂 <b>MANAJEMEN PORTFOLIO</b>\n' +
            '• <code>/portfolio</code> — Pantau P/L & Metrik Risk (Monte Carlo).\n' +
            '• <code>/optimize</code> — ⚖️ Rebalancer. Saran "Alpha Swaps".\n\n' +
            '🔙 Kembali: /back',
            { parse_mode: 'HTML' }
        ));

        // ─── /hot ─────────────────────────────────────────────────────────────
        this.bot.command('hot', async (ctx) => {
            const loading = await ctx.reply('🔥 Mencari saham dengan Volume Breakout (Fast Money)...');
            try {
                const hotItems = await this.calculateHotlist.execute();
                if (hotItems.length === 0) {
                    return ctx.reply('⏸️ Belum ada lonjakan volume yang signifikan saat ini.');
                }

                let msg = `🔥 <b>INSTANT HOTLIST (Volume Surge)</b>\n`;
                msg += `<i>Mencari "Fast Money" & Akumulasi Institusi</i>\n\n`;
                msg += `<code>No Saham      VolSurge  Trend</code>\n`;

                hotItems.forEach((item, idx) => {
                    const no = String(idx + 1).padStart(2, ' ');
                    const sym = item.symbol.replace('.JK', '').padEnd(10, ' ');
                    const surge = item.volumeSurge.toFixed(1).padStart(5, ' ') + 'x';
                    const trend = item.momentum === 'UP' ? '📈' : item.momentum === 'DOWN' ? '📉' : '↔️';
                    msg += `<code>${no}. ${sym} ${surge}   </code> ${trend}\n`;
                    if (item.patterns.length > 0) {
                        msg += `   └ ✨ <i>${item.patterns.join(', ')}</i>\n`;
                    }
                });

                msg += `\n👉 Gunakan <code>/analyze [Saham]</code> untuk cek validasi Ichimoku.\n\n🔙 Kembali: /back`;
                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                logger.error('Hot command error:', err);
                await ctx.reply('❌ Gagal mengambil data hotlist.');
            } finally {
                ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => { });
            }
        });

        // ─── /smart ────────────────────────────────────────────────────────────
        this.bot.command('smart', async (ctx) => {
            const loading = await ctx.reply('🔍 Memindai Akumulasi Smart Money & Quiet Buying...');
            try {
                const results = await this.trackSmartMoney.execute();
                if (results.length === 0) {
                    return ctx.reply('⏸️ Belum mendeteksi pola akumulasi Smart Money yang signifikan saat ini.');
                }

                let msg = `🏛️ <b>SMART MONEY TRACKER</b>\n`;
                msg += `<i>Mendeteksi Akumulasi & Intensitas Beli Institusi</i>\n\n`;
                msg += `<code>No Saham      Score  Status</code>\n`;

                results.forEach((item, idx) => {
                    const no = String(idx + 1).padStart(2, ' ');
                    const sym = item.symbol.replace('.JK', '').padEnd(10, ' ');
                    const score = item.intensity.toString().padStart(5, ' ');
                    const status = item.isAccumulating ? '🤫 QUIET' : '🔥 ACTIVE';
                    msg += `<code>${no}. ${sym} ${score}  </code> ${status}\n`;
                });

                msg += `\n🤫 <b>QUIET:</b> Volume melonjak tapi harga belum breakout (Akumulasi).\n`;
                msg += `🔥 <b>ACTIVE:</b> Tekanan beli institusi sangat kuat.\n`;
                msg += `\n👉 Gunakan <code>/analyze [Saham]</code> untuk detail chart Ichimoku.\n\n🔙 Kembali: /back`;

                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                logger.error('Smart command error:', err);
                await ctx.reply('❌ Gagal mengambil data smart money.');
            } finally {
                ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => { });
            }
        });

        // ─── /signals — Strict Actionable Signals ────────────────────────────
        this.bot.command('signals', async (ctx) => {
            const statusMsg = await ctx.reply('📡 <b>Sinyal Trading (Low Noise Mode)</b>\n⏳ Mencari entry valid di Top Active IDX...', { parse_mode: 'HTML' });
            try {
                const report = await this.scanner.execute();
                const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });
                const regimeEmoji = report.regime === 'BULL' ? '🟢' : report.regime === 'BEAR' ? '🔴' : '🟡';

                const buySignals = report.buySignals;
                const sellSignals = report.sellSignals;

                let msg = `🎯 <b>Sinyal Trading Terverifikasi</b>  ${regimeEmoji} ${report.regime}\n`;
                msg += `🕒 ${now}  |  Dianalisis: <b>${report.totalScanned} saham</b>\n`;
                msg += `────────────────────────────\n\n`;

                if (buySignals.length === 0 && sellSignals.length === 0) {
                    msg += `⏸️ <b>Tidak ada sinyal beli/jual valid saat ini.</b>\n<i>Strategi sedang menunggu konfirmasi harga & likuiditas.</i>\n\n`;
                }

                if (buySignals.length > 0) {
                    msg += `✅ <b>SINYAL BELI (${buySignals.length})</b>\n`;
                    buySignals.forEach(s => {
                        const sym = s.symbol.replace('.JK', '');
                        msg += `🚀 <code>${sym.padEnd(6)}</code> Rp ${s.price.toLocaleString('id-ID')}\n`;
                        msg += `   └ Konf: ${(s.confidence ?? 0).toFixed(0)}% | Lot: ${s.lots}\n`;
                    });
                    msg += '\n';
                }

                if (sellSignals.length > 0) {
                    msg += `🔴 <b>SINYAL JUAL (${sellSignals.length})</b>\n`;
                    sellSignals.forEach(s => {
                        const sym = s.symbol.replace('.JK', '');
                        msg += `📉 <code>${sym.padEnd(6)}</code> Rp ${s.price.toLocaleString('id-ID')}\n`;
                        msg += `   └ Alasan: ${s.reason}\n`;
                    });
                    msg += '\n';
                }

                msg += `👉 /scan — Lihat seluruh peringkat pasar & eksekusi\n\n🔙 Kembali: /back`;

                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ Error: ${err.message}`, { parse_mode: 'HTML' });
            }
        });


        // ─── /scan ────────────────────────────────────────────────────────────
        this.bot.command('scan', async (ctx) => {
            await ctx.reply('🔎 <b>Menjalankan Market Scanner</b>\n⏳ Menganalisis Top 20 saham IDX paling aktif saat ini secara dinamis.', { parse_mode: 'HTML' });
            try {
                const report = await this.scanner.execute();

                const regimeEmoji = report.regime === 'BULL' ? '🟢' : report.regime === 'BEAR' ? '🔴' : '🟡';
                const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' });

                // Raw signal counts from ranked items (pre-filter)
                const rawBuyItems = report.rankedItems.filter(r => r.signal === 'BUY');
                const rawSellItems = report.rankedItems.filter(r => r.signal === 'SELL');
                const actionableBuy = report.buySignals.length;   // passed all filters
                const actionableSell = report.sellSignals.length;

                // ── Message 1: Header + Summary ──
                let header = `🏛️ <b>Peringkat Pasar IDX (Alpha Ranking)</b>\n`;
                header += `${regimeEmoji} Regime IHSG: <b>${report.regime}</b> | 🕒 ${now}\n`;
                header += `📋 Dianalisis: <b>${report.totalScanned} saham</b>\n`;

                const breadthEmoji = report.marketBreadth >= 60 ? '🌿' : report.marketBreadth >= 40 ? '🍂' : '❄️';
                header += `📈 Breadth: <b>${report.marketBreadth}%</b> Assets > SMA-50 ${breadthEmoji}\n\n`;

                header += `📈 Sinyal Terdeteksi:\n`;
                header += `  🟢 BUY: <b>${rawBuyItems.length}</b>`;
                if (rawBuyItems.length > actionableBuy) {
                    header += ` (${actionableBuy} lolos filter)`;
                }
                header += `\n  📈 SELL: <b>${rawSellItems.length}</b>`;
                header += `\n  ⏸️ HOLD: <b>${report.totalScanned - rawBuyItems.length - rawSellItems.length}</b>\n`;

                if (report.elitePicks.length > 0) {
                    header += `\n💎 <b>ELITE PICKS (Alpha Dominance)</b>\n`;
                    report.elitePicks.forEach((p, idx) => {
                        header += `${idx + 1}. <b>${p.symbol}</b> (α: ${p.alphaScore}) - ${p.sector || '?'}\n`;
                    });
                }

                await ctx.reply(header, { parse_mode: 'HTML' });

                // ── Message 2: Full Ranked Table ──
                if (report.rankedItems.length > 0) {
                    const chunkSize = 10;
                    for (let i = 0; i < report.rankedItems.length; i += chunkSize) {
                        const chunk = report.rankedItems.slice(i, i + chunkSize);

                        let rankMsg = i === 0
                            ? `🏆 <b>Ranking Alpha (${report.rankedItems.length} saham)</b>\n<code>No Saham      Sig  ADX  α (Alpha) Harga</code>\n`
                            : `<code>No Saham      Sig  ADX  α (Alpha) Harga</code>\n`;

                        chunk.forEach((item, idx) => {
                            const no = String(i + idx + 1).padStart(2, ' ');
                            const sym = item.symbol.replace('.JK', '').padEnd(10, ' ');
                            const sigLabel = item.signal === 'BUY' ? 'B' : item.signal === 'SELL' ? 'S' : '-';
                            const adx = item.adx.toFixed(0).padStart(3, ' ');
                            const alpha = item.alphaScore.toString().padStart(5, ' ');
                            const price = item.price > 0 ? `Rp${item.price.toFixed(0)}` : '-';
                            const dbTag = item.inDb ? '📌' : '';
                            rankMsg += `<code>${no}. ${sym} ${sigLabel}  ${adx}  ${alpha}  </code> ${price}${dbTag}\n`;
                        });

                        if (i === 0) {
                            rankMsg += `\n<i>📌 = watchlist DB | BUY = sinyal masuk | SELL = sinyal keluar</i>`;
                        }

                        await ctx.reply(rankMsg, { parse_mode: 'HTML' });
                    }
                }

                // ── Message 3a: Actionable BUY signals (passed all filters) ──
                if (actionableBuy > 0) {
                    for (const s of report.buySignals) {
                        const buyMsg =
                            `🚀 <b>SINYAL BUY AKTIF: ${s.symbol}</b>\n` +
                            `💰 Harga: <b>Rp ${s.price.toFixed(0)}</b>\n` +
                            `🎯 Confidence: <b>${s.confidence?.toFixed(1)}%</b>\n` +
                            `📝 Alasan: ${s.reason}\n` +
                            (s.lots ? `📦 Rekomendasi: <b>${s.lots} lot</b>\n` : '') +
                            `\n⚡ Konfirmasi trading:`;

                        await ctx.reply(buyMsg, {
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: `✅ BELI ${s.symbol}`, callback_data: `trade_buy_${s.symbol}_${s.price}_${s.lots || 1}` },
                                    { text: '❌ Abaikan', callback_data: `trade_ignore_${s.symbol}` }
                                ]]
                            }
                        });
                    }
                }

                // ── Message 3b: Actionable SELL signals ──
                if (actionableSell > 0) {
                    for (const s of report.sellSignals) {
                        const sellMsg =
                            `🔴 <b>SINYAL JUAL AKTIF: ${s.symbol}</b>\n` +
                            `💰 Harga: <b>Rp ${s.price.toFixed(0)}</b>\n` +
                            `🎯 Confidence: <b>${s.confidence?.toFixed(1)}%</b>\n` +
                            `📝 Alasan: ${s.reason}\n\n` +
                            `⚡ Konfirmasi:`;
                        await ctx.reply(sellMsg, {
                            parse_mode: 'HTML',
                            reply_markup: {
                                inline_keyboard: [[
                                    { text: `🔴 JUAL ${s.symbol}`, callback_data: `trade_sell_${s.symbol}_${s.price}` },
                                    { text: '⏩ Tahan Dulu', callback_data: `trade_ignore_${s.symbol}` }
                                ]]
                            }
                        });
                    }
                }

                // ── Message 3c: Detected BUY that got filtered (informational) ──
                const filteredBuys = rawBuyItems.filter(r => !report.buySignals.find(s => s.symbol === r.symbol));
                if (filteredBuys.length > 0) {
                    let filtMsg = `⚠️ <b>Sinyal BUY Terdeteksi tapi Terfilter:</b>\n\n`;
                    filteredBuys.forEach(item => {
                        filtMsg += `📌 <b>${item.symbol}</b> — Score: ${item.score.toFixed(2)}, Harga: Rp ${item.price.toFixed(0)}\n`;
                        filtMsg += `   ↳ Ditolak karena: confidence rendah (&lt;60%) atau bukan Top-3 ranking\n`;
                        filtMsg += `   ↳ Gunakan /analyze ${item.symbol} untuk detail\n\n`;
                    });
                    filtMsg += `<i>💡 Filter ini melindungi modal dari sinyal berkualitas rendah.</i>\n\n🔙 Kembali: /back`;
                    await ctx.reply(filtMsg, { parse_mode: 'HTML' });
                }

                // ── Message 3c: No signals at all ──
                if (rawBuyItems.length === 0 && rawSellItems.length === 0) {
                    const noSig =
                        `⏸️ <b>Tidak ada sinyal BUY/SELL hari ini</b>\n\n` +
                        `📌 <i>Kondisi normal dalam market ${report.regime}.</i>\n` +
                        `Ichimoku membutuhkan:\n` +
                        `• Price cross di atas Tenkan-Sen\n` +
                        `• Harga di atas Awan (Kumo)\n` +
                        `• Volume &gt; 1.2× rata-rata\n\n` +
                        `💡 Pasar IDX buka <b>Senin–Jumat 09:00–15:45 WIB</b>.\n` +
                        `🔄 Scan otomatis tiap hari pkl 15:45 WIB.\n\n🔙 Kembali: /back`;
                    await ctx.reply(noSig, { parse_mode: 'HTML' });
                }

            } catch (err: any) {
                await ctx.reply(`❌ Scanner error: ${err.message}`);
            }
        });

        // ─── /quote (REAL-TIME) ────────────────────────────────────────────────
        this.bot.command('quote', async (ctx) => {
            const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
            if (!symbol) return ctx.reply('Usage: /quote <SYMBOL.JK>\nContoh: /quote BBCA.JK');

            await ctx.reply(`📡 Mengambil data real-time ${symbol}...`);

            try {
                const provider = this.marketData as YahooFinanceProvider;
                const quote = await provider.fetchRealTimeQuote(symbol);

                if (!quote) return ctx.reply(`❌ Tidak ada data untuk ${symbol}. Cek simbol dengan /search`);

                const changeEmoji = quote.changePercent >= 0 ? '🟢' : '🔴';
                const changSign = quote.changePercent >= 0 ? '+' : '';
                const mcap = quote.marketCap > 1e12
                    ? `${(quote.marketCap / 1e12).toFixed(2)}T`
                    : quote.marketCap > 1e9
                        ? `${(quote.marketCap / 1e9).toFixed(2)}B`
                        : `${(quote.marketCap / 1e6).toFixed(0)}M`;

                const msg = `📊 <b>${quote.name}</b> (<code>${symbol}</code>)\n\n` +
                    `${changeEmoji} <b>Harga: Rp ${quote.price.toFixed(0)}</b>\n` +
                    `📈 Change: <b>${changSign}${quote.changePercent.toFixed(2)}%</b>\n\n` +
                    `🔓 Open: Rp ${quote.open.toFixed(0)}\n` +
                    `⬆️ High: Rp ${quote.high.toFixed(0)}\n` +
                    `⬇️ Low: Rp ${quote.low.toFixed(0)}\n` +
                    `📉 Prev Close: Rp ${quote.previousClose.toFixed(0)}\n\n` +
                    `📦 Volume: ${quote.volume.toLocaleString('id-ID')}\n` +
                    `🏢 Market Cap: Rp ${mcap}\n\n` +
                    `⏰ Data dari Yahoo Finance (real-time)\n\n🔙 Kembali: /back`;

                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.reply(`❌ Gagal mengambil data: ${err.message}`);
            }
        });

        // ─── /search ────────────────────────────────────────────────────────
        this.bot.command('search', async (ctx) => {
            const query = ctx.message.text.split(' ').slice(1).join(' ');
            if (!query) return ctx.reply('Usage: /search <keyword>\nContoh: /search Bank Central Asia');

            await ctx.reply(`🔍 Mencari "${query}" di Yahoo Finance...`);

            try {
                const provider = this.marketData as YahooFinanceProvider;
                const results = await provider.searchSymbol(query);

                if (!results || results.length === 0) {
                    return ctx.reply(`❌ Tidak ditemukan hasil untuk "${query}"`);
                }

                let msg = `🔍 <b>Hasil Pencarian: "${query}"</b>\n\n`;
                results.forEach((r, i) => {
                    msg += `${i + 1}. <code>${r.symbol}</code> — ${r.name}\n   Exchange: ${r.exchange}\n\n`;
                });
                msg += `\n💡 Gunakan simbol di atas untuk:\n/quote SYMBOL | /analyze SYMBOL\n\n🔙 Kembali: /back`;

                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.reply(`❌ Pencarian gagal: ${err.message}`);
            }
        });

        // ─── /analyze ────────────────────────────────────────────────────────
        this.bot.command('analyze', async (ctx) => {
            const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
            if (!symbol) return ctx.reply('Usage: /analyze <SYMBOL.JK>\nContoh: /analyze BBCA.JK');

            await ctx.reply(`🔍 Menganalisis ${symbol} dengan data real-time...\n⏳ Mohon tunggu...`);

            try {
                const signal = await this.manualAnalysis.execute(symbol);

                if (!signal) return ctx.reply(`❌ Analisis gagal. Pastikan simbol valid (gunakan /search untuk mencari).`);

                const rtData = (signal as any).realTimeData;
                const b = signal.breakdown;
                const signalEmoji = signal.type === 'BUY' ? '🚀' : signal.type === 'SELL' ? '🔥' : '⏸️';
                const inDB = !!(await this.tickerRepo.findBySymbol(symbol));

                let msg = `${signalEmoji} <b>Analisis Institusional: ${symbol}</b>\n`;
                if (rtData?.name && rtData.name !== symbol) {
                    msg += `<i>${rtData.name}</i>\n`;
                }

                if (rtData?.alphaScore) {
                    const alpha = rtData.alphaScore;
                    const alphaEmoji = alpha >= 70 ? '💎' : alpha >= 50 ? '🛡️' : alpha >= 30 ? '⚪' : '⚠️';
                    msg += `🏛️ <b>Prime Alpha Score: ${alphaEmoji} ${alpha}/100</b>\n`;
                }
                msg += `\n`;

                if (rtData) {
                    const changeEmoji = parseFloat(rtData.changePercent) >= 0 ? '🟢' : '🔴';
                    msg += `💰 <b>Harga: Rp ${rtData.currentPrice.toLocaleString('id-ID')}</b> (${changeEmoji} ${rtData.changePercent}%)\n`;
                    msg += `⚡ <b>Trend Strength (ADX): ${rtData.adx}</b>\n`;
                    if (rtData.patterns && rtData.patterns.length > 0) {
                        msg += `✨ <b>Pola Candle: ${rtData.patterns.join(', ')}</b>\n`;
                    }

                    const intensity = parseInt(rtData.smartMoney?.intensity || '0');
                    const intensityEmoji = intensity > 40 ? '🏛️' : intensity > 0 ? '🟢' : intensity < -40 ? '🐋' : '⚪';
                    msg += `${intensityEmoji} <b>Smart Money Intensity: ${intensity}</b> ${rtData.smartMoney?.isAccumulating ? '(Akumulasi 🤫)' : ''}\n`;

                    // Broker Summary Injection (v13.2)
                    const brosum = rtData.brokerSummary || 'NEUTRAL';
                    const brosumEmoji = brosum.includes('ACCUM') ? '🟢' : brosum.includes('DIST') ? '🔴' : '⚪';
                    msg += `${brosumEmoji} <b>Broker Summary: ${brosum}</b>\n`;

                    msg += `\n🏛️ <b>Sektor: ${rtData.financials.sector}</b>\n`;
                    msg += `📁 Industri: ${rtData.financials.industry}\n\n`;

                    // Market Cap Formatting
                    const mcap = rtData.financials.marketCap;
                    const mcapStr = mcap > 1e12
                        ? `Rp ${(mcap / 1e12).toFixed(2)}T`
                        : mcap > 1e9
                            ? `Rp ${(mcap / 1e9).toFixed(2)}B`
                            : mcap > 0
                                ? `Rp ${(mcap / 1e6).toFixed(0)}M`
                                : '-';

                    const divYield = rtData.financials.dividendYield
                        ? `${(rtData.financials.dividendYield * 100).toFixed(2)}%`
                        : '-';

                    msg += `📊 <b>Financial Health:</b>\n`;
                    msg += `<code>`;
                    msg += `• P/E Ratio    : ${rtData.financials.pe}\n`;
                    msg += `• P/B Ratio    : ${rtData.financials.pb}\n`;
                    msg += `• EPS          : ${rtData.financials.eps}\n`;
                    msg += `• Market Cap   : ${mcapStr}\n`;
                    msg += `• Dividend     : ${divYield}\n`;
                    if (rtData.financials.bookValue > 0) {
                        msg += `• Book Value   : Rp ${rtData.financials.bookValue.toLocaleString('id-ID')}\n`;
                    }
                    msg += `</code>\n`;

                    // Fundamental Audit Injection (v15.2)
                    const audit = await this.auditFundamental.execute(symbol);
                    if (audit) {
                        const auditEmoji = audit.rating.startsWith('A') ? '🟢' : audit.rating === 'B' ? '🟡' : '🔴';
                        msg += `🏛️ <b>Fundamental: ${auditEmoji} ${audit.rating}</b>`;
                        msg += ` (F-Score: <b>${audit.fScore}/9</b>`;
                        msg += ` | Z-Score: <b>${audit.zScore > 0 ? audit.zScore.toFixed(1) : 'N/A'}</b>)\n`;
                    }

                    // Sentiment Injection (v18)
                    const sentiment = await this.analyzeSentiment.execute(symbol);
                    if (sentiment) {
                        const sentEmoji = sentiment.compositeScore >= 20 ? '🟢' : sentiment.compositeScore <= -20 ? '🔴' : '⚪';
                        msg += `🧠 <b>Sentiment: ${sentEmoji} ${sentiment.compositeLabel.replace('_', ' ')}</b> (${sentiment.compositeScore > 0 ? '+' : ''}${sentiment.compositeScore})\n`;
                    }
                    msg += `\n`;
                }

                msg += `📡 <b>Sinyal V13.2 Sovereign: ${signal.type}</b>\n`;
                msg += `📝 Alasan: ${signal.reason}\n`;
                if (signal.confidence) {
                    msg += `🎯 Confidence: <b>${signal.confidence.total.toFixed(1)}%</b>\n`;
                }
                msg += `\n`;

                // V13 Institutional Logic Injection
                if (rtData) {
                    msg += `🐋 <b>Whale Context (V13.2):</b>\n`;
                    msg += `<code>• VWAP (20d)  : Rp ${rtData.vwap?.toLocaleString('id-ID') || '-'}\n`;
                    msg += `• POC (50d)   : Rp ${rtData.poc?.toLocaleString('id-ID') || '-'}\n`;
                    const vcpStatus = rtData.isVCP ? '✅ DETECTED' : '❌ No';
                    msg += `• VCP Pattern : ${vcpStatus}</code>\n\n`;
                }

                if (b) {
                    msg += `<b>📐 Ichimoku Breakdown:</b>\n`;
                    msg += `- Di atas Awan: ${b.isAboveCloud ? '✅ Ya' : '❌ Tidak'}\n`;
                    msg += `- Cross Sinyal: ${b.isCrossed ? '✅ Ya' : '❌ Tidak'}\n`;
                    msg += `- Volume Breakout: ${b.isVolumeBreakout ? '✅ Ya' : '❌ Tidak'}\n\n`;
                }

                // Trading Levels (v13 IPA institutional Logic)
                if (rtData?.tradingLevels) {
                    const lv = rtData.tradingLevels;
                    msg += `🎯 <b>Institutional Levels (v13 IPA):</b>\n`;
                    msg += `<code>`;
                    msg += `📍 Entry   : Rp ${lv.entry.toLocaleString('id-ID')}\n`;
                    msg += `🛑 StopLoss: Rp ${lv.sl.toLocaleString('id-ID')} (-${lv.riskPercent}%)\n`;
                    msg += `✅ TP1 (R1): Rp ${lv.tp1.toLocaleString('id-ID')}\n`;
                    msg += `✅ TP2 (R2): Rp ${lv.tp2.toLocaleString('id-ID')}\n`;
                    msg += `💎 TP3 (Fib): Rp ${lv.tp3.toLocaleString('id-ID')}\n`;
                    msg += `</code>\n`;
                    
                    if (lv.fibLevels) {
                        msg += `📏 <b>Fibonacci Retracement:</b>\n`;
                        msg += `<code>• 0.500: Rp ${Math.round(lv.fibLevels['0.5']).toLocaleString('id-ID')}\n`;
                        msg += `• 0.618: Rp ${Math.round(lv.fibLevels['0.618']).toLocaleString('id-ID')} (Golden)</code>\n`;
                    }
                    msg += `\n💡 <i>Tips: Entry terbaik di Golden Pocket (0.5-0.618). SL diletakkan di bawah Support Pivot terdekat.</i>\n\n`;
                } else if (b) {
                    msg += `<b>📏 Level Kunci:</b>\n`;
                    msg += `- Kijun-Sen: Rp ${b.kijunLevel.toFixed(0)}\n`;
                    msg += `- Tenkan-Sen: Rp ${b.tenkanLevel.toFixed(0)}\n`;
                    msg += `- Trailing Stop: Rp ${b.stopLoss.toFixed(0)}\n\n`;
                }

                if (rtData) msg += `📊 Data: ${rtData.dataPoints} candle (Yahoo Finance)\n`;
                if (!inDB) msg += `\n💡 Tambahkan ke watchlist: /add ${symbol}`;
                msg += `\n\n🔙 Kembali: /back`;

                if (signal.type === 'BUY') {
                    await ctx.reply(msg, {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback(`✅ Beli ${symbol}`, `trade_buy_${symbol}_${signal.price}_1`),
                            Markup.button.callback(`❌ Abaikan`, `trade_ignore_${symbol}`)]
                        ])
                    });
                } else {
                    await ctx.reply(msg, { parse_mode: 'HTML' });
                }
            } catch (err: any) {
                await ctx.reply(`❌ Error analisis: ${err.message}`);
            }
        });

        // ─── /sector ──────────────────────────────────────────────────────────
        this.bot.command('sector', async (ctx) => {
            const loading = await ctx.reply('🔍 Menganalisis Rotasi Sektor & Heatmap Pasar...');
            try {
                const results = await this.analyzeSector.execute();
                if (results.length === 0) {
                    return ctx.reply('⏸️ Belum dapat menganalisis data sektoral saat ini.');
                }

                let msg = `🧭 <b>SECTOR WISDOM (Market Heatmap)</b>\n`;
                msg += `<i>Mencari Sektor Leading & Arus Uang Pintar</i>\n\n`;
                msg += `<code>Heat  Sector         Trend  TopPick</code>\n`;

                results.forEach((s) => {
                    const heat = s.heatScore.toString().padStart(3, ' ');
                    const name = s.name.substring(0, 14).padEnd(14, ' ');
                    const trend = s.momentum === 'BULLISH' ? '📈' : s.momentum === 'BEARISH' ? '📉' : '↔️';
                    const pick = s.topConstituent.padEnd(7, ' ');
                    msg += `<code>${heat}   ${name} </code> ${trend}   <code>${pick}</code>\n`;
                });

                msg += `\n🔥 <b>Strategi:</b> Fokus pada saham di sektor <b>BULLISH</b> dengan skor Heat > 65.\n`;
                msg += `\n👉 Gunakan <code>/analyze [TopPick]</code> untuk validasi entry.\n\n🔙 Kembali: /back`;

                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                logger.error('Sector command error:', err);
                await ctx.reply('❌ Gagal melakukan analisis rotasi sektor.');
            } finally {
                ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => { });
            }
        });

        // ─── /breadth ─────────────────────────────────────────────────────────
        this.bot.command('breadth', async (ctx) => {
            const loading = await ctx.reply('📈 Menganalisis Market Breadth (Internal Health)...');
            try {
                const report = await this.scanner.execute();
                const breadth = report.marketBreadth;
                const emoji = breadth >= 60 ? '🌿 BULLISH (Healthy)' : breadth >= 40 ? '🍂 NEUTRAL (Fragile)' : '❄️ BEARISH (Exhausted)';

                let msg = `📈 <b>MARKET BREADTH REPORT</b>\n`;
                msg += `<i>Mendeteksi Kesehatan Ekosistem Pasar IDX</i>\n\n`;
                msg += `📊 Kondisi: <b>${emoji}</b>\n`;
                msg += `📉 Assets > SMA-50: <b>${breadth}%</b>\n\n`;

                if (breadth >= 60) {
                    msg += `✅ <b>Aksi:</b> Dominasi pembeli sangat kuat. Peluang Profit tinggi di banyak sektor.\n`;
                } else if (breadth >= 40) {
                    msg += `⚠️ <b>Aksi:</b> Pasar terfragmentasi. Hanya beberapa sektor yang kuat. Pilih-pilih saham (Selective).\n`;
                } else {
                    msg += `🚫 <b>Aksi:</b> Market Internal sangat lemah. Rally mungkin hanya didorong segelintir saham besar. Disarankan <i>Wait & See</i>.\n`;
                }

                msg += `\n🕒 Scanned: ${report.totalScanned} Assets\n\n🔙 Kembali: /back`;
                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                logger.error('Breadth command error:', err);
                await ctx.reply('❌ Gagal melakukan analisis market breadth.');
            } finally {
                ctx.telegram.deleteMessage(ctx.chat.id, loading.message_id).catch(() => { });
            }
        });

        // ─── /backtest ────────────────────────────────────────────────────────
        this.bot.command('backtest', async (ctx) => {
            const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
            if (!symbol) return ctx.reply('Usage: /backtest <SYMBOL.JK>\nContoh: /backtest BBCA.JK');

            await ctx.reply(`🧪 Menjalankan backtest ${symbol}...\n⏳ Mengambil data historis dari Yahoo Finance...`);

            try {
                let ticker = await this.tickerRepo.findBySymbol(symbol);

                if (!ticker) {
                    // Create temp ticker for backtest
                    ticker = buildDefaultTicker(symbol);
                }

                const result = await this.backtester.execute(ticker as any);
                if (!result) return ctx.reply('Backtest gagal atau data tidak cukup.');

                const profitClass = result.totalReturn >= 0 ? '🟢' : '🔴';
                const msg = `🧪 <b>Hasil Backtest: ${symbol}</b>\n\n` +
                    `${profitClass} Return: <b>${result.totalReturn.toFixed(2)}%</b>\n` +
                    `🎯 Win Rate: <b>${result.winRate.toFixed(1)}%</b>\n` +
                    `🔄 Total Trades: ${result.totalTrades}\n` +
                    ((result as any).sharpeRatio !== undefined ? `📐 Sharpe Ratio: ${(result as any).sharpeRatio?.toFixed(2)}\n` : '') +
                    ((result as any).maxDrawdown !== undefined ? `📉 Max Drawdown: ${(result as any).maxDrawdown?.toFixed(2)}%\n` : '') +
                    `\n💡 Gunakan /analyze ${symbol} untuk sinyal live\n\n🔙 Kembali: /back`;

                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.reply(`❌ Backtest error: ${err.message}`);
            }
        });

        // ─── /add ─────────────────────────────────────────────────────────────
        this.bot.command('add', async (ctx) => {
            let symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
            if (!symbol) return ctx.reply('Usage: /add <SYMBOL.JK>\nContoh: /add BBCA.JK');

            if (!symbol.includes('.')) symbol += '.JK';

            await ctx.reply(`🔍 Memvalidasi ${symbol} di Yahoo Finance...`);

            try {
                // Check if already in DB (scoped to this user)
                const userId = ctx.from.id.toString();
                const existing = await this.tickerRepo.findBySymbol(symbol, userId);
                if (existing) return ctx.reply(`⚠️ ${symbol} sudah ada di watchlist kamu.`);

                // Validate symbol on Yahoo Finance
                const provider = this.marketData as YahooFinanceProvider;
                const valid = await provider.validateSymbol(symbol);
                if (!valid) {
                    return ctx.reply(
                        `❌ Simbol <code>${symbol}</code> tidak ditemukan di Yahoo Finance.\n\n` +
                        `Gunakan /search untuk menemukan simbol yang benar.\n` +
                        `Contoh: /search Bank BCA`,
                        { parse_mode: 'HTML' }
                    );
                }

                // Get real name
                const quote = await provider.fetchRealTimeQuote(symbol);
                const name = quote?.name ?? symbol;

                const newTicker = buildDefaultTicker(symbol);
                await this.tickerRepo.save(newTicker, userId);

                await ctx.reply(
                    `✅ <b>${name}</b> (<code>${symbol}</code>) berhasil ditambahkan ke watchlist!\n\n` +
                    `💡 Saham ini akan discan otomatis setiap hari.\n` +
                    `Gunakan /analyze ${symbol} untuk analisis sekarang.\n\n🔙 Kembali: /back`,
                    { parse_mode: 'HTML' }
                );
            } catch (err: any) {
                await ctx.reply(`❌ Gagal menambahkan: ${err.message}`);
            }
        });

        // ─── /remove ─────────────────────────────────────────────────────────
        this.bot.command('remove', async (ctx) => {
            let symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
            if (!symbol) return ctx.reply('Usage: /remove <SYMBOL.JK>');

            if (!symbol.includes('.')) symbol += '.JK';

            try {
                const userId = ctx.from.id.toString();
                const existing = await this.tickerRepo.findBySymbol(symbol, userId);
                if (!existing) return ctx.reply(`⚠️ ${symbol} tidak ada di watchlist kamu.`);

                await this.tickerRepo.deleteBySymbol(symbol, userId);
                await ctx.reply(`🗑️ <b>${symbol}</b> berhasil dihapus dari watchlist.\n\n🔙 Kembali: /back`, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.reply(`❌ Gagal menghapus: ${err.message}`);
            }
        });

        // ─── /list ─────────────────────────────────────────────────────────
        this.bot.command('list', async (ctx) => {
            try {
                const userId = ctx.from.id.toString();
                const tickers = await this.tickerRepo.findAll(userId);

                if (tickers.length === 0) {
                    return ctx.reply(
                        '📋 Watchlist kosong.\n\nTambahkan saham dengan /add BBCA.JK'
                    );
                }

                let msg = `📋 <b>Watchlist (${tickers.length} saham)</b>\n\n`;
                tickers.forEach((t: DomainTicker, i: number) => {
                    const holding = t.state.isHolding ? `📌 Holding ${t.state.lots} lot @ ${t.state.entryPrice}` : '⬜ Idle';
                    msg += `${i + 1}. <code>${t.config.symbol}</code> — ${holding}\n`;
                });
                msg += `\n💡 /analyze SYMBOL untuk analisis | /remove SYMBOL untuk hapus\n\n🔙 Kembali: /back`;

                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.reply(`❌ Error: ${err.message}`);
            }
        });

        // ─── /portfolio ───────────────────────────────────────────────────────
        this.bot.command('portfolio', async (ctx) => {
            try {
                const userId = ctx.from.id.toString();
                const user = await this.userRepo.findByTelegramId(userId);
                const tickers = await this.tickerRepo.findAll(userId);
                const holding = tickers.filter((t: DomainTicker) => t.state.isHolding);

                if (holding.length === 0) {
                    return ctx.reply(
                        '📭 <b>Tidak ada posisi aktif</b>\n\n' +
                        '📋 Watchlist kamu: ' + tickers.length + ' saham\n' +
                        '💡 Jalankan /scan untuk mencari sinyal BUY.',
                        { parse_mode: 'HTML' }
                    );
                }

                await ctx.reply(`💼 <b>Mengambil harga live...</b>\n⏳ ${holding.length} posisi aktif`, { parse_mode: 'HTML' });

                const provider = this.marketData as YahooFinanceProvider;
                let totalCost = 0;
                let totalCurrentValue = 0;

                interface RowData {
                    symbol: string;
                    currentPrice: number;
                    changePct: number;
                    avgPrice: number;
                    lots: number;
                    invested: number;
                    pnl: number;
                    pnlPct: number;
                }
                const rows: RowData[] = [];

                for (const t of holding) {
                    const symbol = t.config.symbol.replace('.JK', '');
                    const avgPrice = t.state.entryPrice;
                    const lots = t.state.lots;
                    const shares = lots * 100;
                    const invested = avgPrice * shares;

                    let currentPrice = t.state.highestPrice || avgPrice;
                    let changePct = 0;
                    try {
                        const quote = await provider.fetchRealTimeQuote(t.config.symbol);
                        if (quote && quote.price > 0) {
                            changePct = quote.changePercent ?? 0;
                            currentPrice = quote.price;
                        }
                    } catch { /* use fallback */ }

                    const currentValue = currentPrice * shares;
                    const pnl = currentValue - invested;
                    const pnlPct = invested > 0 ? (pnl / invested * 100) : 0;

                    totalCost += invested;
                    totalCurrentValue += currentValue;

                    rows.push({ symbol, currentPrice, changePct, avgPrice, lots, invested, pnl, pnlPct });
                }

                const totalPnl = totalCurrentValue - totalCost;
                const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost * 100) : 0;
                const capital = user?.capital ?? totalCost;
                const tradingBalance = capital - totalCost;
                const totalEquity = tradingBalance + totalCurrentValue;

                // ── Stockbit-style Dashboard Header ──
                const now = new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', hour12: false });
                let msg = `💼 <b>Portfolio</b>  🕒 ${now}\n`;
                msg += `<code>`;
                msg += `Trading Balance : Rp ${Math.round(tradingBalance).toLocaleString('id-ID')}\n`;
                msg += `Invested        : Rp ${Math.round(totalCost).toLocaleString('id-ID')}\n`;
                msg += `P&L             : ${totalPnl >= 0 ? '+' : ''}Rp ${Math.round(totalPnl).toLocaleString('id-ID')} (${totalPnl >= 0 ? '+' : ''}${totalPnlPct.toFixed(2)}%)\n`;
                msg += `Total Equity    : Rp ${Math.round(totalEquity).toLocaleString('id-ID')}\n`;
                msg += `</code>\n`;

                // ── Per-position table ──
                msg += `\n<b>Posisi Aktif</b>\n`;
                msg += `<code>`;
                msg += `${'Saham'.padEnd(6)} ${'Harga'.padStart(7)} ${'Avg'.padStart(7)} ${'Lot'.padStart(3)} ${'Invested'.padStart(10)} ${'P&L'.padStart(8)} ${'%'.padStart(6)}\n`;
                msg += `${'─'.repeat(52)}\n`;

                for (const r of rows) {
                    const pnlSign = r.pnl >= 0 ? '+' : '';
                    const changeSign = r.changePct >= 0 ? '+' : '';
                    const sym = r.symbol.padEnd(6).substring(0, 6);
                    const harga = `${r.currentPrice.toLocaleString('id-ID')}(${changeSign}${r.changePct.toFixed(1)}%)`.padStart(14);
                    const avg = r.avgPrice.toLocaleString('id-ID').padStart(7);
                    const lot = String(r.lots).padStart(3);
                    const inv = `${Math.round(r.invested / 1000)}K`.padStart(10);
                    const pnl = `${pnlSign}${Math.round(r.pnl / 1000)}K`.padStart(8);
                    const pct = `${pnlSign}${r.pnlPct.toFixed(2)}%`.padStart(6);
                    msg += `${sym} ${harga} ${avg} ${lot} ${inv} ${pnl} ${pct}\n`;
                }
                // ── Institutional Performance Polish (V13.2) ──
                const returns = rows.map(r => r.pnlPct / 100);
                const sharpe = PerformanceCalculator.calculateSharpe(returns);
                const sortino = PerformanceCalculator.calculateSortino(returns);
                const mc = MonteCarloSimulator.run(returns.length > 0 ? returns : [0], capital);

                msg += `\n📊 <b>Institutional Risk Metrics:</b>\n`;
                msg += `<code>`;
                msg += `• Sharpe Ratio  : ${sharpe.toFixed(2)}\n`;
                msg += `• Sortino Ratio : ${sortino.toFixed(2)}\n`;
                msg += `• Risk of Ruin  : ${mc.riskOfRuin.toFixed(2)}%\n`;
                msg += `• Max DD (95%)  : ${mc.p95Drawdown.toFixed(2)}%</code>\n`;

                msg += `\n💡 <i>Fund Manager Note: Sharpe > 1.0 is Good. Risk of Ruin < 1% is Institutional Standard.</i>\n`;
                msg += `\n/scan — cari sinyal | /status — ringkasan\n\n🔙 Kembali: /back`;

                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.reply(`❌ Portfolio error: ${err.message}`);
            }
        });


        // ─── /status ─────────────────────────────────────────────────────────
        this.bot.command('status', async (ctx) => {
            try {
                const userId = ctx.from.id.toString();
                const tickers = await this.tickerRepo.findAll(userId);
                const holding = tickers.filter((t: DomainTicker) => t.state.isHolding);

                let status = `💼 <b>Portfolio Status</b>\n\n`;
                if (holding.length === 0) {
                    status += '📭 Tidak ada posisi aktif.\n\nJalankan /scan untuk mencari sinyal.';
                } else {
                    holding.forEach((t: DomainTicker) => {
                        const pnlPct = t.state.entryPrice > 0
                            ? ((t.state.highestPrice - t.state.entryPrice) / t.state.entryPrice * 100).toFixed(2)
                            : '0.00';
                        status += `📌 <b>${t.config.symbol}</b>\n`;
                        status += `   Lots: ${t.state.lots} | Entry: Rp ${t.state.entryPrice}\n`;
                        status += `   Peak: Rp ${t.state.highestPrice} (${pnlPct}%)\n\n`;
                    });
                    status += `Total Posisi: ${holding.length}/${tickers.length}\n\n🔙 Kembali: /back`;
                }
                await ctx.reply(status, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.reply(`❌ Error: ${err.message}`);
            }
        });

        // ─── /risk ──────────────────────────────────────────────────────────
        this.bot.command('risk', async (ctx) => {
            try {
                const userId = ctx.from.id.toString();
                const statusMsg = await ctx.reply('🔎 <b>Auditing Systemic Risk...</b>\n<i>Analisis korelasi 30 hari sedang berjalan.</i>', { parse_mode: 'HTML' });

                const report = await this.analyzeRisk.execute(userId);

                if (report.totalPositions === 0) {
                    return ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined,
                        '📭 <b>Audit Selesai</b>\nTidak ada posisi aktif yang perlu diaudit.\n\n🔙 Kembali: /back', { parse_mode: 'HTML' });
                }

                let msg = `🏛️ <b>Institutional Risk Audit</b>\n`;
                msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

                const scoreEmoji = report.diversificationScore > 70 ? '🟢' : report.diversificationScore > 40 ? '🟡' : '🔴';
                msg += `${scoreEmoji} <b>Diversification Score: ${report.diversificationScore.toFixed(1)}/100</b>\n`;
                msg += `📊 Total Positions: <b>${report.totalPositions}</b>\n`;
                msg += `📉 Avg Correlation: <b>${report.avgCorrelation.toFixed(2)}</b>\n\n`;

                if (Object.keys(report.correlationMatrix).length > 0) {
                    msg += `📑 <b>Correlation Highlights:</b>\n`;
                    Object.entries(report.correlationMatrix)
                        .sort(([, a], [, b]) => b - a)
                        .slice(0, 5)
                        .forEach(([pair, val]) => {
                            const valEmoji = val > 0.8 ? '🧨' : val > 0.6 ? '⚠️' : '✅';
                            msg += `${valEmoji} ${pair.padEnd(12)} : <b>${val.toFixed(2)}</b>\n`;
                        });
                }

                if (report.warnings.length > 0) {
                    msg += `\n🚨 <b>Risk Warnings:</b>\n`;
                    report.warnings.forEach(w => msg += `• ${w}\n`);
                }

                msg += `\n💡 <i>Skor tinggi (>70) menandakan portofolio memiliki diversifikasi yang sehat. Korelasi > 0.8 menandakan overlap resiko yang berbahaya.</i>\n\n🔙 Kembali: /back`;

                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                logger.error('Risk audit error:', err);
                await ctx.reply(`❌ Risk audit failed: ${err.message}`);
            }
        });

        // ─── /audit (v15.2) ────────────────────────────────────────────────
        this.bot.command('audit', async (ctx) => {
            try {
                const text = (ctx.message as any).text || '';
                const parts = text.split(' ');
                let symbol = parts[1]?.toUpperCase();

                if (!symbol) {
                    return ctx.reply('📑 <b>Usage:</b> <code>/audit [SYMBOL]</code>\nContoh: <code>/audit BBCA.JK</code>', { parse_mode: 'HTML' });
                }

                if (!symbol.includes('.')) symbol += '.JK';

                const statusMsg = await ctx.reply(`🔍 <b>Auditing Fundamental: ${symbol}...</b>\n<i>Analisis Piotroski F-Score & Altman Z-Score sedang berjalan.</i>`, { parse_mode: 'HTML' });

                const report = await this.auditFundamental.execute(symbol);

                if (!report) {
                    return ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined,
                        `❌ <b>Audit Gagal</b>\nData fundamental untuk <b>${symbol}</b> tidak tersedia.\n<i>Coba lagi beberapa saat lagi.</i>`, { parse_mode: 'HTML' });
                }

                let msg = `🏛️ <b>Institutional Fundamental Audit</b>\n`;
                msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;

                const ratingEmoji = report.rating.startsWith('A') ? '🟢' : report.rating === 'B' ? '🟡' : '🔴';
                msg += `🏷️ Rating: ${ratingEmoji} <b>${report.rating}</b>\n`;
                msg += `📈 F-Score: <b>${report.fScore}/9</b>\n`;
                msg += `🛡️ Z-Score: <b>${report.zScore > 0 ? report.zScore.toFixed(2) : 'N/A'}</b>\n\n`;

                msg += `📊 <b>Key Metrics:</b>\n`;
                msg += `<code>• P/E Ratio: ${report.metrics.pe.toFixed(2)}</code>\n`;
                msg += `<code>• P/B Ratio: ${report.metrics.pb.toFixed(2)}</code>\n`;
                msg += `<code>• Div Yield: ${report.metrics.dividendYield.toFixed(2)}%</code>\n`;
                msg += `<code>• Mkt Cap  : ${(report.metrics.marketCap / 1e12).toFixed(2)}T IDR</code>\n\n`;

                msg += `📝 <b>Summary:</b>\n<i>"${report.summary}"</i>\n`;

                if (report.warnings.length > 0) {
                    msg += `\n⚠️ <b>Audit Warnings:</b>\n`;
                    report.warnings.forEach(w => msg += `• ${w}\n`);
                }

                msg += `\n🔙 Kembali: /back`;

                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, msg, { parse_mode: 'HTML' });

            } catch (err: any) {
                logger.error('Fundamental audit error:', err);
                await ctx.reply(`❌ Audit failed: ${err.message}`);
            }
        });

        // ─── /sentiment (v18) ─────────────────────────────────────────────
        this.bot.command('sentiment', async (ctx) => {
            try {
                const text = (ctx.message as any).text || '';
                const parts = text.split(' ');
                let symbol = parts[1]?.toUpperCase();

                if (!symbol) {
                    return ctx.reply('🧠 <b>Usage:</b> <code>/sentiment [SYMBOL]</code>\nContoh: <code>/sentiment BBCA.JK</code>', { parse_mode: 'HTML' });
                }

                if (!symbol.includes('.')) symbol += '.JK';

                const statusMsg = await ctx.reply(`🧠 <b>Analyzing Sentiment: ${symbol}...</b>\n<i>NLP Engine & Market Mood sedang diproses.</i>`, { parse_mode: 'HTML' });

                const report = await this.analyzeSentiment.execute(symbol);

                if (!report) {
                    return ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined,
                        `❌ <b>Sentiment Analysis Gagal</b>\nData untuk <b>${symbol}</b> tidak tersedia.`, { parse_mode: 'HTML' });
                }

                const moodEmoji = report.compositeScore >= 60 ? '🟢🔥' : report.compositeScore >= 20 ? '🟢' : report.compositeScore <= -60 ? '🔴🧊' : report.compositeScore <= -20 ? '🔴' : '⚪';
                const moodBar = this.buildMoodBar(report.compositeScore);

                let msg = `🧠 <b>Sentiment Intelligence Report</b>\n`;
                msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
                msg += `🏷️ Symbol: <b>${symbol}</b>\n`;
                msg += `${moodEmoji} Mood: <b>${report.compositeLabel.replace('_', ' ')}</b> (${report.compositeScore > 0 ? '+' : ''}${report.compositeScore})\n`;
                msg += `<code>${moodBar}</code>\n`;
                msg += `📡 Source: <b>${report.source.replace('_', ' ')}</b>\n\n`;

                // News Section
                msg += `📰 <b>News NLP Score:</b> ${report.news.totalAnalyzed > 0 ? report.news.score : 'N/A'}\n`;
                if (report.news.totalAnalyzed > 0) {
                    msg += `   ├ Bullish: <b>${report.news.bullishCount}</b> | Bearish: <b>${report.news.bearishCount}</b>\n`;
                    msg += `   └ Analyzed: ${report.news.totalAnalyzed} headlines\n`;
                } else {
                    msg += `   └ <i>No headlines available for NLP</i>\n`;
                }

                // Market Section
                msg += `\n📊 <b>Market Mood Score:</b> ${report.market.score}\n`;
                msg += `   ├ Momentum: <b>${report.market.momentum > 0 ? '+' : ''}${report.market.momentum}</b>\n`;
                msg += `   ├ Volume:   <b>${report.market.volumeTrend > 0 ? '+' : ''}${report.market.volumeTrend}</b>\n`;
                msg += `   └ Volatility: <b>${report.market.volatilitySignal > 0 ? '+' : ''}${report.market.volatilitySignal}</b>\n\n`;

                // Headlines Preview
                if (report.news.headlines.length > 0) {
                    msg += `📋 <b>Latest Headlines:</b>\n`;
                    report.news.headlines.slice(0, 3).forEach((h, i) => {
                        msg += `  ${i + 1}. <i>${h.substring(0, 80)}${h.length > 80 ? '...' : ''}</i>\n`;
                    });
                    msg += `\n`;
                }

                msg += `📝 <b>Summary:</b>\n<i>"${report.summary}"</i>\n`;
                msg += `\n🔙 Kembali: /back`;

                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, msg, { parse_mode: 'HTML' });

            } catch (err: any) {
                logger.error('Sentiment analysis error:', err);
                await ctx.reply(`❌ Sentiment failed: ${err.message}`);
            }
        });

        // ─── Callback Query Handler ────────────────────────────────────────────
        this.bot.on('callback_query', async (ctx) => {
            const data = (ctx.callbackQuery as any).data;
            if (!data) return;

            try {
                if (data.startsWith('trade_buy_')) {
                    const parts = data.split('_');
                    const symbol = parts[2];
                    const price = parseFloat(parts[3]);
                    const lots = parseInt(parts[4]);

                    await ctx.answerCbQuery(`⏳ Mengeksekusi BUY ${symbol}...`);
                    await ctx.editMessageReplyMarkup(undefined);

                    await this.handleDecision.execute({
                        symbol, action: 'BUY', price, lots,
                        reason: 'Manual Confirmation via Telegram'
                    });

                    await ctx.reply(
                        `✅ <b>Posisi ${symbol} berhasil dibuka!</b>\n` +
                        `💼 ${lots} lot @ Rp ${price}\n\n` +
                        `Pantau posisi dengan /status`,
                        { parse_mode: 'HTML' }
                    );
                } else if (data.startsWith('trade_ignore_')) {
                    const symbol = data.split('_')[2];
                    await ctx.answerCbQuery('Signal Diabaikan.');
                    await ctx.editMessageReplyMarkup(undefined);
                    logger.info(`Signal ${symbol} diabaikan oleh user.`);
                }
            } catch (err: any) {
                await ctx.answerCbQuery(`Error: ${err.message}`);
            }
        });

    }

    private async sendMainMenu(ctx: Context, user: any) {
        if (!user) {
            return ctx.reply(
                `👋 Halo, <b>${ctx.from?.first_name}</b>!\n\n` +
                `🏛️ <b>Ultimate Bagger Bot V13.2</b>\n` +
                `Institutional Sovereign — Alpha Sentinel\n\n` +
                `Kamu belum terdaftar. Gunakan:\n` +
                `👉 /register — Daftar akun baru untuk mendapatkan pelindungan Sentinel`,
                { parse_mode: 'HTML' }
            );
        }
        const telegramId = ctx.from?.id.toString() || '';
        const statusEmoji = user.status === 'APPROVED' ? '✅' : user.status === 'PENDING' ? '⏳' : '🚫';
        const isAdmin = this.isAdmin(telegramId);
        return ctx.reply(
            `👋 Selamat datang, <b>${ctx.from?.first_name}</b>! ${statusEmoji}\n` +
            `🏛️ <b>ULTIMATE BAGGER BOT v13.2</b>\n` +
            `<i>Institutional Sovereign — Alpha Sentinel</i>\n\n` +
            `🎯 <b>DISCOVERY (Cari Peluang)</b>\n` +
            `├ /scan - Discovery Umum (Top Active)\n` +
            `├ /whale - 🐋 <b>Whale Radar</b> (Smart Money Flow)\n` +
            `├ /hot - ⚡ <b>Fast Money</b> (Volume Breakout)\n` +
            `├ /smart - 🤫 <b>Smart Money</b> (Accumulation)\n` +
            `└ /sector - 🧭 <b>Market Heatmap</b> (Rotasi Sektor)\n\n` +
            `🔬 <b>ANALYSIS (Analisis Mendalam)</b>\n` +
            `├ /analyze [SYM] - Audit Lengkap (VWAP/POC/V13)\n` +
            `├ /sentiment [SYM] - 🧠 <b>Sentiment</b> (NLP)\n` +
            `├ /audit [SYM] - 🏛️ <b>Fundamental Audit</b>\n` +
            `├ /valuation [SYM] - ⚖️ <b>Intrinsic Audit</b> (Graham)\n` +
            `├ /risk - 🧨 <b>Systemic Risk Audit</b>\n` +
            `└ /signals - Cari Entry Paling Disiplin\n\n` +
            `📂 <b>MANAGEMENT (Portfolio)</b>\n` +
            `├ /list - Lihat Daftar Pantau & Sentinel\n` +
            `├ /optimize - ⚖️ <b>Portfolio Rebalancer</b>\n` +
            `├ /myprofile - Cek Profil & Update Modal\n` +
            `└ /portfolio - Positions & Profit/Loss\n\n` +
            (isAdmin ? `🔒 <b>ADMIN</b>: /users, /approve\n` : '') +
            `📖 <b>Panduan Lengkap Sentinel:</b> /help`,
            { parse_mode: 'HTML' }
        );
    }

    private buildMoodBar(score: number): string {
        // Renders: FEAR [████░░░░░░░░░░░░████] GREED
        const barLen = 20;
        const normalized = Math.round(((score + 100) / 200) * barLen); // 0 to barLen
        const clamped = Math.max(0, Math.min(barLen, normalized));
        const filled = '█'.repeat(clamped);
        const empty = '░'.repeat(barLen - clamped);
        return `FEAR [${filled}${empty}] GREED`;
    }

    async launch() {
        await this.bot.launch();
        logger.info('🤖 Telegram Bot started in Polling Mode');
    }
}

// ─── Helper Functions ──────────────────────────────────────────────────────

function Signal_priceFormat(price: number): string {
    return price.toLocaleString('id-ID');
}

function buildDefaultTicker(symbol: string): any {
    return {
        config: {
            symbol,
            tenkanPeriod: 8,
            kijunPeriod: 21,
            spanBPeriod: 55,
            displacement: 26,
            trailPercent: 0.10,
            entryRule: 'AGGRESSIVE',
            sizingMode: 'RISK_BASED',
            riskPerTrade: 0.015,
            useVolEntry: true,
            useVolExit: true,
            useExitKijun: true,
            useTrailing: true,
            volEntryMult: 1.2,
            volDistMult: 1.5,
            atrMultiplier: 2.0
        },
        account: {
            initialCapital: 10000000,
            currentBalance: 10000000,
            reservedCash: 0,
            isCompounding: true,
            peakEquity: 10000000,
            dailyPeakEquity: 10000000,
            dailyStartEquity: 10000000,
            lockedCapital: 0
        },
        state: {
            isHolding: false,
            entryPrice: 0,
            highestPrice: 0,
            lots: 0,
            lastExitPrice: 0,
            consecutiveLosses: 0,
            equityHistory: [],
            pyramidEntries: 0,
            atrHistory: []
        },
        analytics: {
            totalTrades: 0,
            winRate: 0,
            recentTrades: [],
            profitFactor: 0,
            maxDrawdown: 0,
            avgWin: 0,
            avgLoss: 0,
            expectancy: 0
        },
        risk: { maxExposure: 0, currentHeat: 0 }
    };
}
