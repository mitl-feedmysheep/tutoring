-- CreateTable
CREATE TABLE `notification_log` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `kind` ENUM('LESSON_REMINDER', 'SCHEDULE_CHANGED', 'SLOT_DELETED', 'STUDY_MISSING', 'BOARD', 'WEEKLY_MISSING', 'TEACHER_CHANGED') NOT NULL,
    `target_key` VARCHAR(100) NOT NULL,
    `recipient` VARCHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `notification_log_teacher_id_kind_target_key_recipient_key`(`teacher_id`, `kind`, `target_key`, `recipient`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notification_log` ADD CONSTRAINT `notification_log_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teacher`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
