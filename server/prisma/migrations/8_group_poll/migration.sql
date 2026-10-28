-- 群投票：单选/多选 + 截止时间；选项与投票分表，同一选项一人一票
-- CreateTable
CREATE TABLE "group_polls" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "question" VARCHAR(120) NOT NULL,
    "multi" BOOLEAN NOT NULL DEFAULT false,
    "deadline" TIMESTAMP(3),
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_poll_options" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "content" VARCHAR(60) NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "group_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_poll_votes" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "option_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_poll_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "group_polls_group_id_created_at_idx" ON "group_polls"("group_id", "created_at");

-- CreateIndex
CREATE INDEX "group_poll_options_poll_id_idx" ON "group_poll_options"("poll_id");

-- CreateIndex
CREATE INDEX "group_poll_votes_poll_id_user_id_idx" ON "group_poll_votes"("poll_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "group_poll_votes_option_id_user_id_key" ON "group_poll_votes"("option_id", "user_id");

-- AddForeignKey
ALTER TABLE "group_polls" ADD CONSTRAINT "group_polls_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_poll_options" ADD CONSTRAINT "group_poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "group_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_poll_votes" ADD CONSTRAINT "group_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "group_polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_poll_votes" ADD CONSTRAINT "group_poll_votes_option_id_fkey" FOREIGN KEY ("option_id") REFERENCES "group_poll_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
