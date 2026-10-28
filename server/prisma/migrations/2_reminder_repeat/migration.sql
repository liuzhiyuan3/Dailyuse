-- 便签定期提醒：repeat（'' | daily | weekly | monthly）+ 每条提醒自带模板 ID（推送时回退 WX_TEMPLATE_ID）
ALTER TABLE "reminders" ADD COLUMN "repeat" VARCHAR(16) NOT NULL DEFAULT '';
ALTER TABLE "reminders" ADD COLUMN "template_id" VARCHAR(64) NOT NULL DEFAULT '';
