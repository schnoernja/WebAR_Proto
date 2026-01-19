<?php
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");

$dbHost = getenv("DB_HOST") ?: "postgres";
$dbPort = getenv("DB_PORT") ?: "5432";
$dbName = getenv("DB_NAME") ?: "webar";
$dbUser = getenv("DB_USER") ?: "webar_user";
$dbPass = getenv("DB_PASS") ?: "webar_pass";

function respond($payload, $code = 200) {
    http_response_code($code);
    echo json_encode($payload);
    exit;
}

function get_float_param($key) {
    if (!isset($_GET[$key])) {
        return null;
    }
    $val = filter_var($_GET[$key], FILTER_VALIDATE_FLOAT);
    return ($val === false) ? null : $val;
}

$lat = get_float_param("lat");
$lon = get_float_param("lon");
if ($lat === null || $lon === null) {
    respond(["error" => "invalid_params"], 400);
}

try {
    $dsn = "pgsql:host={$dbHost};port={$dbPort};dbname={$dbName}";
    $pdo = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    $sql = "SELECT tile_key, min_lat, min_lon, max_lat, max_lon, grid_w, grid_h, heights
            FROM public.height_tiles
            WHERE :lat BETWEEN min_lat AND max_lat
              AND :lon BETWEEN min_lon AND max_lon
            LIMIT 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute(["lat" => $lat, "lon" => $lon]);
    $row = $stmt->fetch();

    if (!$row) {
        respond(["error" => "no_height_tile"], 404);
    }

    $gridW = (int)$row["grid_w"];
    $gridH = (int)$row["grid_h"];
    $minLat = (float)$row["min_lat"];
    $minLon = (float)$row["min_lon"];
    $maxLat = (float)$row["max_lat"];
    $maxLon = (float)$row["max_lon"];

    $compressed = $row["heights"];
    $decompressed = @gzuncompress($compressed);
    if ($decompressed === false) {
        respond(["error" => "height_decode_failed"], 500);
    }

    $heights = array_values(unpack("f*", $decompressed));
    if (count($heights) !== $gridW * $gridH) {
        respond(["error" => "height_grid_mismatch"], 500);
    }

    $u = ($lon - $minLon) / max(1e-9, ($maxLon - $minLon));
    $v = ($lat - $minLat) / max(1e-9, ($maxLat - $minLat));
    $u = min(max($u, 0.0), 1.0);
    $v = min(max($v, 0.0), 1.0);

    $x = $u * ($gridW - 1);
    $y = $v * ($gridH - 1);
    $x0 = (int)floor($x);
    $y0 = (int)floor($y);
    $x1 = min($x0 + 1, $gridW - 1);
    $y1 = min($y0 + 1, $gridH - 1);
    $tx = $x - $x0;
    $ty = $y - $y0;

    $idx00 = $y0 * $gridW + $x0;
    $idx10 = $y0 * $gridW + $x1;
    $idx01 = $y1 * $gridW + $x0;
    $idx11 = $y1 * $gridW + $x1;

    $h00 = $heights[$idx00];
    $h10 = $heights[$idx10];
    $h01 = $heights[$idx01];
    $h11 = $heights[$idx11];

    $h0 = $h00 * (1 - $tx) + $h10 * $tx;
    $h1 = $h01 * (1 - $tx) + $h11 * $tx;
    $height = $h0 * (1 - $ty) + $h1 * $ty;

    respond([
        "lat" => $lat,
        "lon" => $lon,
        "height_m" => $height,
        "tile_key" => $row["tile_key"]
    ]);
} catch (Exception $e) {
    respond([
        "error" => "db_error",
        "message" => $e->getMessage()
    ], 500);
}
