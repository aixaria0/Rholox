<?php
declare(strict_types=1);
define('RHOLOX_REV_LIBRARY_ONLY', true);
require __DIR__ . '/../server/legacy-rev.php';

function syntheticAddress(int $seed): string
{
    $body = str_repeat("\0", 4) . str_repeat(chr($seed), 32);
    $raw = $body . substr(sodium_crypto_generichash($body, '', 32), 0, 4);
    $digits = [];
    foreach (str_split($raw) as $byte) {
        $carry = ord($byte);
        foreach ($digits as $i => $digit) {
            $carry += $digit * 256;
            $digits[$i] = $carry % 58;
            $carry = intdiv($carry, 58);
        }
        while ($carry > 0) { $digits[] = $carry % 58; $carry = intdiv($carry, 58); }
    }
    $out = str_repeat('1', strspn($raw, "\0"));
    foreach (array_reverse($digits) as $digit) { $out .= '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'[$digit]; }
    return $out;
}
function ensure(bool $condition, string $name): void
{
    global $checks;
    if (!$condition) { throw new RuntimeException('FAIL ' . $name); }
    $checks++;
    echo 'PASS ' . $name . "\n";
}
$checks = 0;
$directory = sys_get_temp_dir() . '/rholox-endpoint-' . bin2hex(random_bytes(8));
mkdir($directory, 0700);
$known = syntheticAddress(17); $zero = syntheticAddress(18); $missing = syntheticAddress(19);
$raw = json_encode(['schema_version' => 1, 'balances' => [[$known, '9007199254740993'], [$zero, '0']]]) . "\n";
$manifest = ['schema_version' => 1, 'snapshot_date' => '2000-01-01', 'snapshot_date_basis' => 'operator_reference',
    'decimals' => 8, 'record_count' => 2, 'byte_length' => strlen($raw), 'sha256' => hash('sha256', $raw)];
file_put_contents($directory . '/balances.json', $raw);
file_put_contents($directory . '/manifest.json', json_encode($manifest));
$call = function (string $body, string $method = 'POST', string $type = 'application/json', string $query = '', string $site = '') use ($directory): array {
    return \Rholox\LegacyRev\handleRequest($method, $type, $body, $query, $site, $directory);
};
try {
    ensure(\Rholox\LegacyRev\normalizeAddress(' ' . $known . "\n") === $known, 'server independently validates REV checksum');
    [$status, $response] = $call(json_encode(['address' => $known]));
    ensure($status === 200 && $response['balance_drops'] === '9007199254740993', 'exact large integer returned as string');
    ensure(!isset($response['balances']) && count($response) === 9, 'response contains exactly one address result');
    [$status, $response] = $call(json_encode(['address' => $zero]));
    ensure($status === 200 && $response['found'] && $response['balance_drops'] === '0', 'explicit zero is present');
    [$status, $response] = $call(json_encode(['address' => $missing]));
    ensure($status === 200 && !$response['found'] && $response['balance_drops'] === null, 'absence does not imply zero');
    [$status, $response] = $call('', 'GET');
    ensure($status === 200 && count($response) === 6 && !isset($response['address']), 'GET exposes metadata only');
    foreach (['', '{', '[]', '{"address":1}', '{"address":"invalid"}', json_encode(['address' => $known, 'all' => true]),
        json_encode(['address' => strtolower($known)]), json_encode(['address' => substr($known, 0, -1) . '0'])] as $body) {
        ensure($call($body)[0] === 400, 'malformed JSON or invalid address rejected');
    }
    ensure($call(str_repeat('a', 257))[0] === 413, 'oversized request rejected');
    ensure($call('{}', 'POST', 'text/plain')[0] === 415, 'JSON content type required');
    ensure($call('', 'DELETE')[0] === 405, 'unsupported method rejected');
    ensure($call('', 'GET', '', 'address=anything')[0] === 400, 'query parameters rejected');
    ensure($call('{}', 'POST', 'application/json', '', 'cross-site')[0] === 400, 'cross-site browser request rejected');
    file_put_contents($directory . '/balances.json', $raw . ' ');
    ensure($call(json_encode(['address' => $known]))[0] === 503, 'integrity failure cannot become an absent balance');
    unlink($directory . '/balances.json');
    ensure($call('', 'GET')[0] === 503, 'missing private data fails closed');
    ensure(\Rholox\LegacyRev\validAmount('18446744073709551615') && !\Rholox\LegacyRev\validAmount('18446744073709551616'), 'u64 boundary is exact');
} finally {
    foreach (glob($directory . '/*') as $file) { unlink($file); }
    rmdir($directory);
}
echo $checks . " endpoint checks passed with synthetic records only.\n";
