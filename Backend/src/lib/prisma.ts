import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from '../config/env.js';

export const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(env.DATABASE_URL),
});
