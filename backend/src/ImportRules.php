<?php
declare(strict_types=1);
namespace Jigsaw;
final class ImportRules {
    public static function normalize(?string $text): string {
        return trim(preg_replace('/[^\p{L}\p{N}]+/u', ' ', mb_strtolower(trim($text ?? ''), 'UTF-8')));
    }
    public static function identity(array $fields): ?string {
        $title = self::normalize($fields['title'] ?? null); $maker = self::normalize($fields['manufacturer'] ?? null);
        if (!$title || !$maker || (empty($fields['pieces']) && empty($fields['product_number']))) return null;
        return hash('sha256', json_encode([$maker, $title, $fields['pieces'] ?? null, self::normalize($fields['product_number'] ?? null)]));
    }
    public static function canTransition(string $from, string $to): bool {
        return in_array($to, ['queued'=>['processing','image_review','failed'], 'processing'=>['needs_review','failed'], 'image_review'=>['queued','rejected'], 'failed'=>['queued'], 'needs_review'=>['approved','rejected'], 'approved'=>['imported','needs_review','rejected'], 'rejected'=>['needs_review'], 'imported'=>[]][$from] ?? [], true);
    }
    public static function fields(array $data): array {
        $result = [];
        foreach (['title'=>255,'manufacturer'=>160,'product_number'=>100] as $field=>$max) {
            $value = $data[$field] ?? null;
            if ($value !== null && !is_string($value)) throw new \InvalidArgumentException("$field must be text or null");
            $value = $value === null ? null : trim($value);
            if ($value === '') $value = null;
            if ($value !== null && mb_strlen($value) > $max) throw new \InvalidArgumentException("$field is too long");
            $result[$field] = $value;
        }
        foreach (['pieces'=>[1,100000], 'release_year'=>[1800,2100]] as $field=>[$min,$max]) {
            $value = $data[$field] ?? null;
            if ($value !== null && (!is_int($value) || $value < $min || $value > $max)) throw new \InvalidArgumentException("$field must be a whole number between $min and $max, or unknown");
            $result[$field] = $value;
        }
        return $result;
    }
}
