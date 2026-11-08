<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;

final class IntegrationTest extends TestCase {
    public function testHealthAndNotFoundResponses(): void {
        $body = file_get_contents('http://api/api/health');
        self::assertSame(['status' => 'ok', 'service' => 'jigsaw-api'], json_decode($body, true, 512, JSON_THROW_ON_ERROR));
        $context = stream_context_create(['http' => ['ignore_errors' => true]]);
        $body = file_get_contents('http://api/api/missing', false, $context);
        self::assertStringContainsString('404', $http_response_header[0]);
        self::assertSame(['error' => 'Not found'], json_decode($body, true, 512, JSON_THROW_ON_ERROR));
    }

    public function testDatabaseHasCoreTablesAndForeignKeys(): void {
        $db = new PDO('mysql:host=' . getenv('DB_HOST') . ';dbname=' . getenv('DB_NAME'), getenv('DB_USER'), getenv('DB_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        $tables = $db->query('SHOW TABLES')->fetchAll(PDO::FETCH_COLUMN);
        foreach (['users', 'puzzles', 'editions', 'owned_copies'] as $table) {
            self::assertContains($table, $tables);
        }
        $query = $db->prepare('SELECT COUNT(*) FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA = ?');
        $query->execute([getenv('DB_NAME')]);
        self::assertGreaterThanOrEqual(3, (int) $query->fetchColumn());
    }
}
