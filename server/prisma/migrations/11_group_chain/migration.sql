-- 群接龙：报名/集合接龙，标题 + 按加入顺序编号的条目，一人一条
-- CreateTable
CREATE TABLE "group_chains" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_chain_entries" (
    "id" TEXT NOT NULL,
    "chain_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "remark" VARCHAR(120) NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_chain_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_chains_group_id_created_at_idx" ON "group_chains"("group_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "group_chain_entries_chain_id_user_id_key" ON "group_chain_entries"("chain_id", "user_id");

-- AddForeignKey
ALTER TABLE "group_chains" ADD CONSTRAINT "group_chains_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_chain_entries" ADD CONSTRAINT "group_chain_entries_chain_id_fkey" FOREIGN KEY ("chain_id") REFERENCES "group_chains"("id") ON DELETE CASCADE ON UPDATE CASCADE;
