<?php
declare(strict_types=1);
namespace Jigsaw;
use PDO;
final class Database {
    public static function connect(): PDO {
        $db = new PDO('mysql:host='.getenv('DB_HOST').';dbname='.getenv('DB_NAME').';charset=utf8mb4', getenv('DB_USER'), getenv('DB_PASSWORD'), [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_EMULATE_PREPARES=>false, PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
        $db->exec("SET time_zone = '+00:00'"); return $db;
    }
}
