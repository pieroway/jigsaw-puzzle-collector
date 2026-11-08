<?php
declare(strict_types=1);
return static function(PDO $db): void {
    $q=$db->query("SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='import_items' AND COLUMN_NAME='preprocessing'");
    if(!(int)$q->fetchColumn()) $db->exec('ALTER TABLE import_items ADD COLUMN preprocessing JSON NULL');
    // Existing reviews and approvals remain intact. Only new or explicitly reprocessed items enter image review.
};
