<?php
declare(strict_types=1);
return static function(PDO $db): void {
    $q=$db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='import_batches' AND COLUMN_NAME='deleted_at'");
    if(!(int)$q->fetchColumn()) $db->exec('ALTER TABLE import_batches ADD COLUMN deleted_at DATETIME NULL');
    $db->exec('CREATE TABLE IF NOT EXISTS image_deletion_queue (image_id BIGINT UNSIGNED PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,asset_keys JSON NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,INDEX(user_id),FOREIGN KEY(image_id) REFERENCES private_images(id),FOREIGN KEY(user_id) REFERENCES users(id))');
};
