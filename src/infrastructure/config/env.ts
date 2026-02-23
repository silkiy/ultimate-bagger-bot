import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.string().default('3000').transform(Number),
    MONGODB_URI: z.string().url(),
    TELEGRAM_BOT_TOKEN: z.string().min(1),
    TELEGRAM_CHAT_ID: z.string().min(1),
    LOG_LEVEL: z.enum(['info', 'debug', 'warn', 'error']).default('info'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
    const errors = JSON.stringify(parsed.error.flatten().fieldErrors);
    console.error(`❌ Invalid environment variables: ${errors}`);
    throw new Error(`Missing or invalid environment variables: ${errors}`);
}

export const ENV = parsed.data;
export type Env = z.infer<typeof envSchema>;
