<?php
declare(strict_types=1);
return static function(PDO $db): void {
    foreach(['field_overrides'=>'JSON NULL','edit_revision'=>'INT UNSIGNED NOT NULL DEFAULT 1'] as $column=>$definition) {
        $q=$db->prepare("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='owned_copies' AND COLUMN_NAME=?");$q->execute([$column]);
        if(!(int)$q->fetchColumn())$db->exec("ALTER TABLE owned_copies ADD COLUMN $column $definition");
    }
    $db->exec('CREATE TABLE IF NOT EXISTS owned_copy_edits (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,copy_id BIGINT UNSIGNED NOT NULL,user_id BIGINT UNSIGNED NOT NULL,revision INT UNSIGNED NOT NULL,before_values JSON NOT NULL,after_values JSON NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(copy_id,revision),INDEX(user_id,copy_id),FOREIGN KEY(copy_id) REFERENCES owned_copies(id),FOREIGN KEY(user_id) REFERENCES users(id))');
};
