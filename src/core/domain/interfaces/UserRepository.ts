import { BotUser } from '../entities/User';

export interface IUserRepository {
    findByTelegramId(telegramId: string): Promise<BotUser | null>;
    findByUsername(username: string): Promise<BotUser | null>;
    create(user: BotUser): Promise<void>;
    approve(telegramId: string): Promise<void>;
    block(telegramId: string): Promise<void>;
    setCapital(telegramId: string, capital: number): Promise<void>;
    findAll(): Promise<BotUser[]>;
}
