<?php
declare(strict_types=1);
return static function(PDO $db): void {
    $db->exec('CREATE TABLE IF NOT EXISTS ai_recognition_usage (
        usage_day DATE NOT NULL,
        scope_id BIGINT UNSIGNED NOT NULL,
        attempts INT UNSIGNED NOT NULL,
        PRIMARY KEY (usage_day,scope_id)
    )');
};
