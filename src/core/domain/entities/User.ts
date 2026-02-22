// User domain entity
export type UserStatus = 'PENDING' | 'APPROVED' | 'BLOCKED';

export interface BotUser {
    telegramId: string;       // Telegram numeric user ID (string for easy comparison)
    username: string;         // @username (may be empty)
    firstName: string;
    status: UserStatus;
    capital: number;          // Modal awal dalam Rupiah (default: 10_000_000)
    registeredAt: Date;
    approvedAt?: Date;
}
