-- 资讯定时推送：push_hour（null=即时；0-23=每天该整点摘要）、last_digest_at（增量与同日去重）
ALTER TABLE "subscribes" ADD COLUMN "push_hour" INTEGER;
ALTER TABLE "subscribes" ADD COLUMN "last_digest_at" TIMESTAMP(3);
