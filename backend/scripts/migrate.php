<?php
declare(strict_types=1);
spl_autoload_register(function ($class) { $path = __DIR__.'/../src/'.substr($class, strlen('Jigsaw\\')).'.php'; if (is_file($path)) require $path; });
$db = Jigsaw\Database::connect();
$lock = 'jigsaw-migrate-'.getenv('DB_NAME');
$stmt = $db->prepare('SELECT GET_LOCK(?, 30)'); $stmt->execute([$lock]);
if ((int)$stmt->fetchColumn() !== 1) throw new RuntimeException('Migration lock unavailable');
try {
    $db->exec('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(100) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)');
    foreach (glob(__DIR__.'/../migrations/*') as $path) {
        $extension=pathinfo($path,PATHINFO_EXTENSION); if (!in_array($extension,["sql","php"],true)) continue; $name = basename($path); $q = $db->prepare('SELECT name FROM schema_migrations WHERE name=?'); $q->execute([$name]);
        if (!$q->fetchColumn()) {
            if ($extension === "sql") $db->exec(file_get_contents($path)); else { $migration=require $path; $migration($db); }
            $db->prepare('INSERT INTO schema_migrations (name) VALUES (?)')->execute([$name]);
        }
    }
    echo "Migrations applied.\n";
} finally { $db->prepare('SELECT RELEASE_LOCK(?)')->execute([$lock]); }
