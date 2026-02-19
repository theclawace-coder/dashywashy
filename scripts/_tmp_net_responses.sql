SELECT id, status_code, error_msg, created, LEFT(content::text, 300) AS content
FROM net._http_response
ORDER BY created DESC
LIMIT 20;