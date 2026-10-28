-- 资讯模块下线：删订阅与新闻缓存表；push_logs 去掉资讯专属字段
ALTER TABLE "push_logs" DROP COLUMN "keyword";
ALTER TABLE "push_logs" DROP COLUMN "news_id";
DROP TABLE "subscribes";
DROP TABLE "news_items";
