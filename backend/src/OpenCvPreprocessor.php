<?php
declare(strict_types=1);
namespace Jigsaw;
final class OpenCvPreprocessor implements PhotoPreprocessor {
    public function __construct(private string $url,private string $key) {}
    public function process(string $path,?array $corners=null,?int $rotation=null): array {
        if($corners!==null) $corners=CornerGeometry::validate($corners);
        if(!in_array(parse_url($this->url,PHP_URL_SCHEME),['http','https'],true)) throw new \RuntimeException('Processor address is invalid');
        $payload=['image'=>base64_encode(file_get_contents($path))]; if($corners!==null) $payload['corners']=$corners;
        if($rotation!==null) { if(!in_array($rotation,[0,90,180,270],true)) throw new \InvalidArgumentException('Invalid rotation'); $payload['rotation']=$rotation; }
        $context=stream_context_create(['http'=>['method'=>'POST','header'=>"Content-Type: application/json\r\nX-Processor-Key: ".$this->key,'content'=>json_encode($payload,JSON_THROW_ON_ERROR),'timeout'=>20,'ignore_errors'=>true,'follow_location'=>0]]);
        $body=@file_get_contents(rtrim($this->url,'/').'/process',false,$context,0,10*1024*1024+1);
        if($body===false||strlen($body)>10*1024*1024||!str_contains($http_response_header[0] ?? '',' 200 ')) throw new \RuntimeException('OpenCV processor unavailable. Retry or keep the original photograph.');
        $result=json_decode($body,true,32,JSON_THROW_ON_ERROR);
        if(!is_array($result)) throw new \RuntimeException('Invalid processor response');
        foreach(['source','catalogue','thumbnail'] as $field) {
            $bytes=base64_decode($result[$field] ?? '',true);
            $size=$bytes===false?false:@getimagesizefromstring($bytes);
            if(!$size||$size['mime']!=='image/jpeg'||max($size[0],$size[1])>($field==='thumbnail'?400:1600)) throw new \RuntimeException('Invalid processor image');
            $result[$field]=$bytes;
        }
        $result['corners']=CornerGeometry::validate($result['corners'] ?? []);
        if(!is_numeric($result['confidence'] ?? null)||$result['confidence']<0||$result['confidence']>1||$result['engine']!=='opencv') throw new \RuntimeException('Invalid processor metadata');
        $orientation=$result['orientation'] ?? null;
        if(!is_array($orientation)||!in_array($orientation['angle'] ?? null,[0,90,180,270],true)||!is_bool($orientation['ambiguous'] ?? null)||!in_array($orientation['source'] ?? null,['ocr','manual'],true)) throw new \RuntimeException('Invalid orientation metadata');
        if($rotation!==null&&($orientation['source']!=='manual'||$orientation['angle']!==$rotation)) throw new \RuntimeException('Processor did not preserve manual rotation');
        return $result;
    }
}
