-- CreateTable Video
CREATE TABLE "Video" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "durationSeconds" INTEGER NOT NULL,
    "thumbnailUrl" TEXT NOT NULL,
    "hostedOn" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "qualities" TEXT NOT NULL,
    "subtitles" TEXT,
    "playlist" TEXT,
    "views" INTEGER NOT NULL DEFAULT 0,
    "watchTime" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "Video_category_idx" ON "Video"("category");
CREATE INDEX "Video_role_idx" ON "Video"("role");
CREATE INDEX "Video_views_idx" ON "Video"("views");
