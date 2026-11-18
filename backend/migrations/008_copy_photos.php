<?php
declare(strict_types=1);
return static function(PDO $db): void {
    $db->exec("CREATE TABLE IF NOT EXISTS copy_photos (id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,copy_id BIGINT UNSIGNED NOT NULL,image_id BIGINT UNSIGNED NOT NULL,name VARCHAR(80) NOT NULL DEFAULT '',FOREIGN KEY(copy_id) REFERENCES owned_copies(id),FOREIGN KEY(image_id) REFERENCES private_images(id),INDEX(copy_id))");
};
