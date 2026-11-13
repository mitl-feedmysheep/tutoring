-- AlterTable
ALTER TABLE `slot` ADD COLUMN `meeting_external_id` VARCHAR(255) NULL,
    ADD COLUMN `meeting_provider` ENUM('GOOGLE_MEET', 'FIXED_LINK') NULL,
    ADD COLUMN `meeting_url` VARCHAR(500) NULL;

-- AlterTable
ALTER TABLE `teacher` ADD COLUMN `meeting_fixed_url` VARCHAR(500) NULL,
    ADD COLUMN `meeting_provider` ENUM('GOOGLE_MEET', 'FIXED_LINK') NULL;

-- CreateTable
CREATE TABLE `teacher_meeting_account` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `provider` ENUM('GOOGLE') NOT NULL,
    `account_email` VARCHAR(255) NOT NULL,
    `refresh_token` VARCHAR(2048) NOT NULL,
    `connected_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `teacher_meeting_account_teacher_id_provider_key`(`teacher_id`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `teacher_meeting_account` ADD CONSTRAINT `teacher_meeting_account_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teacher`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
