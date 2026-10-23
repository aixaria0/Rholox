<?php
declare(strict_types=1);

namespace Rholox\LegacyRev;

const MAX_BODY_BYTES = 256;
const MAX_DATA_BYTES = 8 * 1024 * 1024;

function validAmount($value): bool
{
    return is_string($value) && preg_match('/\A(0|[1-9][0-9]{0,19})\z/', $value) === 1
        && (strlen($value) < 20 || strcmp($value, '18446744073709551615') <= 0);
}

function normalizeAddress(string $input): string
{
    $address = trim($input);
    if (strlen($address) < 40 || strlen($address) > 64
        || preg_match('/\A[1-9A-HJ-NP-Za-km-z]+\z/', $address) !== 1) {
        throw new \InvalidArgumentException('Invalid REV address');
    }
    $alphabet = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    $bytes = [];
    foreach (str_split($address) as $character) {
        $carry = strpos($alphabet, $character);
        foreach ($bytes as $index => $byte) {
            $carry += $byte * 58;
            $bytes[$index] = $carry & 255;
            $carry = intdiv($carry, 256);
        }
        while ($carry > 0) {
            $bytes[] = $carry & 255;
            $carry = intdiv($carry, 256);
        }
    }
    $decoded = str_repeat("\0", strspn($address, '1'));
    foreach (array_reverse($bytes) as $byte) {
        $decoded .= chr($byte);
    }
    if (strlen($decoded) !== 40 || substr($decoded, 0, 4) !== str_repeat("\0", 4)
        || !hash_equals(substr(sodium_crypto_generichash(substr($decoded, 0, 36), '', 32), 0, 4), substr($decoded, 36))) {
        throw new \InvalidArgumentException('Invalid REV checksum');
    }
    return $address;
}

function limitedFile(string $path, int $limit): string
{
    $contents = @file_get_contents($path, false, null, 0, $limit + 1);
    if ($contents === false || strlen($contents) > $limit) {
        throw new \RuntimeException('Unavailable reference');
    }
    return $contents;
}

function loadSnapshot(string $directory): array
{
    $manifest = json_decode(limitedFile($directory . '/manifest.json', 4096), true, 8, JSON_THROW_ON_ERROR);
    if (!is_array($manifest) || ($manifest['schema_version'] ?? null) !== 1
        || ($manifest['decimals'] ?? null) !== 8 || !is_int($manifest['record_count'] ?? null)
        || $manifest['record_count'] < 1 || $manifest['record_count'] > 50000
        || !is_string($manifest['snapshot_date'] ?? null)
        || preg_match('/\A[0-9]{4}-[0-9]{2}-[0-9]{2}\z/', $manifest['snapshot_date']) !== 1
        || !in_array($manifest['snapshot_date_basis'] ?? null, ['source_title', 'operator_reference'], true)
        || !is_string($manifest['sha256'] ?? null) || preg_match('/\A[a-f0-9]{64}\z/', $manifest['sha256']) !== 1
        || !is_int($manifest['byte_length'] ?? null) || $manifest['byte_length'] < 1
        || $manifest['byte_length'] > MAX_DATA_BYTES) {
        throw new \RuntimeException('Invalid reference metadata');
    }
    $date = \DateTimeImmutable::createFromFormat('!Y-m-d', $manifest['snapshot_date']);
    if ($date === false || $date->format('Y-m-d') !== $manifest['snapshot_date']) {
        throw new \RuntimeException('Invalid reference date');
    }
    $raw = limitedFile($directory . '/balances.json', MAX_DATA_BYTES);
    if (strlen($raw) !== $manifest['byte_length'] || !hash_equals($manifest['sha256'], hash('sha256', $raw))) {
        throw new \RuntimeException('Reference integrity failure');
    }
    $data = json_decode($raw, true, 8, JSON_THROW_ON_ERROR);
    if (!is_array($data) || ($data['schema_version'] ?? null) !== 1
        || !is_array($data['balances'] ?? null) || !array_is_list($data['balances'])
        || count($data['balances']) !== $manifest['record_count']) {
        throw new \RuntimeException('Invalid reference structure');
    }
    $balances = [];
    foreach ($data['balances'] as $row) {
        if (!is_array($row) || !array_is_list($row) || count($row) !== 2
            || !is_string($row[0]) || strlen($row[0]) < 40 || strlen($row[0]) > 64
            || preg_match('/\A[1-9A-HJ-NP-Za-km-z]+\z/', $row[0]) !== 1
            || !validAmount($row[1]) || array_key_exists($row[0], $balances)) {
            throw new \RuntimeException('Invalid reference row');
        }
        $balances[$row[0]] = $row[1];
    }
    return [[
        'schema_version' => 1,
        'snapshot_date' => $manifest['snapshot_date'],
        'snapshot_date_basis' => $manifest['snapshot_date_basis'],
        'decimals' => 8,
        'record_count' => $manifest['record_count'],
        'snapshot_id' => $manifest['sha256'],
    ], $balances];
}

