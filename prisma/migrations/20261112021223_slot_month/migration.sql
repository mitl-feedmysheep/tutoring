-- CreateTable
CREATE TABLE `slot_month` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `month` DATE NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `slot_month_teacher_id_month_key`(`teacher_id`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `slot_month` ADD CONSTRAINT `slot_month_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teacher`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;
