<?php
declare(strict_types=1);
return static function(PDO $db): void {
    $db->exec('CREATE TABLE IF NOT EXISTS deleted_owned_copies (copy_id BIGINT UNSIGNED PRIMARY KEY,user_id BIGINT UNSIGNED NOT NULL,import_item_id BIGINT UNSIGNED NULL,deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,INDEX(user_id,import_item_id),FOREIGN KEY(user_id) REFERENCES users(id))');
    $q=$db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='private_images' AND COLUMN_NAME='cleanup_keys'");
    if(!(int)$q->fetchColumn())$db->exec('ALTER TABLE private_images ADD COLUMN cleanup_keys JSON NULL');
};
