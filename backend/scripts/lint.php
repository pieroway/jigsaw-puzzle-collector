<?php
declare(strict_types=1);
foreach (['src','public','scripts','migrations','tests'] as $directory) {
    $files=new RecursiveIteratorIterator(new RecursiveDirectoryIterator(__DIR__.'/../'.$directory,FilesystemIterator::SKIP_DOTS));
    foreach ($files as $file) if ($file->isFile()&&$file->getExtension()==='php') {
        passthru(escapeshellarg(PHP_BINARY).' -l '.escapeshellarg($file->getPathname()),$status);
        if ($status!==0) exit($status);
    }
}
