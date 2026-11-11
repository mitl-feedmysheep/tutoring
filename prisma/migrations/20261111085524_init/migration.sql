-- CreateTable
CREATE TABLE `teacher` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `email` VARCHAR(100) NOT NULL,
    `password_hash` VARCHAR(100) NOT NULL,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `session_version` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `teacher_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `student` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `name` VARCHAR(50) NOT NULL,
    `birth_year` SMALLINT NOT NULL,
    `gender` ENUM('MALE', 'FEMALE') NOT NULL,
    `email` VARCHAR(150) NOT NULL,
    `password_hash` VARCHAR(100) NOT NULL,
    `must_change_password` BOOLEAN NOT NULL DEFAULT false,
    `session_version` INTEGER NOT NULL DEFAULT 0,
    `occupation` VARCHAR(100) NULL,
    `deactivated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `student_email_key`(`email`),
    UNIQUE INDEX `student_teacher_id_id_key`(`teacher_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invite` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `memo` VARCHAR(50) NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `used_at` DATETIME(3) NULL,
    `student_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `invite_token_hash_key`(`token_hash`),
    INDEX `invite_teacher_id_created_at_idx`(`teacher_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `weekly_slot` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `weekday` TINYINT NOT NULL,
    `start_minute` SMALLINT NOT NULL,
    `end_minute` SMALLINT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `weekly_slot_teacher_id_id_key`(`teacher_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `slot` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `weekly_slot_id` CHAR(36) NULL,
    `starts_at` DATETIME(3) NOT NULL,
    `ends_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `slot_teacher_id_starts_at_idx`(`teacher_id`, `starts_at`),
    UNIQUE INDEX `slot_teacher_id_id_key`(`teacher_id`, `id`),
    UNIQUE INDEX `slot_weekly_slot_id_starts_at_key`(`weekly_slot_id`, `starts_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `weekly_lesson` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `weekly_slot_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `weekly_lesson_student_id_idx`(`student_id`),
    UNIQUE INDEX `weekly_lesson_teacher_id_id_key`(`teacher_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `slot_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `weekly_lesson_id` CHAR(36) NULL,
    `attendance` ENUM('COMPLETED', 'ABSENT') NULL,
    `canceled_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `lesson_teacher_id_student_id_idx`(`teacher_id`, `student_id`),
    UNIQUE INDEX `lesson_teacher_id_id_key`(`teacher_id`, `id`),
    UNIQUE INDEX `lesson_slot_id_student_id_key`(`slot_id`, `student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `schedule_change` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `lesson_id` CHAR(36) NULL,
    `weekly_lesson_id` CHAR(36) NULL,
    `action` ENUM('ADD', 'CANCEL', 'MOVE', 'CHANGE', 'REMOVE') NOT NULL,
    `before_text` VARCHAR(50) NULL,
    `after_text` VARCHAR(50) NULL,
    `changed_by` ENUM('STUDENT', 'TEACHER', 'SYSTEM') NOT NULL,
    `reason` VARCHAR(200) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `schedule_change_teacher_id_student_id_created_at_idx`(`teacher_id`, `student_id`, `created_at`),
    INDEX `schedule_change_lesson_id_idx`(`lesson_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson_note` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `lesson_id` CHAR(36) NOT NULL,
    `author` ENUM('TEACHER', 'STUDENT') NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `lesson_note_lesson_id_author_key`(`lesson_id`, `author`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `study_log` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NULL,
    `study_date` DATE NOT NULL,
    `minutes` SMALLINT NOT NULL,
    `memo` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `study_log_teacher_id_student_id_study_date_idx`(`teacher_id`, `student_id`, `study_date`),
    UNIQUE INDEX `study_log_teacher_id_id_key`(`teacher_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `uploader_student_id` CHAR(36) NULL,
    `kind` ENUM('STUDY_PHOTO', 'MATERIAL') NOT NULL,
    `study_log_id` CHAR(36) NULL,
    `file_name` VARCHAR(200) NOT NULL,
    `r2_key` VARCHAR(200) NOT NULL,
    `content_type` VARCHAR(100) NOT NULL,
    `size_bytes` INTEGER NOT NULL,
    `sort_order` TINYINT NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `file_teacher_id_kind_created_at_idx`(`teacher_id`, `kind`, `created_at`),
    INDEX `file_study_log_id_idx`(`study_log_id`),
    UNIQUE INDEX `file_teacher_id_id_key`(`teacher_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `file_access` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `file_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `file_access_teacher_id_student_id_idx`(`teacher_id`, `student_id`),
    UNIQUE INDEX `file_access_file_id_student_id_key`(`file_id`, `student_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `month` DATE NOT NULL,
    `paid_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `payment_teacher_id_month_idx`(`teacher_id`, `month`),
    UNIQUE INDEX `payment_student_id_month_key`(`student_id`, `month`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `board` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `student_id` CHAR(36) NOT NULL,
    `author` ENUM('TEACHER', 'STUDENT') NOT NULL,
    `title` VARCHAR(100) NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `board_teacher_id_student_id_created_at_idx`(`teacher_id`, `student_id`, `created_at`),
    UNIQUE INDEX `board_teacher_id_id_key`(`teacher_id`, `id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comment` (
    `id` CHAR(36) NOT NULL,
    `teacher_id` CHAR(36) NOT NULL,
    `board_id` CHAR(36) NOT NULL,
    `author` ENUM('TEACHER', 'STUDENT') NOT NULL,
    `content` TEXT NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `comment_board_id_created_at_idx`(`board_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `student` ADD CONSTRAINT `student_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teacher`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `invite` ADD CONSTRAINT `invite_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teacher`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `invite` ADD CONSTRAINT `invite_teacher_id_student_id_fkey` FOREIGN KEY (`teacher_id`, `student_id`) REFERENCES `student`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `weekly_slot` ADD CONSTRAINT `weekly_slot_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teacher`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `slot` ADD CONSTRAINT `slot_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teacher`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `slot` ADD CONSTRAINT `slot_teacher_id_weekly_slot_id_fkey` FOREIGN KEY (`teacher_id`, `weekly_slot_id`) REFERENCES `weekly_slot`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `weekly_lesson` ADD CONSTRAINT `weekly_lesson_teacher_id_student_id_fkey` FOREIGN KEY (`teacher_id`, `student_id`) REFERENCES `student`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `weekly_lesson` ADD CONSTRAINT `weekly_lesson_teacher_id_weekly_slot_id_fkey` FOREIGN KEY (`teacher_id`, `weekly_slot_id`) REFERENCES `weekly_slot`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `lesson` ADD CONSTRAINT `lesson_teacher_id_slot_id_fkey` FOREIGN KEY (`teacher_id`, `slot_id`) REFERENCES `slot`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `lesson` ADD CONSTRAINT `lesson_teacher_id_student_id_fkey` FOREIGN KEY (`teacher_id`, `student_id`) REFERENCES `student`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `lesson` ADD CONSTRAINT `lesson_teacher_id_weekly_lesson_id_fkey` FOREIGN KEY (`teacher_id`, `weekly_lesson_id`) REFERENCES `weekly_lesson`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedule_change` ADD CONSTRAINT `schedule_change_teacher_id_student_id_fkey` FOREIGN KEY (`teacher_id`, `student_id`) REFERENCES `student`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedule_change` ADD CONSTRAINT `schedule_change_teacher_id_lesson_id_fkey` FOREIGN KEY (`teacher_id`, `lesson_id`) REFERENCES `lesson`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `schedule_change` ADD CONSTRAINT `schedule_change_teacher_id_weekly_lesson_id_fkey` FOREIGN KEY (`teacher_id`, `weekly_lesson_id`) REFERENCES `weekly_lesson`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `lesson_note` ADD CONSTRAINT `lesson_note_teacher_id_lesson_id_fkey` FOREIGN KEY (`teacher_id`, `lesson_id`) REFERENCES `lesson`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `study_log` ADD CONSTRAINT `study_log_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teacher`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `study_log` ADD CONSTRAINT `study_log_teacher_id_student_id_fkey` FOREIGN KEY (`teacher_id`, `student_id`) REFERENCES `student`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `file` ADD CONSTRAINT `file_teacher_id_fkey` FOREIGN KEY (`teacher_id`) REFERENCES `teacher`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `file` ADD CONSTRAINT `file_teacher_id_uploader_student_id_fkey` FOREIGN KEY (`teacher_id`, `uploader_student_id`) REFERENCES `student`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `file` ADD CONSTRAINT `file_teacher_id_study_log_id_fkey` FOREIGN KEY (`teacher_id`, `study_log_id`) REFERENCES `study_log`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `file_access` ADD CONSTRAINT `file_access_teacher_id_file_id_fkey` FOREIGN KEY (`teacher_id`, `file_id`) REFERENCES `file`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `file_access` ADD CONSTRAINT `file_access_teacher_id_student_id_fkey` FOREIGN KEY (`teacher_id`, `student_id`) REFERENCES `student`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `payment` ADD CONSTRAINT `payment_teacher_id_student_id_fkey` FOREIGN KEY (`teacher_id`, `student_id`) REFERENCES `student`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `board` ADD CONSTRAINT `board_teacher_id_student_id_fkey` FOREIGN KEY (`teacher_id`, `student_id`) REFERENCES `student`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `comment` ADD CONSTRAINT `comment_teacher_id_board_id_fkey` FOREIGN KEY (`teacher_id`, `board_id`) REFERENCES `board`(`teacher_id`, `id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- schedule_change: 수업 1회(lesson_id)와 고정 일정(weekly_lesson_id) 중 정확히 하나만 채운다
ALTER TABLE `schedule_change` ADD CONSTRAINT `schedule_change_target_check` CHECK ((`lesson_id` IS NULL) <> (`weekly_lesson_id` IS NULL));
