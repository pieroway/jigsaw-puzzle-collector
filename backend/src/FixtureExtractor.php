<?php
declare(strict_types=1);
namespace Jigsaw;
final class FixtureExtractor implements ExtractionProvider {
    private ?array $index = null;
    public function __construct(private string $root) {}
    public function extract(string $path,?string $sourceHash=null): array {
        if ($this->index===null) {
            $this->index=[];
            $data=json_decode(file_get_contents($this->root.'/puzzles.json'),true,512,JSON_THROW_ON_ERROR);
            foreach ($data['puzzles'] as $entry) $this->index[hash_file('sha256',$this->root.'/'.$entry['photo'])]=$entry;
        }
        $entry = $this->index[$sourceHash ?? hash_file('sha256', $path)] ?? [];
        return ['title'=>$entry['title'] ?? null, 'manufacturer'=>$entry['manufacturer_or_brand'] ?? null, 'pieces'=>$entry['piece_count'] ?? null,
            'product_number'=>$entry['product_number'] ?? null, 'release_year'=>$entry['release_year'] ?? null,
            'provider'=>'deterministic_fixture', 'source'=>$entry['source'] ?? 'unrecognized_photo', 'confidence'=>$entry['identification_confidence'] ?? 'unknown',
            'catalogue_verified'=>false, 'photo_notes'=>$entry['visible_series_or_description'] ?? null,
            'fixture_id'=>$entry['import_id'] ?? null, 'evidence'=>'Provisional photo-derived fixture transcription; all proposed identity fields need human review.'];
    }
}
