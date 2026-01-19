<?php
header("Content-Type: application/json; charset=utf-8");
header("Access-Control-Allow-Origin: *");

$dbHost = getenv("DB_HOST") ?: "postgres";
$dbPort = getenv("DB_PORT") ?: "5444";
$dbName = getenv("DB_NAME") ?: "webar";
$dbUser = getenv("DB_USER") ?: "webar_user";
$dbPass = getenv("DB_PASS") ?: "webar_pass";

try {
    $dsn = "pgsql:host={$dbHost};port={$dbPort};dbname={$dbName}";
    $pdo = new PDO($dsn, $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);

    $stmt = $pdo->query("SELECT name, url, lat, lon, height_m FROM models ORDER BY id ASC");
    $rows = $stmt->fetchAll();

    echo json_encode($rows);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        "error" => "db_error",
        "message" => $e->getMessage()
    ]);
}
