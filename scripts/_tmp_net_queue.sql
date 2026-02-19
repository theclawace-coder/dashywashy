SELECT id, method, url, headers, body, timeout_milliseconds
FROM net.http_request_queue
ORDER BY id DESC
LIMIT 20;