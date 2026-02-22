import { Telegraf, Context, Markup } from 'telegraf';
import { RunScanner } from '../../application/use-cases/RunScanner';
import { ExecuteBacktest } from '../../application/use-cases/ExecuteBacktest';
import { PerformManualAnalysis } from '../../application/use-cases/PerformManualAnalysis';
import { HandleTradingDecision } from '../../application/use-cases/HandleTradingDecision';
import { ITickerRepository } from '../../core/domain/interfaces/TickerRepository';
import { IUserRepository } from '../../core/domain/interfaces/UserRepository';
import { IMarketDataProvider } from '../../core/domain/interfaces/ExternalServices';
import { logger } from '../../infrastructure/logging/WinstonLogger';
import { DomainTicker } from '../../core/domain/entities/Ticker';
import { YahooFinanceProvider } from '../../infrastructure/external/YahooFinanceProvider';
import { ENV } from '../../infrastructure/config/env';

export class TelegramInterface {
    constructor(
        private bot: Telegraf,
        private scanner: RunScanner,
        private backtester: ExecuteBacktest,
        private manualAnalysis: PerformManualAnalysis,
        private handleDecision: HandleTradingDecision,
        private tickerRepo: ITickerRepository,
        private userRepo: IUserRepository,
        private marketData: IMarketDataProvider
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

        // ─── /start ───────────────────────────────────────────────────────────
        this.bot.start(async (ctx) => {
            const telegramId = ctx.from.id.toString();
            const user = await this.userRepo.findByTelegramId(telegramId);
            if (!user) {
                return ctx.reply(
                    `👋 Halo, <b>${ctx.from.first_name}</b>!\n\n` +
                    `🏛️ <b>Ultimate Bagger Bot V7.2</b>\n` +
                    `Institutional Quant Engine untuk IDX\n\n` +
                    `Kamu belum terdaftar. Gunakan:\n` +
                    `👉 /register — Daftar akun baru`,
                    { parse_mode: 'HTML' }
                );
            }
            const statusEmoji = user.status === 'APPROVED' ? '✅' : user.status === 'PENDING' ? '⏳' : '🚫';
            const isAdmin = this.isAdmin(telegramId);
            return ctx.reply(
                `👋 Selamat datang, <b>${ctx.from.first_name}</b>! ${statusEmoji}\n` +
                `🏛️ <b>Ultimate Bagger Bot V7.2</b>\n\n` +
                `📡 <b>Sinyal Market</b>\n` +
                `  /scan — Scan BUY/SELL/HOLD (15 IDX terpilih)\n` +
                `  /quote [SYMBOL.JK] — Harga real-time\n` +
                `  /analyze [SYMBOL.JK] — Analisis Ichimoku detail\n` +
                `  /backtest [SYMBOL.JK] — Backtest strategi historis\n\n` +
                `📂 <b>Watchlist Pribadi</b>\n` +
                `  /add [SYMBOL.JK] — Tambah saham ke watchlist\n` +
                `  /remove [SYMBOL.JK] — Hapus dari watchlist\n` +
                `  /list — Lihat semua watchlist kamu\n\n` +
                `💼 <b>Portfolio</b>\n` +
                `  /portfolio — Posisi aktif + P&L real-time\n` +
                `  /status — Ringkasan posisi singkat\n\n` +
                `👤 <b>Akun</b>\n` +
                `  /myprofile — Profil & modal kamu\n` +
                `  /setcapital [N] — Set modal awal\n` +
                (isAdmin ? `\n🔒 <b>Admin</b>\n  /users — Daftar semua user\n  /approve @username — Setujui user\n  /block 123 — Blokir user\n` : '') +
                `\n👉 /help — Daftar lengkap semua commands`,
                { parse_mode: 'HTML' }
            );
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
                `Contoh: <code>/setcapital 15000000</code>`,
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
                `✅ Modal diperbarui: <b>Rp ${amount.toLocaleString('id-ID')}</b>`,
                { parse_mode: 'HTML' }
            );
        });

