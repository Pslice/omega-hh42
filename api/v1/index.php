<?php
// API Configuration
define('API_KEY', 'omega_red_want2turnUptheheat!'); // Get this from db.js line 1

// Check API key before processing any request
$headers = getallheaders();
$provided_api_key = isset($headers['X-API-Key']) ? $headers['X-API-Key'] : null;

if (!$provided_api_key || $provided_api_key !== API_KEY) {
    http_response_code(401);
    echo json_encode([
        'status' => 'error',
        'message' => 'Unauthorized access'
    ]);
    exit();
}

// Database configuration
$db_host = 'localhost';
$db_name = 'temperature';
$db_user = 'omega_red';
$db_pass = 'want2turnUptheheat!';

try {
    // Create PDO connection
    $pdo = new PDO(
        "mysql:host=$db_host;dbname=$db_name;charset=utf8mb4",
        $db_user,
        $db_pass,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false
        ]
    );

    // Handle POST request for inserting temperature
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $data = json_decode(file_get_contents('php://input'), true);

        if (isset($data['temperature_value']) && isset($data['temperature_unit'])) {
            $stmt = $pdo->prepare("INSERT INTO omegahh42 (temperature_value, temperature_unit) VALUES (?, ?)");

            if ($stmt->execute([$data['temperature_value'], $data['temperature_unit']])) {
                http_response_code(201);
                echo json_encode([
                    'status' => 'success',
                    'message' => 'Temperature recorded successfully'
                ]);
            }
        } else {
            http_response_code(400);
            echo json_encode([
                'status' => 'error',
                'message' => 'Missing required fields'
            ]);
        }
    }

    // Handle GET request for reading temperatures
    if ($_SERVER['REQUEST_METHOD'] === 'GET') {
        $params = [];
        $sql = "SELECT * FROM omegahh42";

        // Add date range filter if provided
        if (isset($_GET['start_date']) && isset($_GET['end_date'])) {
            $sql .= " WHERE temperature_timestamp BETWEEN ? AND ?";
            $params[] = $_GET['start_date'];
            $params[] = $_GET['end_date'];
        }

        $sql .= " ORDER BY temperature_timestamp DESC";

        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $temperatures = $stmt->fetchAll();

        echo json_encode([
            'status' => 'success',
            'data' => $temperatures
        ]);
    }
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Database error: ' . $e->getMessage()
    ]);
}
