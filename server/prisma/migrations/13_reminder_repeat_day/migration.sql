-- 保留月提醒的原始日期，避免短月之后永久漂到 28/29 日。
ALTER TABLE "reminders" ADD COLUMN "repeat_day" INTEGER;
