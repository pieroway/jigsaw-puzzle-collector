<?php
declare(strict_types=1);
use PHPUnit\Framework\TestCase;
use Jigsaw\{CopyRules,CopyValidationError,CopyService,ImportService,ImageStore,ExtractionProvider,HttpError};
final class CopyRulesTest extends TestCase {
    public function testPrivateCorrectionsDoNotChangeOtherCopiesAndNullClearsKnownValues(): void {
        $source=['title'=>'Original','manufacturer'=>'Maker','piece_count'=>500,'sku'=>'A','release_year'=>2020,'edit_revision'=>1];
        $edited=CopyRules::effective([...$source,'field_overrides'=>json_encode(['title'=>'Corrected','manufacturer'=>null,'piece_count'=>1000])]);
        self::assertSame('Corrected',$edited['title']);self::assertNull($edited['manufacturer']);self::assertSame(1000,$edited['piece_count']);
        self::assertSame('Original',CopyRules::effective($source)['title']);self::assertSame(500,$source['piece_count']);
    }
    public function testValidationNormalizesOptionalValuesAndPreservesPlainTextNotes(): void {
        $fields=CopyRules::fields(['title'=>'  My puzzle  ','manufacturer'=>' ','piece_count'=>null,'sku'=>'','release_year'=>2024,'notes'=>' <b>Private note</b> ','box_condition'=>'good','seal_status'=>'opened','completeness'=>'unchecked','storage_location'=>' Shelf 3 ']);
        self::assertSame('My puzzle',$fields['title']);self::assertNull($fields['manufacturer']);self::assertNull($fields['sku']);
        self::assertSame('<b>Private note</b>',$fields['notes']);self::assertSame('Shelf 3',$fields['storage_location']);
    }
    public function testInvalidFieldsHaveFieldSpecificErrorsAndImmutableFieldsAreRejected(): void {
        try {CopyRules::fields(['title'=>'','piece_count'=>1.5,'release_year'=>1700,'box_condition'=>'invented','notes'=>str_repeat('x',5001),'edition_id'=>99]);self::fail('Invalid fields accepted');}
        catch(CopyValidationError $e) {foreach(['title','piece_count','release_year','box_condition','notes','edition_id'] as $field)self::assertArrayHasKey($field,$e->errors);}
    }
    public function testMissingCopyAndStaleRevisionRollBackWithoutWriting(): void {
        foreach([false,['edit_revision'=>2]] as $row) {
            $db=$this->createMock(PDO::class);$statement=$this->createMock(PDOStatement::class);
            $db->expects(self::once())->method('beginTransaction');$db->expects(self::once())->method('rollBack');$db->method('inTransaction')->willReturn(true);
            $db->expects(self::once())->method('prepare')->willReturnCallback(function(string $sql) use($statement) {self::assertStringContainsString('id=? AND user_id=? FOR UPDATE',$sql);return $statement;});
            $statement->expects(self::once())->method('execute')->with([12,7]);$statement->method('fetch')->willReturn($row);
            $imports=new ImportService($db,new ImageStore('/tmp'),$this->createMock(ExtractionProvider::class));
            try {(new CopyService($db,$imports))->update(12,7,['revision'=>1,'fields'=>['title'=>'My correction']]);self::fail('Unsafe update accepted');}
            catch(HttpError $e) {self::assertSame($row===false?404:409,$e->status);}
        }
    }
    public function testHistoryFailureRollsBackTheCopyUpdateAsOneTransaction(): void {
        $db=$this->createMock(PDO::class);$db->expects(self::once())->method('beginTransaction');$db->expects(self::never())->method('commit');$db->method('inTransaction')->willReturn(true);$db->expects(self::once())->method('rollBack');
        $row=['id'=>12,'edit_revision'=>1,'field_overrides'=>null,'title'=>'Original','manufacturer'=>'Maker','piece_count'=>500,'sku'=>null,'release_year'=>null,'import_item_id'=>null,'provenance'=>null,'copy_preprocessing'=>null];
        $lock=$this->createMock(PDOStatement::class);$lock->method('fetch')->willReturn($row);
        $read=$this->createMock(PDOStatement::class);$read->method('fetchAll')->willReturn([$row]);
        $write=$this->createMock(PDOStatement::class);$write->method('rowCount')->willReturn(1);
        $history=$this->createMock(PDOStatement::class);$history->method('execute')->willThrowException(new PDOException('History write failed'));
        $db->expects(self::exactly(4))->method('prepare')->willReturnCallback(function(string $sql) use($lock,$read,$write,$history) {
            if(str_starts_with($sql,'SELECT * FROM owned_copies'))return $lock;
            if(str_starts_with($sql,'SELECT c.*'))return $read;
            if(str_starts_with($sql,'UPDATE owned_copies')) {self::assertStringNotContainsString('edition_id=',$sql);self::assertStringNotContainsString('provenance=',$sql);return $write;}
            return $history;
        });
        $imports=new ImportService($db,new ImageStore('/tmp'),$this->createMock(ExtractionProvider::class));
        $this->expectException(PDOException::class);(new CopyService($db,$imports))->update(12,7,['revision'=>1,'fields'=>['title'=>'Corrected']]);
    }
}
