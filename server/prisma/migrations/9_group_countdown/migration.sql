-- 群倒数日：群内共享的重要日子
-- CreateTable
CREATE TABLE "group_countdowns" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "target_date" DATE NOT NULL,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_countdowns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_countdowns_group_id_target_date_idx" ON "group_countdowns"("group_id", "target_date");

-- AddForeignKey
ALTER TABLE "group_countdowns" ADD CONSTRAINT "group_countdowns_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
