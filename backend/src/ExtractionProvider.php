<?php
declare(strict_types=1);
namespace Jigsaw;
interface ExtractionProvider {
    /** Local path only. Future remote providers require separate consent and server-side secrets. */
    public function extract(string $path,?string $sourceHash=null): array;
}
