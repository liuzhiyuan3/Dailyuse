import { config } from '../config';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
});
