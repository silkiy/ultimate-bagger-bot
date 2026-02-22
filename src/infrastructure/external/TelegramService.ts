import { Telegraf } from 'telegraf';
import { IMessagingService } from '../../core/domain/interfaces/ExternalServices';
import { IUserRepository } from '../../core/domain/interfaces/UserRepository';
import { ENV } from '../config/env';
import { logger } from '../logging/WinstonLogger';

export class TelegramService implements IMessagingService {
    private bot: Telegraf;

    constructor(private userRepo?: IUserRepository) {
        this.bot = new Telegraf(ENV.TELEGRAM_BOT_TOKEN);
    }

    getBotInstance(): Telegraf {
        return this.bot;
    }

    async sendAlert(message: string): Promise<void> {
        try {
            await this.bot.telegram.sendMessage(ENV.TELEGRAM_CHAT_ID, message, { parse_mode: 'HTML' });
        } catch (error) {
            logger.error('Telegram sendAlert error:', error);
        }
    }

    async sendInteractiveAlert(message: string, buttons: { text: string, callbackData: string }[]): Promise<void> {
        try {
            const keyboard = {
                inline_keyboard: [
                    buttons.map(b => ({ text: b.text, callback_data: b.callbackData }))
                ]
            };
            await this.bot.telegram.sendMessage(ENV.TELEGRAM_CHAT_ID, message, {
                parse_mode: 'HTML',
                reply_markup: keyboard
            });
        } catch (error) {
            logger.error('Telegram sendInteractiveAlert error:', error);
        }
    }

    async broadcast(message: string): Promise<void> {
        try {
            if (!this.userRepo) {
                await this.sendAlert(message);
                return;
            }

            const users = await this.userRepo.findAll();
            const approvedUsers = users.filter(u => u.status === 'APPROVED');

            if (approvedUsers.length === 0) {
                await this.sendAlert(message); // Fallback to admin
                return;
            }

            logger.info(`📢 Broadcasting message to ${approvedUsers.length} users...`);
            const chunks = [];
            for (let i = 0; i < approvedUsers.length; i += 30) {
                chunks.push(approvedUsers.slice(i, i + 30));
            }

            for (const chunk of chunks) {
                await Promise.all(chunk.map(user =>
                    this.bot.telegram.sendMessage(user.telegramId, message, { parse_mode: 'HTML' })
                        .catch(err => logger.error(`Failed to send broadcast to ${user.telegramId}: ${err.message}`))
                ));
            }
        } catch (error) {
            logger.error('Telegram broadcast error:', error);
        }
    }
}
