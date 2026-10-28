-- 天气订阅：Reminder 增加 city 列（toolType=weather 时存城市名，推送时填「城市」栏目）
ALTER TABLE "reminders" ADD COLUMN "city" TEXT;
