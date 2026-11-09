<?php
declare(strict_types=1);
namespace Jigsaw;
final class CopyValidationError extends \InvalidArgumentException {
    public function __construct(public readonly array $errors) {parent::__construct('Please correct the highlighted fields.');}
}
