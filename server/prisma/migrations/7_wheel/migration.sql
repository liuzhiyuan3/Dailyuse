-- 转盘：用户自定义选项（items 为 JSON 字符串数组）
-- CreateTable
CREATE TABLE "wheels" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "title" VARCHAR(40) NOT NULL DEFAULT '转盘',
    "items" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wheels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "wheels_user_id_updated_at_idx" ON "wheels"("user_id", "updated_at");

-- AddForeignKey
ALTER TABLE "wheels" ADD CONSTRAINT "wheels_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
