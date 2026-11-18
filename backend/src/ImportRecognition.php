<?php
declare(strict_types=1);
namespace Jigsaw;

use PDO;

final class ImportRecognition {
    public function __construct(private PDO $db, private ImageStore $store, private \Closure $provider) {}

    public function identify(int $id, int $owner, array $request): array {
        if (($request['consent'] ?? null) !== true) throw new HttpError(422,'Confirm that Google can receive this photo.');
        $row = $this->reviewPhoto($id,$owner);
        $revision = $this->revision($row);
        if (!isset($request['revision']) || $request['revision'] !== $revision) {
            throw new HttpError(409,'The selected photo changed. Refresh the batch and try again.');
        }
        $lock = 'jigsaw-ai-'.hash('sha1', $this->query('SELECT DATABASE()')->fetchColumn().':'.$id);
        if ((int)$this->query('SELECT GET_LOCK(?,0)',[$lock])->fetchColumn() !== 1) {
            throw new HttpError(409,'Identification is already running for this photo.');
        }
        try {
            $row = $this->reviewPhoto($id,$owner);
            if ($this->revision($row) !== $revision) throw new HttpError(409,'The selected photo changed. Refresh the batch and try again.');
            $path = PreprocessingService::configured($this->db,$this->store)->selectedPath($row,$row);
            $jpeg = $this->preparePhoto($path);
            $this->reserveUsage($owner);
            $result = ($this->provider)($jpeg);
            if ($this->revision($this->reviewPhoto($id,$owner)) !== $revision) {
                throw new HttpError(409,'The selected photo changed. Refresh the batch and try again.');
            }
            try {
                $fields = ImportRules::fields(array_intersect_key($result,array_flip(['title','manufacturer','pieces','product_number'])));
                unset($fields['release_year']);
                $barcode = $result['barcode'] ?? null;
                if (!is_string($barcode) || !preg_match('/^\d{8,14}$/D',$barcode)) $barcode = null;
            } catch (\InvalidArgumentException) {
                throw new HttpError(502,'Google AI returned invalid suggestions. You can enter the details manually.');
            }
            return ['fields'=>$fields,'barcode'=>$barcode,'revision'=>$revision];
        } finally {
            $this->query('SELECT RELEASE_LOCK(?)',[$lock]);
        }
    }

    private function reviewPhoto(int $id, int $owner): array {
        $row = $this->query('SELECT i.state,i.preprocessing,i.image_id,p.storage_key
            FROM import_items i JOIN import_batches b ON b.id=i.batch_id
            JOIN private_images p ON p.id=i.image_id AND p.user_id=b.user_id
            WHERE i.id=? AND b.user_id=? AND b.deleted_at IS NULL',[$id,$owner])->fetch();
        if (!$row) throw new HttpError(404,'Import photo not found.');
        if (!in_array($row['state'],['needs_review','approved'],true)) {
            throw new HttpError(409,'Finish photo review before requesting identification.');
        }
        return $row;
    }

    private function revision(array $row): string {
        $photo = json_decode($row['preprocessing'] ?? 'null',true);
        return isset($photo['revision']) ? $photo['revision'].':'.$photo['decision'] : 'original';
    }

    private function preparePhoto(string $path): string {
        $bytes = @file_get_contents($path);
        $image = $bytes === false ? false : @imagecreatefromstring($bytes);
        if (!$image) throw new HttpError(422,'The selected photo could not be prepared for identification.');
        if (max(imagesx($image),imagesy($image)) > 1600) {
            $width = max(1,(int)round(imagesx($image) * 1600 / max(imagesx($image),imagesy($image))));
            $height = max(1,(int)round(imagesy($image) * 1600 / max(imagesx($image),imagesy($image))));
            $image = imagescale($image,$width,$height);
        }
        if (!$image) throw new HttpError(422,'The selected photo could not be resized.');
        ob_start();
        $encoded = imagejpeg($image,null,85);
        $jpeg = ob_get_clean();
        if (!$encoded || $jpeg === '') throw new HttpError(422,'The selected photo could not be encoded.');
        return $jpeg;
    }

    private function reserveUsage(int $owner): void {
        $day = gmdate('Y-m-d');
        $limits = [0=>max(1,(int)(getenv('AI_RECOGNITION_DAILY_LIMIT') ?: 20)),
            $owner=>max(1,(int)(getenv('AI_RECOGNITION_USER_DAILY_LIMIT') ?: 5))];
        $this->db->beginTransaction();
        try {
            foreach ($limits as $scope=>$limit) {
                $this->query('INSERT INTO ai_recognition_usage (usage_day,scope_id,attempts) VALUES (?,?,0)
                    ON DUPLICATE KEY UPDATE attempts=attempts',[$day,$scope]);
                $updated = $this->query('UPDATE ai_recognition_usage SET attempts=attempts+1
                    WHERE usage_day=? AND scope_id=? AND attempts<?',[$day,$scope,$limit]);
                if ($updated->rowCount() !== 1) throw new HttpError(429,'The daily AI allowance is used up. Try tomorrow or enter the details manually.');
            }
            $this->db->commit();
        } catch (\Throwable $error) {
            $this->db->rollBack();
            throw $error;
        }
    }

    private function query(string $sql, array $args = []): \PDOStatement {
        $statement = $this->db->prepare($sql);
        $statement->execute($args);
        return $statement;
    }
}
