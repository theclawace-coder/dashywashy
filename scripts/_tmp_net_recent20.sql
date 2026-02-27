SELECT id, created, status_code, error_msg, LEFT(content::text, 240) AS content
FROM net._http_response
ORDER BY created DESC
LIMIT 20;
