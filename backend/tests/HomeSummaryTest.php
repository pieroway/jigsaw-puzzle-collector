<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use Jigsaw\HomeSummary;
final class HomeSummaryTest extends TestCase {
    public function testSummaryUsesOwnerScopedAggregatesAndExcludesDeletedOrFinishedBatches(): void {
        $db=$this->createMock(PDO::class); $statement=$this->createMock(PDOStatement::class);
        $db->expects(self::exactly(2))->method('prepare')->willReturnCallback(function(string $sql) use($statement) {
            if(str_contains($sql,'owned_copies')) {
                self::assertStringContainsString('c.user_id=?',$sql);
                self::assertStringContainsString('LOWER(TRIM(e.manufacturer))',$sql);
                self::assertStringNotContainsString('LIMIT 1000',$sql);
            } else {
                self::assertStringContainsString('b.user_id=?',$sql);self::assertStringContainsString('b.deleted_at IS NULL',$sql);
                self::assertStringContainsString('HAVING remaining>0',$sql);self::assertStringContainsString('LIMIT 3',$sql);
            }
            return $statement;
        });
        $statement->expects(self::exactly(2))->method('execute')->with([7]);
        $statement->method('fetch')->willReturn(['puzzles'=>'1201','manufacturers'=>'12','known_pieces'=>'650000']);
        $statement->method('fetchAll')->willReturn([['id'=>'42','created_at'=>'2026-11-08 12:00:00','remaining'=>'4','image_review'=>'2','needs_review'=>'1','failed'=>'1','approved'=>'0','queued'=>'0','processing'=>'0']]);
        $result=(new HomeSummary($db))->get(7);
        self::assertSame(1201,$result['totals']['puzzles']);self::assertSame(650000,$result['totals']['known_pieces']);
        self::assertSame(42,$result['batches'][0]['id']);self::assertSame(4,$result['batches'][0]['remaining']);
    }
}
