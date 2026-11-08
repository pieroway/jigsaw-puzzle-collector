<?php
declare(strict_types=1);
return static function(PDO $db): void {
    // Guard each additive ALTER so interruption can safely resume on existing starter volumes.
    $columns = [
      'puzzles'=>['owner_id'=>'BIGINT UNSIGNED NULL', 'visibility'=>"VARCHAR(12) NOT NULL DEFAULT 'private'", 'catalogue_verified'=>'BOOLEAN NOT NULL DEFAULT FALSE'],
      'editions'=>['owner_id'=>'BIGINT UNSIGNED NULL', 'identity_key'=>'CHAR(64) NULL', 'candidate_key'=>'CHAR(64) NULL'],
      'owned_copies'=>['visibility'=>"VARCHAR(12) NOT NULL DEFAULT 'private'", 'import_item_id'=>'BIGINT UNSIGNED NULL', 'image_id'=>'BIGINT UNSIGNED NULL', 'provenance'=>'JSON NULL'],
      'import_items'=>['identity_key'=>'CHAR(64) NULL'],
    ];
    foreach ($columns as $table=>$definitions) foreach ($definitions as $column=>$definition) {
        $q = $db->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=?'); $q->execute([$table, $column]);
        if (!(int)$q->fetchColumn()) $db->exec("ALTER TABLE $table ADD COLUMN $column $definition");
    }
    foreach (['editions'=>['edition_owner_identity'=>'UNIQUE (owner_id, identity_key)'], 'owned_copies'=>['copy_import_item'=>'UNIQUE (import_item_id)']] as $table=>$indexes) foreach ($indexes as $name=>$sql) {
        $q = $db->prepare('SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=?'); $q->execute([$table,$name]);
        if (!(int)$q->fetchColumn()) $db->exec("ALTER TABLE $table ADD UNIQUE INDEX $name ".str_replace('UNIQUE ', '', $sql));
        // Upgrade a previously interrupted nonunique index before considering migration complete.
        $q = $db->query("SHOW INDEX FROM $table WHERE Key_name='$name'");
        if ((int)$q->fetch()['Non_unique'] !== 0) $db->exec("ALTER TABLE $table DROP INDEX $name, ADD UNIQUE INDEX $name ".str_replace('UNIQUE ', '', $sql));
    }
    $q=$db->query("SELECT IS_NULLABLE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='editions' AND COLUMN_NAME='manufacturer'");
    if ($q->fetchColumn()==='NO') $db->exec('ALTER TABLE editions MODIFY manufacturer VARCHAR(160) NULL');
    $q=$db->query("SHOW INDEX FROM import_items WHERE Key_name='import_identity'");
    if (!$q->fetch()) $db->exec('ALTER TABLE import_items ADD INDEX import_identity(identity_key)');
    $q=$db->query("SHOW INDEX FROM editions WHERE Key_name='edition_candidates'");
    if (!$q->fetch()) $db->exec('ALTER TABLE editions ADD INDEX edition_candidates(candidate_key,owner_id)');
    foreach ($db->query('SELECT e.*,p.title FROM editions e JOIN puzzles p ON p.id=e.puzzle_id WHERE e.owner_id IS NOT NULL AND e.candidate_key IS NULL')->fetchAll() as $edition) {
        $key=Jigsaw\ImportRules::identity(['title'=>$edition['title'],'manufacturer'=>$edition['manufacturer'],'pieces'=>$edition['piece_count'],'product_number'=>$edition['sku']]);
        if ($key) $db->prepare('UPDATE editions SET candidate_key=?,identity_key=? WHERE id=?')->execute([$key,hash('sha256',$key.'|'.($edition['release_year'] ?? 'unknown')),$edition['id']]);
    }
    $foreignKeys=[
      ['puzzles','puzzle_owner','owner_id','users'], ['editions','edition_owner','owner_id','users'],
      ['owned_copies','copy_import_source','import_item_id','import_items'], ['owned_copies','copy_image','image_id','private_images'],
    ];
    foreach ($foreignKeys as [$table,$name,$column,$target]) {
        $q=$db->prepare('SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND CONSTRAINT_NAME=?'); $q->execute([$name]);
        if (!(int)$q->fetchColumn()) $db->exec("ALTER TABLE $table ADD CONSTRAINT $name FOREIGN KEY ($column) REFERENCES $target(id)");
    }
};
