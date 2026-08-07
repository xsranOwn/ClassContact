-- ============================================================
-- chatroom schema - 教师(A)与班级大屏(B)沟通系统
-- 主键一律 CHAR(36) UUID(由应用层 crypto.randomUUID 生成)
-- ============================================================

CREATE TABLE IF NOT EXISTS users (
  id            CHAR(36) PRIMARY KEY,
  username      VARCHAR(64)  NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(128) NOT NULL,
  role          ENUM('admin','head_teacher','teacher','screen') NOT NULL,
  class_id      CHAR(36) DEFAULT NULL COMMENT 'B(大屏)账号绑定的班级',
  avatar        VARCHAR(512) DEFAULT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS classes (
  id          CHAR(36) PRIMARY KEY,
  code        VARCHAR(20) DEFAULT NULL COMMENT '班级业务编号(如 202415,唯一)',
  name        VARCHAR(128) NOT NULL,
  invite_code VARCHAR(16)  NOT NULL UNIQUE,
  owner_id    CHAR(36) NOT NULL COMMENT '班主任 C',
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_classes_code (code),
  CONSTRAINT fk_classes_owner FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS class_members (
  id         CHAR(36) PRIMARY KEY,
  class_id   CHAR(36) NOT NULL,
  user_id    CHAR(36) NOT NULL,
  status     ENUM('pending','approved') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_class_user (class_id, user_id),
  CONSTRAINT fk_cm_class FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
  CONSTRAINT fk_cm_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS friendships (
  id         CHAR(36) PRIMARY KEY,
  user_a     CHAR(36) NOT NULL COMMENT '好友关系中字典序较小的一方',
  user_b     CHAR(36) NOT NULL COMMENT '好友关系中字典序较大的一方',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_friend (user_a, user_b),
  CONSTRAINT fk_friend_a FOREIGN KEY (user_a) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_friend_b FOREIGN KEY (user_b) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id           CHAR(36) PRIMARY KEY,
  sender_id    CHAR(36) NOT NULL,
  receiver_id  CHAR(36) NOT NULL,
  type         ENUM('text','image','video','file') NOT NULL DEFAULT 'text',
  content      TEXT COMMENT '文本内容或文件描述',
  file_url     VARCHAR(1024) DEFAULT NULL,
  file_name    VARCHAR(255) DEFAULT NULL,
  file_size    BIGINT DEFAULT NULL,
  file_deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '文件已删除标记(收发双方删除或 OneDrive 文件丢失)',
  read_at      DATETIME DEFAULT NULL COMMENT '接收方已读时间',
  created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_conversation (sender_id, receiver_id, id),
  INDEX idx_receiver_unread (receiver_id, read_at),
  CONSTRAINT fk_msg_sender   FOREIGN KEY (sender_id)   REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_msg_receiver FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         CHAR(36) PRIMARY KEY,
  user_id    CHAR(36) NOT NULL,
  endpoint   VARCHAR(512) NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_push_endpoint (endpoint),
  CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS settings (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  setting_key   VARCHAR(64) NOT NULL UNIQUE,
  setting_value VARCHAR(255) NOT NULL,
  updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