        // ─── /help ────────────────────────────────────────────────────────────
        this.bot.command('help', (ctx) => ctx.reply(
            '🆘 <b>Command Reference</b>\n\n' +
            '👤 <b>Akun</b>\n' +
            '<code>/register</code> — Daftar akun baru\n' +
            '<code>/myprofile</code> — Lihat profil & kapital\n' +
            '<code>/setcapital [N]</code> — Set modal awal\n\n' +
            '📡 <b>Market</b>\n' +
            '<code>/scan</code> — Full market scan 15 IDX terpilih\n' +
            '<code>/quote [SYMBOL]</code> — Real-time price\n' +
            '<code>/search [KEYWORD]</code> — Cari simbol\n' +
            '<code>/analyze [SYMBOL]</code> — Analisis Ichimoku\n' +
            '<code>/backtest [SYMBOL]</code> — Backtest strategi\n\n' +
            '📂 <b>Watchlist (Personal)</b>\n' +
            '<code>/add [SYMBOL]</code> — Tambah ke watchlist\n' +
            '<code>/remove [SYMBOL]</code> — Hapus dari watchlist\n' +
            '<code>/list</code> — Lihat watchlist kamu\n\n' +
            '💼 <b>Portfolio (Personal)</b>\n' +
            '<code>/portfolio</code> — Posisi aktif + P&L real-time\n' +
            '<code>/status</code> — Ringkasan posisi',
            { parse_mode: 'HTML' }
        ));

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