/** Returns a status and a bounded public response; never returns the reference rows. */
function handleRequest(string $method, string $contentType, string $body, string $query, string $fetchSite, string $directory): array
{
    if (!in_array($method, ['GET', 'POST'], true)) {
        return [405, ['error' => 'method_not_allowed']];
    }
    if ($query !== '' || $fetchSite === 'cross-site') {
        return [400, ['error' => 'invalid_request']];
    }
    $address = null;
    if ($method === 'POST') {
        if (strlen($body) > MAX_BODY_BYTES) {
            return [413, ['error' => 'request_too_large']];
        }
        if (strtolower(trim(explode(';', $contentType)[0])) !== 'application/json') {
            return [415, ['error' => 'json_required']];
        }
        try {
            $input = json_decode($body, true, 4, JSON_THROW_ON_ERROR);
            if (!is_array($input) || array_keys($input) !== ['address'] || !is_string($input['address'])) {
                return [400, ['error' => 'invalid_request']];
            }
            $address = normalizeAddress($input['address']);
        } catch (\JsonException | \InvalidArgumentException $error) {
            return [400, ['error' => 'invalid_address_or_json']];
        }
    }
    try {
        [$metadata, $balances] = loadSnapshot($directory);
    } catch (\Throwable $error) {
        return [503, ['error' => 'reference_unavailable']];
    }
    if ($address === null) {
        return [200, $metadata];
    }
    return [200, array_merge($metadata, [
        'address' => $address,
        'found' => array_key_exists($address, $balances),
        'balance_drops' => $balances[$address] ?? null,
    ])];
}

function serve(): void
{
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, private');
    header('X-Content-Type-Options: nosniff');
    header('X-Robots-Tag: noindex, nofollow');
    header('Allow: GET, POST');
    $directory = getenv('RHOLOX_REV_DATA_DIR') ?: dirname(__DIR__, 2) . '/rholox-private';
    $resolved = realpath($directory);
    $public = realpath($_SERVER['DOCUMENT_ROOT'] ?? dirname(__DIR__));
    if ($resolved === false || ($public !== false && ($resolved === $public || str_starts_with($resolved, $public . DIRECTORY_SEPARATOR)))) {
        http_response_code(503);
        echo '{"error":"reference_unavailable"}';
        return;
    }
    if (!function_exists('sodium_crypto_generichash')) {
        http_response_code(503);
        echo '{"error":"reference_unavailable"}';
        return;
    }
    $body = file_get_contents('php://input', false, null, 0, MAX_BODY_BYTES + 1);
    [$status, $response] = handleRequest(
        $_SERVER['REQUEST_METHOD'] ?? '', $_SERVER['CONTENT_TYPE'] ?? '', $body === false ? '' : $body,
        $_SERVER['QUERY_STRING'] ?? '', $_SERVER['HTTP_SEC_FETCH_SITE'] ?? '', $resolved
    );
    http_response_code($status);
    echo json_encode($response, JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR);
}

if (!defined('RHOLOX_REV_LIBRARY_ONLY')) {
    try {
        serve();
    } catch (\Throwable $error) {
        http_response_code(503);
        error_log('Rholox legacy lookup unavailable');
        echo '{"error":"reference_unavailable"}';
    }
}
