<?php
declare(strict_types=1);
namespace Jigsaw;
final class ImageStore {
    public function __construct(public readonly string $root, private int $maxBytes = 12582912, private int $maxPixels = 25000000) {}
    public function inspect(string $path, string $name): array {
        if (str_contains($name, '/') || str_contains($name, '\\') || str_contains($name, "\0") || !preg_match('/\.(jpg|jpeg|png|webp)$/i', $name) || strlen($name)>255) throw new \InvalidArgumentException('Choose a JPEG, PNG or WebP image with a safe filename. Convert HEIC to JPEG first.');
        $bytes = filesize($path);
        if (!$bytes || $bytes > $this->maxBytes) throw new \InvalidArgumentException('Each image must be smaller than 12 MB. Resize and retry.');
        $mime = (new \finfo(FILEINFO_MIME_TYPE))->file($path);
        $size = @getimagesize($path);
        if (!$size || !in_array($mime, ['image/jpeg','image/png','image/webp'], true) || $size['mime'] !== $mime) throw new \InvalidArgumentException('This file is not a supported image. Choose JPEG, PNG or WebP.');
        if (min($size[0],$size[1])<16) throw new \InvalidArgumentException('The uploaded image must be at least 16 pixels per side.');
        if (max($size[0],$size[1])>12000 || $size[0]*$size[1]>$this->maxPixels) throw new \InvalidArgumentException(sprintf('The uploaded image is %d × %d pixels (%.2f megapixels). The limit is %.0f megapixels and 12,000 pixels per side. Export a smaller copy and retry.', $size[0], $size[1], $size[0]*$size[1]/1000000, $this->maxPixels/1000000));
        $image = @imagecreatefromstring(file_get_contents($path));
        if (!$image) throw new \InvalidArgumentException('The image is damaged or cannot be decoded. Export it again and retry.');
        imagedestroy($image);
        return ['sha256'=>hash_file('sha256',$path), 'mime'=>$mime, 'bytes'=>$bytes, 'width'=>$size[0], 'height'=>$size[1]];
    }
    public function save(string $path, string $key): void {
        if (!is_dir($this->root) && !mkdir($this->root,0700,true) && !is_dir($this->root)) throw new \RuntimeException('Private storage unavailable');
        $base = $this->path($key);
        try {
            if (!copy($path,$base.'.original')) throw new \RuntimeException('Could not store photo');
            chmod($base.'.original',0600);
            $image = self::oriented($path);
            $scale = min(1,800/max(imagesx($image),imagesy($image)));
            $thumb = imagescale($image, max(1,(int)(imagesx($image)*$scale)), max(1,(int)(imagesy($image)*$scale)));
            if (!imagejpeg($thumb,$base.'.jpg',85)) throw new \RuntimeException('Could not create thumbnail');
            chmod($base.'.jpg',0600); imagedestroy($thumb); imagedestroy($image);
        } catch (\Throwable $e) { $this->remove($key); throw $e; }
    }
    public static function oriented(string $path): \GdImage {
        $image=@imagecreatefromstring(file_get_contents($path));
        if(!$image) throw new \InvalidArgumentException('Cannot decode photograph.');
        $orientation=@exif_read_data($path)['Orientation'] ?? 1;
        if(in_array($orientation,[2,4,5,7],true)) imageflip($image,IMG_FLIP_HORIZONTAL);
        $angle=[3=>180,4=>180,5=>90,6=>-90,7=>-90,8=>90][$orientation] ?? 0;
        if($angle) { $rotated=imagerotate($image,$angle,0); imagedestroy($image); $image=$rotated; }
        return $image;
    }
    public function path(string $key): string {
        if (!preg_match('/^[a-f0-9]{48}$/D',$key)) throw new \InvalidArgumentException('Invalid image key');
        return $this->root.'/'.$key;
    }
    public function remove(string $key): void { foreach (['.jpg','.original'] as $suffix) if (is_file($this->path($key).$suffix)) unlink($this->path($key).$suffix); }
    public function removeVariants(string $key): void {
        $base=$this->path($key);
        foreach(['.original','.jpg','.source.jpg','.catalogue.jpg','.thumbnail.jpg','.studio.webp','.studio-thumbnail.webp'] as $suffix) {
            $path=$base.$suffix;
            if(is_file($path)&&!@unlink($path)) throw new \RuntimeException('Could not remove a private photo variant. Retry cleanup.');
        }
    }
}