                msg += `👉 /scan — Lihat seluruh peringkat pasar & eksekusi`;

                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, undefined, `❌ Error: ${err.message}`, { parse_mode: 'HTML' });
            }
        });


        // ─── /scan ────────────────────────────────────────────────────────────
        this.bot.command('scan', async (ctx) => {
            await ctx.reply('🔎 <b>Menjalankan Market Scanner V7.3...</b>\n⏳ Menganalisis Top 20 saham IDX paling aktif saat ini secara dinamis.', { parse_mode: 'HTML' });
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
                let header = `🏛️ <b>Peringkat Pasar IDX (Top Assets)</b>\n`;
                header += `${regimeEmoji} Regime IHSG: <b>${report.regime}</b> | 🕒 ${now}\n`;
                header += `📋 Dianalisis: <b>${report.totalScanned} saham</b> dari Yahoo Finance\n\n`;
                header += `📈 Sinyal Terdeteksi:\n`;
                header += `  🟢 BUY: <b>${rawBuyItems.length}</b>`;
                if (rawBuyItems.length > actionableBuy) {
                    header += ` (${actionableBuy} lolos filter, ${rawBuyItems.length - actionableBuy} terfilter)`;
                }
                header += `\n  📈 SELL: <b>${rawSellItems.length}</b>`;
                if (rawSellItems.length > actionableSell) {
                    header += ` (${actionableSell} lolos filter)`;
                }
                header += `\n  ⏸️ HOLD: <b>${report.totalScanned - rawBuyItems.length - rawSellItems.length}</b>`;
                await ctx.reply(header, { parse_mode: 'HTML' });

                // ── Message 2: Full Ranked Table ──
                if (report.rankedItems.length > 0) {
                    const chunkSize = 10;
                    for (let i = 0; i < report.rankedItems.length; i += chunkSize) {
                        const chunk = report.rankedItems.slice(i, i + chunkSize);

                        let rankMsg = i === 0
                            ? `🏆 <b>Ranking Lengkap (${report.rankedItems.length} saham)</b>\n<code>No  Saham      Sinyal  Score    Harga</code>\n`
                            : `<code>No  Saham      Sinyal  Score    Harga</code>\n`;

                        chunk.forEach((item, idx) => {
                            const no = String(i + idx + 1).padStart(2, ' ');
                            const sym = item.symbol.replace('.JK', '').padEnd(10, ' ');
                            const sigLabel = item.signal === 'BUY' ? 'BUY ' : item.signal === 'SELL' ? 'SELL' : 'HOLD';
                            const sigMark = item.signal === 'BUY' ? '[B]' : item.signal === 'SELL' ? '[S]' : '   ';
                            const score = item.score.toFixed(2).padStart(6, ' ');
                            const price = item.price > 0 ? `Rp ${item.price.toFixed(0)}` : '-';
                            const dbTag = item.inDb ? ' 📌' : '';
                            rankMsg += `<code>${no}. ${sym} ${sigLabel} ${score}</code>  ${price}${dbTag}\n`;
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
                    filtMsg += `<i>💡 Filter ini melindungi modal dari sinyal berkualitas rendah.</i>`;
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
                        `🔄 Scan otomatis tiap hari pkl 15:45 WIB.`;
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
                    `⏰ Data dari Yahoo Finance (real-time)`;

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
                msg += `\n💡 Gunakan simbol di atas untuk:\n/quote SYMBOL | /analyze SYMBOL`;

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
                msg += `\n`;

                if (rtData) {
                    const changeEmoji = parseFloat(rtData.changePercent) >= 0 ? '🟢' : '🔴';
                    msg += `💰 <b>Harga Saat Ini: Rp ${Signal_priceFormat(signal.price)}</b>\n`;
                    msg += `${changeEmoji} Perubahan: ${rtData.changePercent}%\n\n`;
                }

                msg += `📡 <b>Sinyal V7: ${signal.type}</b>\n`;
                msg += `📝 Alasan: ${signal.reason}\n`;
                if (signal.confidence) {
                    msg += `🎯 Confidence: <b>${signal.confidence.total.toFixed(1)}%</b>\n`;
                }
                msg += `\n`;

                if (b) {
                    msg += `<b>📐 Ichimoku Breakdown:</b>\n`;
                    msg += `- Di atas Awan: ${b.isAboveCloud ? '✅ Ya' : '❌ Tidak'}\n`;
                    msg += `- Cross Sinyal: ${b.isCrossed ? '✅ Ya' : '❌ Tidak'}\n`;
                    msg += `- Volume Breakout: ${b.isVolumeBreakout ? '✅ Ya' : '❌ Tidak'}\n\n`;
                    msg += `<b>📏 Level Kunci:</b>\n`;
                    msg += `- Kijun-Sen: Rp ${b.kijunLevel.toFixed(0)}\n`;
                    msg += `- Tenkan-Sen: Rp ${b.tenkanLevel.toFixed(0)}\n`;
                    msg += `- Trailing Stop: Rp ${b.stopLoss.toFixed(0)}\n\n`;
                }

                if (rtData) msg += `📊 Data: ${rtData.dataPoints} candle (Yahoo Finance)\n`;
                if (!inDB) msg += `\n💡 Tambahkan ke watchlist: /add ${symbol}`;

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
                    `\n💡 Gunakan /analyze ${symbol} untuk sinyal live`;

                await ctx.reply(msg, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.reply(`❌ Backtest error: ${err.message}`);
            }
        });

        // ─── /add ─────────────────────────────────────────────────────────────
        this.bot.command('add', async (ctx) => {
            const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
            if (!symbol) return ctx.reply('Usage: /add <SYMBOL.JK>\nContoh: /add BBCA.JK');

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
                    `Gunakan /analyze ${symbol} untuk analisis sekarang.`,
                    { parse_mode: 'HTML' }
                );
            } catch (err: any) {
                await ctx.reply(`❌ Gagal menambahkan: ${err.message}`);
            }
        });

        // ─── /remove ─────────────────────────────────────────────────────────
        this.bot.command('remove', async (ctx) => {
            const symbol = ctx.message.text.split(' ')[1]?.toUpperCase();
            if (!symbol) return ctx.reply('Usage: /remove <SYMBOL.JK>');

            try {
                const userId = ctx.from.id.toString();
                const existing = await this.tickerRepo.findBySymbol(symbol, userId);
                if (!existing) return ctx.reply(`⚠️ ${symbol} tidak ada di watchlist kamu.`);

                await this.tickerRepo.deleteBySymbol(symbol, userId);
                await ctx.reply(`🗑️ <b>${symbol}</b> berhasil dihapus dari watchlist.`, { parse_mode: 'HTML' });
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
                msg += `\n💡 /analyze SYMBOL untuk analisis | /remove SYMBOL untuk hapus`;

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
                msg += `</code>`;
                msg += `\n💡 /scan — cari sinyal | /status — ringkasan`;

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
                    status += `Total Posisi: ${holding.length}/${tickers.length}`;
                }
                await ctx.reply(status, { parse_mode: 'HTML' });
            } catch (err: any) {
                await ctx.reply(`❌ Error: ${err.message}`);
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

        this.bot.launch();
        logger.info('🤖 Telegram Bot handlers initialized (Interactive V2)');
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
