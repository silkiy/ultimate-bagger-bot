import mongoose from 'mongoose';
import { BotUser, UserStatus } from '../../core/domain/entities/User';
import { IUserRepository } from '../../core/domain/interfaces/UserRepository';

const UserSchema = new mongoose.Schema({
    telegramId: { type: String, required: true, unique: true },
    username: { type: String, default: '' },
    firstName: { type: String, default: '' },
    status: { type: String, enum: ['PENDING', 'APPROVED', 'BLOCKED'], default: 'PENDING' },
    capital: { type: Number, default: 10_000_000 },
    registeredAt: { type: Date, default: Date.now },
    approvedAt: { type: Date }
}, { timestamps: true });

const UserModel = mongoose.model('BotUser', UserSchema);

export class MongoUserRepository implements IUserRepository {
    async findByTelegramId(telegramId: string): Promise<BotUser | null> {
        const doc = await UserModel.findOne({ telegramId });
        if (!doc) return null;
        return doc.toObject() as unknown as BotUser;
    }

    async findByUsername(username: string): Promise<BotUser | null> {
        // Strip leading @ if present, case-insensitive search
        const clean = username.replace(/^@/, '').toLowerCase();
        const doc = await UserModel.findOne({
            username: { $regex: new RegExp(`^${clean}$`, 'i') }
        });
        if (!doc) return null;
        return doc.toObject() as unknown as BotUser;
    }

    async create(user: BotUser): Promise<void> {
        await UserModel.findOneAndUpdate(
            { telegramId: user.telegramId },
            user,
            { upsert: true }
        );
    }

    async approve(telegramId: string): Promise<void> {
        await UserModel.updateOne(
            { telegramId },
            { status: 'APPROVED', approvedAt: new Date() }
        );
    }

    async block(telegramId: string): Promise<void> {
        await UserModel.updateOne({ telegramId }, { status: 'BLOCKED' });
    }

    async setCapital(telegramId: string, capital: number): Promise<void> {
        await UserModel.updateOne({ telegramId }, { capital });
    }

    async findAll(): Promise<BotUser[]> {
        const docs = await UserModel.find().sort({ registeredAt: -1 });
        return docs.map(doc => doc.toObject() as unknown as BotUser);
    }
}
